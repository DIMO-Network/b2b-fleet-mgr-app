import type { ApiResponse } from "@datatypes/api-response.ts";
import type {
  AssignVehiclesInput,
  AssignVehiclesResult,
  CreateCustomerInput,
  CreateMembershipInput,
  CustomerTenant,
  EntitledVehicle,
  GroupDrift,
  Member,
  MembershipList,
  MembershipStatus,
  MoveMembershipInput,
  ProvisionMemberInput,
  RenewMembershipInput,
  UpdateCustomerInput,
  UpdateMemberInput,
  VehicleMembership,
} from "@services/tenancy-service.ts";

// In-memory stand-in for the /user/v1 management surface, which is not built.
//
// This exists so the console can be designed, reviewed and clicked through
// before the backend lands, and so the shapes it assumes are written down
// somewhere executable rather than only in prose. Everything here is fixtures:
// no wallet, tenant id or client id below corresponds to anything real.
//
// It deliberately models three rules that the real service enforces, because a
// UI built against a stub that only ever succeeds grows no error paths:
//
//   1. EXCLUSIVITY — a vehicle may be entitled to at most one customer under a
//      given operator, so assigning one that another customer holds is a
//      partial success with a reason, not a failure.
//   2. MINTED ONLY — entitlement is keyed by vehicle token id, so an unminted
//      VIN cannot be assigned. The fixtures include unminted vehicles.
//   3. SNAPSHOT ASSIGNMENT — assigning a group expands to the vehicles in it at
//      that moment. Vehicles added later show up as drift, never automatically.
//
// State lives for the life of the page. A reload resets it, which is the right
// trade for fixtures — persisting them would eventually be mistaken for data.
//
// Import type-only from tenancy-service so this module and its importer don't
// form a runtime cycle.

// Types used only by the stub's fleet fallback, which stands in for the real
// (and already existing) GET /fleet/vehicles when no backend is reachable.
export interface OperatorFleetVehicle {
  // null means unminted: no token id, therefore not entitleable. The picker
  // must show these as unselectable rather than hide them, or an operator
  // wondering where a VIN went has no answer.
  vehicleTokenId: number | null;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number;
  groups: { id: string; name: string }[];
}

const OPERATOR_ID = "7be1ab9e-0000-4000-8000-0000000000ff";

// Mirrors EXPIRING_SOON_DAYS in tenancy-service. Duplicated rather than
// imported on purpose: the import at the top of this file is type-only so the
// two modules cannot form a runtime cycle, and a value import would.
const EXPIRING_SOON_DAYS = 30;

// Mirrors MEMBERSHIP_TERMS, duplicated for the same no-runtime-cycle reason.
const VALID_TERMS = [1, 12, 24, 36, 48];

// Month arithmetic for the fixtures. The real service does this in Postgres
// (starts_at + make_interval(months => n)), which clamps a 31st to the shorter
// month; Date.setMonth overflows it into the next one instead. Close enough for
// fixtures, and a reason not to port this helper anywhere real.
function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 180 + Math.random() * 220));
}

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function fail<T>(error: string, status = 400): ApiResponse<T> {
  return { success: false, error, status };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// Synthetic, deterministic, and obviously not a real wallet.
function fakeWallet(seed: number): string {
  const hex = seed.toString(16).padStart(6, "0").repeat(7).slice(0, 40);
  return `0x${hex}`;
}

interface StubEntitlement {
  tenantId: string;
  tokenId: number;
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  source: "operator" | "sacd" | "import";
  createdAt: string;
}

// Membership is per (tenant, wallet), so the fixture rows carry their tenant
// rather than being grouped by position in a list.
interface StubMember extends Member {
  tenantId: string;
}

// The commercial record, keyed by its own id rather than by vehicle — that is
// what lets it move between vehicles and keep its identity, term and history.
interface StubMembership {
  id: string;
  tenantId: string;
  tokenId: number;
  termMonths: number;
  startsAt: string;
  expiresAt: string;
  canceledAt: string | null;
}

interface StubGroupAssignment {
  tenantId: string;
  groupId: string;
  groupName: string;
  assignedAt: string;
  // The membership of the group at assign time. Anything in the group now that
  // isn't here is drift.
  snapshotTokenIds: number[];
}

export class TenancyStub {
  private operator: CustomerTenant = {
    id: OPERATOR_ID,
    name: "Kaufmann",
    kind: "operator",
    parentTenantId: null,
    status: "active",
    managed: false,
    entitlementMode: "implicit",
    fleetLiteEnabled: true,
    // An operator resolves its own fleet from its license and is never hidden
    // behind memberships — the flag only means anything for managed customers.
    membershipsEnforced: false,
    externalRef: null,
    createdAt: daysAgo(420),
    vehicleCount: 524,
    userCount: 149,
    lastActivityAt: daysAgo(0),
  };

  // Counts are derived by recount(), never set here: a literal would drift from
  // the entitlement and membership rows below and quietly become a lie.
  private customers: CustomerTenant[] = [
    // Northwind has enforcement ON, so the panel's "fleet-lite is hiding
    // unmembered vehicles" state is reachable without changing a setting first.
    this.customer("Northwind Logistics", 1, { lastActivity: 0, membershipsEnforced: true }),
    this.customer("Cedar Valley Rentals", 2, { lastActivity: 2 }),
    this.customer("Atlas Courier", 3, { lastActivity: 11 }),
    this.customer("Pine Ridge Transit", 4, { lastActivity: null, status: "suspended" }),
  ];

  private members: StubMember[] = [
    this.member(1, "ops@northwind.example", "owner", ["manage_members", "manage_settings"], null, 1),
    // Restricted to one group, and unrestricted, and restricted to nothing —
    // all three scope states, because the nil-vs-empty distinction is the one
    // this domain gets wrong.
    this.member(1, "dispatch@northwind.example", "member", [], ["grp-vans"], 3),
    this.member(1, "audit@northwind.example", "member", ["reports"], [], 14),
    this.member(2, "fleet@cedarvalley.example", "owner", ["manage_members", "manage_settings"], null, 2),
    this.member(3, "admin@atlascourier.example", "admin", ["manage_members"], null, 11),
    this.member(4, "hello@pineridge.example", "owner", ["manage_members", "manage_settings"], null, null),
  ];

  private fleet: OperatorFleetVehicle[] = this.buildFleet();

  private entitlements: StubEntitlement[] = [];

  private groupAssignments: StubGroupAssignment[] = [];

  private memberships: StubMembership[] = [];

  private membershipSeq = 0;

  constructor() {
    this.seedEntitlements();
    this.seedMemberships();
  }

  // FIXTURE CONSTRUCTION

  private customer(
    name: string,
    seed: number,
    opts: {
      lastActivity: number | null;
      status?: "active" | "suspended";
      membershipsEnforced?: boolean;
    },
  ): CustomerTenant {
    return {
      id: `c0000000-0000-4000-8000-${seed.toString().padStart(12, "0")}`,
      name,
      kind: "customer",
      parentTenantId: OPERATOR_ID,
      status: opts.status ?? "active",
      managed: true,
      entitlementMode: "explicit",
      fleetLiteEnabled: true,
      membershipsEnforced: opts.membershipsEnforced ?? false,
      externalRef: null,
      createdAt: daysAgo(120 - seed * 20),
      vehicleCount: 0,
      userCount: 0,
      lastActivityAt: opts.lastActivity === null ? null : daysAgo(opts.lastActivity),
    };
  }

  private member(
    customerSeed: number,
    email: string,
    role: Member["role"],
    permissions: string[],
    scopeGroupIds: string[] | null,
    lastLoginDaysAgo: number | null,
  ): StubMember {
    return {
      tenantId: `c0000000-0000-4000-8000-${customerSeed.toString().padStart(12, "0")}`,
      wallet: fakeWallet(customerSeed * 1000 + email.length),
      email,
      role,
      permissions,
      scopeGroupIds,
      grantedByTenantId: OPERATOR_ID,
      lastLoginAt: lastLoginDaysAgo === null ? null : daysAgo(lastLoginDaysAgo),
      createdAt: daysAgo(90),
    };
  }

  private buildFleet(): OperatorFleetVehicle[] {
    const makes: [string, string, number][] = [
      ["Ford", "Transit", 2022],
      ["Mercedes-Benz", "Sprinter", 2021],
      ["Ram", "ProMaster", 2023],
      ["Chevrolet", "Express", 2020],
      ["Ford", "F-150", 2024],
      ["Toyota", "Hilux", 2022],
    ];
    const groups = [
      { id: "grp-vans", name: "Vans" },
      { id: "grp-north", name: "North Region" },
      { id: "grp-service", name: "Service Fleet" },
    ];

    const out: OperatorFleetVehicle[] = [];
    for (let i = 0; i < 40; i++) {
      const [make, model, year] = makes[i % makes.length];
      // Every seventh vehicle is unminted, so the picker's minted-only rule is
      // visible in the fixtures rather than theoretical.
      const minted = i % 7 !== 6;
      const vehicleGroups = i % 3 === 0 ? [groups[0]] : i % 5 === 0 ? [groups[1]] : i % 4 === 0 ? [groups[2]] : [];
      out.push({
        vehicleTokenId: minted ? 100000 + i : null,
        vin: `STUBVIN${(i + 1).toString().padStart(9, "0")}`,
        licensePlate: i % 3 === 0 ? null : `STB-${(1000 + i).toString()}`,
        make,
        model,
        year,
        groups: vehicleGroups,
      });
    }
    return out;
  }

  private seedEntitlements() {
    const minted = this.fleet.filter((v) => v.vehicleTokenId !== null);

    // Northwind holds a group-assigned slice, so drift has something to work on.
    const vans = minted.filter((v) => v.groups.some((g) => g.id === "grp-vans"));
    const northwind = this.customers[0];
    // Snapshot deliberately excludes the last two vans: they are the vehicles
    // "added to the group since assignment" that the drift banner reports.
    const snapshot = vans.slice(0, Math.max(0, vans.length - 2));
    snapshot.forEach((v) => {
      this.entitlements.push({
        tenantId: northwind.id,
        tokenId: v.vehicleTokenId as number,
        sourceGroupId: "grp-vans",
        sourceGroupName: "Vans",
        source: "operator",
        createdAt: daysAgo(30),
      });
    });
    this.groupAssignments.push({
      tenantId: northwind.id,
      groupId: "grp-vans",
      groupName: "Vans",
      assignedAt: daysAgo(30),
      snapshotTokenIds: snapshot.map((v) => v.vehicleTokenId as number),
    });

    // Cedar Valley and Atlas hold vehicles assigned individually, so the list
    // shows both provenances and the picker has cross-customer conflicts to
    // grey out. Pine Ridge holds none — a suspended customer with no fleet.
    const unheld = () =>
      minted.filter((v) => !this.entitlements.some((e) => e.tokenId === v.vehicleTokenId));

    const assignIndividually = (tenantId: string, count: number, ago: number) => {
      unheld()
        .slice(0, count)
        .forEach((v) => {
          this.entitlements.push({
            tenantId,
            tokenId: v.vehicleTokenId as number,
            sourceGroupId: null,
            sourceGroupName: null,
            source: "operator",
            createdAt: daysAgo(ago),
          });
        });
    };

    assignIndividually(this.customers[1].id, 4, 12);
    assignIndividually(this.customers[2].id, 6, 40);
  }

  private nextMembershipId(): string {
    this.membershipSeq += 1;
    return `m0000000-0000-4000-8000-${this.membershipSeq.toString().padStart(12, "0")}`;
  }

  private seedMemberships() {
    const northwind = this.customers[0];
    const held = this.entitlements
      .filter((e) => e.tenantId === northwind.id)
      .map((e) => e.tokenId);

    // A spread of statuses, so every badge and every action is reachable in the
    // demo without having to set something up first.
    const spread = [
      { term: 12, expiresInDays: 210 }, // active
      { term: 12, expiresInDays: 18 }, // inside EXPIRING_SOON_DAYS
      { term: 1, expiresInDays: -5 }, // lapsed: fleet-lite is hiding this one
      { term: 24, expiresInDays: 600 }, // active
    ];

    spread.forEach((s, i) => {
      const tokenId = held[i];
      if (tokenId === undefined) return;
      const expiresAt = new Date(Date.now() + s.expiresInDays * 86400000).toISOString();
      this.memberships.push({
        id: this.nextMembershipId(),
        tenantId: northwind.id,
        tokenId,
        termMonths: s.term,
        startsAt: addMonths(expiresAt, -s.term),
        expiresAt,
        canceledAt: null,
      });
    });

    // One membership on a vehicle this customer is NOT entitled to — the
    // discontinued-vehicle case that move exists for. Revoking a vehicle
    // deliberately leaves its paid time alone rather than destroying a
    // commercial record as a side effect, so the console has to surface it.
    const orphan = this.fleet.find(
      (v) =>
        v.vehicleTokenId !== null &&
        !this.entitlements.some((e) => e.tokenId === v.vehicleTokenId),
    );
    if (orphan) {
      const startsAt = daysAgo(60);
      this.memberships.push({
        id: this.nextMembershipId(),
        tenantId: northwind.id,
        tokenId: orphan.vehicleTokenId as number,
        termMonths: 12,
        startsAt,
        expiresAt: addMonths(startsAt, 12),
        canceledAt: null,
      });
    }

    // Cedar Valley gets one so a second customer's tab is not empty.
    const cedar = this.customers[1];
    const cedarHeld = this.entitlements.find((e) => e.tenantId === cedar.id);
    if (cedarHeld) {
      const startsAt = daysAgo(10);
      this.memberships.push({
        id: this.nextMembershipId(),
        tenantId: cedar.id,
        tokenId: cedarHeld.tokenId,
        termMonths: 36,
        startsAt,
        expiresAt: addMonths(startsAt, 36),
        canceledAt: null,
      });
    }
  }

  private membersFor(tenantId: string): StubMember[] {
    return this.members.filter((m) => m.tenantId === tenantId);
  }

  private findCustomer(id: string): CustomerTenant | undefined {
    return this.customers.find((c) => c.id === id);
  }

  private recount(tenantId: string) {
    const c = this.findCustomer(tenantId);
    if (!c) return;
    c.vehicleCount = this.entitlements.filter((e) => e.tenantId === tenantId).length;
    c.userCount = this.membersFor(tenantId).length;
  }

  // CUSTOMERS

  async listCustomers(): Promise<ApiResponse<CustomerTenant[]>> {
    await delay();
    this.customers.forEach((c) => this.recount(c.id));
    return ok(this.customers.map((c) => ({ ...c })));
  }

  async getCustomer(id: string): Promise<ApiResponse<CustomerTenant>> {
    await delay();
    const c = this.findCustomer(id);
    if (!c) return fail("customer not found", 404);
    this.recount(id);
    return ok({ ...c });
  }

  async createCustomer(input: CreateCustomerInput): Promise<ApiResponse<CustomerTenant>> {
    await delay();
    const name = input.name.trim();
    if (!name) return fail("name is required");
    // Names are unique per operator, not globally.
    if (this.customers.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return fail(`a customer named "${name}" already exists`, 409);
    }
    const created: CustomerTenant = {
      id: `c0000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
      name,
      kind: "customer",
      parentTenantId: OPERATOR_ID,
      status: "active",
      managed: true,
      entitlementMode: "explicit",
      fleetLiteEnabled: true,
      // Off for a new customer: they have no memberships yet, so enforcing
      // would show them an empty fleet the moment they signed in.
      membershipsEnforced: false,
      externalRef: input.externalRef?.trim() || null,
      createdAt: new Date().toISOString(),
      vehicleCount: 0,
      userCount: 0,
      lastActivityAt: null,
    };
    this.customers = [...this.customers, created];
    return ok({ ...created });
  }

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<ApiResponse<CustomerTenant>> {
    await delay();
    const c = this.findCustomer(id);
    if (!c) return fail("customer not found", 404);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) return fail("name cannot be empty");
      if (
        this.customers.some((o) => o.id !== id && o.name.toLowerCase() === name.toLowerCase())
      ) {
        return fail(`a customer named "${name}" already exists`, 409);
      }
      c.name = name;
    }
    if (input.status !== undefined) c.status = input.status;
    if (input.fleetLiteEnabled !== undefined) c.fleetLiteEnabled = input.fleetLiteEnabled;
    if (input.membershipsEnforced !== undefined) c.membershipsEnforced = input.membershipsEnforced;
    if (input.externalRef !== undefined) c.externalRef = input.externalRef;
    return ok({ ...c });
  }

  // MEMBERS

  // tenantId is an implementation detail of the fixtures — it is in the path on
  // the wire, not the body — so it is stripped rather than handed to the UI,
  // which must not grow a dependency on a field the real API won't send.
  private toWire(m: StubMember): Member {
    const { tenantId, ...wire } = m;
    void tenantId;
    return wire;
  }

  async listMembers(tenantId: string): Promise<ApiResponse<Member[]>> {
    await delay();
    if (!this.findCustomer(tenantId)) return fail("customer not found", 404);
    return ok(this.membersFor(tenantId).map((m) => this.toWire(m)));
  }

  async provisionMember(
    tenantId: string,
    input: ProvisionMemberInput,
  ): Promise<ApiResponse<Member>> {
    await delay();
    if (!this.findCustomer(tenantId)) return fail("customer not found", 404);
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes("@")) return fail("a valid email is required");
    if (this.membersFor(tenantId).some((m) => m.email?.toLowerCase() === email)) {
      return fail(`${email} is already a member`, 409);
    }
    const created: StubMember = {
      tenantId,
      wallet: fakeWallet(Math.floor(Math.random() * 0xffffff)),
      email,
      role: input.role,
      permissions: [...input.permissions],
      scopeGroupIds: input.scopeGroupIds,
      grantedByTenantId: OPERATOR_ID,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
    };
    this.members = [...this.members, created];
    this.recount(tenantId);
    return ok(this.toWire(created));
  }

  async updateMember(
    tenantId: string,
    wallet: string,
    input: UpdateMemberInput,
  ): Promise<ApiResponse<Member>> {
    await delay();
    const m = this.membersFor(tenantId).find((x) => x.wallet === wallet);
    if (!m) return fail("member not found", 404);
    if (input.role !== undefined) m.role = input.role;
    if (input.permissions !== undefined) m.permissions = [...input.permissions];
    if (input.scopeGroupIds !== undefined) m.scopeGroupIds = input.scopeGroupIds;
    return ok(this.toWire(m));
  }

  async removeMember(tenantId: string, wallet: string): Promise<ApiResponse<void>> {
    await delay();
    const m = this.membersFor(tenantId).find((x) => x.wallet === wallet);
    if (!m) return fail("member not found", 404);
    this.members = this.members.filter((x) => x !== m);
    this.recount(tenantId);
    return ok(undefined as unknown as void);
  }

  // VEHICLES

  async listEntitlements(tenantId: string): Promise<ApiResponse<EntitledVehicle[]>> {
    await delay();
    if (!this.findCustomer(tenantId)) return fail("customer not found", 404);
    const rows = this.entitlements
      .filter((e) => e.tenantId === tenantId)
      .map((e) => {
        const v = this.fleet.find((f) => f.vehicleTokenId === e.tokenId);
        return {
          vehicleTokenId: e.tokenId,
          vin: v?.vin ?? null,
          licensePlate: v?.licensePlate ?? null,
          make: v?.make ?? null,
          model: v?.model ?? null,
          year: v?.year ?? null,
          source: e.source,
          sourceGroupId: e.sourceGroupId,
          sourceGroupName: e.sourceGroupName,
          createdAt: e.createdAt,
        } as EntitledVehicle;
      });
    return ok(rows);
  }

  async assignVehicles(
    tenantId: string,
    input: AssignVehiclesInput,
  ): Promise<ApiResponse<AssignVehiclesResult>> {
    await delay();
    if (!this.findCustomer(tenantId)) return fail("customer not found", 404);

    const assigned: number[] = [];
    const rejected: AssignVehiclesResult["rejected"] = [];

    for (const tokenId of input.tokenIds) {
      const held = this.entitlements.find((e) => e.tokenId === tokenId);
      if (held && held.tenantId !== tenantId) {
        const holder = this.findCustomer(held.tenantId);
        rejected.push({
          tokenId,
          reason: "already entitled to another customer",
          heldBy: holder?.name ?? held.tenantId,
        });
        continue;
      }
      if (held) continue; // already ours, idempotent
      this.entitlements.push({
        tenantId,
        tokenId,
        sourceGroupId: input.fromGroupId ?? null,
        sourceGroupName: input.fromGroupName ?? null,
        source: "operator",
        createdAt: new Date().toISOString(),
      });
      assigned.push(tokenId);
    }

    if (input.fromGroupId) {
      const existing = this.groupAssignments.find(
        (g) => g.tenantId === tenantId && g.groupId === input.fromGroupId,
      );
      const snapshot = input.tokenIds;
      if (existing) {
        existing.snapshotTokenIds = snapshot;
        existing.assignedAt = new Date().toISOString();
      } else {
        this.groupAssignments.push({
          tenantId,
          groupId: input.fromGroupId,
          groupName: input.fromGroupName ?? input.fromGroupId,
          assignedAt: new Date().toISOString(),
          snapshotTokenIds: snapshot,
        });
      }
    }

    this.recount(tenantId);
    return ok({ assigned, rejected });
  }

  async revokeVehicle(tenantId: string, tokenId: number): Promise<ApiResponse<void>> {
    await delay();
    const before = this.entitlements.length;
    this.entitlements = this.entitlements.filter(
      (e) => !(e.tenantId === tenantId && e.tokenId === tokenId),
    );
    if (this.entitlements.length === before) return fail("entitlement not found", 404);
    this.recount(tenantId);
    return ok(undefined as unknown as void);
  }

  async getDrift(tenantId: string): Promise<ApiResponse<GroupDrift[]>> {
    await delay();
    const out: GroupDrift[] = [];
    for (const ga of this.groupAssignments.filter((g) => g.tenantId === tenantId)) {
      const currentMembers = this.fleet
        .filter((v) => v.vehicleTokenId !== null && v.groups.some((g) => g.id === ga.groupId))
        .map((v) => v.vehicleTokenId as number);
      const added = currentMembers.filter((t) => !ga.snapshotTokenIds.includes(t));
      if (added.length > 0) {
        out.push({
          groupId: ga.groupId,
          groupName: ga.groupName,
          addedTokenIds: added,
          assignedAt: ga.assignedAt,
        });
      }
    }
    return ok(out);
  }

  async reapplyGroup(
    tenantId: string,
    groupId: string,
  ): Promise<ApiResponse<AssignVehiclesResult>> {
    const ga = this.groupAssignments.find(
      (g) => g.tenantId === tenantId && g.groupId === groupId,
    );
    if (!ga) return fail("group was not assigned to this customer", 404);
    const currentMembers = this.fleet
      .filter((v) => v.vehicleTokenId !== null && v.groups.some((g) => g.id === groupId))
      .map((v) => v.vehicleTokenId as number);
    return this.assignVehicles(tenantId, {
      tokenIds: currentMembers,
      fromGroupId: groupId,
      fromGroupName: ga.groupName,
    });
  }

  // MEMBERSHIPS
  //
  // Four rules modelled here because the real service enforces them, and a UI
  // built against a stub that only ever succeeds grows no error paths:
  //
  //   1. ENTITLED ONLY — a membership may only sit on a vehicle the customer is
  //      currently assigned. 422.
  //   2. ONE LIVE PER VEHICLE — creating or moving onto a vehicle that already
  //      has an unexpired membership is a 409, not a silent replacement.
  //      Replacing paid time quietly is the bug nobody reports until an invoice
  //      is wrong.
  //   3. SUPERSEDE ON LAPSE — the same action over an EXPIRED membership is
  //      allowed and cancels the old row, so a lapsed vehicle can start fresh.
  //   4. RENEWAL NEVER BACKDATES — early renewal extends from the existing
  //      expiry, late renewal starts from now.

  private membershipStatus(m: StubMembership): MembershipStatus {
    if (m.canceledAt) return "canceled";
    const remaining = new Date(m.expiresAt).getTime() - Date.now();
    if (remaining <= 0) return "expired";
    if (remaining <= EXPIRING_SOON_DAYS * 86400000) return "expiring_soon";
    return "active";
  }

  // Live means "not canceled". An EXPIRED membership is still live: it is shown,
  // it can be renewed, and it still blocks nothing — only cancelling or being
  // superseded ends one.
  private liveMembership(tenantId: string, tokenId: number): StubMembership | undefined {
    return this.memberships.find(
      (m) => m.tenantId === tenantId && m.tokenId === tokenId && !m.canceledAt,
    );
  }

  private findMembership(tenantId: string, id: string): StubMembership | undefined {
    return this.memberships.find(
      (m) => m.id === id && m.tenantId === tenantId && !m.canceledAt,
    );
  }

  private toMembershipWire(m: StubMembership): VehicleMembership {
    const v = this.fleet.find((f) => f.vehicleTokenId === m.tokenId);
    return {
      id: m.id,
      vehicleTokenId: m.tokenId,
      termMonths: m.termMonths,
      startsAt: m.startsAt,
      expiresAt: m.expiresAt,
      canceledAt: m.canceledAt,
      status: this.membershipStatus(m),
      vin: v?.vin ?? null,
      licensePlate: v?.licensePlate ?? null,
      make: v?.make ?? null,
      model: v?.model ?? null,
      year: v?.year ?? null,
      entitled: this.entitlements.some(
        (e) => e.tenantId === m.tenantId && e.tokenId === m.tokenId,
      ),
    };
  }

  private isEntitled(tenantId: string, tokenId: number): boolean {
    return this.entitlements.some((e) => e.tenantId === tenantId && e.tokenId === tokenId);
  }

  // Canceled rows are omitted: cancelling is how a membership ends, and a list
  // that accumulated them would grow without bound. The status union keeps
  // "canceled" for the record itself, which a history view would read.
  async listMemberships(tenantId: string): Promise<ApiResponse<MembershipList>> {
    await delay();
    const c = this.findCustomer(tenantId);
    if (!c) return fail("customer not found", 404);
    return ok({
      enforced: c.membershipsEnforced,
      memberships: this.memberships
        .filter((m) => m.tenantId === tenantId && !m.canceledAt)
        .map((m) => this.toMembershipWire(m)),
    });
  }

  async createMembership(
    tenantId: string,
    input: CreateMembershipInput,
  ): Promise<ApiResponse<VehicleMembership>> {
    await delay();
    if (!this.findCustomer(tenantId)) return fail("customer not found", 404);
    if (!VALID_TERMS.includes(input.termMonths)) return fail("unsupported term");
    if (!this.isEntitled(tenantId, input.vehicleTokenId)) {
      return fail("that vehicle is not assigned to this customer", 422);
    }

    const live = this.liveMembership(tenantId, input.vehicleTokenId);
    if (live) {
      if (this.membershipStatus(live) !== "expired") {
        return fail("that vehicle already has a membership — renew or move it instead", 409);
      }
      live.canceledAt = new Date().toISOString();
    }

    const startsAt = new Date().toISOString();
    const created: StubMembership = {
      id: this.nextMembershipId(),
      tenantId,
      tokenId: input.vehicleTokenId,
      termMonths: input.termMonths,
      startsAt,
      expiresAt: addMonths(startsAt, input.termMonths),
      canceledAt: null,
    };
    this.memberships = [...this.memberships, created];
    return ok(this.toMembershipWire(created));
  }

  async moveMembership(
    tenantId: string,
    membershipId: string,
    input: MoveMembershipInput,
  ): Promise<ApiResponse<VehicleMembership>> {
    await delay();
    const m = this.findMembership(tenantId, membershipId);
    if (!m) return fail("membership not found", 404);
    if (input.vehicleTokenId === m.tokenId) {
      return fail("that membership is already on this vehicle");
    }
    if (!this.isEntitled(tenantId, input.vehicleTokenId)) {
      return fail("that vehicle is not assigned to this customer", 422);
    }

    const live = this.liveMembership(tenantId, input.vehicleTokenId);
    if (live) {
      if (this.membershipStatus(live) !== "expired") {
        return fail("that vehicle already has a membership", 409);
      }
      live.canceledAt = new Date().toISOString();
    }

    // The term and the remaining time move with it — the customer paid for a
    // period, not for a particular vehicle.
    m.tokenId = input.vehicleTokenId;
    return ok(this.toMembershipWire(m));
  }

  async renewMembership(
    tenantId: string,
    membershipId: string,
    input: RenewMembershipInput,
  ): Promise<ApiResponse<VehicleMembership>> {
    await delay();
    const m = this.findMembership(tenantId, membershipId);
    if (!m) return fail("membership not found", 404);
    if (!VALID_TERMS.includes(input.termMonths)) return fail("unsupported term");

    // Renewing early adds to the end of the existing term; renewing after a
    // lapse starts now. Never backdated into a period the customer could not use.
    const from = Math.max(new Date(m.expiresAt).getTime(), Date.now());
    m.expiresAt = addMonths(new Date(from).toISOString(), input.termMonths);
    m.termMonths = input.termMonths;
    return ok(this.toMembershipWire(m));
  }

  // Soft, mirroring entitlement revocation: knowing a vehicle used to carry a
  // membership matters for support, and the row is what a refund would refer to.
  async cancelMembership(tenantId: string, membershipId: string): Promise<ApiResponse<void>> {
    await delay();
    const m = this.findMembership(tenantId, membershipId);
    if (!m) return fail("membership not found", 404);
    m.canceledAt = new Date().toISOString();
    return ok(undefined as unknown as void);
  }

  // OPERATOR

  async getOperator(): Promise<ApiResponse<CustomerTenant>> {
    await delay();
    return ok({ ...this.operator });
  }

  async updateOperator(input: UpdateCustomerInput): Promise<ApiResponse<CustomerTenant>> {
    await delay();
    if (input.fleetLiteEnabled !== undefined) this.operator.fleetLiteEnabled = input.fleetLiteEnabled;
    if (input.name !== undefined && input.name.trim()) this.operator.name = input.name.trim();
    return ok({ ...this.operator });
  }

  // FLEET FALLBACK
  //
  // Stands in for GET /fleet/vehicles, which is real and already exists — the
  // picker prefers it and falls back here only when no backend is reachable, so
  // the console can be worked on offline.
  async listOperatorFleet(search: string): Promise<ApiResponse<OperatorFleetVehicle[]>> {
    await delay();
    const q = search.trim().toLowerCase();
    const rows = q
      ? this.fleet.filter(
          (v) =>
            v.vin.toLowerCase().includes(q) ||
            (v.licensePlate ?? "").toLowerCase().includes(q) ||
            `${v.make} ${v.model}`.toLowerCase().includes(q),
        )
      : this.fleet;
    return ok(rows.map((v) => ({ ...v })));
  }

  // Which customer, if any, already holds each token — the picker greys these
  // out rather than letting an operator select something the save will reject.
  async entitlementHolders(): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    for (const e of this.entitlements) {
      out[e.tokenId] = this.findCustomer(e.tenantId)?.name ?? e.tenantId;
    }
    return out;
  }
}
