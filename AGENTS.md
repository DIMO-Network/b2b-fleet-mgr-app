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

See `.planning/codebase/` for fuller architecture, conventions and stack notes,
and `.planning/PROJECT.md` for the milestone. **Both are point-in-time snapshots
and drift** — `PROJECT.md` still lists shipped work as active, and
`CONCERNS.md` predates `.github/workflows/weblint.yml`. Verify against the code
before acting on either. (One `CONCERNS.md` item is still live and unfixed:
`api/certs/acme_account+key` is a tracked EC private key.)

## The other repos — you will need them

State lives upstream, so most "where does this come from?" questions leave this
repo. All are siblings of it on disk:

| Path | What it is | Read first |
|---|---|---|
| `../kaufmann-oracle` | The oracle backend. Go + Fiber + Postgres + River jobs; owns vehicles, tenants, minting, telemetry ingest. Routes are `/v1/*` in `internal/app/app.go`. | **`docs/onboarding-frontend-context.md`** — maps this app's calls to the oracle's handlers for onboarding, transfer and SACD. The single best cross-repo document. Also `docs/adr/`. |
| `../fleet-tenancy-api` | Shared source of truth for tenants, members, entitlements and vehicle memberships. Live in prod, in-cluster only. | `docs/HANDOFF.md` (what's deployed), `docs/plans/` (what landed since), `docs/operator-tenancy/` (the design set). |
| `../fleet-lite-app` | The **customer-facing** surface. Different app, not another view of this one. | The comparison table in `docs/OPERATOR_TENANCY.md`. |

Request path, all three tiers:

```
browser  /oracle/{oracleId}/tenancy/customers
  → b2b BFF            api/internal/app/app.go   (strips prefix, JoinPath /v1/…)
  → kaufmann-oracle    /v1/tenancy/customers
  → fleet-tenancy-api  /v1/operators/{id}/children
```

b2b holds no DIMO developer licence, so it cannot call `fleet-tenancy-api`
directly — going through kaufmann is deliberate.

## Frontend conventions

- **Register new code or it won't load.** Views go in `web/src/views/` *and*
  `web/src/views/index.ts`; elements in `web/src/elements/` *and*
  `web/src/elements/index.ts`. Routes are declared in one place:
  `web/src/elements/app-root-v2.ts` (hash-based, `@lit-labs/router`).
- **All HTTP goes through `ApiService.callApi`**
  (`web/src/services/api-service.ts`):
  `callApi(method, endpoint, body, auth, useOracle, includeTenantId)`. It adds
  the bearer token and `Tenant-Id`, prefixes `/oracle/{id}` when `useOracle`,
  and unwraps a top-level `data` key from the response.
- **Localization is not optional.** The app runs `@lit/localize` with an `es`
  target. Every user-facing string needs `msg('…')` / `msg(str`…`)` from
  `@lit/localize`. After adding strings run `npm run localize:extract`, fill in
  `web/xliff/es.xlf`, then `npm run localize:build` — the generated
  `web/src/generated/locales/es.ts` is committed. Hardcoded English compiles
  fine and silently ships untranslated.
- Shared CSS lives in `web/src/global-styles.ts`; prefer its existing classes
  (`.panel`, `.btn`, `.table-container`, `.inner-tabs`, `.alert-error`, …) over
  new component CSS.
- Strict TS: `noUnusedLocals` and `noUnusedParameters` are errors. ESLint warns
  on `any` and `console`.

## Commands

| Task | Command |
|---|---|
| Run everything locally | `make dev` |
| Frontend lint / typecheck+build | `cd web && npm run lint` / `npm run build` |
| Backend fmt / lint / test | `cd api && make fmt` / `make lint` / `make test` |
| Extract & build translations | `cd web && npm run localize:extract && npm run localize:build` |

CI on a PR: `lint.yml` (golangci-lint on `api/`), `weblint.yml` (eslint +
`npm run build` on `web/`), `helmlint.yml`.

## Releasing — merging to main is not a deploy

Same split as `kaufmann-oracle` and `fleet-lite-app`:

| File | Written by | Consumed by |
|---|---|---|
| `charts/fleet-onboard-app/values.yaml` | `buildpushdev` (push to `main`) | dev |
| `charts/fleet-onboard-app/values-prod.yaml` | `buildpushprod` (push of a `v*` tag) | prod |

So a merge to `main` builds and pushes an image but deploys nothing to prod.
**Prod releases are cut with a `v*` tag.** Keep the two files in step for
everything except `image.tag` — a change made only in `values.yaml` never
reaches prod.

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
  invisible to the operator and needs an on-chain fix. *Not yet implemented* —
  `add-vin-element.ts` still renders the full grantee checkbox list plus a manual
  client-id field. This is the rule to build toward, not a description of the
  code.
- **Only minted vehicles can be assigned** to a sub-tenant — entitlement is keyed
  by vehicle token id, which an unminted VIN doesn't have.
- Sub-tenants get **no SACD grants**; their access is web2 only.

## Local development

See [`README.md`](README.md). TL;DR: `make dev` brings up frontend + backend
together. Needs `localdev.dimo.org` in `/etc/hosts` and the mkcert root CA
trusted — passkeys require https and a `*.dimo.org` relying-party id.
