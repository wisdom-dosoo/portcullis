# Contributing to Portcullis

Portcullis is built through small, reviewed milestones derived from the target
architecture in `README.md`.

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+ (for the web frontend)
- Docker + Docker Compose v2 (for infrastructure)
- `pip` or `uv` for Python package management

### Backend (API)

```bash
cd api

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install with dev dependencies
pip install -e ".[dev]"

# Start infrastructure (Postgres + Redis)
docker compose -f deploy/docker-compose.yml up -d postgres redis

# Run migrations
DATABASE_URL=postgresql+asyncpg://portcullis:portcullis@localhost:5432/portcullis \
  alembic upgrade head

# Start the server
DATABASE_URL=postgresql+asyncpg://portcullis:portcullis@localhost:5432/portcullis \
  REDIS_URL=redis://localhost:6379/0 \
  API_KEY_PEPPER=dev-pepper \
  uvicorn app.main:app --reload --port 8080
```

### Web Frontend

```bash
cd web

# Install dependencies
npm install

# Start dev server
npm run dev
```

## Code Style

### Python

- **Formatter/Linter**: `ruff` (line length 100, target Python 3.12)
- **Type checker**: `mypy --strict`
- **Import order**: stdlib, third-party, internal (enforced by ruff)
- **Naming**: `snake_case` for functions/variables, `PascalCase` for classes
- **Docstrings**: Google-style docstrings on public functions and classes
- Run before committing:
  ```bash
  cd api
  ruff check .
  mypy app
  ```

### TypeScript/React

- **Linter**: ESLint with `eslint-config-next`
- **Formatter**: Prettier (via Next.js defaults)
- Run before committing:
  ```bash
  cd web
  npm run lint
  ```

## Testing

### Backend Tests

```bash
cd api

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run specific test category
pytest tests/unit/        # Unit tests
pytest tests/integration/ # Integration tests (requires Docker)
pytest tests/contract/    # Contract tests
```

Integration tests use [testcontainers](https://testcontainers.com/) to spin up
real Postgres and Redis instances — no mocking.

### Frontend Tests

```bash
cd web
npm test  # when test framework is configured
```

## Commit Guidelines

- **Conventional commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **Scope**: Use the module boundary as scope when helpful, e.g. `feat(gateway): ...`
- **Body**: Explain *what* and *why*, not *how* (the diff shows how)
- **Security**: If the change affects authentication, authorization, or data handling,
  mention the security implication in the commit body

## Pull Request Process

1. **Open or reference an issue** that defines the change and its acceptance criteria.
2. **Keep the change within one architectural boundary** — don't mix auth changes with
   gateway changes in the same PR.
3. **Add tests before behavior** when the milestone introduces executable code.
4. **Run all checks locally** before opening the PR:
   ```bash
   cd api && ruff check . && mypy app && pytest
   cd web && npm run lint
   ```
5. **Explain security and compatibility implications** in the pull request description.
6. **CI must pass** (lint, test, security scan) before merge.

## Architecture Boundaries

The codebase is organized into clear boundaries:

| Boundary | Location | Responsibility |
|----------|----------|----------------|
| `api/` | REST endpoint layer | HTTP request/response, validation |
| `auth/` | Authentication/authorization | JWT, API keys, RBAC, SSO |
| `gateway/` | MCP proxy core | Routing, forwarding, sessions, health |
| `limits/` | Rate limiting | Redis buckets, policy resolution |
| `observability/` | Tracing/metrics/audit | OTel, Prometheus, audit log |
| `models/` | Data models | ORM, Pydantic schemas |
| `repositories/` | Data access | CRUD operations |
| `email/` | Email delivery | Console/SMTP/SendGrid/Resend |
| `plugins/` | Plugin system | Dynamic module loading |

Changes should stay within a single boundary unless the issue explicitly requires
cross-boundary work.

## Good First Issues

Check the issue tracker for issues labeled `good first issue`. Common entry points:

- Additional rate-limit strategies
- Helm chart improvements
- Admin UI enhancements
- stdio-bridge adapter improvements
- Documentation improvements
- Test coverage gaps
