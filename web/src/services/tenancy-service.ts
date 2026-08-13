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
// THE BACKEND IS COMPLETE: every action the console offers is served for real
// — the provisioning slice was the last, and with it the member routes below
// went live. The stub remains only as a demo/development mode:
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
