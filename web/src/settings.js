import {isLocalhost} from "./utils.js";

export class Settings {
    constructor() {
        if (isLocalhost()) {
            this.apiUrl = "https://localdev.dimo.org:3007";
        } else {
            this.apiUrl = "" // assumption is go app runs under in same place but could move to /api
        }
        // todo rethink settings loading pattern, this is messy
        // load config stuff from localstorage in case it exists already
        this.settings = this.loadSettings(); // Load from localStorage initially
        this.accountInfo = this.loadAccountInfo(); // load from localstorage

        this.token = localStorage.getItem("token");
    }

    /**
     * @typedef {Object} SettingsResponse
     * @property {string} devicesApiUrl - The URL of the devices API.
     * @property {string} paymasterUrl - The URL of the paymaster service.
     * @property {string} rpcUrl - The RPC URL.
     * @property {string} bundlerUrl - The URL of the bundler service.
     */
    /**
     * Grabs static app settings from backend
     * @returns {Promise<SettingsResponse|null>}
     */
    async fetchSettings() {
        try {
            const response = await fetch(this.apiUrl + "/v1/settings", {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
            });
            if (!response.ok) throw new Error("Failed to fetch settings");

            this.settings = await response.json();
            this.saveSettings(); // Persist to localStorage
            return this.settings;
        } catch (error) {
            console.error("Error fetching settings:", error);
            return null;
        }
    }

    /**
     * @typedef {Object} PublicSettingsResponse
     * @property {string} clientId - The client ID.
     * @property {string} loginUrl - Url for login.
     */
    /**
     * Gets the publicly accesible settings
     * @returns {Promise<PublicSettingsResponse|null>}
     */
    async fetchPublicSettings() {
        try {
            const response = await fetch(this.apiUrl + "/v1/public/settings", {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                },
            });
            if (!response.ok) throw new Error("Failed to fetch public settings");

            this.settings = await response.json();
            this.saveSettings(); // Persist to localStorage
            return this.settings;
        } catch (error) {
            console.error("Error fetching public settings:", error);
            return null;
        }
    }

    async fetchAccountInfo(email) {
        const apiUrl = this.getAccountsApiUrl()
        try {
            const response = await fetch(`${apiUrl}/api/account/${email}`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                }
            });
            if (!response.ok) {
                return {
                    success: false,
                    error: "Failed to fetch account info"
                }
            }

            const accountInfo = await response.json();
            this.saveAccountInfo(accountInfo);
            return accountInfo;
        } catch (error) {
            return {
                success: false,
                error: error
            }
        }
    }

    // Save settings to localStorage
    saveSettings() {
        localStorage.setItem("appSettings", JSON.stringify(this.settings));
    }

    saveAccountInfo(accountInfo) {
        localStorage.setItem("accountInfo", JSON.stringify(accountInfo));
        this.accountInfo = accountInfo;
    }

    // Load settings from localStorage
    loadSettings() {
        const storedSettings = localStorage.getItem("appSettings");
        return storedSettings ? JSON.parse(storedSettings) : {};
    }
    loadAccountInfo() {
        const ls = localStorage.getItem("accountInfo");
        return ls ? JSON.parse(ls) : {};
    }

    /*
    * {"devicesApiUrl":"https://devices-api.dimo.zone","paymasterUrl":"https://rpc.zerodev.app/api/v2/paymaster/c3526d90-4977-44e3-8584-8820693a7fd9","rpcUrl":"https://polygon.gateway.tenderly.co/2QTagH5V4szp7BLAgpZYIf","bundlerUrl":"https://rpc.zerodev.app/api/v2/bundler/c3526d90-4977-44e3-8584-8820693a7fd9"}

     */
    // Get a specific setting
    getSetting(key) {
        return this.settings[key];
    }

    getAccountInfo(key) {
        return this.accountInfo[key];
    }

    // getters for specific settings
    getBackendUrl() {
        return this.apiUrl;
    }

    getDevicesApiUrl() {
        return this.getSetting("devicesApiUrl");
    }

    getAccountsApiUrl() {
        return this.getSetting("accountsApiUrl");
    }
    getRpcUrl() {
        return this.getSetting("rpcUrl");
    }
    getPaymasterUrl() {
        return this.getSetting("paymasterUrl");
    }
    getBundlerUrl() {
        return this.getSetting("bundlerUrl");
    }
    getAppClientId() {
        return localStorage.getItem("clientId");
    }
    getEnvironment() {
        return this.getSetting("environment");
    }

    /**
     * gets the wallet address returned from LIWD, which happens to be the ZeroDev org smart contract address
     * @returns {string} 0x Organization smart contract address from ZeroDev/Turnkey. Not be confused with the user's wallet address
     */
    getOrgSmartContractAddress(){
        return localStorage.getItem("walletAddress");
    }

    getTurnkeySubOrgId() {
        return this.getAccountInfo("subOrganizationId");
    }

    /**
     * this does not change
     * @returns {string}
     */
    getCompassIntegrationId() {
        return "2szgr5WqMQtK2ZFM8F8qW8WUfJa";
    }
}