# Integration Map

## Overview
- Backend acts as both API server and proxy/facade for multiple upstream services (`api/internal/app/app.go`).
- Frontend calls backend-relative routes through `ApiService`, with optional oracle and tenant scoping (`web/src/services/api-service.ts`).
- Oracle-specific traffic is routed through `/oracle/:oracleID/*` and forwarded to upstream `/v1/*` paths (`api/internal/controllers/proxy.go`).

## Identity and Definitions (DIMO)
- Identity GraphQL endpoint is configured by `IDENTITY_API_URL` in `config.Settings` (`api/internal/config/settings.go`).
- Identity controller exposes:
- `GET /identity/vehicle/:tokenID`
- `GET /identity/definition/:id`
- `GET /identity/owner/:owner`
- `POST /identity/proxy`
- These are implemented in `api/internal/controllers/identity.go` and use `api/internal/service/identity_api.go`.
- `identity_api.go` builds GraphQL queries and POSTs JSON payloads with retry-enabled shared HTTP client.

## Oracle Integrations
- Supported oracles come from `Settings.GetOracles()` in `api/internal/config/settings.go`:
- `motorq` -> `MOTORQ_ORACLE_API_URL`
- `staex` -> `STAEX_ORACLE_API_URL`
- `kaufmann` -> `KAUFMANN_ORACLE_API_URL` (with `UsePendingMode: true`)
- Oracle route validation is enforced by `oracleIDMiddleware` (`api/internal/app/app.go`).
- Proxy forwarding logic strips `/oracle/{id}` prefix then forwards to upstream `/v1/...` (`api/internal/controllers/proxy.go`, `api/internal/controllers/common.go`).

## Accounts and OTP
- Accounts API base URL is configured as `ACCOUNTS_API_URL` (`api/internal/config/settings.go`).
- OTP endpoints are forwarded directly to Accounts API:
- `POST /oracle/:oracleID/auth/otp`
- `PUT /oracle/:oracleID/auth/otp`
- Implementation: `api/internal/controllers/account.go`.
- Frontend also queries account details through `settingsService.privateSettings.accountsApiUrl` in `web/src/services/identity-service.ts`.

## Auth and Trust Boundaries
- Backend-protected routes use JWT middleware configured with `JWT_KEY_SET_URL` (`api/internal/app/app.go`).
- Frontend sends bearer token from local storage (`web/src/services/api-service.ts`).
- Tenant scoping is propagated via `Tenant-Id` header (`web/src/services/api-service.ts`, `api/internal/controllers/proxy.go`).
- CORS is currently hardcoded for `https://localdev.dimo.org:3008` in backend (`api/internal/app/app.go`).

## Wallet, Signing, and AA Stack
- Private settings endpoint `/settings` exposes `paymasterUrl`, `rpcUrl`, `bundlerUrl`, and Turnkey settings (`api/internal/controllers/settings.go`).
- Frontend signing integrates Turnkey + ZeroDev + viem in `web/src/services/signing-service.ts`.
- Dependencies include:
- `@turnkey/sdk-browser`, `@turnkey/viem`, `@turnkey/webauthn-stamper`
- `@zerodev/sdk`, `@zerodev/ecdsa-validator`
- `viem`
- Dependency declarations are in `web/package.json`.

## DIMO Developer JWT Service
- Backend includes `DIMOJWTService` in `api/internal/service/dimo_jwt.go`.
- Service behavior: generates ES256 JWT, registers ephemeral public key at `APIURL + /developer/register-key`, and caches JWT in memory.
- Config fields exist in `Settings`: `DIMO_API_URL`, `DIMO_CLIENT_ID`, `DIMO_CLIENT_SECRET` (`api/internal/config/settings.go`).
- Unknown: no direct route/controller wiring to this service was confirmed in scanned files.

## Deployment-Time Integrations
- Helm values define environment-specific upstream URLs in:
- `charts/fleet-onboard-app/values.yaml` (dev)
- `charts/fleet-onboard-app/values-prod.yaml` (prod)
- External Secrets inject:
- `PAYMASTER_URL`
- `RPC_URL`
- `BUNDLER_URL`
- via `charts/fleet-onboard-app/templates/secret.yaml`.

## Risks and Unknowns
- `InsecureSkipVerify: true` is used for outbound proxy TLS transport (`api/internal/controllers/proxy.go`), which weakens upstream TLS verification.
- `settings.sample.yaml` uses `DEVICE_DEFINITIONS_API_URL`, while Go config expects `DEFINITION_API_URL`; mapping appears inconsistent (unknown whether handled elsewhere).
- No explicit timeout configuration is present in proxy controller HTTP client construction (it uses `http.Client` with custom transport only).
- No explicit circuit breaker/rate limiter integration was observed in scanned backend files.
