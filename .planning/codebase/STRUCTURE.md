# Structure

## Repository Layout
Top-level directories split by runtime concern:
- `api/`: Go backend service and HTTP API/proxy.
- `web/`: Lit + TypeScript frontend application.
- `charts/`: Helm chart manifests for Kubernetes deployment.
- `.planning/codebase/`: generated architecture mapping docs.

## High-Level Tree
- `api/cmd/fleet-onboard-app/main.go`: backend executable entrypoint.
- `api/internal/app/app.go`: Fiber app setup, middleware, and all route registration.
- `api/internal/controllers/`: HTTP controllers by domain (`vehicles.go`, `identity.go`, `settings.go`, `proxy.go`).
- `api/internal/service/`: outbound service wrappers (`identity_api.go`, `dimo_jwt.go`).
- `api/internal/config/settings.go`: config contract and oracle registry model.
- `web/index.html` and `web/login.html`: two HTML entry documents for app/login surfaces.
- `web/src/index.ts`: frontend boot file importing elements, views, and global styles.
- `web/src/elements/`: app shell and reusable components/modals.
- `web/src/views/`: route-level pages (home, onboarding, vehicles, users, reports, tenant views).
- `web/src/services/`: client-side service layer for API and domain workflows.

## Backend Directory Details
`api/internal/controllers/` is organized by API domain responsibility:
- `vehicles.go`: onboarding + lifecycle operations (mint, transfer, disconnect, delete, verify).
- `account.go`: account CRUD and OTP endpoints.
- `identity.go`: identity GraphQL proxy and owner/vehicle lookups.
- `settings.go`: public/private app config responses.
- `proxy.go`: generic forwarding logic to oracle APIs.

`api/internal/service/` contains reusable integration logic:
- `identity_api.go`: GraphQL request construction and HTTP execution.
- `dimo_jwt.go`: developer JWT generation and key registration workflow.

`api/internal/controllers/*_test.go` currently includes:
- `api/internal/controllers/common_test.go`
- `api/internal/controllers/proxy_test.go`

## Frontend Directory Details
`web/src/elements/` contains shell and shared UI components:
- `app-root-v2.ts`: sidebar layout, router wiring, nav permissions, version polling.
- `login-element.ts`: login URL bootstrap using public settings.
- modal and workflow components like `otp-modal-element.ts`, `transfer-modal-element.ts`, and `confirm-onboarding-modal-element.ts`.

`web/src/views/` defines page components and route targets:
- `home.ts`, `onboarding.ts`, `vehicles-fleets.ts`, `vehicle-detail.ts`, `users.ts`, `reports.ts`, `tenant-selector.ts`, `tenant-settings.ts`.
- `web/src/views/index.ts` re-exports these views for centralized registration.

`web/src/services/` defines singleton domain services:
- `api-service.ts`: base transport + headers + oracle route composition.
- `oracle-tenant-service.ts`: current oracle and selected tenant persistence.
- `identity-service.ts`, `fleet-service.ts`, `settings-service.ts`, `signing-service.ts` for feature-specific behavior.

## Configuration and Tooling Files
Backend:
- `api/settings.sample.yaml`: example runtime configuration.
- `api/go.mod` and `api/go.sum`: Go module dependencies.
- `api/Makefile`: build/test/lint/install automation.

Frontend:
- `web/package.json`: scripts and npm dependencies.
- `web/tsconfig.json`: strict TS config and path aliases (`@services/*`, `@views/*`, etc.).
- `web/vite.config.js`: HTTPS local host setup, multi-entry build (`index.html`, `login.html`).

Deployment:
- root `Dockerfile`: multi-stage image build for backend + frontend assets.
- `charts/fleet-onboard-app/templates/*.yaml`: deployment/service/ingress/config manifests.

## Naming and Organization Conventions
Go code uses `internal` package boundaries and constructor functions like `NewVehiclesController`.
Routes are grouped by concern in `app.go`, with oracle endpoints nested under `/oracle/:oracleID`.
Frontend custom elements generally follow kebab-case tags and `*-view` / `*-element` file naming.
Frontend stateful services use singleton access (`getInstance()`) and localStorage-backed caches.

## Practical Navigation Guide
Start architecture tracing from `api/internal/app/app.go` and `web/src/elements/app-root-v2.ts`.
For oracle request behavior, follow `web/src/services/api-service.ts` -> `api/internal/controllers/proxy.go`.
For identity queries, follow `web/src/services/identity-service.ts` -> `api/internal/controllers/identity.go` -> `api/internal/service/identity_api.go`.
For login/bootstrap, follow `web/login.html` -> `web/src/elements/login-element.ts` -> `api/internal/controllers/settings.go`.
