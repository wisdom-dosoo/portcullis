# S0001 — Identity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a person-level platform-admin identity (`User.is_platform_admin`), tenant-scope plumbing (`tenant_subject`), and a CLI bootstrap so /admin/platform surfaces can be gated — without changing existing single-tenant behavior.

**Architecture:** Additive & backwards-compatible. A new boolean on `users` + a new `audit_event_type` enum value; a new `platform_admin_subject` dependency that requires a user-bound API key in the default tenant whose user is flagged; a thin `tenant_subject` dependency exposing `subject.tenant_id` (already present on `Subject`); a `GET /admin/platform/me` endpoint; and a `portcullis admin bootstrap <email>` CLI that promotes a user, mints a one-time user token, and writes an audit log.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, structlog, pytest (asyncio auto mode), ruff, mypy.

**Spec:** `docs/superpowers/specs/S0001-identity-foundation.md`

**Node — deviations from spec (flagged during writing):**
- `Subject.tenant_id` **already exists** and is already populated by `verify_key` (`app/auth/api_keys.py:128-133`). Plan does not re-add it; only the `tenant_subject` dependency is new.
- `UserView` gains `is_platform_admin` (matching the ORM column for clean `from_attributes` mapping), rather than `platform_admin` as written in the spec.
- The new `/admin/platform/me` router is mounted in `app/main.py` on the API app (there is no separate versioned `/admin` prefix; existing admin routers are `/admin/...` within the API app). Spec referred to an "`/admin` router" abstractly; the plan mounts `app.api.platform.router` the same way as `auth_router`.

---

### Task 1: Migration — add `users.is_platform_admin` + audit enum value

**Files:**
- Create: `api/alembic/versions/0005_v0_4_platform_admin.py`
- Test: `api/tests/integration/test_migrations.py`

- [ ] **Step 1: Write failing assertions in `test_migrations.py`**

Append a new test asserting the new column and enum value exist after upgrade to head:

```python
@pytest.mark.integration
async def test_platform_admin_column_and_audit_enum_exist(
    postgres_container: str,
) -> None:
    """v0.4 adds users.is_platform_admin and the platform_admin_granted audit value."""
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", postgres_container)
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")

    engine = create_async_engine(postgres_container, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            columns = {
                col["name"]
                for col in await conn.run_sync(
                    lambda sync_conn: inspect(sync_conn).get_columns("users")
                )
            }
            assert "is_platform_admin" in columns

            values = await conn.scalars(
                text(
                    "SELECT enum_range(NULL::audit_event_type)"
                )
            )
            enum_text = str(values.first())
            assert "platform_admin_granted" in enum_text, enum_text
    finally:
        await engine.dispose()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/integration/test_migrations.py::test_platform_admin_column_and_audit_enum_exist -v`
Expected: FAIL with `assert "is_platform_admin" in columns` (`KeyError`/AssertionError) on the column check.

- [ ] **Step 3: Create the migration file `0005_v0_4_platform_admin.py`**

```python
"""v0.4 — Platform-admin identity.

Changes:
  1. Add users.is_platform_admin (default false) — a person-level flag granting
     platform-admin privileges, gated by the new PLATFORM_ADMIN path.
  2. Extend the audit_event_type enum with 'platform_admin_granted' so admin
     bootstrap actions are auditable.

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-15 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_platform_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # PG 12+ permits ALTER TYPE ADD VALUE inside a transaction as long as the
    # new value is not used within the same transaction block.
    op.execute(
        sa.text("ALTER TYPE audit_event_type ADD VALUE 'platform_admin_granted'")
    )


def downgrade() -> None:
    op.drop_column("users", "is_platform_admin")
    # PostgreSQL enums cannot drop values; the enum addition is left in place.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/integration/test_migrations.py::test_platform_admin_column_and_audit_enum_exist -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/alembic/versions/0005_v0_4_platform_admin.py api/tests/integration/test_migrations.py
git commit -m "feat: add users.is_platform_admin column and platform_admin_granted audit enum"
```

---

### Task 2: ORM model — `User.is_platform_admin` + `AuditEventType.PLATFORM_ADMIN_GRANTED`

**Files:**
- Modify: `api/app/models/orm.py:198-224` (User model)
- Modify: `api/app/models/orm.py:356-359` (AuditEventType)
- Test: `api/tests/unit/test_orm_metadata.py`

- [ ] **Step 1: Write failing tests in `test_orm_metadata.py`**

Add to `test_user_and_api_key_auth_constraints` (or a new test):

```python
def test_platform_admin_column_and_audit_enum() -> None:
    users = orm.Base.metadata.tables["users"]

    assert "is_platform_admin" in users.c
    assert orm.AuditEventType.PLATFORM_ADMIN_GRANTED == "platform_admin_granted"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_orm_metadata.py::test_platform_admin_column_and_audit_enum -v`
Expected: FAIL — `users.c` has no `is_platform_admin` and enum member raises `AttributeError`.

- [ ] **Step 3: Add the column to the `User` model**

In `app/models/orm.py`, after `is_active` (line 213), add:

```python
    is_platform_admin: Mapped[bool] = mapped_column(nullable=False, default=False)
```

- [ ] **Step 4: Add the enum member to `AuditEventType`**

```python
class AuditEventType(StrEnum):
    AUTH_FAILURE = "auth_failure"
    RBAC_DENY = "rbac_deny"
    TOOL_CALL = "tool_call"
    PLATFORM_ADMIN_GRANTED = "platform_admin_granted"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pytest tests/unit/test_orm_metadata.py::test_platform_admin_column_and_audit_enum -v`
Expected: PASS

- [ ] **Step 6: Run lint/typecheck**

Run: `ruff check app && mypy app`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/app/models/orm.py api/tests/unit/test_orm_metadata.py
git commit -m "feat: add is_platform_admin to User and PLATFORM_ADMIN_GRANTED audit event"
```

---

### Task 3: Schemas — `UserView.is_platform_admin` + `PlatformAdminMe`

**Files:**
- Modify: `api/app/models/schemas.py:137-154` (UserView)
- Modify: `api/app/models/schemas.py` (add `PlatformAdminMe`)
- Test: `api/tests/unit/test_auth_api.py`

- [ ] **Step 1: Write a failing test**

Append to `test_auth_api.py`:

```python
class TestPlatformAdminMeSchema:
    def test_platform_admin_me_shape(self) -> None:
        from app.models.schemas import PlatformAdminMe

        user = _make_orm_user()
        user.is_platform_admin = True
        me = PlatformAdminMe(is_platform_admin=True, user=UserView.model_validate(user))
        assert me.is_platform_admin is True
        assert me.user.is_platform_admin is True
```

Add the missing import at the top of `test_auth_api.py` (after existing schema imports):

```python
from app.models.schemas import UserView
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_auth_api.py::TestPlatformAdminMeSchema -v`
Expected: FAIL — `ImportError: cannot import name 'PlatformAdminMe'` and `UserView` has no `is_platform_admin`.

- [ ] **Step 3: Add `is_platform_admin` to `UserView`**

In `app/models/schemas.py`, inside `UserView` after `approval_status`:

```python
    is_platform_admin: bool = False
```

- [ ] **Step 4: Add the `PlatformAdminMe` schema**

After `UserView` (before `AuthResponse`):

```python
class PlatformAdminMe(BaseModel):
    """Response for the platform-admin introspection endpoint."""

    is_platform_admin: bool
    user: UserView
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pytest tests/unit/test_auth_api.py::TestPlatformAdminMeSchema -v`
Expected: PASS

- [ ] **Step 6: Run lint/typecheck**

Run: `ruff check app tests && mypy app`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/app/models/schemas.py api/tests/unit/test_auth_api.py
git commit -m "feat: add is_platform_admin to UserView and PlatformAdminMe schema"
```

---

### Task 4: Repository — `UserRepository.set_platform_admin`

**Files:**
- Modify: `api/app/repositories/users.py`
- Test: Create `api/tests/integration/test_user_repository.py`

- [ ] **Step 1: Write failing integration tests**

Create `api/tests/integration/test_user_repository.py`:

```python
"""Integration tests for UserRepository — including platform-admin flag."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import UserApprovalStatus
from app.repositories.users import UserRepository

TENANT = UUID("00000000-0000-0000-0000-000000000001")


async def _seed_user(async_session: AsyncSession, email: str) -> UUID:
    repo = UserRepository(async_session)
    user = await repo.create(
        tenant_id=TENANT,
        email=email,
        password_hash="$argon2id$dummy",
        full_name="Test User",
        org_name=None,
        intended_use=None,
        approval_status=UserApprovalStatus.APPROVED,
    )
    await async_session.commit()
    return user.id


async def test_set_platform_admin_flips_flag(async_session: AsyncSession) -> None:
    user_id = await _seed_user(async_session, "owner@example.com")
    repo = UserRepository(async_session)

    assert await repo.set_platform_admin(TENANT, user_id, True) is True
    await async_session.commit()
    await async_session.expire_all()

    user = await repo.get_by_id(TENANT, user_id)
    assert user is not None
    assert user.is_platform_admin is True


async def test_set_platform_admin_false_for_missing_user(
    async_session: AsyncSession,
) -> None:
    repo = UserRepository(async_session)
    missing = UUID("11111111-1111-1111-1111-111111111111")
    assert await repo.set_platform_admin(TENANT, missing, True) is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/integration/test_user_repository.py -v`
Expected: FAIL with `AttributeError: 'UserRepository' object has no attribute 'set_platform_admin'`

- [ ] **Step 3: Implement the method**

In `app/repositories/users.py`, after `set_approval_status`:

```python
    async def set_platform_admin(
        self,
        tenant_id: UUID,
        user_id: UUID,
        flag: bool,
    ) -> bool:
        """Set a user's platform-admin flag; False if the user is missing."""
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            update(User)
            .where(
                User.tenant_id == tenant_id,
                User.id == user_id,
            )
            .values(is_platform_admin=flag)
        )
        return cursor.rowcount > 0
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/integration/test_user_repository.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run lint/typecheck**

Run: `ruff check app tests && mypy app`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/app/repositories/users.py api/tests/integration/test_user_repository.py
git commit -m "feat: add UserRepository.set_platform_admin"
```

---

### Task 5: Auth dependencies — `platform_admin_subject` + `tenant_subject`

**Files:**
- Modify: `api/app/auth/dependencies.py`
- Test: `api/tests/unit/test_auth_dependencies.py`

- [ ] **Step 1: Write failing tests**

Append to `test_auth_dependencies.py`:

```python
# ---------------------------------------------------------------------------
# tenant_subject
# ---------------------------------------------------------------------------


class TestTenantSubject:
    @pytest.mark.asyncio
    async def test_returns_subject_tenant_id(self) -> None:
        from app.auth.dependencies import tenant_subject

        subject = _make_subject(["read"])
        assert await tenant_subject(subject=subject) == TENANT_ID


# ---------------------------------------------------------------------------
# platform_admin_subject
# ---------------------------------------------------------------------------


def _make_user_mock(*, flagged: bool, active: bool = True) -> MagicMock:
    user = MagicMock()
    user.is_active = active
    user.approval_status = UserApprovalStatus.APPROVED
    user.is_platform_admin = flagged
    return user


def _make_api_key_mock(*, user_id: UUID | None) -> MagicMock:
    key = MagicMock()
    key.user_id = user_id
    return key


class TestPlatformAdminSubject:
    @pytest.mark.asyncio
    async def test_api_key_not_user_bound_raises_401(self) -> None:
        from app.auth.dependencies import platform_admin_subject

        session = _make_mock_session()
        subject = _make_subject(["admin"])

        with (
            patch("app.auth.dependencies.ApiKeyRepository") as MockKeys,
            patch("app.auth.dependencies.UserRepository") as MockUsers,
        ):
            MockKeys.return_value.get_by_id = AsyncMock(
                return_value=_make_api_key_mock(user_id=None)
            )
            with pytest.raises(HTTPException) as exc_info:
                await platform_admin_subject(subject=subject, session=session)

        assert exc_info.value.status_code == 401
        MockUsers.return_value.get_by_id.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_user_not_flagged_raises_403(self) -> None:
        from app.auth.dependencies import platform_admin_subject

        session = _make_mock_session()
        subject = _make_subject(["admin"])
        user_id = uuid4()

        with (
            patch("app.auth.dependencies.ApiKeyRepository") as MockKeys,
            patch("app.auth.dependencies.UserRepository") as MockUsers,
        ):
            MockKeys.return_value.get_by_id = AsyncMock(
                return_value=_make_api_key_mock(user_id=user_id)
            )
            MockUsers.return_value.get_by_id = AsyncMock(
                return_value=_make_user_mock(flagged=False)
            )
            with pytest.raises(HTTPException) as exc_info:
                await platform_admin_subject(subject=subject, session=session)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Platform admin required"

    @pytest.mark.asyncio
    async def test_flagged_user_passes(self) -> None:
        from app.auth.dependencies import platform_admin_subject

        session = _make_mock_session()
        subject = _make_subject(["admin"])
        user_id = uuid4()

        with (
            patch("app.auth.dependencies.ApiKeyRepository") as MockKeys,
            patch("app.auth.dependencies.UserRepository") as MockUsers,
        ):
            MockKeys.return_value.get_by_id = AsyncMock(
                return_value=_make_api_key_mock(user_id=user_id)
            )
            MockUsers.return_value.get_by_id = AsyncMock(
                return_value=_make_user_mock(flagged=True)
            )
            result = await platform_admin_subject(subject=subject, session=session)

        assert result is subject
```

Add imports at the top of `test_auth_dependencies.py`:

```python
from fastapi import HTTPException
from app.models.orm import SubjectType, UserApprovalStatus
```

(Replace the existing `from fastapi import HTTPException` — it is already imported.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_auth_dependencies.py -v`
Expected: FAIL — `ImportError: cannot import name 'tenant_subject'` / `'platform_admin_subject'`.

- [ ] **Step 3: Implement the dependencies**

In `app/auth/dependencies.py`, add imports:

```python
from uuid import UUID

from app.auth.api_keys import ApiKeyRepository
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import SubjectType, UserApprovalStatus
from app.repositories.users import UserRepository
```

Then append after `admin_subject`:

```python
async def tenant_subject(
    subject: Annotated[Subject, Depends(current_subject)],
) -> UUID:
    """Return the tenant id scoping the authenticated subject.

    Today every key resolves to the sentinel tenant; real org tenants arrive
    in a later sub-project. This dependency is the explicit seam for that.
    """
    return subject.tenant_id


async def platform_admin_subject(
    subject: Annotated[Subject, Depends(current_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Subject:
    """Return subject only if it identifies a platform administrator.

    Accepts an API-key subject whose key is user-bound in the default tenant
    AND whose user has ``is_platform_admin`` set. A valid but non-admin
    subject raises 403; any invalid credential raises 401 (no detail leak).
    """
    if subject.subject_type is not SubjectType.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")

    keys = ApiKeyRepository(session)
    api_key = await keys.get_by_id(UUID(subject.subject_id), DEFAULT_TENANT_ID)
    if api_key is None or api_key.user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")

    repo = UserRepository(session)
    user = await repo.get_by_id(DEFAULT_TENANT_ID, api_key.user_id)
    if (
        user is None
        or not user.is_active
        or user.approval_status is not UserApprovalStatus.APPROVED
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")
    if not user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform admin required")

    return subject
```

Note: `AsyncSession` must be imported from `sqlalchemy.ext.asyncio` — it already is in this module.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_auth_dependencies.py -v`
Expected: PASS

- [ ] **Step 5: Run lint/typecheck**

Run: `ruff check app tests && mypy app`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/app/auth/dependencies.py api/tests/unit/test_auth_dependencies.py
git commit -m "feat: add platform_admin_subject and tenant_subject dependencies"
```

---

### Task 6: Platform API router — `GET /admin/platform/me`

**Files:**
- Create: `api/app/api/platform.py`
- Modify: `api/app/main.py`
- Test: Create `api/tests/unit/test_platform_api.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/unit/test_platform_api.py`:

```python
"""Unit tests for the /admin/platform endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.auth.dependencies import platform_admin_subject
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import SubjectType, UserApprovalStatus

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC)


def _make_subject() -> Subject:
    return Subject(
        subject_id=str(UUID("00000000-0000-0000-0000-0000000000cd")),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_api_key_mock() -> MagicMock:
    key = MagicMock()
    key.user_id = UUID("00000000-0000-0000-0000-0000000000ab")
    return key


def _make_user_mock() -> MagicMock:
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-0000000000ab")
    user.email = "owner@example.com"
    user.full_name = "Owner"
    user.org_name = None
    user.intended_use = None
    user.is_active = True
    user.approval_status = UserApprovalStatus.APPROVED
    user.is_platform_admin = True
    user.created_at = NOW
    user.updated_at = NOW
    return user


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


@pytest.mark.asyncio
async def test_platform_admin_me_returns_flag() -> None:
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response: Response = await client.get("/admin/platform/me")

    assert response.status_code == 200
    body = response.json()
    assert body["is_platform_admin"] is True
    assert body["user"]["email"] == "owner@example.com"
    assert body["user"]["is_platform_admin"] is True


@pytest.mark.asyncio
async def test_platform_admin_me_patches_repos() -> None:
    """The endpoint queries ApiKeyRepository + UserRepository."""
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()
    mock_session = app.state.runtime.session_factory.return_value.__aenter__.return_value

    with (
        patch("app.api.platform.ApiKeyRepository") as MockKeys,
        patch("app.api.platform.UserRepository") as MockUsers,
    ):
        MockKeys.return_value.get_by_id = AsyncMock(return_value=_make_api_key_mock())
        MockUsers.return_value.get_by_id = AsyncMock(return_value=_make_user_mock())

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get("/admin/platform/me")

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "owner@example.com"
    assert body["is_platform_admin"] is True
    # auth/me-style repo lookups occur against the request session.
    MockKeys.return_value.get_by_id.assert_awaited_once()
    MockUsers.return_value.get_by_id.assert_awaited_once()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_platform_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.platform'` and 404 for `/admin/platform/me`.

- [ ] **Step 3: Create `app/api/platform.py`**

```python
"""Platform-admin introspection endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.auth.dependencies import platform_admin_subject
from app.auth.subject import Subject
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import SubjectType, UserApprovalStatus
from app.models.schemas import PlatformAdminMe, UserView
from app.repositories.api_keys import ApiKeyRepository
from app.repositories.users import UserRepository

router = APIRouter(prefix="/admin/platform", tags=["admin-platform"])


async def _resolve_admin_user(
    subject: Subject,
    session: AsyncSession,
) -> tuple[object, UserView]:
    """Resolve the platform-admin api key + user from a subject.

    Mirrors ``/auth/me``: reads the api_keys row by id in the default tenant,
    then the bound user. Raises HTTPException 401 for missing/invalid creds and
    403 if the resolved user is not a platform admin.
    """
    if subject.subject_type is not SubjectType.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")

    keys = ApiKeyRepository(session)
    api_key = await keys.get_by_id(UUID(subject.subject_id), DEFAULT_TENANT_ID)
    if api_key is None or api_key.user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")

    repo = UserRepository(session)
    user = await repo.get_by_id(DEFAULT_TENANT_ID, api_key.user_id)
    if (
        user is None
        or not user.is_active
        or user.approval_status is not UserApprovalStatus.APPROVED
        or not user.is_platform_admin
    ):
        raise HTTPException(status_code=403, detail="Platform admin required")

    return api_key, UserView.model_validate(user)


@router.get("/me", response_model=PlatformAdminMe)
async def platform_admin_me(
    subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformAdminMe:
    """Return the platform-admin status of the current subject."""
    _, user = await _resolve_admin_user(subject, session)
    return PlatformAdminMe(is_platform_admin=True, user=user)
```

- [ ] **Step 4: Mount the router in `app/main.py`**

After the `app.api.audit` import + include (main.py:167-169), add:

```python
    from app.api.platform import router as platform_router

    application.include_router(platform_router)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/unit/test_platform_api.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Run lint/typecheck**

Run: `ruff check app tests && mypy app`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/app/api/platform.py api/app/main.py api/tests/unit/test_platform_api.py
git commit -m "feat: add GET /admin/platform/me platform-admin introspection endpoint"
```

---

### Task 7: CLI — `portcullis admin bootstrap <email>`

**Files:**
- Modify: `api/app/cli.py`
- Test: `api/tests/unit/test_cli.py`

- [ ] **Step 1: Write failing tests**

Append to `test_cli.py`:

```python
# ---------------------------------------------------------------------------
# admin bootstrap
# ---------------------------------------------------------------------------


def _make_user_mock() -> MagicMock:
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-0000000000ab")
    user.email = "owner@example.com"
    return user


class TestBootstrapAdmin:
    @pytest.mark.asyncio
    async def test_promotes_user_and_prints_token(self, capsys) -> None:
        plaintext = "pk_abcdefgh_" + "a" * 43
        issued = IssuedKey(
            key_id=UUID("00000000-0000-0000-0000-000000000099"),
            plaintext=plaintext,
            prefix="abcdefgh",
            scopes=frozenset(),
        )
        mock_runtime = _make_mock_runtime()
        mock_user = _make_user_mock()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch("app.cli.UserRepository") as MockUsers,
            patch("app.cli.AuditRepository") as MockAudit,
            patch("app.cli.issue_key", new_callable=AsyncMock, return_value=issued) as mock_issue,
        ):
            repo = MockUsers.return_value
            repo.get_by_email = AsyncMock(return_value=mock_user)
            repo.set_platform_admin = AsyncMock(return_value=True)
            audit = MockAudit.return_value
            audit.create = AsyncMock(return_value=MagicMock())

            await _bootstrap_admin("owner@example.com")

        assert MockUsers.return_value.set_platform_admin.await_count == 1
        audit.create.assert_awaited_once()
        mock_issue.assert_awaited_once()
        captured = capsys.readouterr()
        assert captured.out.strip() == plaintext

    @pytest.mark.asyncio
    async def test_missing_user_raises_system_exit(self, capsys) -> None:
        mock_runtime = _make_mock_runtime()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch("app.cli.UserRepository") as MockUsers,
        ):
            MockUsers.return_value.get_by_email = AsyncMock(return_value=None)

            with pytest.raises(SystemExit):
                await _bootstrap_admin("missing@example.com")

        mock_runtime.close.assert_awaited_once()
```

Add import at the top of `test_cli.py`:

```python
from app.cli import _bootstrap_admin, _create_admin_key
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_cli.py::TestBootstrapAdmin -v`
Expected: FAIL — `ImportError: cannot import name '_bootstrap_admin'`.

- [ ] **Step 3: Implement the CLI command**

In `app/cli.py`, update imports. The file currently imports:

```python
from app.auth.api_keys import issue_key
from app.config import get_settings
from app.gateway.registry import DEFAULT_TENANT_ID
from app.runtime import Runtime
```

Keep those four unchanged and add:

```python
from app.models.orm import AuditEventType, SubjectType
from app.repositories.audit import AuditRepository
from app.repositories.users import UserRepository
```

Update `main()`:

```python
    admin_key_parser = subparsers.add_parser("admin-key", help="Manage admin API keys")
    admin_key_parser.add_argument("action", help="Action to perform (create)")
    admin_key_parser.add_argument("--name", required=True, help="Name for the new API key")

    admin_parser = subparsers.add_parser("admin", help="Platform administration")
    admin_subparsers = admin_parser.add_subparsers(dest="admin_command")

    bootstrap_parser = admin_subparsers.add_parser(
        "bootstrap", help="Promote a user to platform admin"
    )
    bootstrap_parser.add_argument("email", help="Email of the user to promote")

    args = parser.parse_args()

    if args.command == "admin-key" and args.action == "create":
        asyncio.run(_create_admin_key(args.name))
    elif args.command == "admin" and args.admin_command == "bootstrap":
        asyncio.run(_bootstrap_admin(args.email))
    else:
        parser.print_help()
```

Add the implementation function after `_create_admin_key`:

```python
async def _bootstrap_admin(email: str) -> None:
    """Promote a user to platform admin and print their first access token.

    Idempotent: re-promoting an already-admin user succeeds and mints a fresh
    token. The plaintext key is printed once and never stored.
    """
    settings = get_settings()
    runtime = Runtime.build(settings)
    try:
        async with runtime.session_factory() as session:
            repo = UserRepository(session)
            user = await repo.get_by_email(DEFAULT_TENANT_ID, email)
            if user is None:
                raise SystemExit(f"No user found with email: {email}")

            if not await repo.set_platform_admin(DEFAULT_TENANT_ID, user.id, True):
                raise SystemExit(f"Could not promote user: {email}")

            issued = await issue_key(
                name=f"user:{user.email}",
                scopes=[],
                pepper=settings.api_key_pepper,
                session=session,
                tenant_id=DEFAULT_TENANT_ID,
                user_id=user.id,
            )

            audit = AuditRepository(session)
            await audit.create(
                event_type=AuditEventType.PLATFORM_ADMIN_GRANTED,
                outcome="allowed",
                tenant_id=DEFAULT_TENANT_ID,
                subject_id=str(user.id),
                subject_type=SubjectType.API_KEY,
                detail={"email": user.email},
            )
            await session.commit()
        print(issued.plaintext)
    finally:
        await runtime.close()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_cli.py -v`
Expected: PASS (all previous + 2 new)

- [ ] **Step 5: Verify CLI wiring end-to-end (manual smoke)**

Run: `python -m app.cli --help; python -m app.cli admin bootstrap --help`
Expected: both print usage; `admin bootstrap` shows the `email` argument.

- [ ] **Step 6: Run lint/typecheck**

Run: `ruff check app tests && mypy app`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/app/cli.py api/tests/unit/test_cli.py
git commit -m "feat: add portcullis admin bootstrap CLI command"
```

---

### Task 8: Integration — CLI bootstrap end-to-end (real DB)

**Files:**
- Test: Create `api/tests/integration/test_cli_bootstrap_flow.py`

- [ ] **Step 1: Write the integration test**

Create `api/tests/integration/test_cli_bootstrap_flow.py`:

```python
"""Integration: portcullis admin bootstrap against a real database."""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import PasswordService
from app.cli import _bootstrap_admin
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import AuditEventType, SubjectType, UserApprovalStatus
from app.repositories.audit import AuditRepository
from app.repositories.users import UserRepository

PEPPER = "development-only-change-me"


@pytest.mark.integration
async def test_bootstrap_promotes_user_and_audits(
    async_session: AsyncSession,
    capsys: pytest.CaptureFixture[str],
) -> None:
    passwords = PasswordService(PEPPER)
    repo = UserRepository(async_session)
    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email="owner@example.com",
        password_hash=passwords.hash_password("password-123"),
        full_name="Owner",
        org_name="Acme",
        intended_use="admin",
        approval_status=UserApprovalStatus.APPROVED,
    )
    await async_session.commit()

    await _bootstrap_admin("owner@example.com")

    out = capsys.readouterr().out.strip()
    assert out.startswith("pk_")

    await async_session.expire_all()
    promoted = await repo.get_by_email(DEFAULT_TENANT_ID, "owner@example.com")
    assert promoted is not None
    assert promoted.is_platform_admin is True

    audit = AuditRepository(async_session)
    events = await audit.list(
        DEFAULT_TENANT_ID,
        event_type=AuditEventType.PLATFORM_ADMIN_GRANTED,
    )
    assert any(
        e.subject_id == str(user.id) and e.detail.get("email") == "owner@example.com"
        for e in events
    )


@pytest.mark.integration
async def test_bootstrap_is_idempotent(
    async_session: AsyncSession,
    capsys: pytest.CaptureFixture[str],
) -> None:
    passwords = PasswordService(PEPPER)
    repo = UserRepository(async_session)
    await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email="again@example.com",
        password_hash=passwords.hash_password("password-123"),
        full_name="Again",
        org_name="Acme",
        intended_use="admin",
        approval_status=UserApprovalStatus.APPROVED,
    )
    await async_session.commit()

    await _bootstrap_admin("again@example.com")
    await _bootstrap_admin("again@example.com")

    captured = capsys.readouterr().out.strip().splitlines()
    assert len(captured) == 2
    assert all(line.startswith("pk_") for line in captured)

    await async_session.expire_all()
    promoted = await repo.get_by_email(DEFAULT_TENANT_ID, "again@example.com")
    assert promoted is not None
    assert promoted.is_platform_admin is True
```

Note: `_bootstrap_admin` builds its own `Runtime` from `get_settings()`; in integration tests `DATABASE_URL` is set by the `postgres_container` fixture, and `Redis.from_url`/`httpx.AsyncClient` are created but never used, so `close()` cleanly tears them down.

- [ ] **Step 2: Run the tests to verify they fail (or pass against real DB)**

Run: `pytest tests/integration/test_cli_bootstrap_flow.py -v`
Expected: They should pass once Task 7 lands; if run before Task 7, FAIL with `ImportError`. If the environment already has the gem, confirm PASS and proceed.

- [ ] **Step 3: Run the full test suite + lint + typecheck**

Run: `pytest` then `ruff check app tests` then `mypy app`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add api/tests/integration/test_cli_bootstrap_flow.py
git commit -m "test: integration coverage for admin bootstrap CLI flow"
```

---

## Self-Review

**Spec coverage:**
- `User.is_platform_admin` column → Task 1 (migration), Task 2 (ORM).
- `UserView` surface flag → Task 3 (named `is_platform_admin` for from_attributes mapping — deviation documented).
- `Subject.tenant_id` + `tenant_subject` → Task 5 (Subject already had it; dependency only).
- `platform_admin_subject` (person-level, user-bound, sentinel) → Task 5.
- `AuditEventType.PLATFORM_ADMIN_GRANTED` → Task 2 (ORM) + Task 1 (DB enum value).
- CLI `admin bootstrap` (idempotent, mints one-time token, audit-logged, exits non-zero on missing user) → Task 7.
- `GET /admin/platform/me` → Task 6.
- Default-tenant residency enforced on platform admin → Tasks 5 & 6 via `get_by_id(..., DEFAULT_TENANT_ID)`.
- Security: flag read at resolution time (per request), audit on grant, no escalation via admin API keys → Task 5 (user-bound requirement), Task 7 (audit), Tests.

**Placeholder scan:** No TBD/TODO placeholders; all steps carry exact code, paths, and commands.

**Type consistency:**
- `_UserRepository.set_platform_admin(tenant_id, user_id, flag) -> bool` used identically in Tasks 4, 7.
- `PlatformAdminMe(is_platform_admin, user)` created in Task 3, used in Task 5.
- `platform_admin_subject(subject, session) -> Subject` signature identical across Tasks 5, 6.
- `GET /admin/platform/me` base path matches router prefix `/admin/platform` + route `/me`.