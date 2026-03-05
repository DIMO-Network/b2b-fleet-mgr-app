# Codebase Concerns Map

## Scope
- Repository analyzed: `/Users/jreate/Source/b2b-fleet-mgr-app`
- Focus: technical debt, bugs, security/performance risks, and fragile areas.
- Evidence sources include `api/`, `web/`, `charts/`, `Dockerfile`, and `.github/workflows/`.

## Critical Security Risks

### 1) Private key committed to repository
- A PEM private key is present in `api/certs/acme_account+key`.
- This is immediate credential exposure and should be treated as compromised material.
- Risk: unauthorized certificate/account actions and downstream trust impact if key is active.
- Action: rotate/revoke key material, remove from git history, and enforce secret scanning in CI.

### 2) TLS verification disabled in backend proxy
- `api/internal/controllers/proxy.go` sets `InsecureSkipVerify: true` in outbound TLS config.
- This disables certificate validation for proxied backend calls.
- Risk: MITM vulnerability for oracle/accounts upstream traffic.
- Action: gate this by non-prod config at minimum, default to strict verification, and add tests/assertions that prod never runs with insecure TLS.

### 3) Sensitive auth/session data persisted in localStorage
- Token/session/key-like values are stored in browser storage in `web/login.html`, `web/index.html`, `web/src/services/api-service.ts`, and `web/src/services/signing-service.ts`.
- Risk: token/session theft under any XSS condition; long-lived leakage across tabs/sessions.
- Action: move auth token to secure cookie strategy where possible; at minimum reduce storage duration and harden CSP/input surfaces.

## High-Impact Bugs and Correctness Issues

### 4) Logout query param check is broken
- In `web/login.html`, `URLSearchParams` values are strings, but code checks `if (key === 'logout' && value === true)`.
- This condition will never be true because `value` is string (e.g., `"true"`).
- User-visible effect: logout callback flow can silently fail.
- Action: compare with string literal and add a tiny regression test for login redirect parsing.

### 5) Query values are interpolated without encoding in several backend routes
- `api/internal/controllers/vehicles.go` builds raw query strings using `fmt.Sprintf("vins=%s", vins)` and similar patterns.
- Risk: malformed or ambiguous upstream requests if values contain reserved characters.
- Action: use `url.Values` for query construction consistently across controllers.

### 6) GraphQL query composition via string concatenation
- `api/internal/service/identity_api.go` interpolates `id` and `owner` directly into GraphQL query strings.
- Risk: malformed query behavior and potential injection-like query manipulation.
- Action: prefer GraphQL variables (or strict validation/escaping) for all external input fields.

## Performance and Scalability Risks

### 7) N+1 sequential telemetry fetching in UI
- `web/src/views/vehicles-fleets.ts` fetches telemetry one-by-one in a loop (`loadTelemetryProgressively`).
- Risk: slow page hydration and amplified latency with larger fleets.
- Action: batch telemetry endpoint support or bounded-concurrency fetching with cancellation and backoff.

### 8) New HTTP client created for each proxied request
- `api/internal/controllers/proxy.go` constructs a new `http.Client` and transport per request.
- Risk: reduced connection reuse and avoidable overhead under load.
- Action: share a configured client/transport at controller or app scope.

## Fragility and Technical Debt

### 9) Large, state-heavy frontend components
- Very large files include `web/src/elements/telemetry-modal-element.ts` (~725 lines), `web/src/elements/base-onboarding-element.ts` (~645), and `web/src/elements/add-vin-element.ts` (~563).
- Risk: high regression probability and difficult code ownership/testing boundaries.
- Action: split by feature subcomponents and extract service/state orchestration from element classes.

### 10) Inconsistent localStorage key management
- `web/src/elements/app-root-v2.ts` logout removes keys like `appSettings` but active settings keys in `web/src/services/settings-service.ts` are `appPrivateSettings`/`appPublicSettings`.
- Risk: stale state survives logout and causes confusing cross-session behavior.
- Action: centralize storage key constants and logout cleanup in a single service.

### 11) Unsafe JSON parsing from localStorage without guardrails
- `web/src/services/settings-service.ts` and `web/src/services/oracle-tenant-service.ts` parse localStorage values directly with `JSON.parse`.
- Risk: app crash on malformed/corrupted storage entries.
- Action: add try/catch with fallback defaults and optional storage versioning/migration.

### 12) Hardcoded CORS origin in backend
- `api/internal/app/app.go` allows only `https://localdev.dimo.org:3008`.
- Risk: brittle environment behavior and unexpected integration failures across staging/prod domain changes.
- Action: move allowed origins to config per environment with strict defaults.

## Test and Delivery Gaps

### 13) Limited automated test coverage outside proxy helper logic
- Tests exist mainly in `api/internal/controllers/proxy_test.go` and `api/internal/controllers/common_test.go`; no web tests were found.
- `.github/workflows/lint.yml` runs Go lint only; no frontend test/lint gate is enforced in CI.
- Risk: regressions in login/onboarding/session and UI flows.
- Action: add minimal web unit tests for auth/session parsing and one end-to-end smoke path in CI.

## Recommended Priority Order
1. Remove/rotate exposed key in `api/certs/acme_account+key` and add secret-scanning gate.
2. Eliminate `InsecureSkipVerify` usage in prod paths (`api/internal/controllers/proxy.go`).
3. Fix logout parsing bug and storage cleanup mismatch (`web/login.html`, `web/src/elements/app-root-v2.ts`).
4. Harden query and GraphQL input handling (`api/internal/controllers/vehicles.go`, `api/internal/service/identity_api.go`).
5. Address UI/API performance debt in telemetry loading (`web/src/views/vehicles-fleets.ts`).
