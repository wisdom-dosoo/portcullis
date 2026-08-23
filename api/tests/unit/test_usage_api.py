"""Unit tests for the usage metering endpoints and repository."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import authenticated_subject, platform_admin_subject
from app.auth.subject import Subject
from app.config import Settings
from app.main import create_app
from app.models.orm import LicensePlan, SubjectType
from app.models.schemas import UsageTotalsView
from app.repositories.usage import UsageRepository

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


def _settings(**overrides) -> Settings:
    base = {
        "_env_file": None,
        "usage_enforcement_enabled": True,
        "usage_monthly_cap_community": 100,
        "usage_monthly_cap_pro": 200,
        "usage_monthly_cap_enterprise": 0,
    }
    base.update(overrides)
    return Settings(**base)


def _make_subject() -> Subject:
    return Subject(
        subject_id=str(UUID("00000000-0000-0000-0000-0000000000cd")),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_app() -> FastAPI:
    app = create_app()
    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()
    return app


def _totals() -> dict[str, int]:
    return {
        "requests": 42,
        "tool_calls": 7,
        "rbac_denials": 1,
        "rate_limit_rejections": 2,
    }


class TestUsageRepository:
    async def test_totals_unpacks_four_counters(self) -> None:
        session = AsyncMock()
        row = MagicMock()
        row.one = MagicMock(return_value=(42, 7, 1, 2))
        session.execute = AsyncMock(return_value=row)
        repo = UsageRepository(session)
        totals = await repo.totals(DEFAULT_TENANT_ID, date(2026, 8, 1), date(2026, 8, 19))
        assert totals == _totals()

    async def test_increment_creates_row_and_adds(self) -> None:
        session = AsyncMock()
        row = MagicMock()
        row.requests = 0
        row.tool_calls = 0
        row.rbac_denials = 0
        row.rate_limit_rejections = 0
        session.scalar = AsyncMock(return_value=row)
        session.add = MagicMock()
        session.flush = AsyncMock()

        repo = UsageRepository(session)
        await repo.increment(
            DEFAULT_TENANT_ID,
            requests=10,
            tool_calls=3,
            rbac_denials=1,
            rate_limit_rejections=4,
            day=date(2026, 8, 19),
        )
        assert row.requests == 10
        assert row.tool_calls == 3
        assert row.rbac_denials == 1
        assert row.rate_limit_rejections == 4

    async def test_monthly_tool_calls_sums_through_totals(self) -> None:
        session = AsyncMock()
        row = MagicMock()
        row.one = MagicMock(return_value=(10, 4, 0, 0))
        session.execute = AsyncMock(return_value=row)
        repo = UsageRepository(session)
        assert await repo.monthly_tool_calls(DEFAULT_TENANT_ID) == 4


@pytest.mark.asyncio
class TestUsageApi:
    async def test_org_usage_returns_view_with_cap(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings()
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        license = MagicMock()
        license.plan = LicensePlan.PRO

        with (
            patch.object(
                UsageRepository, "totals", new_callable=AsyncMock, return_value=_totals()
            ),
            patch(
                "app.api.usage.LicenseService",
                return_value=MagicMock(current=AsyncMock(return_value=license)),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response: Response = await client.get("/v1/usage")

        assert response.status_code == 200
        body = response.json()
        assert body["requests"] == 42
        assert body["tool_calls"] == 7
        assert body["rbac_denials"] == 1
        assert body["rate_limit_rejections"] == 2
        assert body["plan"] == "pro"
        assert body["monthly_request_cap"] == 200
        assert body["enforcement_enabled"] is True

    async def test_org_usage_no_license_yields_no_cap(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings()
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        with (
            patch.object(
                UsageRepository, "totals", new_callable=AsyncMock, return_value=_totals()
            ),
            patch(
                "app.api.usage.LicenseService",
                return_value=MagicMock(current=AsyncMock(return_value=None)),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response: Response = await client.get("/v1/usage")

        assert response.status_code == 200
        body = response.json()
        assert body["plan"] is None
        assert body["monthly_request_cap"] == 0

    async def test_admin_usage_aggregates_across_tenants(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings()
        session = AsyncMock()
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        row = MagicMock()
        row.tenant_id = DEFAULT_TENANT_ID
        row.requests = 30
        row.tool_calls = 5
        row.rbac_denials = 1
        row.rate_limit_rejections = 0

        result = MagicMock()
        result.all = MagicMock(return_value=[row])
        session.scalars = AsyncMock(return_value=result)

        license = MagicMock()
        license.plan = LicensePlan.COMMUNITY

        with patch(
            "app.api.usage.LicenseService",
            return_value=MagicMock(current=AsyncMock(return_value=license)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response: Response = await client.get("/admin/usage")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["requests"] == 30
        assert body[0]["tool_calls"] == 5
        assert body[0]["plan"] == "community"
        assert body[0]["monthly_request_cap"] == 100


class TestMonthlyCap:
    def test_plan_caps_from_settings(self) -> None:
        from app.api.usage import _monthly_cap

        settings = _settings()
        assert _monthly_cap(LicensePlan.PRO, settings) == 200
        assert _monthly_cap(LicensePlan.COMMUNITY, settings) == 100
        assert _monthly_cap(LicensePlan.ENTERPRISE, settings) == 0
        assert _monthly_cap(None, settings) == 0


class TestUsageTotalsViewSchema:
    def test_view_builds_from_dict(self) -> None:
        view = UsageTotalsView(**_totals())
        assert view.requests == 42
        assert view.tool_calls == 7