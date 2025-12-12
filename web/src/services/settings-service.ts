import {ApiService} from "@services/api-service.ts";

export interface PublicSettings {
    "clientId": `0x${string}`,
    "loginUrl": string
    "oracles": Oracle[] // future: this should be moved to it's own thing and own backend endpoint
}


export interface Oracle {
    oracleId: string,
    name: string,
    usePendingMode: boolean,
}

export interface PrivateSettings {
    accountsApiUrl: string,
    paymasterUrl: string,
    rpcUrl: string,
    bundlerUrl: string,
    environment: "prod" | "dev",
    turnkeyOrgId: string,
    turnkeyApiUrl: string,
    turnkeyRpId: string,
}

export interface AccountInfo {
    subOrganizationId: string,
    isDeployed: boolean,
    hasPasskey: boolean,
    emailVerified: boolean,
    authenticators: any[] // do we need more details here?
}

export interface SharingInfo {
    enabled: boolean,
    grantee?: string,
    permissions?: Record<number, boolean>,
    ownerEnabled?: boolean,
    ownerAddress?: string,
    ownerEmailAddress?: string
}

const PRIVATE_SETTINGS_KEY = "appPrivateSettings";
const PUBLIC_SETTINGS_KEY = "appPublicSettings";
const ACCOUNT_INFO_KEY = "accountInfo";
const SHARING_INFO_KEY = "sharingInfo";

export class SettingsService {
    static instance = new SettingsService();

    // TODO: Make those private later
    publicSettings?: PublicSettings;
    privateSettings?: PrivateSettings;
    accountInfo?: AccountInfo;
    sharingInfo?: SharingInfo;
    // Tenant/oracle state is now managed by OracleTenantService

    private apiService = ApiService.getInstance();

    static getInstance() {
        return SettingsService.instance;
    }

    constructor() {
        this.publicSettings = this.loadPublicSettings();
        this.privateSettings = this.loadPrivateSettings();
        this.accountInfo = this.loadAccountInfo();
        this.sharingInfo = this.loadSharingInfo();
    }

    async fetchPrivateSettings() {
        const response = await this.apiService.callApi<PrivateSettings>("GET", "/settings", null, true);

        if (response.success) {
            this.privateSettings = response.data!;
            this.savePrivateSettings();
            return this.privateSettings;
        }

        return null;
    }

    async fetchPublicSettings() {
        const response = await this.apiService.callApi<PublicSettings>("GET", "/public/settings", null, true, false);

        if (response.success) {
            this.publicSettings = response.data!;
            this.savePublicSettings();
            return this.publicSettings;
        }

        return null;
    }

    async fetchAccountInfo(email: string) {
        const apiUrl = this.privateSettings?.accountsApiUrl;
        const url = `${apiUrl}/api/account/${email}`;
        const response = await this.apiService.callApi<AccountInfo>("GET", url, null, false, true, false);

        if (response.success) {
            this.accountInfo = response.data!;
            this.saveAccountInfo();
            return this.privateSettings;
        }

        return null;
    }

    savePublicSettings() {
        localStorage.setItem(PUBLIC_SETTINGS_KEY, JSON.stringify(this.publicSettings));
    }

    savePrivateSettings() {
        localStorage.setItem(PRIVATE_SETTINGS_KEY, JSON.stringify(this.privateSettings));
    }

    saveAccountInfo() {
        localStorage.setItem(ACCOUNT_INFO_KEY, JSON.stringify(this.accountInfo));
    }

    saveSharingInfo() {
        localStorage.setItem(SHARING_INFO_KEY, JSON.stringify(this.sharingInfo));
    }

    loadFromLocalStorage(key: string) {
        const ls = localStorage.getItem(key);
        return ls ? JSON.parse(ls) : undefined;
    }

    loadPublicSettings(): PublicSettings | undefined {
        return this.loadFromLocalStorage(PUBLIC_SETTINGS_KEY)
    }

    loadPrivateSettings(): PrivateSettings | undefined {
        return this.loadFromLocalStorage(PRIVATE_SETTINGS_KEY)
    }

    loadAccountInfo(): AccountInfo | undefined {
        return this.loadFromLocalStorage(ACCOUNT_INFO_KEY)
    }

    loadSharingInfo(): SharingInfo | undefined {
        return this.loadFromLocalStorage(SHARING_INFO_KEY)
    }
}