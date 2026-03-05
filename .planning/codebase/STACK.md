# Stack Map

## Repository Shape
- Monorepo-style split between backend and frontend under `api/` and `web/`.
- Deployment assets are in `charts/fleet-onboard-app/` and CI in `.github/workflows/`.
- A single root image build stitches both apps via `Dockerfile`.

## Backend Runtime
- Language: Go 1.24 (`api/go.mod`, `Dockerfile`, `.github/workflows/buildpushdev.yml`).
- HTTP framework: Fiber v2 (`api/go.mod`, `api/internal/app/app.go`).
- App entrypoint: `api/cmd/fleet-onboard-app/main.go`.
- Config loading: `shared.LoadConfig` reads `settings.yaml` into `config.Settings` (`api/cmd/fleet-onboard-app/main.go`, `api/internal/config/settings.go`).
- Structured logging with `zerolog` (`api/cmd/fleet-onboard-app/main.go`).

## Backend Middleware and Ops
- Prometheus HTTP middleware from `github.com/DIMO-Network/shared/middleware/metrics` is used in main app (`api/internal/app/app.go`).
- Separate monitoring server exposes `/metrics` on monitoring port (`api/cmd/fleet-onboard-app/main.go`).
- JWT auth middleware via `github.com/gofiber/contrib/jwt` validates against configured JWK set URL (`api/internal/app/app.go`).
- Panic recovery middleware is enabled (`api/internal/app/app.go`).

## Frontend Runtime
- Frontend is Vite + TypeScript + Lit (`web/package.json`, `web/vite.config.js`).
- TypeScript is strict-mode configured (`web/tsconfig.json`).
- Main bootstrapping happens in `web/src/index.ts` and view/element registrations in `web/src/views/index.ts` and `web/src/elements/index.ts`.
- Routing library dependency is `@lit-labs/router` (`web/package.json`).

## Frontend Tooling
- Build/dev scripts: `dev`, `build`, `preview`, `lint` in `web/package.json`.
- ESLint v9 + `typescript-eslint` + `eslint-plugin-lit` (`web/eslint.config.js`).
- Vite plugins include mkcert, TS path resolution, ESLint, and static copy (`web/vite.config.js`).
- Local HTTPS dev host is fixed to `localdev.dimo.org:3008` (`web/vite.config.js`).

## Cross-Stack Build and Packaging
- Root `Dockerfile` builds Go binary and web assets in one build stage.
- Node.js is installed in build image for frontend build (`Dockerfile`).
- Final image is BusyBox-based and runs `fleet-onboard-app` with static assets under `/dist` (`Dockerfile`).
- Backend serves static SPA files from `./dist` (`api/internal/app/app.go`).

## Deployment and Environment
- Helm chart: `charts/fleet-onboard-app/Chart.yaml` with environment values in `values.yaml` and `values-prod.yaml`.
- Runtime env vars are projected via configmap template `charts/fleet-onboard-app/templates/envconfigmap.yaml`.
- External secrets (paymaster/rpc/bundler) come from External Secrets in `charts/fleet-onboard-app/templates/secret.yaml`.
- CI build/push pipelines are `buildpushdev.yml` (main branch) and `buildpushprod.yml` (tag-based).

## Testing and Quality Signals
- Backend tests currently observed in controller layer: `api/internal/controllers/proxy_test.go`, `api/internal/controllers/common_test.go`.
- Frontend test files were not found via filename scan in `web/` (unknown if tests exist outside common naming conventions).
- PR lint workflow runs `golangci-lint` in `api/` (`.github/workflows/lint.yml`).

## Known Unknowns
- No explicit DB driver or migration tooling is visible in scanned files; persistence appears delegated to external services/oracles.
- No explicit frontend test runner dependency (e.g., Vitest/Jest) was found in `web/package.json`.
- No explicit API schema generation pipeline (OpenAPI/Swagger tooling) was confirmed in the scanned build scripts.
