# Portcullis Project Structure Design

**Date:** 2026-08-03

**Status:** Approved for implementation planning

## Objective

Create the initial Portcullis repository structure described in `README.md` without implementing application behavior. The result will give future work stable package boundaries, named modules, and syntactically valid project configuration while making no claim that the service is runnable.

## Scope

The scaffold will mirror the repository tree documented in the README:

- `app/` will be an importable Python package.
- `app/gateway/`, `app/auth/`, `app/limits/`, `app/observability/`, `app/models/`, and `app/api/` will be importable subpackages.
- Every Python module named in the README will exist and contain only a concise module docstring describing its responsibility.
- `alembic/versions/`, `tests/unit/`, `tests/integration/`, `deploy/`, `docs/diagrams/`, and `.github/workflows/` will exist in version control.
- Root-level project metadata and policy files named in the README will exist.

This milestone will not add functions, classes, routes, database models, migrations, tests of application behavior, dependency wiring, or executable service behavior.

## File Layout

```text
portcullis/
|-- app/
|   |-- __init__.py
|   |-- main.py
|   |-- config.py
|   |-- gateway/
|   |   |-- __init__.py
|   |   |-- registry.py
|   |   |-- proxy.py
|   |   |-- router.py
|   |   `-- session.py
|   |-- auth/
|   |   |-- __init__.py
|   |   |-- jwt_validator.py
|   |   |-- api_keys.py
|   |   |-- rbac.py
|   |   `-- dependencies.py
|   |-- limits/
|   |   |-- __init__.py
|   |   |-- redis_bucket.py
|   |   `-- policies.py
|   |-- observability/
|   |   |-- __init__.py
|   |   |-- otel.py
|   |   |-- metrics.py
|   |   `-- audit.py
|   |-- models/
|   |   |-- __init__.py
|   |   |-- db.py
|   |   |-- orm.py
|   |   `-- schemas.py
|   `-- api/
|       |-- __init__.py
|       |-- servers.py
|       |-- api_keys.py
|       |-- roles.py
|       |-- audit.py
|       `-- health.py
|-- alembic/
|   |-- env.py
|   `-- versions/.gitkeep
|-- tests/
|   |-- __init__.py
|   |-- conftest.py
|   |-- unit/
|   |   |-- __init__.py
|   |   |-- test_rbac.py
|   |   |-- test_rate_limiter.py
|   |   `-- test_jwt_validator.py
|   `-- integration/
|       |-- __init__.py
|       |-- test_proxy_flow.py
|       `-- test_session_routing.py
|-- deploy/
|   |-- Dockerfile
|   |-- docker-compose.yml
|   `-- railway.toml
|-- docs/
|   |-- architecture.md
|   |-- diagrams/.gitkeep
|   `-- superpowers/specs/2026-08-03-project-structure-design.md
|-- .github/workflows/
|   |-- ci.yml
|   `-- release.yml
|-- .env.example
|-- pyproject.toml
|-- alembic.ini
|-- LICENSE
|-- SECURITY.md
|-- CONTRIBUTING.md
`-- README.md
```

## File Content Rules

Python package initializers and modules will contain module docstrings only. Test modules will also contain docstrings only because this milestone introduces no behavior to test.

`pyproject.toml` will be valid PEP 621 metadata for a Python 3.12 project and will contain basic Ruff, mypy, and pytest configuration. It will not declare the future runtime stack as installed dependencies because no code uses those libraries yet.

`.env.example` will list the configuration keys documented in the README using safe local-development example values. It will not contain real credentials.

Alembic, Docker, Docker Compose, Railway, CI, and release files will be syntactically valid comment-only or metadata-only foundations. They will explicitly describe the milestone that must supply executable behavior, avoiding commands that imply the currently empty application can run.

`LICENSE` will contain the MIT License identified by the README. `SECURITY.md` and `CONTRIBUTING.md` will provide concise, immediately applicable repository policies. `docs/architecture.md` will point readers to the detailed architecture in the README and state that implementation is pending.

## Architectural Boundaries

The layout establishes these future ownership boundaries:

- `api`: HTTP management endpoints and health reporting.
- `auth`: subject authentication and authorization decisions.
- `gateway`: MCP registry, routing, proxy, and session behavior.
- `limits`: rate-limit algorithms and policy resolution.
- `models`: persistence setup, ORM entities, and transport schemas.
- `observability`: tracing, metrics, and audit recording.

No subpackage will import from another during this milestone. Future implementation plans must preserve dependency direction and avoid placing business logic in API route modules.

## Validation

The scaffold will be accepted when:

1. Every path in the approved file layout is present in Git.
2. All Python files compile successfully with Python 3.12 syntax.
3. `pyproject.toml` parses as TOML.
4. YAML files parse when a YAML parser is available; otherwise they must remain comment-only so they cannot be syntactically invalid.
5. The Git diff contains no application behavior or secrets.

## Deferred Work

A later milestone will make the foundation runnable by adding dependencies, typed settings, the FastAPI application factory, health checks, database and Redis lifecycle management, tests, Docker execution, and CI commands. Gateway features such as registry management, authentication, RBAC, rate limiting, proxying, and observability remain separate implementation milestones.
