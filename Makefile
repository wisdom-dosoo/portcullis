.PHONY: help dev test lint typecheck clean docker-up docker-down bootstrap

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local Development ──────────────────────────────────────────────

dev: ## Start API server with hot-reload (requires infra via docker-up)
	cd api && uvicorn app.main:app --reload --port 8080

dev-web: ## Start Next.js frontend dev server
	cd web && npm run dev

dev-all: docker-up ## Start everything (infra + API + web)
	@echo "API: http://localhost:8080"
	@echo "Web: http://localhost:3000"
	@echo "Docs: http://localhost:8080/docs"

# ── Infrastructure ─────────────────────────────────────────────────

docker-up: ## Start Postgres + Redis + Jaeger
	docker compose up -d postgres redis jaeger

docker-down: ## Stop all containers
	docker compose down

docker-down-v: ## Stop and wipe volumes
	docker compose down -v

# ── Testing ────────────────────────────────────────────────────────

test: ## Run all tests
	cd api && pytest

test-unit: ## Run unit tests only
	cd api && pytest tests/unit -v

test-integration: ## Run integration tests (requires Docker infra)
	cd api && pytest tests/integration -v

test-cov: ## Run tests with coverage report
	cd api && pytest --cov=app --cov-report=term-missing --cov-report=html

# ── Linting & Type Checking ───────────────────────────────────────

lint: ## Run ruff linter
	cd api && ruff check .

lint-fix: ## Run ruff with auto-fix
	cd api && ruff check --fix .

format: ## Format code with ruff
	cd api && ruff format .

typecheck: ## Run mypy type checker
	cd api && mypy app

check: lint typecheck ## Run all checks (lint + typecheck)

# ── Pre-commit ─────────────────────────────────────────────────────

pre-commit-install: ## Install pre-commit hooks
	pre-commit install

pre-commit-run: ## Run pre-commit on all files
	pre-commit run --all-files

# ── Database ───────────────────────────────────────────────────────

migrate: ## Run Alembic migrations
	cd api && alembic upgrade head

migrate-new: ## Create new migration (usage: make migrate-new MSG="add foobar")
	cd api && alembic revision --autogenerate -m "$(MSG)"

# ── Bootstrap ──────────────────────────────────────────────────────

bootstrap: ## Create initial admin API key
	cd api && python -m app.cli admin-key create --name initial-admin

# ── Build ──────────────────────────────────────────────────────────

docker-build: ## Build Docker image
	docker build -t portcullis -f api/deploy/Dockerfile api

# ── Cleanup ────────────────────────────────────────────────────────

clean: ## Remove build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name htmlcov -exec rm -rf {} + 2>/dev/null || true
	rm -rf api/coverage.xml api/.coverage web/.next
