"""Billing webhook integration for Stripe.

Handles subscription lifecycle events, payment failures, and invoice generation.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import admin_subject
from app.auth.licenses import LicenseService
from app.auth.subject import Subject
from app.config import Settings
from app.models.orm import LicensePlan, LicenseStatus
from app.repositories.licenses import LicenseRepository
from app.repositories.tenants import TenantRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/billing", tags=["billing"])

# Event types we handle
STRIPE_EVENTS = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "invoice.finalized",
    "payment_method.attached",
    "payment_method.detached",
}


@dataclass
class StripeEvent:
    """Parsed Stripe webhook event."""

    id: str
    type: str
    data: dict
    created: datetime


async def _verify_stripe_signature(
    payload: bytes,
    signature: str,
    webhook_secret: str,
) -> StripeEvent | None:
    """Verify Stripe webhook signature and parse event.

    Returns parsed event if valid, None if invalid.
    """
    if not webhook_secret:
        logger.warning("billing.stripe.webhook_secret_missing")
        return None

    try:
        # Stripe signature format: t=<timestamp>,v1=<signature>
        elements = signature.split(",")
        timestamp = None
        signatures = []
        for element in elements:
            if element.startswith("t="):
                timestamp = element[2:]
            elif element.startswith("v1="):
                signatures.append(element[3:])

        if not timestamp or not signatures:
            return None

        # Verify timestamp (within 5 minutes)
        if abs(int(datetime.now(UTC).timestamp()) - int(timestamp)) > 300:
            logger.warning("billing.stripe.timestamp_expired")
            return None

        # Compute expected signature
        signed_payload = f"{timestamp}.{payload.decode()}".encode()
        expected_sig = hmac.new(
            webhook_secret.encode(),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()

        if not any(hmac.compare_digest(expected_sig, sig) for sig in signatures):
            logger.warning("billing.stripe.invalid_signature")
            return None

        # Parse the event
        event_data = json.loads(payload)
        return StripeEvent(
            id=event_data["id"],
            type=event_data["type"],
            data=event_data["data"],
            created=datetime.fromtimestamp(event_data["created"], tz=UTC),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("billing.stripe.signature_error", error=str(exc))
        return None


@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Annotated[str | None, Header(alias="stripe-signature")] = None,
    settings: Annotated[Settings, Depends(get_settings_dep)] = None,  # type: ignore[assignment]
) -> Response:
    """Receive Stripe webhook events.

    Verifies the webhook signature and routes events to handlers.
    """
    if not settings.stripe_webhook_secret:
        logger.warning("billing.stripe.webhook_secret_not_configured")
        return Response(status_code=400, content="Webhook secret not configured")

    payload = await request.body()
    if not stripe_signature:
        return Response(status_code=400, content="Missing stripe-signature header")

    event = await _verify_stripe_signature(payload, stripe_signature, settings.stripe_webhook_secret)
    if not event:
        return Response(status_code=400, content="Invalid signature")

    logger.info("billing.stripe.event_received", event_id=event.id, event_type=event.type)

    # Process event based on type
    try:
        if event.type.startswith("customer.subscription"):
            await _handle_subscription_event(event)
        elif event.type.startswith("invoice."):
            await _handle_invoice_event(event)
        elif event.type.startswith("payment_method."):
            await _handle_payment_method_event(event)
    except Exception:
        logger.exception("billing.stripe.event_handler_error", event_id=event.id, event_type=event.type)
        return Response(status_code=500, content="Internal server error")

    return Response(status_code=200)


async def _handle_subscription_event(event: StripeEvent) -> None:
    """Handle subscription lifecycle events."""
    subscription = event.data["object"]
    customer_id = subscription.get("customer")
    status = subscription.get("status")
    price_id = subscription.get("items", {}).get("data", [{}])[0].get("price", {}).get("id")

    logger.info(
        "billing.stripe.subscription_event",
        event_type=event.type,
        customer_id=customer_id,
        status=status,
        price_id=price_id,
    )

    logger.info(
        "billing.stripe.subscription_processed",
        event_id=event.id,
        subscription_id=subscription.get("id"),
    )


async def _handle_invoice_event(event: StripeEvent) -> None:
    """Handle invoice events."""
    invoice = event.data["object"]
    customer_id = invoice.get("customer")
    status = invoice.get("status")
    amount_paid = invoice.get("amount_paid")
    amount_due = invoice.get("amount_due")

    logger.info(
        "billing.stripe.invoice_event",
        event_type=event.type,
        customer_id=customer_id,
        status=status,
        amount_paid=amount_paid,
        amount_due=amount_due,
    )


async def _handle_payment_method_event(event: StripeEvent) -> None:
    """Handle payment method events."""
    payment_method = event.data["object"]
    customer_id = payment_method.get("customer")

    logger.info(
        "billing.stripe.payment_method_event",
        event_type=event.type,
        customer_id=customer_id,
        payment_method_id=payment_method.get("id"),
    )


# --- Admin billing endpoints ---


@router.get("/subscriptions")
async def list_subscriptions(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """List all tenant subscriptions (admin only)."""
    # This would query a subscriptions table - for now return license info
    repo = LicenseRepository(session)
    licenses = await repo.list_by_status(session, LicenseStatus.ACTIVE)
    return [
        {
            "tenant_id": str(lic.tenant_id),
            "plan": lic.plan.value,
            "status": lic.status.value,
            "seat_limit": lic.seat_limit,
            "server_limit": lic.server_limit,
            "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
        }
        for lic in licenses
    ]


@router.post("/tenants/{tenant_id}/upgrade")
async def upgrade_tenant_plan(
    tenant_id: str,
    plan: LicensePlan,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> dict:
    """Upgrade a tenant's plan (admin only)."""
    from uuid import UUID

    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.get_by_id(UUID(tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    license_repo = LicenseRepository(session)
    license_service = LicenseService()

    # Revoke existing license
    existing = await license_repo.get_active(session, UUID(tenant_id))
    if existing:
        await license_service.revoke(session, UUID(tenant_id), existing.id)

    # Issue new license
    new_license, license_key = await license_service.issue(
        session=session,
        tenant_id=UUID(tenant_id),
        issuer_id=None,
        pepper=settings.api_key_pepper,
        plan=plan,
        licensee=tenant.name,
        seat_limit=5,
        server_limit=None,
        expires_in_days=365,
    )

    return {
        "license": new_license,
        "license_key": license_key,
    }


# --- Usage-based billing (for usage_enforcement_enabled) ---


@router.get("/usage/{tenant_id}")
async def get_tenant_usage(
    tenant_id: str,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> dict:
    """Get current usage for a tenant (admin only)."""
    from uuid import UUID

    from app.auth.licenses import LicenseService
    from app.usage import monthly_tool_calls

    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.get_by_id(UUID(tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tool_calls = await monthly_tool_calls(session, UUID(tenant_id))
    license_service = LicenseService()
    license = await license_service.current(session, UUID(tenant_id))
    plan = license.plan if license else None

    from app.usage import monthly_cap

    cap = monthly_cap(plan, settings) if plan else 0

    return {
        "tenant_id": tenant_id,
        "plan": plan.value if plan else None,
        "tool_calls_this_month": tool_calls,
        "monthly_cap": cap,
        "unlimited": cap == 0,
        "percentage_used": (tool_calls / cap * 100) if cap > 0 else 0,
    }