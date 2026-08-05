# Agent Guidelines — b2b-fleet-mgr-app

## What this app is

A **BFF, not a backend.** No database, no migrations. `api/internal/app/app.go`
is largely one routing table where most entries are
`oracleApp.<verb>(path, genericProxyCtrl.Proxy)` under `/oracle/:oracleID/*`,
proxying to whichever oracle is selected (`kaufmann-oracle`, `motorq-oracle`,
`tesla-oracle`, …). `oracleIDMiddleware` validates the oracle id against the
configured list.

The non-proxy handlers exist to build payloads for passkey signing (mint /
transfer / disconnect / delete) and to talk to accounts-api for OTP login.

**So: tenant and vehicle state lives in the oracle, not here.** If you're
looking for where something is stored, it's upstream.

Frontend is Vite + Lit + TypeScript in `web/`. Oracle and tenant selection are
held in `localStorage` via `web/src/services/oracle-tenant-service.ts`.

See `.planning/codebase/` for the fuller architecture, conventions, stack and
testing notes, and `.planning/PROJECT.md` for the current milestone.

## Tenancy — read this before touching tenant flow, users or vehicle assignment

This app is becoming the **operator console** for an operator-managed
multi-tenant model: one operator tenant configures customer sub-tenants, which
end customers use in `fleet-lite-app`.

Read [`docs/OPERATOR_TENANCY.md`](docs/OPERATOR_TENANCY.md) — it points at the
full design set — before changing tenant selection, the users/admin screens, or
`web/src/elements/add-vin-element.ts`.

Things an agent will otherwise get wrong:

- **This app and fleet-lite are different surfaces, not two views of one thing.**
  Here you operate *as* the operator and see **every** vehicle; sub-tenants are
  configuration objects you manage from the outside. You never "switch into" a
  sub-tenant here.
- **Operator staff are b2b-only.** There's no impersonation and no delegated
  fleet-lite session. Don't build one.
- **The SACD grantee should default to the operator's DIMO client id**, with the
  picker behind an Advanced expander. A vehicle minted with the wrong grantee is
  invisible to the operator and needs an on-chain fix.
- **Only minted vehicles can be assigned** to a sub-tenant — entitlement is keyed
  by vehicle token id, which an unminted VIN doesn't have.
- Sub-tenants get **no SACD grants**; their access is web2 only.

## Local development

See [`README.md`](README.md). TL;DR: `make dev` brings up frontend + backend
together. Needs `localdev.dimo.org` in `/etc/hosts` and the mkcert root CA
trusted — passkeys require https and a `*.dimo.org` relying-party id.
