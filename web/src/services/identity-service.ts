import { ApiService } from './api-service';
import { SettingsService } from './settings-service';

export interface AccountInfo {
  subOrganizationId?: string;
  isDeployed?: boolean;
  hasPasskey?: boolean;
  hasPhone?: boolean;
  emailVerified?: boolean;
  authenticators?: Array<{
    credentialId?: string;
    transports?: string[];
    creationDate?: string;
  }>;
  // Keep these for backward compatibility if they are still needed or might be returned by different endpoints
  email?: string;
  walletAddress?: string;
  [key: string]: any;
}

export interface VehicleIdentityData {
  vehicle?: {
    id?: string;
    owner?: string;
    sacds?: {
      nodes?: Array<{
        grantee?: string;
        permissions?: string;
      }>;
    };
    earnings?: {
      totalTokens?: string;
    };
    mintedAt?: string;
    syntheticDevice?: {
      connection?: {
        name?: string;
        address?: string;
      };
    };
    definition?: {
      id?: string;
      make?: string;
      model?: string;
      year?: number;
    };
    [key: string]: any;
  };
  errors?: any[];
}

/**
 * Service for handling identity and account-related operations
 */
export class IdentityService {
  private static instance: IdentityService;
  private apiService: ApiService;
  private settingsService: SettingsService;

  private constructor() {
    this.apiService = ApiService.getInstance();
    this.settingsService = SettingsService.getInstance();
  }

  public static getInstance(): IdentityService {
    if (!IdentityService.instance) {
      IdentityService.instance = new IdentityService();
    }
    return IdentityService.instance;
  }

  /**
   * Get vehicle identity data including owner information
   * @param tokenId Vehicle token ID
   * @returns Vehicle identity data
   */
  async getVehicleIdentity(tokenId: number | string): Promise<VehicleIdentityData | null> {
    try {
      const response = await this.apiService.callApi<VehicleIdentityData>(
        'GET',
        `/identity/vehicle/${tokenId}`,
        null,
        false, // no auth
        false  // not oracle endpoint
      );

      if (response.success && response.data) {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error('Error fetching vehicle identity:', error);
      return null;
    }
  }

  /**
   * Get the owner's wallet address for a vehicle
   * @param tokenId Vehicle token ID
   * @returns Owner wallet address or null
   */
  async getVehicleOwnerAddress(tokenId: number | string): Promise<string | null> {
    const identityData = await this.getVehicleIdentity(tokenId);
    return identityData?.vehicle?.owner || null;
  }

  /**
   * Get account information by wallet address or email
   * @param identifier Wallet address or email
   * @returns Account information or null
   */
  async getAccountInfo(identifier: string): Promise<AccountInfo | null> {
    try {
      console.log('[IdentityService] Getting account info for:', identifier);

      // Ensure we have the accounts API URL
      if (!this.settingsService.privateSettings) {
        await this.settingsService.fetchPrivateSettings();
      }

      const accountsApiUrl = this.settingsService.privateSettings?.accountsApiUrl;

      if (!accountsApiUrl) {
        return null;
      }

      // Determine if identifier is a wallet address or email
      const isWallet = this.isWalletAddress(identifier);
      const query = isWallet
        ? `walletAddress=${encodeURIComponent(identifier)}`
        : `email=${encodeURIComponent(identifier)}`;

      const endpoint = `${accountsApiUrl}/api/account?${query}`;
      console.log('[IdentityService] Calling accounts API:', endpoint);

      const response = await this.apiService.callApi<AccountInfo>(
        'GET',
        endpoint,
        null,
        false, // no auth
        false, // not oracle endpoint
        false  // no tenant ID
      );

      console.log('[IdentityService] Account API response:', response);

      if (response.success && response.data && (response.data as any)?.error !== 'User not found') {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error('[IdentityService] Error fetching account info:', error);
      return null;
    }
  }

  /**
   * Get account information for a vehicle owner by token ID
   * Combines getVehicleOwnerAddress and getAccountInfo
   * @param tokenId Vehicle token ID
   * @returns Account information with wallet address, or null if no owner
   */
  async getVehicleOwnerInfo(tokenId: number | string): Promise<AccountInfo | null> {
    const ownerAddress = await this.getVehicleOwnerAddress(tokenId);

    if (!ownerAddress) {
      return null;
    }

    // Return wallet address immediately, even if account lookup fails
    const accountInfo = await this.getAccountInfo(ownerAddress);

    // If account info exists, return it; otherwise return just the wallet address
    if (accountInfo) {
      return accountInfo;
    }

    // Return minimal info with just the wallet address
    return {
      walletAddress: ownerAddress
    };
  }

  /**
   * Get owned vehicles for a wallet address with pagination
   * @param walletAddress Owner wallet address
   * @param first Number of vehicles to fetch
   * @param after Cursor for pagination
   * @returns Vehicles data with pagination info
   */
  async getOwnedVehicles(
    walletAddress: string,
    first: number = 25,
    after?: string
  ): Promise<{ nodes: any[]; pageInfo?: any } | null> {
    try {
      const base = `/identity/owner/${walletAddress}?first=${first}`;
      const url = after ? `${base}&after=${encodeURIComponent(after)}` : base;

      const response = await this.apiService.callApi(
        'GET',
        url,
        null,
        true,  // auth required
        false, // not oracle endpoint
        false  // no tenant ID
      );

      if (response.success && response.data) {
        const vehicles = (response.data as any)?.data?.vehicles;
        return {
          nodes: vehicles?.nodes ?? [],
          pageInfo: vehicles?.pageInfo
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching owned vehicles:', error);
      return null;
    }
  }

  /**
   * Get available permissions for admin users
   * @returns List of permissions
   */
  async getAvailablePermissions(): Promise<string[]> {
    try {
      const response = await this.apiService.callApi<string[]>(
        'GET',
        '/account/permissions-available',
        null,
        true,  // auth required
        true,  // oracle endpoint
        false  // no tenant ID (based on CreateUserView implementation)
      );

      if (response.success && Array.isArray(response.data)) {
        return response.data;
      }

      return [];
    } catch (error) {
      console.error('Error fetching available permissions:', error);
      return [];
    }
  }

  /**
   * Get permissions for the current user
   * @returns List of permissions
   */
  async getUserPermissions(): Promise<string[]> {
    try {
      const response = await this.apiService.callApi<string[]>(
        'GET',
        '/permissions',
        null,
        true, // auth required
        true, // oracle endpoint
        true  // include tenant ID
      );

      if (response.success && Array.isArray(response.data)) {
        return response.data;
      }

      return [];
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      return [];
    }
  }

  /**
   * Get all admin users for the current tenant with paging and search
   * @param skip Number of items to skip
   * @param take Number of items to take
   * @param search Search query
   * @returns Paginated admin users
   */
  async getAdminUsers(skip: number = 0, take: number = 10, search: string = ''): Promise<{ items: any[]; totalCount: number; skip: number; take: number } | null> {
    try {
      const url = `/accounts/admin?skip=${skip}&take=${take}&search=${encodeURIComponent(search)}`;
      const response = await this.apiService.callApi<{ items: any[]; totalCount: number; skip: number; take: number }>(
        'GET',
        url,
        null,
        true, // auth required
        true, // oracle endpoint
        true  // include tenant ID
      );

      if (response.success && response.data) {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error('Error fetching admin users:', error);
      return null;
    }
  }

  /**
   * Get admin user details by wallet address
   * @param wallet Wallet address
   * @returns Admin user details
   */
  async getAdminUser(wallet: string): Promise<any | null> {
    try {
      const response = await this.apiService.callApi<any>(
        'GET',
        `/accounts/admin/${wallet}`,
        null,
        true, // auth required
        true, // oracle endpoint
        true  // include tenant ID
      );

      if (response.success && response.data) {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error('Error fetching admin user:', error);
      return null;
    }
  }

  /**
   * Update admin user permissions and fleet groups
   * @param data Update data
   * @returns API response
   */
  async updateAdminUser(data: { walletAddress: string; permissions: string[]; fleetGroupIds: string[] }): Promise<any> {
    return await this.apiService.callApi(
      'PUT',
      '/accounts/admin',
      data,
      true, // auth required
      true, // oracle endpoint
      true  // include tenant ID
    );
  }

  /**
   * Delete an admin user
   * @param wallet Wallet address of the admin user to delete
   * @returns API response
   */
  async deleteAdminUser(wallet: string): Promise<any> {
    return await this.apiService.callApi(
      'DELETE',
      `/accounts/admin/${wallet}`,
      null,
      true, // auth required
      true, // oracle endpoint
      true  // include tenant ID
    );
  }

  /**
   * Check if a string is a valid Ethereum wallet address
   * @param value String to check
   * @returns True if valid wallet address
   */
  private isWalletAddress(value: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }
}
