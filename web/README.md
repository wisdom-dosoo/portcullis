# Portcullis Web Frontend

Next.js 16.3 admin dashboard for the Portcullis MCP gateway.

## Prerequisites

- Node.js 20+
- npm or pnpm

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start dev server
npm run dev
```

The app runs on `http://localhost:3000` and proxies API requests to `NEXT_PUBLIC_API_URL` (default: `http://localhost:8080`).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:8080` | Base URL of the Portcullis API backend |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run api:generate` | Regenerate API client from OpenAPI spec |

## Project Structure

```
web/
├ src/
│   ├── app/           # Page routes (App Router)
│   │   ├── login/     # Auth (email/password, API key, SSO)
│   │   ├── dashboard/ # Org admin (20+ pages)
│   │   ├── admin/     # Platform admin (14+ pages)
│   │   └── developer/ # Developer portal (8+ pages)
│   ├── lib/           # Shared utilities (auth, axios, utils)
│   └── providers/     # React context providers
├ middleware.ts         # Auth guard + security headers
├ openapi.json         # API spec for code generation
└ orval.config.ts      # Orval config for API client generation
```

## API Client Generation

The API client is auto-generated from the backend's OpenAPI spec using [Orval](https://orval.dev/):

```bash
# Start the backend first, then:
npm run api:generate
```

## Architecture

- **Auth**: Dual-write token to localStorage + cookie. Middleware reads cookie for route protection. CSRF token set on login.
- **Admin guard**: `app/admin/layout.tsx` calls `GET /admin/platform/me` and redirects non-admins.
- **Security headers**: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy set in middleware.
