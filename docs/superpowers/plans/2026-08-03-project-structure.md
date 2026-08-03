# Portcullis Project Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the documentation-aligned Portcullis repository skeleton without adding application behavior.

**Architecture:** Establish importable Python package boundaries for the API, authentication, gateway, limits, persistence, and observability concerns. Add valid metadata, infrastructure foundations, policy documents, and syntax-only verification while deferring all executable service behavior.

**Tech Stack:** Python 3.12 package layout, PEP 621/TOML metadata, Alembic layout, Docker Compose YAML, Railway TOML, GitHub Actions YAML, Markdown

---

## File Map

- `app/`: importable application namespace; each module contains only a responsibility docstring.
- `tests/`: future unit and integration test namespaces; each module contains only a scope docstring.
- `alembic/`: migration namespace and version directory marker.
- `deploy/`: non-executable container and hosting foundations.
- `.github/workflows/`: inactive workflow foundations.
- `docs/`: architecture summary and diagram directory marker.
- Root metadata: packaging, example configuration, migration configuration, license, security policy, and contribution guide.

Because this milestone intentionally introduces no functions, classes, or behavior, behavioral TDD does not apply. Each task instead uses structural and syntax validation immediately after file creation.

### Task 1: Create the Application Package Boundaries

**Files:**
- Create: `app/__init__.py`
- Create: `app/main.py`
- Create: `app/config.py`
- Create: `app/gateway/__init__.py`
- Create: `app/gateway/registry.py`
- Create: `app/gateway/proxy.py`
- Create: `app/gateway/router.py`
- Create: `app/gateway/session.py`
- Create: `app/auth/__init__.py`
- Create: `app/auth/jwt_validator.py`
- Create: `app/auth/api_keys.py`
- Create: `app/auth/rbac.py`
- Create: `app/auth/dependencies.py`
- Create: `app/limits/__init__.py`
- Create: `app/limits/redis_bucket.py`
- Create: `app/limits/policies.py`
- Create: `app/observability/__init__.py`
- Create: `app/observability/otel.py`
- Create: `app/observability/metrics.py`
- Create: `app/observability/audit.py`
- Create: `app/models/__init__.py`
- Create: `app/models/db.py`
- Create: `app/models/orm.py`
- Create: `app/models/schemas.py`
- Create: `app/api/__init__.py`
- Create: `app/api/servers.py`
- Create: `app/api/api_keys.py`
- Create: `app/api/roles.py`
- Create: `app/api/audit.py`
- Create: `app/api/health.py`

- [ ] **Step 1: Add the package initializers and responsibility-only modules**

Apply this patch from the repository root:

```diff
*** Begin Patch
*** Add File: app/__init__.py
+"""Portcullis MCP gateway package."""
*** Add File: app/main.py
+"""FastAPI application construction and lifecycle boundary."""
*** Add File: app/config.py
+"""Environment-driven application configuration boundary."""
*** Add File: app/gateway/__init__.py
+"""MCP gateway routing and upstream communication package."""
*** Add File: app/gateway/registry.py
+"""Upstream MCP server registry boundary."""
*** Add File: app/gateway/proxy.py
+"""MCP JSON-RPC upstream proxy boundary."""
*** Add File: app/gateway/router.py
+"""MCP server selection and request routing boundary."""
*** Add File: app/gateway/session.py
+"""MCP session affinity and persistence boundary."""
*** Add File: app/auth/__init__.py
+"""Authentication and authorization package."""
*** Add File: app/auth/jwt_validator.py
+"""OAuth bearer token and JWKS validation boundary."""
*** Add File: app/auth/api_keys.py
+"""API key issuance, hashing, and revocation boundary."""
*** Add File: app/auth/rbac.py
+"""Role-based tool authorization boundary."""
*** Add File: app/auth/dependencies.py
+"""FastAPI authentication dependency boundary."""
*** Add File: app/limits/__init__.py
+"""Distributed request limiting package."""
*** Add File: app/limits/redis_bucket.py
+"""Redis-backed rate-limit algorithm boundary."""
*** Add File: app/limits/policies.py
+"""Effective rate-limit policy resolution boundary."""
*** Add File: app/observability/__init__.py
+"""Tracing, metrics, and audit package."""
*** Add File: app/observability/otel.py
+"""OpenTelemetry setup and instrumentation boundary."""
*** Add File: app/observability/metrics.py
+"""Prometheus metric definition and exposure boundary."""
*** Add File: app/observability/audit.py
+"""Persistent gateway audit recording boundary."""
*** Add File: app/models/__init__.py
+"""Persistence and data-transfer model package."""
*** Add File: app/models/db.py
+"""Async database engine and session boundary."""
*** Add File: app/models/orm.py
+"""SQLAlchemy persistence model boundary."""
*** Add File: app/models/schemas.py
+"""Pydantic request and response schema boundary."""
*** Add File: app/api/__init__.py
+"""HTTP management API package."""
*** Add File: app/api/servers.py
+"""Upstream MCP server management endpoint boundary."""
*** Add File: app/api/api_keys.py
+"""API key management endpoint boundary."""
*** Add File: app/api/roles.py
+"""Role, binding, and permission endpoint boundary."""
*** Add File: app/api/audit.py
+"""Audit query endpoint boundary."""
*** Add File: app/api/health.py
+"""Gateway health endpoint boundary."""
*** End Patch
```

- [ ] **Step 2: Verify every application module is valid Python**

Run:

```powershell
python -m compileall -q app
```

Expected: exit code 0 with no output.

- [ ] **Step 3: Verify imports remain absent across empty boundaries**

Run:

```powershell
rg -n '^(from|import) ' app
```

Expected: exit code 1 with no matches.

- [ ] **Step 4: Commit the application structure**

```powershell
git add app
git commit -m "chore: scaffold application packages"
```

### Task 2: Create the Test and Migration Namespaces

**Files:**
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `tests/unit/__init__.py`
- Create: `tests/unit/test_rbac.py`
- Create: `tests/unit/test_rate_limiter.py`
- Create: `tests/unit/test_jwt_validator.py`
- Create: `tests/integration/__init__.py`
- Create: `tests/integration/test_proxy_flow.py`
- Create: `tests/integration/test_session_routing.py`
- Create: `alembic/env.py`
- Create: `alembic/versions/.gitkeep`

- [ ] **Step 1: Add test scope modules and migration markers**

```diff
*** Begin Patch
*** Add File: tests/__init__.py
+"""Portcullis test suite package."""
*** Add File: tests/conftest.py
+"""Shared pytest fixture boundary."""
*** Add File: tests/unit/__init__.py
+"""Fast, isolated Portcullis tests."""
*** Add File: tests/unit/test_rbac.py
+"""RBAC rule evaluation test boundary."""
*** Add File: tests/unit/test_rate_limiter.py
+"""Rate-limit algorithm test boundary."""
*** Add File: tests/unit/test_jwt_validator.py
+"""JWT and JWKS validation test boundary."""
*** Add File: tests/integration/__init__.py
+"""Portcullis infrastructure integration tests."""
*** Add File: tests/integration/test_proxy_flow.py
+"""Authenticated MCP proxy flow test boundary."""
*** Add File: tests/integration/test_session_routing.py
+"""MCP session affinity test boundary."""
*** Add File: alembic/env.py
+"""Alembic migration environment boundary."""
*** Add File: alembic/versions/.gitkeep

*** End Patch
```

- [ ] **Step 2: Verify test and migration Python syntax**

Run:

```powershell
python -m compileall -q tests alembic
```

Expected: exit code 0 with no output.

- [ ] **Step 3: Commit the test and migration structure**

```powershell
git add tests alembic
git commit -m "chore: scaffold test and migration namespaces"
```

### Task 3: Add Project Metadata and Example Configuration

**Files:**
- Create: `pyproject.toml`
- Create: `.env.example`
- Create: `alembic.ini`

- [ ] **Step 1: Add valid Python project metadata**

Create `pyproject.toml` with exactly:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "portcullis"
version = "0.0.0"
description = "A self-hosted gateway for Model Context Protocol servers"
readme = "README.md"
requires-python = ">=3.12,<4.0"
license = { text = "MIT" }
authors = [
  { name = "DOSOO WISDOM" },
]
dependencies = []

[project.optional-dependencies]
dev = [
  "mypy",
  "pytest",
  "ruff",
]

[tool.hatch.build.targets.wheel]
packages = ["app"]

[tool.pytest.ini_options]
addopts = "-ra"
testpaths = ["tests"]

[tool.ruff]
target-version = "py312"
line-length = 100

[tool.mypy]
python_version = "3.12"
strict = true
packages = ["app"]
```

- [ ] **Step 2: Add safe local-development configuration examples**

Create `.env.example` with exactly:

```dotenv
DATABASE_URL=postgresql+asyncpg://portcullis:portcullis@localhost:5432/portcullis
REDIS_URL=redis://localhost:6379/0
JWT_JWKS_URL=
JWT_AUDIENCE=portcullis
JWT_ISSUER=
API_KEY_PEPPER=development-only-change-me
OTEL_EXPORTER_OTLP_ENDPOINT=
RATE_LIMIT_DEFAULT=100/minute
SESSION_TTL_SECONDS=3600
CORS_ALLOWED_ORIGINS=*
LOG_LEVEL=INFO
ENVIRONMENT=development
```

- [ ] **Step 3: Add the Alembic configuration foundation**

Create `alembic.ini` with exactly:

```ini
[alembic]
script_location = alembic
prepend_sys_path = .
```

- [ ] **Step 4: Parse the TOML metadata**

Run:

```powershell
python -c "import pathlib, tomllib; data=tomllib.loads(pathlib.Path('pyproject.toml').read_text()); assert data['project']['name'] == 'portcullis'; assert data['project']['dependencies'] == []"
```

Expected: exit code 0 with no output.

- [ ] **Step 5: Check the example environment file for secret-key names and safe values**

Run:

```powershell
python -c "from pathlib import Path; text=Path('.env.example').read_text(); assert 'API_KEY_PEPPER=development-only-change-me' in text; assert 'DATABASE_URL=' in text; assert 'REDIS_URL=' in text"
```

Expected: exit code 0 with no output.

- [ ] **Step 6: Commit project metadata**

```powershell
git add pyproject.toml .env.example alembic.ini
git commit -m "chore: add project metadata and configuration examples"
```

### Task 4: Add Deployment and Automation Foundations

**Files:**
- Create: `deploy/Dockerfile`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/railway.toml`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Add the non-executable Docker foundation**

Create `deploy/Dockerfile` with exactly:

```dockerfile
# The runnable Python image is introduced with the application foundation milestone.
```

- [ ] **Step 2: Add an empty but valid Compose model**

Create `deploy/docker-compose.yml` with exactly:

```yaml
name: portcullis
services: {}
```

- [ ] **Step 3: Add the Railway configuration foundation**

Create `deploy/railway.toml` with exactly:

```toml
# Build and deployment settings are introduced with the runnable application milestone.
```

- [ ] **Step 4: Add inactive automation foundations**

Create `.github/workflows/ci.yml` with exactly:

```yaml
# CI jobs are activated when executable application checks exist.
```

Create `.github/workflows/release.yml` with exactly:

```yaml
# Release jobs are activated when the project produces a runnable artifact.
```

- [ ] **Step 5: Validate Compose structure and Railway TOML**

Run:

```powershell
python -c "import pathlib, tomllib; assert 'services: {}' in pathlib.Path('deploy/docker-compose.yml').read_text(); assert tomllib.loads(pathlib.Path('deploy/railway.toml').read_text()) == {}"
```

Expected: exit code 0 with no output.

- [ ] **Step 6: Commit deployment and automation foundations**

```powershell
git add deploy .github/workflows
git commit -m "chore: add deployment and automation foundations"
```

### Task 5: Add Architecture and Repository Policies

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/diagrams/.gitkeep`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Add the architecture status document and diagram marker**

Create `docs/architecture.md` with exactly:

```markdown
# Architecture

Portcullis is organized around six application boundaries: API, authentication,
gateway routing, rate limiting, persistence models, and observability. The complete
target architecture and request lifecycle are documented in the root README.

The repository currently contains structure only. Executable service behavior is
introduced through separately reviewed milestones.
```

Add an empty `docs/diagrams/.gitkeep` file.

- [ ] **Step 2: Add the MIT license**

Create `LICENSE` with exactly:

```text
MIT License

Copyright (c) 2026 DOSOO WISDOM

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Add a concrete security reporting policy**

Create `SECURITY.md` with exactly:

```markdown
# Security Policy

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities in a public issue. Use the repository's
GitHub Security Advisory reporting flow so the maintainer can investigate privately.

Include the affected component, reproduction steps, expected impact, and any known
mitigations. The maintainer will acknowledge a complete report within seven days and
will coordinate disclosure after a fix or mitigation is available.

## Supported Versions

Portcullis has not published a supported release. Security support begins with the
first tagged release.
```

- [ ] **Step 4: Add contribution guidance aligned with the current milestone**

Create `CONTRIBUTING.md` with exactly:

```markdown
# Contributing to Portcullis

Portcullis is being built through small, reviewed milestones derived from the target
architecture in `README.md`.

Before opening a pull request:

1. Open or reference an issue that defines the change and its acceptance criteria.
2. Keep the change within one architectural boundary.
3. Add tests before behavior when the milestone introduces executable code.
4. Run the checks documented by that milestone.
5. Explain security and compatibility implications in the pull request.

Use focused commits and do not include credentials, generated environments, coverage
artifacts, or editor-specific state.
```

- [ ] **Step 5: Verify documentation contains no incomplete markers**

Run:

```powershell
$markerPattern = @('TB' + 'D', 'TO' + 'DO', 'FIX' + 'ME') -join '|'
rg -n $markerPattern docs/architecture.md SECURITY.md CONTRIBUTING.md
```

Expected: exit code 1 with no matches.

- [ ] **Step 6: Commit architecture and repository policies**

```powershell
git add docs/architecture.md docs/diagrams/.gitkeep LICENSE SECURITY.md CONTRIBUTING.md
git commit -m "docs: add architecture and repository policies"
```

### Task 6: Verify the Complete Structure

**Files:**
- Verify: all files listed in `docs/superpowers/specs/2026-08-03-project-structure-design.md`

- [ ] **Step 1: Verify all Python sources compile**

Run:

```powershell
python -m compileall -q app tests alembic
```

Expected: exit code 0 with no output.

- [ ] **Step 2: Verify project TOML files parse**

Run:

```powershell
python -c "import pathlib, tomllib; tomllib.loads(pathlib.Path('pyproject.toml').read_text()); tomllib.loads(pathlib.Path('deploy/railway.toml').read_text())"
```

Expected: exit code 0 with no output.

- [ ] **Step 3: Verify the tracked structure against the approved design**

Run:

```powershell
git status --short
git ls-files app tests alembic deploy docs/architecture.md docs/diagrams .github/workflows .env.example pyproject.toml alembic.ini LICENSE SECURITY.md CONTRIBUTING.md
```

Expected: `git status --short` prints nothing. The file listing contains every scaffold path named in the approved specification.

- [ ] **Step 4: Verify whitespace and patch integrity**

Run:

```powershell
git diff HEAD~5..HEAD --check
```

Expected: exit code 0 with no output.

- [ ] **Step 5: Inspect the final commit sequence**

Run:

```powershell
git log --oneline -6
```

Expected: the design commit followed by five focused scaffold commits, with the repository structure commit at `HEAD`.
