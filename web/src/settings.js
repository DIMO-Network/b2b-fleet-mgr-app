export class Settings {
    constructor() {
        if (this.isLocalhost()) {
            this.apiUrl = "http://localhost:3007/v1/settings";
        } else {
            this.apiUrl = "/api/v1/settings" // assumption is go app runs under /api path
        }
        this.settings = this.loadSettings(); // Load from localStorage initially
    }

    isLocalhost() {
        return window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "";
    }

    // Fetch settings from API
    async fetchSettings() {
        try {
            const response = await fetch(this.apiUrl);
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
}