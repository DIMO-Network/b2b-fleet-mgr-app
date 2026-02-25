import { ApiService } from './api-service';

export interface FleetGroup {
  id: string;
  name: string;
  color: string;
  vehicle_count: number;
  has_access: boolean;
  created_at: string;
  updated_at: string;
}

export interface FleetReport {
  id: string;
  reportName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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

  /**
   * Get all reports for the current tenant
   * @returns List of fleet reports
   */
  async getReports(): Promise<FleetReport[]> {
    try {
      const response = await this.apiService.callApi<FleetReport[]>(
        'GET',
        '/fleet/reports',
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
      console.error('Error fetching reports:', error);
      return [];
    }
  }

  /**
   * Get all report templates
   * @returns List of report template names
   */
  async getReportTemplates(): Promise<string[]> {
    try {
      const response = await this.apiService.callApi<string[]>(
        'GET',
        '/fleet/report-templates',
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
      console.error('Error fetching report templates:', error);
      return [];
    }
  }

  /**
   * Run a new report
   * @param data Report configuration
   * @returns Report ID and initial status
   */
  async runReport(data: {
    startDate: string;
    endDate: string;
    fleetGroupIds: string[];
    reportName: string;
  }): Promise<{ reportId: string; status: string } | null> {
    try {
      const response = await this.apiService.callApi<{ reportId: string; status: string }>(
        'POST',
        '/fleet/reports',
        data,
        true, // auth required
        true, // oracle endpoint
        true  // include tenant ID
      );

      if (response.success && response.data) {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error('Error running report:', error);
      return null;
    }
  }

  /**
   * Get report status and details
   * @param reportId Report ID
   * @returns Report details
   */
  async getReportStatus(reportId: string): Promise<FleetReport | null> {
    try {
      const response = await this.apiService.callApi<FleetReport>(
        'GET',
        `/fleet/reports/${reportId}`,
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
      console.error('Error fetching report status:', error);
      return null;
    }
  }

  /**
   * Download a report CSV
   * @param reportId ID of the report to download
   */
  async downloadReport(reportId: string): Promise<void> {
    const url = `/fleet/reports/${reportId}?download=1`;
    await this.apiService.downloadFile(
      url,
      true, // auth
      true, // useOracle
      true  // includeTenantId
    );
  }
}
