import {isLocalhost} from "@utils/utils.ts";
import { ApiResponse } from '@datatypes/api-response.ts';
import {OracleTenantService} from "@services/oracle-tenant-service.ts";


export class ApiService {
    private static instance: ApiService;
    private readonly baseUrl: string;
    private static readonly DEFAULT_LOCAL_DEV_URL = "https://localdev.dimo.org:3007";
    private oracleTenantService : OracleTenantService | undefined;

    private constructor() {
        this.baseUrl = this.getBaseUrl();
        // can't initialize oracleTenantService here, because it depends on ourselves and would cause a circular dependency
        // ideal solution is to refactor the code to avoid circular dependencies
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

    private constructUrl(endpoint: string, useOracle: boolean): string {
        let base = this.baseUrl;
        if (useOracle) {
            if (this.oracleTenantService === undefined) {
                this.oracleTenantService = OracleTenantService.getInstance();
            }
            const currentOracle = this.oracleTenantService.getOracle();
            const oracleId = currentOracle?.oracleId;
            if (oracleId) {
                base = `${base}/oracle/${oracleId}`;
            }
        }
        return endpoint.startsWith('/') ? `${base}${endpoint}` : endpoint;
    }

    private getAuthorizationHeader(auth: boolean): Record<string, string> {
        if (!auth) return {};
        const token = localStorage.getItem('token');
        return token ? {"Authorization": `Bearer ${token}`} : {};
    }

    private getTenantIdHeader(enable: boolean): Record<string, string> {
        if (!enable) return {};
        if (this.oracleTenantService === undefined) {
            this.oracleTenantService = OracleTenantService.getInstance();
        }
        const tenant = this.oracleTenantService.getSelectedTenant();
        return tenant?.id ? {"Tenant-Id": tenant.id} : {};
    }

    private async processResponse(response: Response): Promise<any> {
        const contentType = response.headers.get("Content-Type");

        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        } else {
            return await response.text();
        }
    }

    public async downloadFile(
        endpoint: string,
        auth: boolean = true,
        useOracle: boolean = true,
        includeTenantId: boolean = true
    ): Promise<void> {
        const headers: Record<string, string> = {
            ...this.getAuthorizationHeader(auth),
            ...this.getTenantIdHeader(includeTenantId),
        };

        const finalUrl = this.constructUrl(endpoint, useOracle);

        try {
            const response = await fetch(finalUrl, { method: 'GET', headers });

            if (!response.ok) {
                const result = await this.processResponse(response);
                throw new Error(result.message || result.error || result || "HTTP error");
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            // Try to get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let fileName = 'export.csv';
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (fileNameMatch && fileNameMatch[1]) {
                    fileName = fileNameMatch[1];
                }
            }

            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error: any) {
            console.error(`Error downloading file from ${endpoint}:`, error);
            throw error;
        }
    }

    public getWalletAddress(): string | null {
        const token = localStorage.getItem('token');
        if (!token) {
            return null;
        }

        try {
            // JWT format is: header.payload.signature
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.error('Invalid JWT token format');
                return null;
            }

            // Decode the payload (second part)
            const payload = parts[1];
            const decodedPayload = JSON.parse(atob(payload));

            // Extract ethereum_address claim
            const ethereumAddress = decodedPayload.ethereum_address;
            if (!ethereumAddress) {
                console.error('ethereum_address claim not found in JWT token');
                return null;
            }

            return ethereumAddress;
        } catch (error) {
            console.error('Error decoding JWT token:', error);
            return null;
        }
    }

    // makes a request to the backend proxy with the currently selected oracle route.
    public async callApi<T>(
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        endpoint: string,
        requestBody: Record<string, any> | string | null = null,
        auth: boolean = false,
        useOracle: boolean = true,
        includeTenantId: boolean = true
    ): Promise<ApiResponse<T>> {
        const body = requestBody
            ? (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody))
            : null;

        const headers: Record<string, string> = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...this.getAuthorizationHeader(auth),
            ...this.getTenantIdHeader(includeTenantId),
        };

        const finalUrl = this.constructUrl(endpoint, useOracle);

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
            // If response has a top-level 'data' field, unwrap it to avoid .data.data access pattern
            const unwrappedData = (result && typeof result === 'object' && 'data' in result)
                ? result.data
                : result;
            return {
                success: true,
                data: unwrappedData,
            };
        } catch (error: any) {
            console.error(`Error calling [${method}] ${endpoint}:`, error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }
}
