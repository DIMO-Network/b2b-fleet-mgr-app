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

  private currentOracle?: string;
  private tenants: Tenant[] = [];
  private selectedTenant?: Tenant;

  private constructor() {
    this.api = ApiService.getInstance();

    this.currentOracle = this.loadOracle() ?? undefined;
    if (this.currentOracle === undefined) {
      this.fetchOracles().then(oracles => {
        if (oracles != null && oracles.length > 0) {
          const defaultOracle = oracles[0]
          this.setOracle(defaultOracle.oracleId)
        }
      })
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
  getOracle(): string | undefined {
    return this.currentOracle;
  }

  setOracle(value: string): void {
    this.currentOracle = value;
    this.saveOracle(value);
  }

  private saveOracle(value: string) {
    localStorage.setItem(ORACLE_STORAGE_KEY, value);
  }

  private loadOracle(): string | null {
    return localStorage.getItem(ORACLE_STORAGE_KEY);
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
      return resp.data ?? [];
    }
    return null;
  }

}