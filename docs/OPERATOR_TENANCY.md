# Operator-managed multi-tenancy — pointer

The design for turning this app into an **operator console** — where one tenant
configures and manages other tenants that end customers use in `fleet-lite-app` —
lives in:

> `../fleet-tenancy-api/docs/operator-tenancy/`

plus `../fleet-tenancy-api/docs/HANDOFF.md` for what is actually built and
deployed, and `../fleet-tenancy-api/docs/plans/` for the work that has landed
since the design was written (`01-groups-into-tenancy.md`,
`02-vehicle-memberships.md`). Where the design set and the plans disagree, the
plans are newer.

(It moved there on 2026-08-12, from `fleet-lite-app`, once the shared service had
a repo of its own. A byte-identical copy remains in `fleet-lite-app`.)

## Status of the console in this repo — it is live

**The Customers section is real and is the default.** `fleet-tenancy-api` was
deployed to prod on 2026-08-10 (in-cluster only, no ingress), and every endpoint
the console calls is served end to end. `web/src/services/tenancy-service.ts`
speaks the contract over HTTP; `STUB_BY_DEFAULT` is `false`.

`web/src/services/tenancy-stub.ts` survives as an opt-in **demo mode**, for
pointing the console at an environment whose oracle predates the tenancy routes:

```js
localStorage.setItem('tenancyStub', 'true')   // fixtures
localStorage.setItem('tenancyStub', 'false')  // live (the default)
```

The flag is all-or-nothing. `<stub-data-banner>` renders on the customer screens
**only while the stub is on** — if you see it in a normal session, someone set
the flag. The memberships panel additionally degrades to a "not available on this
environment yet" state on a 404, which is what an older oracle answers.

**Routing.** The console calls `/tenancy/*` under the oracle prefix, so a request
goes b2b → kaufmann → fleet-tenancy-api:

```
/oracle/{oracleId}/tenancy/customers
  → b2b proxy            (api/internal/app/app.go, the /tenancy/* block)
  → kaufmann             /v1/tenancy/customers
  → fleet-tenancy-api    /v1/operators/{id}/children
```

b2b holds no DIMO developer licence and cannot authenticate to the tenancy
service directly; kaufmann can, and already does for `/v1/authz`. Going through
it is deliberate rather than incidental.

## This app and fleet-lite are different surfaces

Not two views of the same thing. The distinction drives most of the design:

| | this app | `fleet-lite-app` |
|---|---|---|
| You operate **as** | the operator tenant | any tenant you can act in |
| Vehicle scope | **every vehicle** in the operator's fleet | one tenant's slice |
| Sub-tenants are | configuration objects you manage from the outside | the thing you're logged into |
| Built for | thousands of vehicles — paged, searchable tables | **sub-500 fleets**, map-first |

**You never "switch into" a sub-tenant here.** You stay the operator and
configure the customer's fleet from the outside. And operator staff don't go into
fleet-lite at all — **there is no impersonation and no delegated fleet-lite
session**.

An operator tenant *can* also appear in fleet-lite, controlled by the
`fleet_lite_enabled` toggle on the operator settings screen
(`web/src/elements/operator-fleet-lite-panel-element.ts`). Default on; turned off
once the operator's fleet outgrows what fleet-lite is tuned for. Note it makes
the operator's own fleet stop being *served*, not stop being *held* — it is not a
fix for backend load. Member group scope is the finer lever.

## What it means for this repo

This app is still a BFF: no database, `/oracle/:oracleID/*` proxied to the
selected oracle plus a handful of signing helpers. It simply gained a second
upstream, reached through the first.

Shipped (b2b PRs #171, #173–#175, #179, #180):

- `/tenancy/*` proxy routes alongside the rest of `/oracle/:oracleID/*`
- **Customers** section: list, create, detail (Users / Vehicles / Memberships /
  Settings)
- Provision customer users by email (accounts-api lookup-or-create → membership)
- Assign vehicles from the paged `GetFleetVehicles` view — **minted vehicles
  only** (an unminted VIN has no token id to entitle)
- Bulk-assign by **operator** fleet group, with drift re-apply. The group selects
  vehicles; it does not propagate into the customer's tenant — their groups are
  their own
- `fleet_lite_enabled` toggle on operator settings, with a nudge past 500 vehicles
- Per-vehicle **memberships** (term, move, renew, cancel)

**Still outstanding: the SACD grantee default.** `add-vin-element.ts` continues to
render a checkbox list of grantees prefilled from `tenant_settings.dimo_client_id`,
plus a manual "Use below" client id — there is no automatic default and no
Advanced expander. Under the operator model that question always has the same
answer (the operator's developer licence), and a vehicle minted with the wrong
grantee is invisible to the operator and needs an on-chain fix. Worth doing
regardless of the tenancy work.

## Vehicle memberships are deployed but inert

Steps 1–5 of `../fleet-tenancy-api/docs/plans/02-vehicle-memberships.md` shipped
on 2026-08-14. `memberships_enforced` is **`false` for every tenant in
production**, so nothing acts on a membership yet: an operator can record one
here and no customer's fleet changes. That is the intended intermediate state.
Enforcement lands in fleet-lite's `VehicleService` (step 6), then gets turned on
per customer (step 7).

Don't gate anything in this repo on a membership until those steps land.

## The mint flow is already right

On-chain ownership already sits with the operator — `onboard.go:298` mints with
`Owner: args.Owner`, the staff member signing here with their passkey. Customer
tenants never hold the asset, so customer offboarding is a database operation,
and "customer takes their vehicles" reuses the `/vehicle/transfer` flows this app
already has.

## Tenant-flow hardening

The gating milestone in `.planning/PROJECT.md` is partly done:
`app-root-v2.ts:315` forces `#/tenant-selector` when no tenant is stored, and the
shell renders standalone (no nav) until one is chosen. The **hardcoded-tenant**
item is not done — `isKaufmannTenant()` (`app-root-v2.ts:377`) still branches on
the tenant name containing "kaufmann".

Related mid-flight rename: `canManageMembers()` accepts both `manage_members`
(shared tenancy model) and `manage_admin_users` (kaufmann's own `access_tenants`
rows, which still serve `/permissions`). Drop the old spelling once kaufmann
serves permissions from the tenancy service.

## Decisions already locked

1. A **new shared tenancy service** is the source of truth for tenants, users and
   memberships — not this app, not the oracle.
2. Customer tenants read DIMO data under the **operator's** developer license;
   vehicle scoping is a database entitlement, not an on-chain SACD change.
3. Vehicles are assigned **per vehicle**; fleet groups are bulk shorthand with
   provenance recorded.
4. Users get in **both** ways: operator provisions directly, and fleet-lite's
   email-invitation flow stays.
5. **On-chain does two things** — ownership (operator-held) and one SACD grant
   for fleet enumeration. Sub-tenants get no SACD grants; customer access and
   revocation are web2.
6. **The two apps are different surfaces** (see above).
7. **Operator staff are b2b-only** — no impersonation, no delegated fleet-lite
   sessions. Delegation exists for management only.
8. **Fleet group ids embed their tenant**: `<tenant-uuid>_<slug>`. Done —
   `fleetGroupID()` in kaufmann's `internal/controllers/fleet_vehicles.go:183`.

See `05-risks-and-open-questions.md` for the consequences — in particular that
decisions 2 and 5 make tenant isolation our code's responsibility rather than
the chain's, deliberately, and that the mitigations are therefore the isolation
mechanism rather than defence in depth.

## Two inversions that have already caused incidents

Both live in `tenancy-service.ts` and both read as harmless:

- **`scopeGroupIds: null` means unrestricted; `[]` means restricted to nothing.**
  Testing with `length` alone silently granted 131 memberships the whole fleet
  during the tenancy backfill.
- **`permissions[]` is authoritative, `role` is a display label and a preset.**
  Never gate on role.

---
*Last verified against the code on 2026-08-14.*
