# Testing Map

## Scope
This document maps current testing execution, test locations, and coverage patterns for the repository.
It focuses on practical commands and real file-level coverage observed in `api/`, `web/`, and Helm chart assets.

## Current Test Surfaces

### Backend (Go)
- Unit/integration-style tests currently exist in:
- `api/internal/controllers/common_test.go`
- `api/internal/controllers/proxy_test.go`
- No additional `_test.go` files were found in `api/internal/service/`, `api/internal/app/`, or other controller files.

### Frontend (TypeScript/Lit)
- No `*.test.ts` or `*.spec.ts` files are currently present in `web/src/`.
- `web/package.json` has `dev`, `build`, `preview`, and `lint` scripts, but no `test` script.
- Tooling includes ESLint and strict TypeScript checks; these act as quality gates, not runtime tests.

### Deployment/Chart Checks
- Helm includes a smoke test hook at `charts/fleet-onboard-app/templates/tests/test-connection.yaml`.
- This verifies service reachability (busybox `wget`) after deployment, not application behavior.

## How Tests Are Run Today

### Backend Commands
- Canonical test target: `cd api && make test`.
- `make test` runs `go test $(GO_FLAGS) -timeout 3m -race ./...` per `api/Makefile`.
- Backend formatting and static checks are run separately via:
- `cd api && make fmt`
- `cd api && make lint`
- Quick package-level run: `cd api && go test ./...`.

### Frontend Quality Gates
- Type/lint checks are run with:
- `cd web && npm run lint`
- `cd web && npm run build` (includes `tsc`)
- There is no automated component or end-to-end test runner wired in current scripts.

## Existing Test Patterns

### Go Test Structure
- Tests follow table-driven patterns for input/output permutations (`TestStripOraclePrefix` in `api/internal/controllers/common_test.go`).
- HTTP proxy behavior is validated using `httptest.NewServer`, real HTTP verbs, and Fiber `app.Test(...)` (`api/internal/controllers/proxy_test.go`).
- Subtests use `t.Run(...)` for method matrix scenarios.
- Assertions are done with standard library (`if got != want { t.Errorf(...) }`), no third-party assert library.

### Behavior Coverage in Current Tests
- Covered:
- Path normalization helper behavior in `stripOraclePrefix`.
- Proxy forwarding semantics: method preservation, header forwarding, auth header injection.
- Mostly uncovered:
- Route wiring and middleware behavior in `api/internal/app/app.go`.
- Controller request validation and downstream error branches in most files under `api/internal/controllers/`.
- Identity/definition/accounts service interactions (`api/internal/service/*.go`).
- Entire frontend interaction and API integration flow under `web/src/`.

## Coverage Patterns and Practical Guidance

### Current State
- No repository-level minimum coverage threshold is defined.
- No CI workflow file was detected to enforce test/coverage policy.
- Coverage is currently best described as targeted regression tests around proxy code plus lint/type checks elsewhere.

### Recommended Coverage Workflow (Current Toolchain Compatible)
- Generate backend coverage profile:
- `cd api && go test -race -covermode=atomic -coverprofile=coverage.out ./...`
- Inspect per-function coverage:
- `cd api && go tool cover -func=coverage.out`
- Optional HTML report:
- `cd api && go tool cover -html=coverage.out`

### Priority Gaps to Close
- Add controller-level tests for validation and error mapping in files like `api/internal/controllers/identity.go` and `api/internal/controllers/vehicles.go`.
- Add middleware/error-handler tests for `oracleIDMiddleware` and `ErrorHandler` in `api/internal/app/app.go`.
- Introduce frontend test harness (for example Vitest + Web Test Runner) and begin with `web/src/services/api-service.ts` plus high-risk views (`web/src/views/users.ts`, `web/src/elements/base-onboarding-element.ts`).
- Keep Helm test hook as a deployment smoke check, but treat it as complementary to application tests.
