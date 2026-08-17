import { ApiService } from "@services/api-service.ts";
import { ApiResponse } from "@datatypes/api-response.ts";
import { TenancyStub } from "@services/tenancy-stub.ts";
import { FleetService } from "@services/fleet-service.ts";

// How many of the operator's vehicles to pull when joining token ids to VINs.
// fleet-lite targets sub-500 fleets per customer and the console nudges at 500,
// so this covers the intended range; past it, rows render with a token id and
// no description rather than vanishing.
const HYDRATE_LIMIT = 2000;

// The oracle's vehicle shape, as GET /fleet/vehicles returns it.
interface OracleVehicle {
  vin: string;
  vehicle_token_id: number | null;
  license_plate: string | null;
  make: string;
  model: string;
  year: number;
}

// The tenancy service's entitlement shape: token id and provenance, no fleet
// data. Joined to OracleVehicle above to make an EntitledVehicle.
interface RawEntitlement {
  vehicleTokenId: number;
  source: string;
  sourceGroupId: string | null;
  grantedByWallet: string | null;
  createdAt: string;
}

// The shape the assign picker works in, whether the rows came from the real
// GET /fleet/vehicles or from fixtures.
export type { OperatorFleetVehicle } from "@services/tenancy-stub.ts";

// Client for the operator console's tenancy surface.
//
// THE BACKEND IS COMPLETE: every action the console offers is served for real.
// Vehicle memberships were the most recent addition, built UI-first against the
// stub and then wired through (fleet-tenancy-api docs/plans/02-vehicle-memberships.md).
// The memberships panel still renders a "not available on this environment yet"
// state on a 404 from the proxy, which is what an environment running an older
// oracle or tenancy service will answer. The stub remains a demo mode:
//
//   live — HTTP, via the b2b proxy to kaufmann-oracle to fleet-tenancy-api.
//          The default.
//   stub — in-memory fixtures (tenancy-stub.ts). isStubbed() is true and the
//          UI says so on screen.
//
// Flip back with localStorage.setItem('tenancyStub', 'true') — useful against
// an environment whose oracle lacks the tenancy routes. When the stub is no
// longer wanted at all, delete tenancy-stub.ts and the branch in call().
//
// THE FLAG IS ALL-OR-NOTHING. Served for real:
//
//   GET/PATCH  /tenancy/operator
//   GET/POST   /tenancy/customers
//   GET/PATCH  /tenancy/customers/{id}
//   GET        /tenancy/customers/{id}/members
//   POST       /tenancy/customers/{id}/members/provision
//   PATCH      /tenancy/customers/{id}/members/{wallet}
//   DELETE     /tenancy/customers/{id}/members/{wallet}
//   GET/POST   /tenancy/customers/{id}/vehicles
//   DELETE     /tenancy/customers/{id}/vehicles/{tokenId}
//
//   GET/POST   /tenancy/customers/{id}/memberships
//   POST       /tenancy/customers/{id}/memberships/{mid}/move
//   POST       /tenancy/customers/{id}/memberships/{mid}/renew
//   DELETE     /tenancy/customers/{id}/memberships/{mid}
//
// ROUTING. Live mode calls /tenancy/* under the oracle prefix, so a request
// leaves the browser as
//
//   /oracle/{oracleId}/tenancy/customers
//        -> b2b proxy      -> kaufmann /v1/tenancy/customers
//        -> fleet-tenancy-api /v1/operators/{id}/children
//
// b2b holds no DIMO developer license, so it cannot authenticate to
// fleet-tenancy-api directly; kaufmann can, and already does for /v1/authz.
// Going through it is deliberate rather than incidental.

const STUB_FLAG_KEY = "tenancyStub";
const STUB_BY_DEFAULT = false;

export type TenantKind = "operator" | "customer";
export type TenantStatus = "active" | "suspended";
export type EntitlementMode = "implicit" | "explicit";
export type MemberRole = "owner" | "admin" | "member";

// The shared capability set. permissions[] is authoritative for every
// authorization decision; role is a display label and a preset used to fill
// these in when adding a member. Never gate on role.
export const CAPABILITIES = [
  "manage_members",
  "manage_settings",
  "onboard_vehicles",
  "reports",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_members: "Manage members",
  manage_settings: "Manage settings and credentials",
  onboard_vehicles: "Onboard vehicles",
  reports: "Run reports",
};

// Presets only. Changing a role in the UI fills the capability boxes; it is the
// boxes that get saved and checked.
export const ROLE_PRESETS: Record<MemberRole, Capability[]> = {
  owner: ["manage_members", "manage_settings", "onboard_vehicles", "reports"],
  admin: ["manage_members", "onboard_vehicles", "reports"],
  member: [],
};

export interface CustomerTenant {
  id: string;
  name: string;
  kind: TenantKind;
  parentTenantId: string | null;
  status: TenantStatus;
  managed: boolean;
  entitlementMode: EntitlementMode;
  fleetLiteEnabled: boolean;
  // When true, fleet-lite hides this customer's vehicles that have no active
  // membership. Default false so existing customers are unaffected until an
  // operator deliberately turns it on — self-serve tenants have no console to
  // manage memberships from at all.
  membershipsEnforced: boolean;
  externalRef: string | null;
  createdAt: string;
  // Counts come from /v1/operators/{id}/children, which backs the list view.
  vehicleCount: number;
  userCount: number;
  lastActivityAt: string | null;
}

export interface Member {
  wallet: string;
  email: string | null;
  role: MemberRole;
  permissions: string[];
  // null = unrestricted. An empty array means "restricted to nothing", which is
  // the opposite. This inversion silently granted 131 memberships the whole
  // fleet during the tenancy backfill — never test with length alone.
  scopeGroupIds: string[] | null;
  // Set when the operator provisioned this member rather than the customer
  // inviting them. Lets the customer-facing UI tell the two apart.
  grantedByTenantId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

// An email invitation to a customer tenant. The other way a person gets in:
// provisioning creates a DIMO account and wallet on their behalf, an invitation
// lets them bring their own. Both paths exist deliberately (design D4).
//
// There is no token field and there must never be one. The plaintext exists in
// the invitee's email and in fleet-tenancy-api's memory at mint time, nowhere
// else — only its hash is stored.
export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  role: MemberRole;
  status: "pending" | "accepted" | "revoked";
  invitedBy?: string;
  // The wallet that actually accepted, which need not be the emailed address's
  // expected owner.
  inviteeWallet?: string | null;
  // Set when the OPERATOR sent this rather than the customer inviting their
  // own member — so anything sent from this console carries it.
  createdByTenantId?: string | null;
  // Same three-valued scope as Member: null unrestricted, [] nothing. It
  // becomes the membership's scope verbatim on accept.
  scopeGroupIds: string[] | null;
  // Delivery tracking from Postmark, upgraded by webhook. Absent means the
  // email never dispatched — the send failed, or sending is switched off.
  emailStatus?: "sent" | "delivered" | "opened" | "bounced" | null;
  emailStatusAt?: string | null;
  emailStatusDetail?: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  // Create and resend only: false means the record was written but the email
  // did not go out. A partial success, not a failure.
  emailSent?: boolean;
}

export interface CreateInvitationInput {
  email: string;
  role: MemberRole;
  // null = every group, [] = none. Never omit it: fleet-tenancy-api refuses an
  // absent value rather than guessing, precisely so a forgotten field cannot
  // silently grant the whole fleet.
  scopeGroupIds: string[] | null;
  locale?: string;
}

export interface EntitledVehicle {
  vehicleTokenId: number;
  vin: string | null;
  licensePlate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  source: "operator" | "sacd" | "import";
  // Provenance for a bulk assign-by-group. Names an OPERATOR-side fleet group
  // used to select vehicles at assign time — not a link into the customer's
  // tenant, whose groups are their own.
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  createdAt: string;
}

// Vehicles added to a group since that group was assigned. Assignment is a
// snapshot by design (auto-following would let an internal group edit silently
// expose a vehicle), so drift is surfaced and re-applied on request.
export interface GroupDrift {
  groupId: string;
  groupName: string;
  addedTokenIds: number[];
  assignedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  externalRef?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  status?: TenantStatus;
  fleetLiteEnabled?: boolean;
  membershipsEnforced?: boolean;
  externalRef?: string | null;
}

export interface ProvisionMemberInput {
  email: string;
  role: MemberRole;
  permissions: string[];
  scopeGroupIds: string[] | null;
}

export interface UpdateMemberInput {
  role?: MemberRole;
  permissions?: string[];
  scopeGroupIds?: string[] | null;
}

export interface AssignVehiclesInput {
  tokenIds: number[];
  // Set when the selection came from an operator fleet group, so provenance is
  // recorded and drift can be detected later.
  fromGroupId?: string;
  fromGroupName?: string;
}

export interface AssignVehiclesResult {
  assigned: number[];
  // Vehicles already entitled to another customer. The exclusivity invariant —
  // at most one explicit-mode tenant per vehicle per operator — is enforced in
  // the service layer, so a partial success is a normal outcome, not an error.
  rejected: { tokenId: number; reason: string; heldBy: string }[];
}

// MEMBERSHIPS
//
// A membership is the commercial record: one vehicle, paid for a term, movable
// to another vehicle when the first is discontinued. It is deliberately NOT the
// entitlement — the entitlement says "this customer may see this vehicle", the
// membership says "this vehicle is paid for, until when". Keeping them apart is
// what lets a membership move without destroying entitlement provenance, and
// gives a future purchase flow something to attach to.

// The terms an operator can pick. Constrained here and again by a CHECK on the
// tenancy service's column, so a term that reaches the database is one of these.
export const MEMBERSHIP_TERMS = [1, 12, 24, 36, 48] as const;

export type MembershipTerm = (typeof MEMBERSHIP_TERMS)[number];

// Computed by the service from starts_at + term, never stored as a state that
// could go stale — an expired membership is expired the moment the clock passes
// it, with no job needing to have run.
export type MembershipStatus = "active" | "expiring_soon" | "expired" | "canceled";

// Days before expiry that a membership starts warning. The console's whole job
// on expiry is to surface this early enough that an operator renews first.
export const EXPIRING_SOON_DAYS = 30;

// The tenancy service's membership shape: the record and nothing about the
// vehicle, for the same reason entitlements carry no VIN — fleet data belongs
// to the oracle. Joined below into VehicleMembership.
interface RawMembership {
  id: string;
  vehicleTokenId: number;
  termMonths: number;
  startsAt: string;
  expiresAt: string;
  canceledAt: string | null;
  status: MembershipStatus;
}

export interface VehicleMembership {
  id: string;
  vehicleTokenId: number;
  termMonths: number;
  startsAt: string;
  expiresAt: string;
  canceledAt: string | null;
  status: MembershipStatus;
  // Joined from the oracle's fleet list.
  vin: string | null;
  licensePlate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  // False when the customer is no longer entitled to this vehicle — paid time
  // pointing at something they cannot see. Revoking an entitlement deliberately
  // does NOT cancel the membership (that is the discontinued-vehicle case, and
  // destroying a commercial record as a side effect of an access change would
  // be irreversible), so the console flags it and the operator moves or cancels.
  //
  // Computed here, like drift: it needs the entitlement list and the membership
  // list together, and only the console sees both.
  entitled: boolean;
}

export interface MembershipList {
  // Whether fleet-lite is hiding this customer's unmembered vehicles right now.
  // Carried on the list response so the one call answers both questions — it is
  // the shape fleet-lite reads, and the console shows it as context.
  enforced: boolean;
  memberships: VehicleMembership[];
}

export interface CreateMembershipInput {
  vehicleTokenId: number;
  termMonths: number;
}

export interface MoveMembershipInput {
  vehicleTokenId: number;
}

export interface RenewMembershipInput {
  termMonths: number;
}

export class TenancyService {
  private static instance: TenancyService;

  private api: ApiService;
  private stub: TenancyStub;

  private constructor() {
    this.api = ApiService.getInstance();
    this.stub = new TenancyStub();
  }

  public static getInstance(): TenancyService {
    if (!TenancyService.instance) {
      TenancyService.instance = new TenancyService();
    }
    return TenancyService.instance;
  }

  // Whether the data on screen is fixtures. The UI surfaces this — a console
  // showing invented customers with no indication is worse than no console.
  public isStubbed(): boolean {
    const override = localStorage.getItem(STUB_FLAG_KEY);
    if (override !== null) return override !== "false";
    return STUB_BY_DEFAULT;
  }

  private call<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body: Record<string, any> | null,
    stubbed: () => Promise<ApiResponse<T>>,
  ): Promise<ApiResponse<T>> {
    if (this.isStubbed()) return stubbed();
    return this.api.callApi<T>(method, `/tenancy${path}`, body, true, true, true);
  }

  // The customer id the console works in terms of is the tenant id. The two
  // paths below differ because the operator is implied by the caller's own
  // Tenant-Id header rather than named in the URL — the console never selects
  // an operator, it *is* one.


  // CUSTOMERS

  // Customer tenants under the operator currently selected in the app shell.
  // The operator is the selected tenant — you configure customers from the
  // outside and never switch into one here.
  public listCustomers(): Promise<ApiResponse<CustomerTenant[]>> {
    return this.call("GET", "/customers", null, () => this.stub.listCustomers());
  }

  public getCustomer(id: string): Promise<ApiResponse<CustomerTenant>> {
    return this.call("GET", `/customers/${id}`, null, () => this.stub.getCustomer(id));
  }

  public createCustomer(input: CreateCustomerInput): Promise<ApiResponse<CustomerTenant>> {
    return this.call("POST", "/customers", { ...input }, () => this.stub.createCustomer(input));
  }

  public updateCustomer(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<ApiResponse<CustomerTenant>> {
    return this.call("PATCH", `/customers/${id}`, { ...input }, () =>
      this.stub.updateCustomer(id, input),
    );
  }

  // MEMBERS

  public listMembers(tenantId: string): Promise<ApiResponse<Member[]>> {
    return this.call("GET", `/customers/${tenantId}/members`, null, () =>
      this.stub.listMembers(tenantId),
    );
  }

  // Operator on-behalf provisioning: accounts-api lookup-or-create against the
  // email, then a membership row stamped with the operator as granted_by. The
  // customer logs into fleet-lite and lands in their tenant with no invitation
  // to accept.
  public provisionMember(
    tenantId: string,
    input: ProvisionMemberInput,
  ): Promise<ApiResponse<Member>> {
    return this.call("POST", `/customers/${tenantId}/members/provision`, { ...input }, () =>
      this.stub.provisionMember(tenantId, input),
    );
  }

  public updateMember(
    tenantId: string,
    wallet: string,
    input: UpdateMemberInput,
  ): Promise<ApiResponse<Member>> {
    return this.call("PATCH", `/customers/${tenantId}/members/${wallet}`, { ...input }, () =>
      this.stub.updateMember(tenantId, wallet, input),
    );
  }

  public removeMember(tenantId: string, wallet: string): Promise<ApiResponse<void>> {
    return this.call("DELETE", `/customers/${tenantId}/members/${wallet}`, null, () =>
      this.stub.removeMember(tenantId, wallet),
    );
  }

  // INVITATIONS

  // Invite by email instead of provisioning. fleet-tenancy-api mints the
  // single-use token, stores only its hash, and sends the mail; the person
  // signs in with their own DIMO account and the membership is written when
  // they accept.
  public listInvitations(tenantId: string): Promise<ApiResponse<Invitation[]>> {
    return this.call("GET", `/customers/${tenantId}/invitations`, null, () =>
      this.stub.listInvitations(tenantId),
    );
  }

  // A 201 whose emailSent is false is a PARTIAL SUCCESS: the invitation exists
  // and can be resent. Callers must not present it as a failure or the
  // operator will send a second one.
  public createInvitation(
    tenantId: string,
    input: CreateInvitationInput,
  ): Promise<ApiResponse<Invitation>> {
    return this.call("POST", `/customers/${tenantId}/invitations`, { ...input }, () =>
      this.stub.createInvitation(tenantId, input),
    );
  }

  public revokeInvitation(tenantId: string, invitationId: string): Promise<ApiResponse<void>> {
    return this.call("DELETE", `/customers/${tenantId}/invitations/${invitationId}`, null, () =>
      this.stub.revokeInvitation(tenantId, invitationId),
    );
  }

  // Resend mints a FRESH token; the previous link stops working. That is the
  // contract rather than a side effect, and the UI says so before confirming.
  public resendInvitation(
    tenantId: string,
    invitationId: string,
  ): Promise<ApiResponse<Invitation>> {
    return this.call("POST", `/customers/${tenantId}/invitations/${invitationId}/resend`, {}, () =>
      this.stub.resendInvitation(tenantId, invitationId),
    );
  }

  // VEHICLES

  // THE JOIN THE ARCHITECTURE REQUIRES.
  //
  // The tenancy service stores token ids and provenance, never VIN, plate or
  // model — those belong to the oracle, and a copy in the tenancy service would
  // be a second, staler source of fleet data. So the console is the thing that
  // joins them, here.
  //
  // Bounded at HYDRATE_LIMIT vehicles. fleet-lite targets sub-500 fleets per
  // customer and the nudge fires at 500, so this covers the intended range with
  // room to spare; beyond it, rows render with their token id and no
  // description rather than silently disappearing.
  public async listEntitlements(tenantId: string): Promise<ApiResponse<EntitledVehicle[]>> {
    if (this.isStubbed()) return this.stub.listEntitlements(tenantId);

    const raw = await this.api.callApi<RawEntitlement[]>(
      "GET", `/tenancy/customers/${tenantId}/vehicles`, null, true, true, true);
    if (!raw.success) return { success: false, error: raw.error, status: raw.status };

    const rows = raw.data ?? [];
    const [fleet, groups] = await Promise.all([this.fleetIndex(), this.groupNames()]);

    return {
      success: true,
      data: rows.map((e) => {
        const v = fleet.get(e.vehicleTokenId);
        return {
          vehicleTokenId: e.vehicleTokenId,
          vin: v?.vin ?? null,
          licensePlate: v?.license_plate ?? null,
          make: v?.make ?? null,
          model: v?.model ?? null,
          year: v?.year ?? null,
          source: e.source as EntitledVehicle["source"],
          sourceGroupId: e.sourceGroupId,
          sourceGroupName: e.sourceGroupId ? (groups.get(e.sourceGroupId) ?? e.sourceGroupId) : null,
          createdAt: e.createdAt,
        };
      }),
    };
  }

  public assignVehicles(
    tenantId: string,
    input: AssignVehiclesInput,
  ): Promise<ApiResponse<AssignVehiclesResult>> {
    return this.call("POST", `/customers/${tenantId}/vehicles`, { ...input }, () =>
      this.stub.assignVehicles(tenantId, input),
    );
  }

  public revokeVehicle(tenantId: string, tokenId: number): Promise<ApiResponse<void>> {
    return this.call("DELETE", `/customers/${tenantId}/vehicles/${tokenId}`, null, () =>
      this.stub.revokeVehicle(tenantId, tokenId),
    );
  }

  // MEMBERSHIPS

  // Hydrated the same way entitlements are, and for the same reason: the tenancy
  // service holds the record, the oracle holds the fleet data, and the console
  // is the only thing that sees both. The entitlement cross-check rides along
  // here rather than in a second round trip from the panel.
  public async listMemberships(tenantId: string): Promise<ApiResponse<MembershipList>> {
    if (this.isStubbed()) return this.stub.listMemberships(tenantId);

    const raw = await this.api.callApi<{ enforced: boolean; memberships: RawMembership[] }>(
      "GET", `/tenancy/customers/${tenantId}/memberships`, null, true, true, true);
    if (!raw.success) return { success: false, error: raw.error, status: raw.status };

    const rows = raw.data?.memberships ?? [];
    const [fleet, entitled] = await Promise.all([
      this.fleetIndex(),
      this.entitledTokenIds(tenantId),
    ]);

    return {
      success: true,
      data: {
        enforced: raw.data?.enforced ?? false,
        memberships: rows.map((m) => {
          const v = fleet.get(m.vehicleTokenId);
          return {
            ...m,
            vin: v?.vin ?? null,
            licensePlate: v?.license_plate ?? null,
            make: v?.make ?? null,
            model: v?.model ?? null,
            year: v?.year ?? null,
            // null means the entitlement list could not be read. Treated as
            // entitled: "we could not ask" must not render as "this customer
            // lost the vehicle", which would send an operator chasing nothing.
            entitled: entitled === null || entitled.has(m.vehicleTokenId),
          };
        }),
      },
    };
  }

  public createMembership(
    tenantId: string,
    input: CreateMembershipInput,
  ): Promise<ApiResponse<VehicleMembership>> {
    return this.call("POST", `/customers/${tenantId}/memberships`, { ...input }, () =>
      this.stub.createMembership(tenantId, input),
    );
  }

  // Move and renew are actions rather than a PATCH of the same fields. They
  // validate differently — move needs an entitled, unmembered target; renew
  // needs a term — and this programme has twice been bitten by tri-state
  // "absent vs empty vs set" JSON on update endpoints.
  public moveMembership(
    tenantId: string,
    membershipId: string,
    input: MoveMembershipInput,
  ): Promise<ApiResponse<VehicleMembership>> {
    return this.call(
      "POST", `/customers/${tenantId}/memberships/${membershipId}/move`, { ...input },
      () => this.stub.moveMembership(tenantId, membershipId, input),
    );
  }

  public renewMembership(
    tenantId: string,
    membershipId: string,
    input: RenewMembershipInput,
  ): Promise<ApiResponse<VehicleMembership>> {
    return this.call(
      "POST", `/customers/${tenantId}/memberships/${membershipId}/renew`, { ...input },
      () => this.stub.renewMembership(tenantId, membershipId, input),
    );
  }

  public cancelMembership(tenantId: string, membershipId: string): Promise<ApiResponse<void>> {
    return this.call("DELETE", `/customers/${tenantId}/memberships/${membershipId}`, null, () =>
      this.stub.cancelMembership(tenantId, membershipId),
    );
  }

  // Token ids this customer is currently entitled to, or null if that could not
  // be read. Null and empty are distinguished deliberately — the same trap as
  // groupMembers below, and as scopeGroupIds throughout this domain.
  private async entitledTokenIds(tenantId: string): Promise<Set<number> | null> {
    const res = await this.api.callApi<RawEntitlement[]>(
      "GET", `/tenancy/customers/${tenantId}/vehicles`, null, true, true, true);
    if (!res.success) return null;
    return new Set((res.data ?? []).map((e) => e.vehicleTokenId));
  }

  // DRIFT IS COMPUTED HERE, NOT SERVED.
  //
  // It is the difference between the vehicles a group holds *now* and the ones
  // that were entitled when it was assigned. The first half lives in the oracle
  // and the second in the tenancy service, and only this console sees both — so
  // it is the only place the subtraction can happen without one service
  // learning the other's domain. The spec sketched a /vehicles/drift endpoint
  // on the tenancy service; it was dropped for exactly this reason.
  public async getDrift(tenantId: string): Promise<ApiResponse<GroupDrift[]>> {
    if (this.isStubbed()) return this.stub.getDrift(tenantId);

    const entitled = await this.api.callApi<RawEntitlement[]>(
      "GET", `/tenancy/customers/${tenantId}/vehicles`, null, true, true, true);
    if (!entitled.success) return { success: false, error: entitled.error, status: entitled.status };

    const rows = entitled.data ?? [];
    const byGroup = new Map<string, { tokens: Set<number>; assignedAt: string }>();
    for (const e of rows) {
      if (!e.sourceGroupId) continue;
      const seen = byGroup.get(e.sourceGroupId);
      if (seen) {
        seen.tokens.add(e.vehicleTokenId);
        // The earliest row is when the group was applied; later ones are
        // re-applies, and reporting the newest would understate the drift.
        if (e.createdAt < seen.assignedAt) seen.assignedAt = e.createdAt;
      } else {
        byGroup.set(e.sourceGroupId, {
          tokens: new Set([e.vehicleTokenId]),
          assignedAt: e.createdAt,
        });
      }
    }
    if (byGroup.size === 0) return { success: true, data: [] };

    const groupNames = await this.groupNames();
    const drift: GroupDrift[] = [];

    for (const [groupId, snapshot] of byGroup) {
      const current = await this.groupMembers(groupId);
      if (current === null) continue; // group gone, or unreadable — not drift
      const added = current.filter((t) => !snapshot.tokens.has(t));
      if (added.length > 0) {
        drift.push({
          groupId,
          groupName: groupNames.get(groupId) ?? groupId,
          addedTokenIds: added,
          assignedAt: snapshot.assignedAt,
        });
      }
    }
    return { success: true, data: drift };
  }

  // Re-expands a group and assigns whatever is now in it. Vehicles already held
  // come back as no-ops, so this converges rather than duplicating.
  public async reapplyGroup(
    tenantId: string,
    groupId: string,
  ): Promise<ApiResponse<AssignVehiclesResult>> {
    if (this.isStubbed()) return this.stub.reapplyGroup(tenantId, groupId);

    const current = await this.groupMembers(groupId);
    if (current === null) {
      return { success: false, error: "could not read that fleet group" };
    }
    return this.assignVehicles(tenantId, { tokenIds: current, fromGroupId: groupId });
  }

  // FLEET LOOKUPS — the oracle half of the joins above.

  private async fleetIndex(): Promise<Map<number, OracleVehicle>> {
    const res = await this.api.callApi<{ items: OracleVehicle[] }>(
      "GET", `/fleet/vehicles?skip=0&take=${HYDRATE_LIMIT}&search=&filter=`, null, true, true);
    const index = new Map<number, OracleVehicle>();
    for (const v of res.data?.items ?? []) {
      if (v.vehicle_token_id) index.set(v.vehicle_token_id, v);
    }
    return index;
  }

  private async groupNames(): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    try {
      for (const g of (await FleetService.getInstance().getFleetGroups()) ?? []) {
        names.set(g.id, g.name);
      }
    } catch {
      // A missing name only costs a prettier label; the id is shown instead.
    }
    return names;
  }

  // Minted vehicles currently in a group, or null if the group could not be
  // read. Null and empty are distinguished on purpose: "the group is now empty"
  // is drift information, while "we could not ask" is not, and treating the
  // second as the first would report every vehicle as removed.
  private async groupMembers(groupId: string): Promise<number[] | null> {
    const res = await this.api.callApi<{ items: OracleVehicle[] }>(
      "GET",
      `/fleet/vehicles?skip=0&take=${HYDRATE_LIMIT}&search=&filter=group:${encodeURIComponent(groupId)}`,
      null, true, true);
    if (!res.success) return null;
    return (res.data?.items ?? [])
      .filter((v) => !!v.vehicle_token_id)
      .map((v) => v.vehicle_token_id as number);
  }

  // FLEET PICKER SUPPORT
  //
  // The assign picker reads the operator's fleet from GET /fleet/vehicles,
  // which is real and already deployed — so the minted-only rule is enforced
  // against real token ids rather than fixtures. These two exist only for when
  // that call can't be made (stub mode with no backend running), and go away
  // with the stub.

  public listOperatorFleetFallback(search: string) {
    return this.stub.listOperatorFleet(search);
  }

  // Token id -> name of the customer already holding it, so the picker can grey
  // those rows out instead of letting the operator select something the save
  // will reject on the exclusivity invariant.
  //
  // Live mode returns nothing: there is no cross-customer holder endpoint in
  // the spec, and inventing one here would hide the fact. Conflicts still
  // surface — assignVehicles reports them per vehicle in rejected[], which the
  // UI shows either way. The greying out is an affordance, not the enforcement.
  public async entitlementHolders(): Promise<Record<number, string>> {
    if (!this.isStubbed()) return {};
    return this.stub.entitlementHolders();
  }

  // OPERATOR

  // The operator's own record, for the fleet-lite visibility toggle.
  public getOperator(): Promise<ApiResponse<CustomerTenant>> {
    return this.call("GET", "/operator", null, () => this.stub.getOperator());
  }

  public updateOperator(input: UpdateCustomerInput): Promise<ApiResponse<CustomerTenant>> {
    return this.call("PATCH", "/operator", { ...input }, () => this.stub.updateOperator(input));
  }
}
