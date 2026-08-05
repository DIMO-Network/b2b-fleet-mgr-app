# Operator-managed multi-tenancy — pointer

The design for turning this app into an **operator console** — where one tenant
configures and manages other tenants that end customers use in `fleet-lite-app` —
lives in:

> `../fleet-lite-app/docs/operator-tenancy/`

(It's over there because the centrepiece is a new shared service that doesn't
have a repo yet, and fleet-lite-app is the most affected app. It'll move when
that repo exists.)

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
session**. That keeps this app's tenant selection simple (it selects an operator)
which matters given the flow work already in `.planning/PROJECT.md`.

An operator tenant *can* also appear in fleet-lite, controlled by a
`fleet_lite_enabled` toggle that lives on this app's operator settings screen.
Default on; turned off once the operator's fleet outgrows what fleet-lite is
tuned for.

## What it means for this repo

Today this app is a BFF: no database, `/oracle/:oracleID/*` proxied to the
selected oracle plus a handful of signing helpers. That doesn't change — it
gains a second upstream.

| Change | Phase |
|---|---|
| `/tenancy/*` upstream alongside `/oracle/:oracleID/*`, same generic proxy pattern | 3 |
| **Customers** section: list, create, detail (Users / Vehicles / Settings) | 3 |
| Provision customer users by email (accounts-api lookup-or-create → membership) | 3 |
| Assign vehicles to a customer from the existing paged `GetFleetVehicles` view — **minted vehicles only** (an unminted VIN has no token id to entitle) | 3 |
| Bulk-assign by **operator** fleet group, with drift re-apply. The group selects vehicles; it does not propagate into the customer's tenant — their groups are their own | 3 |
| `fleet_lite_enabled` toggle on operator settings, with a nudge when the fleet outgrows fleet-lite | 3 |
| Operator tenant + managed-customer tenant in the frontend tenant state | 3 |
| **SACD grantee picker in `add-vin-element.ts` defaults automatically** to the operator's developer license; the picker demotes to an advanced override | 3 |

## The mint flow is already right

On-chain ownership already sits with the operator — `onboard.go:286` mints with
`Owner: args.Owner`, the staff member signing here with their passkey. Customer
tenants never hold the asset, so customer offboarding is a database operation, and
"customer takes their vehicles" reuses the `/vehicle/transfer` flows this app
already has.

The one change worth making: the grantee checkbox list in `add-vin-element.ts`
asks the person onboarding a vehicle to make a decision that, under the operator
model, always has the same answer — the operator's developer license. A vehicle
minted with the wrong grantee is invisible to the operator and needs an on-chain
fix, so removing that opportunity is worth doing regardless of the tenancy work.

## Sequencing

Phase 3 touches `web/src/services/oracle-tenant-service.ts` and the app shell —
the same surface as the tenant-flow hardening milestone in
`.planning/PROJECT.md`. **Land that milestone first**; running both at once will
conflict.

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
8. **Fleet group ids embed their tenant**: `<tenant-uuid>_<slug>`, fixing a live
   collision and making group attestations attributable under a shared license.

See `05-risks-and-open-questions.md` for the consequences — in particular that
decisions 2 and 5 make tenant isolation our code's responsibility rather than
the chain's, deliberately, and that the mitigations are therefore the isolation
mechanism rather than defence in depth.
