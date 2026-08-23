"""Persistence metadata contract for the Portcullis control plane."""

from collections.abc import Iterable

import pytest
from sqlalchemy import CheckConstraint, Enum, Table, UniqueConstraint
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import db, orm

EXPECTED_TABLES = {
    "tenants",
    "mcp_servers",
    "api_keys",
    "roles",
    "role_bindings",
    "tool_permissions",
    "rate_limit_policies",
    "audit_logs",
    "users",
    "invitations",
    "licenses",
    "teams",
    "org_members",
    "team_servers",
    "super_admin_organizations",
    "instances",
    "usage_daily",
}


def _unique_column_sets(table: Table) -> set[frozenset[str]]:
    return {
        frozenset(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def _foreign_key_targets(table: Table, column_name: str) -> set[str]:
    return {foreign_key.target_fullname for foreign_key in table.c[column_name].foreign_keys}


def _enum_values(table: Table, column_name: str) -> tuple[str, ...]:
    column_type = table.c[column_name].type
    assert isinstance(column_type, Enum)
    return tuple(column_type.enums)


def _check_sql(table: Table) -> Iterable[str]:
    return (
        str(constraint.sqltext).replace(" ", "").lower()
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    )


def test_metadata_contains_complete_schema() -> None:
    assert set(orm.Base.metadata.tables) == EXPECTED_TABLES


@pytest.mark.parametrize(
    "table_name",
    ("mcp_servers", "api_keys", "roles", "rate_limit_policies"),
)
def test_tenant_owned_tables_reference_tenants(table_name: str) -> None:
    table = orm.Base.metadata.tables[table_name]
    assert _foreign_key_targets(table, "tenant_id") == {"tenants.id"}


def test_registry_constraints_and_enums() -> None:
    table = orm.Base.metadata.tables["mcp_servers"]

    assert frozenset(("tenant_id", "slug")) in _unique_column_sets(table)
    assert _enum_values(table, "transport") == ("streamable_http",)
    assert _enum_values(table, "auth_mode") == ("none", "service_token")
    assert _enum_values(table, "status") == ("active", "disabled", "unhealthy")
    assert any("consecutive_health_failures>=0" in sql for sql in _check_sql(table))


def test_api_key_and_role_identity_constraints() -> None:
    api_keys = orm.Base.metadata.tables["api_keys"]
    roles = orm.Base.metadata.tables["roles"]
    bindings = orm.Base.metadata.tables["role_bindings"]

    assert frozenset(("key_prefix",)) in _unique_column_sets(api_keys)
    assert frozenset(("tenant_id", "name")) in _unique_column_sets(roles)
    assert _foreign_key_targets(bindings, "role_id") == {"roles.id"}
    # subject_id is TEXT (no FK) since v0.2 — supports both UUID and OAuth sub claims
    assert not _foreign_key_targets(bindings, "subject_id")
    assert _enum_values(bindings, "subject_type") == ("api_key", "oauth_subject")
    assert frozenset(("role_id", "subject_type", "subject_id")) in _unique_column_sets(bindings)


def test_permission_constraints_and_enums() -> None:
    table = orm.Base.metadata.tables["tool_permissions"]

    assert _foreign_key_targets(table, "role_id") == {"roles.id"}
    assert _enum_values(table, "effect") == ("allow", "deny")


def test_user_and_api_key_auth_constraints() -> None:
    users = orm.Base.metadata.tables["users"]
    api_keys = orm.Base.metadata.tables["api_keys"]

    assert _foreign_key_targets(users, "tenant_id") == {"tenants.id"}
    assert frozenset(("tenant_id", "email")) in _unique_column_sets(users)
    # api_keys.user_id is a nullable FK back to users for token attribution.
    assert _foreign_key_targets(api_keys, "user_id") == {"users.id"}


def test_invitation_auth_constraints_and_enums() -> None:
    users = orm.Base.metadata.tables["users"]
    invitations = orm.Base.metadata.tables["invitations"]

    assert _foreign_key_targets(invitations, "tenant_id") == {"tenants.id"}
    assert _foreign_key_targets(invitations, "created_by") == {"users.id"}
    assert _foreign_key_targets(invitations, "redeemed_by") == {"users.id"}
    assert _enum_values(invitations, "status") == ("active", "used", "revoked", "expired")
    assert _enum_values(users, "approval_status") == ("approved", "pending", "rejected")


def test_rate_limit_constraints_and_enums() -> None:
    table = orm.Base.metadata.tables["rate_limit_policies"]
    checks = tuple(_check_sql(table))

    # subject_id is polymorphic TEXT (UUID string or OAuth sub) — no FK since v0.5
    assert not _foreign_key_targets(table, "subject_id")
    assert _enum_values(table, "subject_type") == ("api_key", "oauth_subject")
    assert _enum_values(table, "algorithm") == ("token_bucket", "sliding_window")
    assert any("request_limit>0" in sql for sql in checks)
    assert any("window_seconds>0" in sql for sql in checks)
    assert any("burst_capacityisnullorburst_capacity>0" in sql for sql in checks)
    assert any("algorithm!='token_bucket'orburst_capacityisnotnull" in sql for sql in checks)


def test_admin_rbac_tables_and_constraints() -> None:
    teams = orm.Base.metadata.tables["teams"]
    team_servers = orm.Base.metadata.tables["team_servers"]
    org_members = orm.Base.metadata.tables["org_members"]
    super_admin_orgs = orm.Base.metadata.tables["super_admin_organizations"]

    # Teams are tenant-scoped with a unique name per tenant.
    assert _foreign_key_targets(teams, "tenant_id") == {"tenants.id"}
    assert frozenset(("tenant_id", "name")) in _unique_column_sets(teams)

    # Team ↔ server join table.
    assert _foreign_key_targets(team_servers, "team_id") == {"teams.id"}
    assert _foreign_key_targets(team_servers, "server_id") == {"mcp_servers.id"}

    # Org members carry a human admin role; a NULL team_id means org-wide.
    assert _foreign_key_targets(org_members, "tenant_id") == {"tenants.id"}
    assert _foreign_key_targets(org_members, "team_id") == {"teams.id"}
    assert _enum_values(org_members, "admin_role") == (
        "org_owner",
        "org_admin",
        "developer",
        "team_member",
        "viewer",
        "auditor",
        "billing_admin",
    )
    assert frozenset(("tenant_id", "user_subject")) in _unique_column_sets(org_members)

    # Super admin join table links a user to a managed org.
    assert _foreign_key_targets(super_admin_orgs, "super_admin_id") == {"users.id"}
    assert _foreign_key_targets(super_admin_orgs, "organization_tenant_id") == {"tenants.id"}


@pytest.mark.asyncio
async def test_async_database_factories_do_not_connect_eagerly() -> None:
    engine = db.create_engine("postgresql+asyncpg://user:password@database/portcullis")
    session_factory = db.create_session_factory(engine)

    try:
        assert engine.url.drivername == "postgresql+asyncpg"
        assert session_factory.class_ is AsyncSession
        assert session_factory.kw["expire_on_commit"] is False
    finally:
        await db.dispose_engine(engine)
