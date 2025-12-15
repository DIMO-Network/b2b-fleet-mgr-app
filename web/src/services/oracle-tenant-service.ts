import {ApiService} from "@services/api-service.ts";

// Moved here from settings-service.ts to make oracle/tenant domain self-contained
export interface Tenant {
  id: string,
  name: string,
}

export interface Oracle {
  oracleId: string,
  name: string,
  usePendingMode: boolean,
}

const ORACLE_STORAGE_KEY = "oracle";
const TENANTS_KEY = "tenants";
const SELECTED_TENANT_KEY = "selectedTenant";

export class OracleTenantService {
  private static instance: OracleTenantService;

  private api: ApiService;

  private currentOracle?: Oracle;
  private oracles: Oracle[] = [];
  private tenants: Tenant[] = [];
  private selectedTenant?: Tenant;

  private constructor() {
    this.api = ApiService.getInstance();
  // todo improve this.
    // Initialize current oracle to Kaufmann by default; override with persisted value if present
    this.currentOracle = { oracleId: 'kaufmann', name: 'kaufmann', usePendingMode: false };

    const storedOracle = this.loadOracle();
    if (storedOracle) {
      this.currentOracle = storedOracle;
    }
    this.tenants = this.loadTenants() ?? [];
    this.selectedTenant = this.loadSelectedTenant();
  }

  static getInstance(): OracleTenantService {
    if (!OracleTenantService.instance) {
      OracleTenantService.instance = new OracleTenantService();
    }
    return OracleTenantService.instance;
  }

  // ORACLE
  getOracle(): Oracle | undefined {
    return this.currentOracle;
  }

  // Set the current oracle by full object
  setOracle(value: Oracle): void {
    this.currentOracle = value;
    this.saveOracle(value);
  }

  // Convenience: set by id (commonly used by UI components)
  setOracleById(oracleId: string): void {
    if (!oracleId) return;
    const found = this.oracles.find(o => o.oracleId === oracleId);
    if (found) {
      this.setOracle(found);
    } else {
      // If not in memory, at least persist minimal object; name/usePendingMode unknown
      this.setOracle({ oracleId, name: oracleId, usePendingMode: false });
    }
  }

  private saveOracle(value: Oracle) {
    localStorage.setItem(ORACLE_STORAGE_KEY, JSON.stringify(value));
  }

  private loadOracle(): Oracle | undefined {
    const raw = localStorage.getItem(ORACLE_STORAGE_KEY);
    if (!raw) return undefined;
    try {
      // Handle legacy string storage (only oracleId)
      if (!raw.startsWith('{')) {
        const legacyId = raw;
        const migrated: Oracle = { oracleId: legacyId, name: legacyId, usePendingMode: false };
        // Persist migrated object
        this.saveOracle(migrated);
        return migrated;
      }
      const parsed = JSON.parse(raw);
      // Basic shape validation
      if (parsed && typeof parsed.oracleId === 'string') {
        return parsed as Oracle;
      }
    } catch {
      // ignore and fall through
    }
    return undefined;
  }

  // TENANTS LIST
  saveTenants(list?: Tenant[]) {
    if (list) this.tenants = list;
    localStorage.setItem(TENANTS_KEY, JSON.stringify(this.tenants));
  }

  loadTenants(): Tenant[] | undefined {
    const ls = localStorage.getItem(TENANTS_KEY);
    return ls ? JSON.parse(ls) : undefined;
  }

  // SELECTED TENANT
  setSelectedTenant(tenant: Tenant | null) {
    this.selectedTenant = tenant ?? undefined;
    localStorage.setItem(SELECTED_TENANT_KEY, JSON.stringify(this.selectedTenant ?? null));
  }

  getSelectedTenant(): Tenant | undefined {
    return this.selectedTenant;
  }

  private loadSelectedTenant(): Tenant | undefined {
    const ls = localStorage.getItem(SELECTED_TENANT_KEY);
    return ls ? JSON.parse(ls) : undefined;
  }

  // NETWORK HELPERS (no direct dependency to avoid cycles — accept ApiService as param)
  async verifyOracleAccess(): Promise<boolean> {
    const resp = await this.api.callApi("GET", "/permissions", null, true);
    return !!resp.success;
  }

  async fetchTenants(): Promise<Tenant[] | null> {
    const resp = await this.api.callApi<Tenant[]>("GET", "/tenants", null, true, true);
    if (resp.success) {
      const list = resp.data ?? [];
      this.saveTenants(list);
      return list;
    }
    return null;
  }

  // PUBLIC ORACLES
  // Fetch list of available oracles from public endpoint
  // Response objects have shape: { name, oracleId, usePendingMode }
  async fetchOracles(): Promise<Oracle[] | null> {
    const resp = await this.api.callApi<Array<{ name: string; oracleId: string; usePendingMode: boolean; }>>(
      "GET",
      "/public/oracles",
      null,
      false,
      false
    );
    if (resp.success) {
      const list = (resp.data ?? []) as Oracle[];
      this.oracles = list;
      return list;
    }
    return null;
  }

}