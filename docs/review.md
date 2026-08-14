Executive assessment
Portcullis has a thoughtful backend foundation and an ambitious, visually strong frontend prototype, but it is not production-ready. My recommendation is no-go for production until the authorization boundary, MCP transport, CI, and frontend authentication issues are addressed.
The main concern is a mismatch between appearance/documentation and implemented behavior: many features look complete but are mocked, MCP session/streaming claims are not implemented, and CI gives more confidence than it should.
Highest-priority findings
RBAC does not scope permissions by tenant or identity type.
[`get_permissions_for_subject` (line 116)](/D:/portcullis/portcullis/app/repositories/rbac.py:116) filters only on subject_id. It ignores tenant_id and subject_type, even though API keys and OAuth subjects share the same text field. An OAuth sub matching an API-key UUID—or identical subjects across future tenants—can receive the wrong permissions.
Change the lookup contract to (tenant_id, subject_type, subject_id) and enforce all three in SQL. Validate API-key bindings against a key belonging to the same tenant.

MCP Streamable HTTP support is incomplete.
The gateway exposes only [`POST /mcp/{server_slug}` (line 80)](/D:/portcullis/portcullis/app/gateway/router.py:80), while [session.py (line 1)](/D:/portcullis/portcullis/app/gateway/session.py:1) is empty. Upstream calls use buffered httpx.request() rather than a streaming request, then wrap already-buffered data in StreamingResponse. Upstream headers such as Mcp-Session-Id are discarded in the response assembly around [router.py (line 321)](/D:/portcullis/portcullis/app/gateway/router.py:321).
This conflicts directly with the session-management claims in the README. Stateful clients and long-lived SSE responses will not work correctly.

Several controlled error paths crash with NameError.
[router.py (line 133)](/D:/portcullis/portcullis/app/gateway/router.py:133) calls logger for Redis, upstream, and catch-all failures, but no logger is defined. Ruff and mypy both detected this. The intended 502/503/500 response may become a secondary exception.

Unauthenticated clients can consume unbounded memory before rate limiting.
The full request body is read and parsed at [router.py (line 98)](/D:/portcullis/portcullis/app/gateway/router.py:98); pre-auth throttling begins only afterward. There is no request-size limit. A small number of large bodies can exhaust worker memory before authentication or Redis protection applies.

Frontend sign-in accepts any token.
The login flow validates the supplied key by calling public /healthz, then stores it and redirects on any healthy response at [login/page.tsx (line 227)](/D:/portcullis/web/src/app/login/page.tsx:227). Consequently, any non-empty value appears to sign in.
Additionally:
Authentication is merely “token exists” in [auth.ts (line 1)](/D:/portcullis/web/src/lib/auth.ts:1).
Long-lived API keys/JWTs are stored in localStorage, making any XSS an immediate credential compromise.
The context switcher deliberately exposes all administrator/developer contexts to every user at [nav-shell.tsx (line 108)](/D:/portcullis/web/src/components/nav-shell.tsx:108).
Backend checks prevent some direct privilege escalation, but the UI security model is unreliable and misleading.

CI does not run integration or end-to-end tests.
[ci.yml (line 47)](/D:/portcullis/portcullis/.github/workflows/ci.yml:47) tells pytest to run the integration/e2e directories while simultaneously ignoring both, then masks the result with || true. Many “integration” tests are empty skipped placeholders, including [test_proxy_flow.py (line 8)](/D:/portcullis/portcullis/tests/integration/test_proxy_flow.py:8).
The backend’s 82.68% aggregate coverage is encouraging, but the critical proxy and persistence paths are much lower:
Gateway router: 42%
HTTP proxy: 39%
Repositories: 31–62%
Audit writer: 57%

The frontend is partly a convincing demo rather than a functioning product.
Examples include random dashboard/billing metrics, static incidents and notifications, and integration connection tests that always succeed after a delay at [integrations/page.tsx (line 993)](/D:/portcullis/web/src/app/dashboard/integrations/page.tsx:993). The backend has no APIs for much of the UI: organizations, teams, alerts, incidents, billing, integrations, settings, notifications, or full policy semantics.
This needs explicit demo labeling or a sharply reduced MVP scope. Operational-looking fake data is dangerous in an infrastructure/security product.

Other important findings
Any authenticated principal can enumerate every active API key and its scopes through [api_keys.py (line 50)](/D:/portcullis/portcullis/app/api/api_keys.py:50). Roles, policies, server URLs, and manual health probes are similarly broadly exposed. Revisit least-privilege requirements.

API-key last_used_at is updated but never committed during authentication: [api_keys.py (line 133)](/D:/portcullis/portcullis/app/auth/api_keys.py:133) and [repositories/api_keys.py (line 74)](/D:/portcullis/portcullis/app/repositories/api_keys.py:74). Usage information will generally be rolled back when the request session closes.

Server updates do not revalidate the auth_mode/service-token invariant and do not translate slug uniqueness failures into 409 responses. These become database-driven 500s.

Some frontend MCP calls use relative /mcp/... URLs, such as [servers/[slug\]/page.tsx (line 124)](/D:/portcullis/web/src/app/dashboard/servers/[slug]/page.tsx:124), while most API calls use NEXT_PUBLIC_API_URL. [next.config.ts (line 3)](/D:/portcullis/web/next.config.ts:3) defines no rewrite, so these routes fail when frontend and API are separately hosted.

API regeneration is not reproducible: [orval.config.ts (line 6)](/D:/portcullis/web/orval.config.ts:6) expects ../openapi.json, which does not exist.

Frontend maintainability has crossed a dangerous threshold: roughly 52,000 TS/TSX lines and 37 files over 500 lines, with multiple pages exceeding 1,000–1,600 lines. Components are frequently declared inside components, causing state resets and many React lint failures.

Custom dialogs such as [confirm-dialog.tsx (line 67)](/D:/portcullis/web/src/components/confirm-dialog.tsx:67) lack proper dialog semantics, focus trapping, focus restoration, and accessible names on icon-only controls. WCAG 2.2 AA is not yet demonstrated.

Production defaults permit wildcard CORS with credentials through [config.py (line 44)](/D:/portcullis/portcullis/app/config.py:44) and [main.py (line 137)](/D:/portcullis/portcullis/app/main.py:137). Production configuration should reject wildcard origins.

The Docker health check invokes wget at [Dockerfile (line 18)](/D:/portcullis/portcullis/deploy/Dockerfile:18), but the image never installs it. This is likely to mark healthy containers unhealthy. Docker was unavailable locally, so I could not execute the image.

Every replica runs Alembic during startup at [entrypoint.sh (line 3)](/D:/portcullis/portcullis/deploy/entrypoint.sh:3), risking concurrent migration races during scaled deployments.

pyproject.toml and requirements.txt duplicate and disagree on OpenTelemetry packages, while all dependencies are loosely lower-bounded. Builds are not reproducible.

What is good
The backend architecture is sensibly layered: routes, auth/services, repositories, infrastructure adapters, and models are clearly separated. Type annotations and Pydantic/SQLAlchemy usage are generally strong.
Security intent is also good:
Argon2id plus a server-side pepper
Timing defense for unknown API-key prefixes
Default-deny tool authorization
Client credential stripping before proxying
HTTPS/hostname allow-listing for upstreams
Redis fail-closed behavior
Structured audit, Prometheus, and OpenTelemetry foundations
The frontend has a cohesive visual language, broad workflow coverage, strict TypeScript, generated React Query hooks, and good empty/loading/error-state design. It is a strong design prototype; it simply needs to be treated as one until backend integration catches up.
Verification results
Backend unit/contract tests: 309 passed
Backend coverage: 82.68%
Ruff: 24 issues, plus 6 files needing formatting
Mypy strict: 13 errors
Frontend TypeScript: passed
Frontend ESLint: 47 errors, 92 warnings
Frontend production build: compiled successfully, but the full build did not finish within five minutes; therefore it is not verified
npm audit: 4 high-severity entries, all propagated from the same transitive nanoid <3.3.18 advisory (GHSA-2v37-7h3g-55p8); reachability still needs assessment
Python dependency audit: timed out, so no clean result
Docker/integration testing: unavailable locally
Recommended release sequence
Fix RBAC scoping, undefined logger, body limits, frontend sign-in, and credential storage.
Implement genuine MCP streaming/session semantics and protocol tests.
Make integration/e2e tests real and blocking in CI; add frontend component and Playwright tests.
Separate real features from demo-only screens and reduce the MVP surface.
Split large frontend pages into feature modules and make lint/build clean.
Harden deployment, dependency locking, CORS, migrations, and health checks.
This review covered the current dirty working-tree snapshot—two staged backend files and substantial uncommitted frontend work. I did not edit source files.