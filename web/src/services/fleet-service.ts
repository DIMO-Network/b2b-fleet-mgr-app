import { ApiService } from './api-service';

export interface FleetGroup {
  id: string;
  name: string;
  color: string;
  vehicle_count: number;
  created_at: string;
  updated_at: string;
}

export class FleetService {
  private static instance: FleetService;
  private apiService: ApiService;

  private constructor() {
    this.apiService = ApiService.getInstance();
  }

  public static getInstance(): FleetService {
    if (!FleetService.instance) {
      FleetService.instance = new FleetService();
    }
    return FleetService.instance;
  }

  /**
   * Get all fleet groups for the current tenant
   * @returns List of fleet groups
   */
  async getFleetGroups(): Promise<FleetGroup[]> {
    try {
      const response = await this.apiService.callApi<FleetGroup[]>(
        'GET',
        '/fleet/groups',
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
      console.error('Error fetching fleet groups:', error);
      return [];
    }
  }
}
