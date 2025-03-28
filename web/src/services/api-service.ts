import {isLocalhost} from "@utils/utils.ts";

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    status?: number;
}

export class ApiService {
    static _instance: ApiService;

    private apiBaseUrl;

    static getInstance() {
        if (!ApiService._instance) {
            ApiService._instance = new ApiService();
        }
        return ApiService._instance;
    }

    constructor() {
        if (isLocalhost()) {
            this.apiBaseUrl = "https://localdev.dimo.org:3007";
        } else {
            this.apiBaseUrl = "" // assumption is go app runs under in same place but could move to /api
        }
    }

    async callApi<T>(method: 'GET' | 'POST', url: string, requestBody: Record<string, any> | null, auth: boolean) : Promise<ApiResponse<T>> {
        const body = requestBody ? JSON.stringify(requestBody) : null

        const headers: Record<string, string> = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        if (auth) {
            const token = localStorage.getItem('token');
            headers["Authorization"] = `Bearer ${token}`;
        }

        let finalUrl = url.startsWith('/') ? this.apiBaseUrl + url : url;

        try {
            const response = await fetch(finalUrl, {
                method,
                headers,
                body
            });

            let result = null;
            try {
                result = await response.json();
            } catch (e: any) {
                //result = await response.text();
            }

            // Check for HTTP errors
            if (!response.ok) {
                return {
                    success: false,
                    error: result.message || result || "HTTP error",
                    status: response.status,
                };
            }

            console.debug(`HTTP Success [${method} ${url}]:`, result);
            return {
                success: true,
                data: result,
            };
        } catch (error: any) {
            console.error(`Error calling [${method}] ${url}:`, error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }
}
