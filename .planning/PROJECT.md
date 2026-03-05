# B2B Fleet Manager App - Tenant Flow Hardening

## What This Is

This is a brownfield Lit + Go fleet management application where authenticated users operate within tenant-scoped workflows. The current milestone focuses on hardening multi-tenancy UX and state handling in the frontend so users cannot proceed in the app until a tenant is explicitly selected or created. The scope includes improving tenant context visibility in the app shell and reducing brittle or hardcoded tenant/oracle behavior.

## Core Value

Every authenticated user is always operating in the correct tenant context, with explicit and reliable tenant selection and switching.

## Requirements

### Validated

- ✓ Users can authenticate and enter the frontend shell (`web/login.html`, `web/src/elements/login-element.ts`) — existing
- ✓ Tenant selection UI exists with tenant listing and add-tenant capability (`web/src/views/tenant-selector.ts`, `web/src/elements/add-tenant-modal-element.ts`) — existing
- ✓ Selected tenant can be persisted and used for API tenant headers (`web/src/services/oracle-tenant-service.ts`, `web/src/services/api-service.ts`) — existing
- ✓ App currently provides a switch-tenant entry route from the shell (`web/src/elements/app-root-v2.ts` -> `#/tenant-selector`) — existing

### Active

- [ ] If no tenant is selected after login (no valid local storage tenant), force a standalone tenant selection view with no app navigation escape paths
- [ ] Keep tenant selector usable for both selecting existing tenants and creating a new tenant before entering the main app
- [ ] Display currently selected tenant name in the app shell with a dropdown/chevron interaction that includes "Switch Tenant"
- [ ] Refactor tenant management flow for clearer ownership and fewer ad-hoc paths/events across views/services
- [ ] Remove hardcoded tenant/oracle assumptions (for example Kaufmann defaults) and drive behavior from real user/oracle/tenant data

### Out of Scope

- Native mobile redesign — current scope is the existing web frontend under `web/`
- Broad visual redesign of unrelated pages — this effort is flow correctness and tenant UX clarity first
- Backend API contract redesign for tenant domain — only minimal backend changes if frontend flow depends on them

## Context

The app is a brownfield codebase with an authenticated shell (`web/src/elements/app-root-v2.ts`) and tenant domain state centralized in `web/src/services/oracle-tenant-service.ts`. Current implementation includes ad-hoc defaults and mixed responsibilities; for example, `oracle-tenant-service.ts` initializes a Kaufmann oracle by default, while the app shell still exposes navigation before tenant certainty is established. Multiple services rely on tenant ID headers (`Tenant-Id`) and assume a selected tenant exists, so gating and state consistency are critical to prevent invalid requests and confusing user behavior.

## Constraints

- **Tech stack**: Preserve Lit + TypeScript frontend architecture in `web/` — minimize churn and keep alignment with existing app structure
- **Brownfield safety**: Must avoid regressions in authenticated routes and tenant-scoped API calls — existing pages depend on `Tenant-Id` behavior
- **Flow integrity**: No-tenant state must be blocking by design — user should have no alternate path until tenant context is established
- **State consistency**: Tenant and oracle state should come from persisted/user data, not hardcoded defaults — prevents environment-specific bugs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize strict flow enforcement before broader refactor depth | Main risk is users operating without valid tenant context | — Pending |
| Always force selector when no tenant is stored | Removes ambiguity and prevents implicit incorrect tenant context | — Pending |
| Use tenant-name dropdown in app shell as switch entry | Keeps current context visible while making switch action discoverable | — Pending |

---
*Last updated: 2026-03-05 after initialization*
