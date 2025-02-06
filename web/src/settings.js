export class Settings {
    constructor() {
        if (this.isLocalhost()) {
            this.apiUrl = "http://localhost:3007";
        } else {
            this.apiUrl = "" // assumption is go app runs under in same place but could move to /api
        }

        this.settings = this.loadSettings(); // Load from localStorage initially

        this.token = localStorage.getItem("token");
    }

    isLocalhost() {
        return window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "";
    }

    // Fetch settings from API
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

    // Save settings to localStorage
    saveSettings() {
        localStorage.setItem("appSettings", JSON.stringify(this.settings));
    }

    // Load settings from localStorage
    loadSettings() {
        const storedSettings = localStorage.getItem("appSettings");
        return storedSettings ? JSON.parse(storedSettings) : {};
    }

    // Get a specific setting
    get(key) {
        return this.settings[key];
    }

    // getters for specific settings
    getBackendUrl() {
        return this.apiUrl;
    }

    getDevicesApiUrl() {
        return this.get("devicesApiUrl");
    }
    getRpcUrl() {
        return this.get("rpcUrl");
    }
    getPaymasterUrl() {
        return this.get("paymasterUrl");
    }
    getBundlerUrl() {
        return this.get("bundlerUrl");
    }
    getAppClientId() {
        return "0x51dacC165f1306Abfbf0a6312ec96E13AAA826DB"; // for now hard coded

        // todo implement prompt for clientId... what object do we store it for under?
        //return this.get("appClientId");
    }

    /**
     * Organization wallet address is what i'm assuming here, from DC, same as DC admin user wallet addr
     */
    getAppSubOrganizationId(){
        return localStorage.getItem("walletAddress");
    }

}