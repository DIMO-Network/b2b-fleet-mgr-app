# Conventions Map

## Scope
This document maps naming, style, and error-handling conventions used in the current codebase.
It is grounded in patterns from `api/`, `web/`, and deployment assets under `charts/`.

## Naming Conventions

### Repository and Module Layout
- Backend service code lives under `api/` with entrypoint `api/cmd/fleet-onboard-app/main.go`.
- Backend domain/runtime code is under `api/internal/` (`app/`, `config/`, `controllers/`, `service/`).
- Frontend code lives under `web/src/` and is grouped by role: `elements/`, `views/`, `services/`, `utils/`, `types/`.
- Helm artifacts use chart-standard names under `charts/fleet-onboard-app/`.

### Go Naming
- Package names are lowercase and concise (for example `controllers`, `config`, `app`).
- Exported types and functions use PascalCase (`IdentityController`, `NewVehiclesController`).
- Unexported helpers use lower camel case (`stripOraclePrefix`, `oracleIDMiddleware`).
- Test files end with `_test.go` (for example `api/internal/controllers/proxy_test.go`).
- Constructors consistently use `New<Type>` (`NewIdentityController`, `NewGenericProxyController`).

### TypeScript and Web Naming
- File names are kebab-case for Lit components and views (for example `web/src/elements/base-onboarding-element.ts`, `web/src/views/vehicle-detail.ts`).
- Class names use PascalCase (`BaseOnboardingElement`, `UsersView`, `ApiService`).
- Custom element tags are kebab-case via `@customElement("users-view")` in `web/src/views/users.ts`.
- Service singletons follow `getInstance()` pattern (`web/src/services/api-service.ts`, `web/src/services/identity-service.ts`).
- Shared path aliases are defined in `web/tsconfig.json` (`@services/*`, `@elements/*`, `@utils/*`).

## Style Conventions

### Go Style
- Formatting is standardized with `gofmt -w -s` via `api/Makefile` target `fmt`.
- Errors are returned explicitly and wrapped where useful (`fmt.Errorf("...: %w", err)` in `api/cmd/fleet-onboard-app/main.go`).
- Handlers are method receivers on controller structs, not free functions.
- Request routing is centralized in `api/internal/app/app.go`.

### TypeScript/Lit Style
- TypeScript strict mode is enabled in `web/tsconfig.json` (`"strict": true`).
- Unused locals/params are compile-time errors (`"noUnusedLocals": true`, `"noUnusedParameters": true`).
- ESLint is configured in `web/eslint.config.js` with semicolon enforcement (`"semi": ["error", "always"]`).
- `no-console` and `no-explicit-any` are warnings, so console logging and `any` still appear in current code.
- Frontend scripts run typecheck before bundling (`"dev": "tsc && vite"`, `"build": "tsc && vite build"` in `web/package.json`).

## Error Handling Conventions

### Backend Error Handling
- Fiber central error shaping is implemented in `api/internal/app/app.go` (`ErrorHandler`).
- API errors are returned as JSON with `{"code": <status>, "message": <error>}` from `ErrorRes`.
- Request validation usually uses `fiber.NewError` for 4xx responses (for example in `api/internal/controllers/identity.go`).
- Runtime/proxy failures are logged with `zerolog` and mapped to 5xx/502 responses.
- Controllers generally log contextual IDs when downstream calls fail (`tokenID`, `definition_id`, `owner_0x`).

### Frontend Error Handling
- API calls are normalized through `ApiService.callApi` in `web/src/services/api-service.ts` using `ApiResponse<T>`.
- Fetch failures are caught and converted to `success: false` plus human-readable `error`.
- Callers commonly wrap async actions in `try/catch/finally` and update UI loading state (for example `web/src/views/users.ts`).
- Current UI still uses `console.error` and occasional `alert(...)` for user-visible failure fallback.

## Known Convention Gaps
- Error payload shape is not fully uniform across backend paths (`ErrorRes` uses `message`, proxy code sometimes returns `error`).
- Frontend import style is mixed between aliased paths and relative paths.
- Minor style drift exists in indentation/spacing across `web/src/` despite lint setup.
- `api/internal/controllers/proxy.go` sets `InsecureSkipVerify: true`; this is an intentional local/proxy behavior but should remain explicitly reviewed.
