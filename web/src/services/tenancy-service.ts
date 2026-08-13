import { ApiService } from "@services/api-service.ts";
import { ApiResponse } from "@datatypes/api-response.ts";
import { TenancyStub } from "@services/tenancy-stub.ts";

// The shape the assign picker works in, whether the rows came from the real
// GET /fleet/vehicles or from fixtures.
export type { OperatorFleetVehicle } from "@services/tenancy-stub.ts";

// Client for the operator console's tenancy surface.
//
// THE BACKEND DOES NOT EXIST YET. fleet-tenancy-api currently serves only
// GET /v1/authz and GET /v1/resolve/client-id/{clientId} — the authorization
// hot path. Everything this file calls (tenants, members, entitlements) is the
// /user/v1 management surface from 03-tenancy-api-spec.md, which is unbuilt.
//
// So this service has two backends behind one interface:
//
//   stub — in-memory fixtures (tenancy-stub.ts). The default, because the real
//          one would 404. isStubbed() is true and the UI says so on screen.
//   live — HTTP, via the b2b proxy to kaufmann-oracle to fleet-tenancy-api.
//
// Flip with localStorage.setItem('tenancyStub', 'false'). When the backend
// lands, change STUB_BY_DEFAULT to false; when the stub is no longer wanted,
// delete tenancy-stub.ts and the branch in call().
//
// ROUTING. Live mode calls /tenancy/* under the oracle prefix, so a request
// leaves the browser as
//
//   /oracle/{oracleId}/tenancy/customers
//        -> b2b proxy      -> kaufmann /v1/tenancy/customers
//        -> fleet-tenancy-api /user/v1/...
//
// b2b holds no DIMO developer license, so it cannot authenticate to
// fleet-tenancy-api directly; kaufmann can, and already does for /v1/authz.
// Going through it is deliberate rather than incidental.

const STUB_FLAG_KEY = "tenancyStub";
const STUB_BY_DEFAULT = true;

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

  public listEntitlements(tenantId: string): Promise<ApiResponse<EntitledVehicle[]>> {
    return this.call("GET", `/customers/${tenantId}/vehicles`, null, () =>
      this.stub.listEntitlements(tenantId),
    );
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

  public getDrift(tenantId: string): Promise<ApiResponse<GroupDrift[]>> {
    return this.call("GET", `/customers/${tenantId}/vehicles/drift`, null, () =>
      this.stub.getDrift(tenantId),
    );
  }

  public reapplyGroup(
    tenantId: string,
    groupId: string,
  ): Promise<ApiResponse<AssignVehiclesResult>> {
    return this.call("POST", `/customers/${tenantId}/vehicles/reapply-group`, { groupId }, () =>
      this.stub.reapplyGroup(tenantId, groupId),
    );
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
