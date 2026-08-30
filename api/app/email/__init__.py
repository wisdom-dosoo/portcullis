"""Email delivery abstraction boundary.

Pluggable email providers: SMTP, SendGrid, Resend, Console (dev).
"""

from __future__ import annotations

import abc
import smtplib
from email.message import EmailMessage

import httpx
import structlog
from pydantic import BaseModel, Field

from app.config import Settings

logger = structlog.get_logger(__name__)


class EmailMessageData(BaseModel):
    """Email message to be sent."""

    to: list[str]
    subject: str
    html_body: str
    text_body: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    reply_to: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)


class EmailProvider(abc.ABC):
    """Abstract base class for email providers."""

    @abc.abstractmethod
    async def send(self, message: EmailMessageData) -> None:
        """Send an email message."""

    @abc.abstractmethod
    async def close(self) -> None:
        """Close any open connections."""


class ConsoleEmailProvider(EmailProvider):
    """Development provider that logs emails to console."""

    async def send(self, message: EmailMessageData) -> None:
        logger.info(
            "email.console",
            to=message.to,
            subject=message.subject,
            html_body=message.html_body[:200] if message.html_body else None,
            text_body=message.text_body[:200] if message.text_body else None,
        )

    async def close(self) -> None:
        pass


class SMTPEmailProvider(EmailProvider):
    """SMTP email provider."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        use_tls: bool = True,
        use_ssl: bool = False,
        from_email: str | None = None,
        from_name: str | None = None,
        timeout: int = 30,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._use_tls = use_tls
        self._use_ssl = use_ssl
        self._default_from_email = from_email or username
        self._default_from_name = from_name
        self._timeout = timeout
        self._connection: smtplib.SMTP | None = None

    async def send(self, message: EmailMessageData) -> None:
        import asyncio

        def _send_sync() -> None:
            if self._use_ssl:
                conn = smtplib.SMTP_SSL(self._host, self._port, timeout=self._timeout)
            else:
                conn = smtplib.SMTP(self._host, self._port, timeout=self._timeout)

            try:
                if self._use_tls and not self._use_ssl:
                    conn.starttls()
                conn.login(self._username, self._password)

                msg = EmailMessage()
                msg["Subject"] = message.subject
                msg["From"] = self._format_from(message)
                msg["To"] = ", ".join(message.to)
                if message.reply_to:
                    msg["Reply-To"] = message.reply_to

                for key, value in message.headers.items():
                    msg[key] = value

                if message.text_body:
                    msg.set_content(message.text_body)
                if message.html_body:
                    msg.add_alternative(message.html_body, subtype="html")

                conn.send_message(msg)
            finally:
                conn.quit()

        await asyncio.to_thread(_send_sync)
        logger.info("email.sent.smtp", to=message.to, subject=message.subject)

    def _format_from(self, message: EmailMessageData) -> str:
        from_email = message.from_email or self._default_from_email
        from_name = message.from_name or self._default_from_name
        if from_name:
            return f"{from_name} <{from_email}>"
        return from_email

    async def close(self) -> None:
        pass


class SendGridEmailProvider(EmailProvider):
    """SendGrid email provider (https://sendgrid.com)."""

    def __init__(
        self, api_key: str, from_email: str, from_name: str | None = None, timeout: int = 30
    ) -> None:
        self._api_key = api_key
        self._from_email = from_email
        self._from_name = from_name
        self._client = httpx.AsyncClient(
            base_url="https://api.sendgrid.com/v3",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=timeout,
        )

    async def send(self, message: EmailMessageData) -> None:
        from_email = message.from_email or self._from_email
        from_name = message.from_name or self._from_name

        personalizations = [{"to": [{"email": email} for email in message.to]}]
        if message.reply_to:
            personalizations[0]["reply_to"] = {"email": message.reply_to}

        payload = {
            "personalizations": personalizations,
            "from": {"email": from_email, "name": from_name}
            if from_name
            else {"email": from_email},
            "subject": message.subject,
            "content": [],
        }
        if message.text_body:
            payload["content"].append({"type": "text/plain", "value": message.text_body})
        if message.html_body:
            payload["content"].append({"type": "text/html", "value": message.html_body})

        response = await self._client.post("/mail/send", json=payload)
        response.raise_for_status()
        logger.info("email.sent.sendgrid", to=message.to, subject=message.subject)

    async def close(self) -> None:
        await self._client.aclose()


class ResendEmailProvider(EmailProvider):
    """Resend email provider (https://resend.com)."""

    def __init__(
        self, api_key: str, from_email: str, from_name: str | None = None, timeout: int = 30
    ) -> None:
        self._api_key = api_key
        self._from_email = from_email
        self._from_name = from_name
        self._client = httpx.AsyncClient(
            base_url="https://api.resend.com",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=timeout,
        )

    async def send(self, message: EmailMessageData) -> None:
        from_email = message.from_email or self._from_email
        from_name = message.from_name or self._from_name

        payload = {
            "from": f"{from_name} <{from_email}>" if from_name else from_email,
            "to": message.to,
            "subject": message.subject,
        }
        if message.html_body:
            payload["html"] = message.html_body
        if message.text_body:
            payload["text"] = message.text_body
        if message.reply_to:
            payload["reply_to"] = message.reply_to

        response = await self._client.post("/emails", json=payload)
        response.raise_for_status()
        logger.info("email.sent.resend", to=message.to, subject=message.subject)

    async def close(self) -> None:
        await self._client.aclose()


def build_email_provider(settings: Settings) -> EmailProvider:
    """Factory to build the configured email provider."""
    provider = settings.email_provider.lower() if settings.email_provider else "console"

    if provider == "console":
        return ConsoleEmailProvider()

    if provider == "smtp":
        return SMTPEmailProvider(
            host=settings.smtp_host or "localhost",
            port=settings.smtp_port or 587,
            username=settings.smtp_username or "",
            password=settings.smtp_password or "",
            use_tls=settings.smtp_use_tls if settings.smtp_use_tls is not None else True,
            use_ssl=settings.smtp_use_ssl if settings.smtp_use_ssl is not None else False,
            from_email=settings.email_from,
            from_name=settings.email_from_name,
        )

    if provider == "sendgrid":
        if not settings.sendgrid_api_key:
            raise ValueError("SENDGRID_API_KEY is required for SendGrid provider")
        return SendGridEmailProvider(
            api_key=settings.sendgrid_api_key,
            from_email=settings.email_from or "",
            from_name=settings.email_from_name,
        )

    if provider == "resend":
        if not settings.resend_api_key:
            raise ValueError("RESEND_API_KEY is required for Resend provider")
        return ResendEmailProvider(
            api_key=settings.resend_api_key,
            from_email=settings.email_from or "",
            from_name=settings.email_from_name,
        )

    raise ValueError(f"Unknown email provider: {provider}")
