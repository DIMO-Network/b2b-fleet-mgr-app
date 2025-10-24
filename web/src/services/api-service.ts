import {isLocalhost} from "@utils/utils.ts";

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    status?: number;
}

export class ApiService {
    private static instance: ApiService;
    private readonly baseUrl: string;
    private static readonly DEFAULT_LOCAL_DEV_URL = "https://localdev.dimo.org:3007";
    public oracle: string = "motorq"; // default

    private constructor() {
        this.baseUrl = this.getBaseUrl();
    }

    public static getInstance(): ApiService {
        if (!ApiService.instance) {
            ApiService.instance = new ApiService();
        }
        return ApiService.instance;
    }

    private getBaseUrl(): string {
        return isLocalhost() ? ApiService.DEFAULT_LOCAL_DEV_URL : "";
    }

    private constructUrl(endpoint: string, oracle: boolean): string {
        let base = this.baseUrl;
        if (oracle) {
            base = `${base}/oracle/${this.oracle}`;
        }
        return endpoint.startsWith('/') ? `${base}${endpoint}` : endpoint;
    }

    private getAuthorizationHeader(auth: boolean): Record<string, string> {
        if (!auth) return {};
        const token = localStorage.getItem('token');
        return token ? {"Authorization": `Bearer ${token}`} : {};
    }

    private async processResponse(response: Response): Promise<any> {
        const contentType = response.headers.get("Content-Type");

        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        } else {
            return await response.text();
        }
    }

    // makes a request to the backend proxy with the currently selected oracle route.
    public async callApi<T>(
        method: 'GET' | 'POST' | 'DELETE',
        endpoint: string,
        requestBody: Record<string, any> | null = null,
        auth: boolean = false,
        oracle: boolean = true
    ): Promise<ApiResponse<T>> {
        const body = requestBody ? JSON.stringify(requestBody) : null;

        const headers: Record<string, string> = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...this.getAuthorizationHeader(auth),
        };

        const finalUrl = this.constructUrl(endpoint, oracle);

        try {
            const response = await fetch(finalUrl, {method, headers, body});

            const result = await this.processResponse(response);

            if (!response.ok) {
                return {
                    success: false,
                    error: result.message || result.error || result || "HTTP error",
                    status: response.status,
                };
            }

            console.debug(`HTTP Success [${method} ${endpoint}]:`, result);
            return {
                success: true,
                data: result,
            };
        } catch (error: any) {
            console.error(`Error calling [${method}] ${endpoint}:`, error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    // sets the oracle at the API service level for future calls and checks if we have access
    async setOracle(selectedValue: string): Promise<boolean> {
        this.oracle = selectedValue;
        const resp = await this.callApi("GET", "/permissions", null, true)
        return resp.success;
    }
}
