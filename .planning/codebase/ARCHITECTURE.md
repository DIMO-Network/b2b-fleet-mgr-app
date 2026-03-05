# Architecture

## System Overview
This repository is a two-tier web application: a Lit SPA frontend and a Go Fiber backend.
The frontend in `web/` handles UI, auth session state, tenant/oracle selection, and API orchestration.
The backend in `api/` serves static frontend assets in production and proxies/aggregates external service calls.
Primary domain scope is B2B fleet onboarding, fleet administration, reporting, and vehicle lifecycle actions.

## Architecture Pattern
The dominant pattern is a BFF + proxy hybrid.
- BFF behavior: backend exposes app-specific endpoints like `GET /public/settings` and `POST /identity/proxy` from `api/internal/controllers/settings.go` and `api/internal/controllers/identity.go`.
- Proxy behavior: most oracle operations are forwarded from `api/internal/controllers/proxy.go` and `api/internal/controllers/vehicles.go`.
- Thin service abstraction: backend service layer in `api/internal/service/` mainly wraps GraphQL/HTTP transport.
- Frontend uses singleton service objects in `web/src/services/*.ts` for API access and client-side domain workflows.

## Entry Points
Backend entrypoint is `api/cmd/fleet-onboard-app/main.go`.
Backend composition root is `api/internal/app/app.go`.
Frontend bundle entry is `web/src/index.ts`, loaded by both `web/index.html` and `web/login.html`.
Main authenticated app shell is `<app-root-v2>` in `web/src/elements/app-root-v2.ts`.
Login flow entry UI is `<login-element>` in `web/src/elements/login-element.ts`.

## Backend Layering
Routing + middleware live in `api/internal/app/app.go`.
HTTP handlers/controllers live in `api/internal/controllers/`.
Outbound integration wrappers live in `api/internal/service/`.
Configuration model lives in `api/internal/config/settings.go` and is loaded via `settings.yaml` in `main.go`.

## Frontend Layering
App shell + navigation/router live in `web/src/elements/app-root-v2.ts`.
Route-level pages live in `web/src/views/` and are registered in `web/src/views/index.ts`.
Reusable UI components live in `web/src/elements/`.
Data access/domain operations live in `web/src/services/`.
Shared types/utilities live in `web/src/types/` and `web/src/utils/`.

## Primary Data Flows
1. Browser loads `web/index.html` -> imports `web/src/index.ts` -> mounts `app-root-v2`.
2. `web/src/services/api-service.ts` composes URLs, auth headers, and optional `Tenant-Id` headers.
3. Most authenticated business requests go to `/oracle/:oracleID/*` routes in `api/internal/app/app.go`.
4. `api/internal/controllers/proxy.go` strips oracle prefix and forwards to target oracle `/v1/*` path.
5. Response is passed through (status/body/headers) back to frontend.

Identity flow differs:
- Frontend calls `/identity/proxy` or `/identity/owner/:owner`.
- `api/internal/controllers/identity.go` delegates to `api/internal/service/identity_api.go` GraphQL wrapper.

Settings/auth bootstrap flow:
- Login UI calls `GET /public/settings` via `web/src/services/settings-service.ts`.
- Backend returns `clientId`, `loginUrl`, and oracle list from `api/internal/controllers/settings.go`.

## Security and Trust Boundaries
JWT auth is enforced on most `/oracle/:oracleID/*` routes using Fiber JWT middleware in `api/internal/app/app.go`.
Frontend stores token and user details in `localStorage` (`token`, `email`, and app settings).
Proxy layer currently uses `InsecureSkipVerify: true` in `api/internal/controllers/proxy.go` for upstream TLS.
Tenant boundary is conveyed with `Tenant-Id` header from `web/src/services/api-service.ts`.

## Runtime and Deployment Model
Local dev: Vite HTTPS server runs on `https://localdev.dimo.org:3008` (`web/vite.config.js`), API usually on port `3007`/configured port.
Production-style runtime: Go app serves static files from `./dist` and exposes API routes (`api/internal/app/app.go`).
Container build: root `Dockerfile` builds Go binary and frontend assets, then packages into BusyBox image.
Kubernetes deployment: Helm chart templates in `charts/fleet-onboard-app/templates/` wire config, probes, and scaling.

## Key Architectural Characteristics
Strong centralization of route wiring in one file (`api/internal/app/app.go`) makes route discovery easy.
Oracle-specific behavior is normalized by path-based oracle routing (`/oracle/:oracleID/...`).
Frontend uses a singleton-service pattern (`ApiService`, `SettingsService`, `OracleTenantService`) to share state.
Hash-based routing avoids server-side SPA route rewrite requirements.
