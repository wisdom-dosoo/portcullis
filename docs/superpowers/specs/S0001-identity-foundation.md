# Spec S0001 — Identity Foundation

Status: Draft<br>
Sub-project: 1 of 6 (foundation)<br>
Phase: v0.4

## Problem

The current instance is single-tenant: every `User`, `ApiKey`, `McpServer`, and resource is bound to the `DEFAULT_TENANT_ID` sentinel. There is no distinct "platform administrator" identity — the only privileged concept is an API-key `admin` scope, which is a key property, not a person. The upcoming v0.4 surfaces (billing/license backend, admin dashboard, support, sales, and license pages) all need a way to determine who may perform platform-level actions. Those surfaces also need the ability to reason about tenants, since real orgs will be introduced as separate tenants.

## Goals

1. Introduce a person-level **platform admin** identity, gateable by a new `PLATFORM_ADMIN` scope on `User`, independent of raw API-key `admin` scope.
2. Add **tenant-scope plumbing** so a `Subject` can carry the tenant it belongs to, without migrating existing sentinel-bound data or changing today's behavior.
3. Provide a **CLI-only bootstrap** to promote the first platform admin (no unauthenticated/generic HTTP path).
4. Lay an additive, backwards-compatible foundation that sub-projects 2–6 build on.

## Non-goals

- No tenant CRUD or multi-tenant serving in this sub-project.
- No new `/admin/platform/*` API routes beyond a single `/me`-style flag used by the frontend.
- No changes to existing `authenticated_subject` / `admin_subject` behavior for existing endpoints.
- No HTTP endpoint for promoting platform admins.

## Decisions (confirmed)

- Platform Admin = a `User`-level boolean, surfaced through a `PLATFORM_ADMIN` scope on their token subject.
- `DEFAULT_TENANT_ID` remains the platform/system tenant. Real orgs become new tenants with tenant-scoped tokens in a later sub-project.
- Additive & backwards-compatible: existing single-tenant behavior is untouched until callers explicitly adopt the new scope.
- First platform admin is grantable **only** via the CLI (`portcullis admin bootstrap <email>`).
- Bootstrap CLI also mints a one-time plaintext access token, mirroring `admin-key create`.
- Frontend surfaces admin state via a `GET /admin/platform/me` flag; no new UI in this sub-project.

## External interfaces

### CLI

```
portcullis admin bootstrap <email>
```

- Promotes the user with `email` in `DEFAULT_TENANT_ID` to `is_platform_admin=True`.
- Idempotent: promoting an already-admin user is a no-op success.
- Prints a one-time plaintext bearer token (`pk_…`) to stdout, bound to that user, exactly once.
- Writes an audit log entry (`PLATFORM_ADMIN_GRANTED`).
- Fails (exit non-zero) with a clear message if the user does not exist.

### HTTP

`GET /admin/platform/me` — platform-admin introspection.

- Response: `PlatformAdminMe { is_platform_admin: bool, user: UserView }`.
- Gated by `platform_admin_subject`: 401 for missing/invalid credentials, 403 for a valid non-platform-admin subject.
- Folded into `/admin` router (new `app/api/platform.py`), passed no payload.

## Domain changes

### `User` model (`app/models/orm.py`)

- Add `is_platform_admin: Mapped[bool] = mapped_column(nullable=False, default=False)`.
- Surface as `platform_admin: bool` on `UserView` (`app/models/schemas.py`).

### `Subject` (`app/auth/subject.py`)

- Add optional `tenant_id: UUID | None` field.
- Populated from the API key's `tenant_id` when an API-key subject is resolved (production keys are all sentinel today; no behavior change).
- `Subject.has_scope` unchanged.

### `AuditEventType` (`app/models/orm.py`)

- Add `PLATFORM_ADMIN_GRANTED = "PLATFORM_ADMIN_GRANTED"`.

## Implementation plan

1. **Model + schema** — add `User.is_platform_admin`, `UserView.platform_admin`, `AuditEventType.PLATFORM_ADMIN_GRANTED`.
2. **Auth layer** — `app/auth/subject.py` gains `tenant_id`; `app/auth/authenticate.py` populates it for API-key subjects; add `platform_admin_subject` and `tenant_subject` dependencies in `app/auth/dependencies.py`.
   - `platform_admin_subject`: requires API-key subject whose key is user-bound, in `DEFAULT_TENANT_ID`, with the resolved user `is_platform_admin=True`. 403 otherwise.
   - `tenant_subject`: resolves the effective tenant id for scoped queries; sentinel today.
3. **User repository** — `UserRepository.get_by_email` unchanged; add `set_platform_admin(tenant_id, user_id, flag) -> bool`.
4. **CLI** — subparser `admin bootstrap` in `app/cli.py`, mirroring `_create_admin_key`; resolves user, flips flag, mints token via existing `issue_key`, writes audit entry.
5. **Platform API** — `app/api/platform.py` with `GET /admin/platform/me`; mount in `app/api/__init__.py`.

## Security considerations

- Platform admin is a **person** (user-bound key + flag), never a raw admin API key.
- No escalation path: a token minted before promotion carries `is_platform_admin` state at resolution time (flag read per request), so revoking the flag immediately gates all future requests.
- Audit log records grants; the CLI path is the only mutation route.

## Testing

- Unit: `platform_admin_subject` returns 403 for (a) admin-scope key not user-bound, (b) valid user not flagged, (c) user flagged but key not bound to that user.
- Unit: `tenant_subject` resolves sentinel for existing keys.
- Integration: CLI bootstrap end-to-end (create user via `/auth/register`, run CLI, confirm `platform_admin` true on `/auth/me`, `/admin/platform/me` returns `is_platform_admin=true`).
- Integration: `/admin/platform/me` 401/403 for unauthenticated and non-admin subjects.
- Idempotency: running bootstrap twice succeeds both times.
- `pytest`, `ruff`, `mypy` pass in `api/`.

## Risk check

- **Backwards compatibility:** additive flag + optional field → no migration rename; `tenant_id` derived not asserted → nothing breaks.
- **CLI changes:** existing `admin-key` parser untouched; new `admin` subparser nests cleanly.
- **Secret handling:** token printed once to stdout, matching existing key conventions; never logged.