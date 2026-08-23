"""Unit tests for the upstream registry service and URL validator."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from app.config import Environment, Settings
from app.models.orm import ServerAuthMode, ServerStatus, ServerTransport
from app.models.schemas import ServerCreate, ServerUpdate, ServerView
from app.security.upstreams import validate_upstream_url

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
ALLOWED_HOSTS: tuple[str, ...] = ("mcp.internal", "tools.internal", "localhost")


def _make_settings(
    *,
    environment: Environment = Environment.DEVELOPMENT,
    allowed_hosts: tuple[str, ...] = ALLOWED_HOSTS,
) -> Settings:
    # Production requires a non-default pepper — supply one for tests.
    pepper = "test-pepper-for-production-env-use-only"
    # Production also requires MCP_ALLOWED_ORIGINS for DNS rebinding protection.
    mcp_origins = "https://example.com,https://claude.ai" if environment is Environment.PRODUCTION else ""
    return Settings(
        _env_file=None,
        environment=environment,
        upstream_allowed_hosts=",".join(allowed_hosts),
        api_key_pepper=pepper,
        cors_allowed_origins="https://example.com",
        mcp_allowed_origins=mcp_origins,
    )


def _make_fake_server(
    slug: str = "my-server",
    auth_mode: ServerAuthMode = ServerAuthMode.NONE,
) -> MagicMock:
    """Build a minimal fake ORM McpServer for use with ServerView.model_validate."""
    server = MagicMock()
    server.id = UUID("00000000-0000-0000-0000-000000000099")
    server.tenant_id = DEFAULT_TENANT_ID
    server.name = "My Server"
    server.slug = slug
    server.upstream_url = "http://localhost/mcp"
    server.transport = ServerTransport.STREAMABLE_HTTP
    server.auth_mode = auth_mode
    server.ssl_ca = None
    server.ssl_cert = None
    server.ssl_key = None
    server.status = ServerStatus.ACTIVE
    server.health_check_path = "/health"
    server.consecutive_health_failures = 0
    server.last_health_check_at = None
    server.created_at = MagicMock()
    server.updated_at = MagicMock()
    return server


# ---------------------------------------------------------------------------
# validate_upstream_url tests
# ---------------------------------------------------------------------------


class TestValidateUpstreamUrl:
    def test_development_allows_http(self) -> None:
        validate_upstream_url("http://localhost/mcp", ALLOWED_HOSTS, Environment.DEVELOPMENT)

    def test_development_allows_https(self) -> None:
        validate_upstream_url("https://localhost/mcp", ALLOWED_HOSTS, Environment.DEVELOPMENT)

    def test_production_requires_https(self) -> None:
        with pytest.raises(ValueError, match="HTTPS"):
            validate_upstream_url("http://mcp.internal/mcp", ALLOWED_HOSTS, Environment.PRODUCTION)

    def test_staging_requires_https(self) -> None:
        with pytest.raises(ValueError, match="HTTPS"):
            validate_upstream_url("http://mcp.internal/mcp", ALLOWED_HOSTS, Environment.STAGING)

    def test_production_accepts_https(self) -> None:
        validate_upstream_url("https://mcp.internal/mcp", ALLOWED_HOSTS, Environment.PRODUCTION)

    def test_host_not_in_allowed_list_raises(self) -> None:
        with pytest.raises(ValueError, match="allowed hosts"):
            validate_upstream_url(
                "http://evil.example.com/mcp", ALLOWED_HOSTS, Environment.DEVELOPMENT
            )

    def test_url_with_credentials_raises(self) -> None:
        with pytest.raises(ValueError, match="credentials"):
            validate_upstream_url(
                "http://user:pass@localhost/mcp", ALLOWED_HOSTS, Environment.DEVELOPMENT
            )

    def test_url_with_fragment_raises(self) -> None:
        with pytest.raises(ValueError, match="fragment"):
            validate_upstream_url(
                "http://localhost/mcp#section", ALLOWED_HOSTS, Environment.DEVELOPMENT
            )

    def test_host_matching_is_case_insensitive(self) -> None:
        validate_upstream_url("http://LOCALHOST/mcp", ALLOWED_HOSTS, Environment.DEVELOPMENT)

    def test_unknown_scheme_raises(self) -> None:
        with pytest.raises(ValueError):
            validate_upstream_url("ftp://localhost/mcp", ALLOWED_HOSTS, Environment.DEVELOPMENT)


# ---------------------------------------------------------------------------
# Slug normalization tests
# ---------------------------------------------------------------------------


class TestSlugNormalization:
    def test_uppercase_normalized_to_lowercase(self) -> None:
        cmd = ServerCreate(
            name="Test",
            slug="MyServer",
            upstream_url="http://localhost/mcp",
        )
        assert cmd.slug == "myserver"

    def test_spaces_replaced_with_hyphens(self) -> None:
        cmd = ServerCreate(
            name="Test",
            slug="my server name",
            upstream_url="http://localhost/mcp",
        )
        assert cmd.slug == "my-server-name"

    def test_leading_trailing_hyphens_stripped(self) -> None:
        cmd = ServerCreate(
            name="Test",
            slug="-my-server-",
            upstream_url="http://localhost/mcp",
        )
        assert cmd.slug == "my-server"

    def test_special_chars_removed(self) -> None:
        cmd = ServerCreate(
            name="Test",
            slug="my.server!name",
            upstream_url="http://localhost/mcp",
        )
        assert cmd.slug == "myservername"

    def test_update_slug_normalized(self) -> None:
        update = ServerUpdate(slug="My Updated Server")
        assert update.slug == "my-updated-server"

    def test_update_slug_none_passthrough(self) -> None:
        update = ServerUpdate(slug=None)
        assert update.slug is None


# ---------------------------------------------------------------------------
# RegistryService unit tests (mocked session)
# ---------------------------------------------------------------------------


def _make_registry_service(
    session: AsyncMock,
    settings: Settings | None = None,
) -> object:
    """Return a RegistryService with a mocked session."""
    from app.gateway.registry import RegistryService

    if settings is None:
        settings = _make_settings()
    return RegistryService(session=session, settings=settings)


class TestRegistryServiceCreate:
    @pytest.mark.asyncio
    async def test_create_returns_server_view(self) -> None:
        session = AsyncMock()
        session.commit = AsyncMock()

        fake_server = _make_fake_server()

        with (
            patch("app.gateway.registry.ServerRepository") as MockRepo,
            patch("app.gateway.registry.require_license", new_callable=AsyncMock),
        ):
            mock_repo = MockRepo.return_value
            mock_repo.count = AsyncMock(return_value=0)
            mock_repo.create = AsyncMock(return_value=fake_server)

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            cmd = ServerCreate(
                name="My Server",
                slug="my-server",
                upstream_url="http://localhost/mcp",
            )
            result = await svc.create(cmd)

        assert isinstance(result, ServerView)
        assert result.slug == "my-server"

    @pytest.mark.asyncio
    async def test_create_rejects_http_in_production(self) -> None:
        session = AsyncMock()
        settings = _make_settings(environment=Environment.PRODUCTION)

        with patch("app.gateway.registry.ServerRepository"):
            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=settings)
            cmd = ServerCreate(
                name="My Server",
                slug="my-server",
                upstream_url="http://mcp.internal/mcp",
            )
            with pytest.raises(ValueError, match="HTTPS"):
                await svc.create(cmd)

    @pytest.mark.asyncio
    async def test_create_rejects_service_token_without_env_var(self) -> None:
        session = AsyncMock()

        with patch("app.gateway.registry.ServerRepository"):
            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            cmd = ServerCreate(
                name="My Server",
                slug="my-server",
                upstream_url="http://localhost/mcp",
                auth_mode=ServerAuthMode.SERVICE_TOKEN,
                service_token_env_var=None,
            )
            with pytest.raises(ValueError, match="service_token_env_var"):
                await svc.create(cmd)

    @pytest.mark.asyncio
    async def test_create_with_service_token_and_env_var_succeeds(self) -> None:
        session = AsyncMock()
        session.commit = AsyncMock()

        fake_server = _make_fake_server(auth_mode=ServerAuthMode.SERVICE_TOKEN)
        fake_server.service_token_env_var = None  # not in ServerView

        with (
            patch("app.gateway.registry.ServerRepository") as MockRepo,
            patch("app.gateway.registry.require_license", new_callable=AsyncMock),
        ):
            mock_repo = MockRepo.return_value
            mock_repo.count = AsyncMock(return_value=0)
            mock_repo.create = AsyncMock(return_value=fake_server)

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            cmd = ServerCreate(
                name="My Server",
                slug="my-server",
                upstream_url="http://localhost/mcp",
                auth_mode=ServerAuthMode.SERVICE_TOKEN,
                service_token_env_var="MY_TOKEN_VAR",
            )
            result = await svc.create(cmd)

        assert isinstance(result, ServerView)

    @pytest.mark.asyncio
    async def test_create_raises_on_slug_conflict(self) -> None:
        from sqlalchemy.exc import IntegrityError

        session = AsyncMock()
        session.rollback = AsyncMock()

        with (
            patch("app.gateway.registry.ServerRepository") as MockRepo,
            patch("app.gateway.registry.require_license", new_callable=AsyncMock),
        ):
            mock_repo = MockRepo.return_value
            mock_repo.count = AsyncMock(return_value=0)
            mock_repo.create = AsyncMock(side_effect=IntegrityError("duplicate", {}, Exception()))

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            cmd = ServerCreate(
                name="My Server",
                slug="my-server",
                upstream_url="http://localhost/mcp",
            )
            with pytest.raises(ValueError, match="already exists"):
                await svc.create(cmd)


class TestRegistryServiceGet:
    @pytest.mark.asyncio
    async def test_get_returns_server_view(self) -> None:
        session = AsyncMock()
        fake_server = _make_fake_server(slug="test-server")

        with patch("app.gateway.registry.ServerRepository") as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.get_by_slug = AsyncMock(return_value=fake_server)

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            result = await svc.get("test-server")

        assert isinstance(result, ServerView)
        assert result.slug == "test-server"

    @pytest.mark.asyncio
    async def test_get_raises_key_error_if_not_found(self) -> None:
        session = AsyncMock()

        with patch("app.gateway.registry.ServerRepository") as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.get_by_slug = AsyncMock(return_value=None)

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            with pytest.raises(KeyError, match="not found"):
                await svc.get("missing-server")


class TestRegistryServiceDelete:
    @pytest.mark.asyncio
    async def test_delete_calls_permission_cleanup_first(self) -> None:
        session = AsyncMock()
        session.commit = AsyncMock()
        fake_server = _make_fake_server(slug="my-server")

        with patch("app.gateway.registry.ServerRepository") as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.get_by_slug = AsyncMock(return_value=fake_server)
            mock_repo.delete_exact_slug_permissions = AsyncMock()
            mock_repo.delete = AsyncMock()

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            await svc.delete("my-server")

        mock_repo.delete_exact_slug_permissions.assert_awaited_once()
        mock_repo.delete.assert_awaited_once_with(fake_server)

    @pytest.mark.asyncio
    async def test_delete_raises_key_error_if_not_found(self) -> None:
        session = AsyncMock()

        with patch("app.gateway.registry.ServerRepository") as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.get_by_slug = AsyncMock(return_value=None)

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            with pytest.raises(KeyError):
                await svc.delete("nonexistent")


class TestRegistryServiceUpdate:
    @pytest.mark.asyncio
    async def test_update_raises_key_error_if_not_found(self) -> None:
        session = AsyncMock()

        with patch("app.gateway.registry.ServerRepository") as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.get_by_slug = AsyncMock(return_value=None)

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=_make_settings())
            with pytest.raises(KeyError):
                await svc.update("nonexistent", ServerUpdate(name="New Name"))

    @pytest.mark.asyncio
    async def test_update_validates_url_if_provided(self) -> None:
        session = AsyncMock()
        fake_server = _make_fake_server()
        settings = _make_settings(environment=Environment.PRODUCTION)

        with patch("app.gateway.registry.ServerRepository") as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.get_by_slug = AsyncMock(return_value=fake_server)

            from app.gateway.registry import RegistryService

            svc = RegistryService(session=session, settings=settings)
            with pytest.raises(ValueError, match="HTTPS"):
                await svc.update("my-server", ServerUpdate(upstream_url="http://mcp.internal/mcp"))
