import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";
import { consume } from '@lit/context';
import { apiServiceContext } from '../context';
import { ApiService } from '@services/api-service.ts';
import { FleetService } from '@services/fleet-service.ts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface VehicleGroup {
  id: string;
  name: string;
  color: string;
}

interface Vehicle {
  vin: string;
  imei: string;
  vehicle_token_id: number;
  connection_status: string;
  device_definition_id: string;
  make: string;
  model: string;
  year: number;
  last_telemetry: string;
  inventory: string;
  groups: VehicleGroup[];
  fuel: boolean;
  engine: string;
}

interface TelemetryInfo {
  signalsLatest: {
    currentLocationCoordinates: {
      value: {
        latitude: number;
        longitude: number;
      };
      timestamp: string;
    };
    obdIsEngineBlocked: {
      value: number;
      timestamp: string;
    };
  };
}

interface FleetVehiclesResponse {
  items: Vehicle[];
  totalCount: number;
  skip: number;
  take: number;
}

interface FleetGroup {
  id: string;
  name: string;
  color: string;
  vehicle_count: number;
  created_at: string;
  updated_at: string;
}

@customElement('vehicles-fleets-view')
export class VehiclesFleetsView extends LitElement {
  static styles = [ globalStyles,
    css`` ]

  @consume({ context: apiServiceContext, subscribe: true })
  @state()
  apiService?: ApiService;

  @state()
  private vehicles: Vehicle[] = [];

  @state()
  private totalCount: number = 0;

  @state()
  private fleetGroups: FleetGroup[] = [];

  @state()
  private skip: number = 0;

  @state()
  private take: number = 20;

  @state()
  private search: string = '';

  @state()
  private filter: string = '';

  @state()
  private activeTab: 'vehicles-list' | 'fleet-groups' = 'vehicles-list';

  @state()
  private showCreateGroupModal: boolean = false;

  @state()
  private showDeleteConfirmModal: boolean = false;

  @state()
  private groupToDelete: FleetGroup | null = null;

  @state()
  private groupToEdit: FleetGroup | null = null;

  @state()
  private showManageVehiclesModal: boolean = false;

  @state()
  private groupToManage: FleetGroup | null = null;

  @state()
  private exporting: boolean = false;

  private searchDebounceTimer?: number;
  private telemetryLoadAbortController?: AbortController;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadVehicles();
    await this.loadFleetGroups();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    // Cancel any ongoing telemetry loading
    if (this.telemetryLoadAbortController) {
      this.telemetryLoadAbortController.abort();
    }
  }

  private async loadVehicles() {
    if (!this.apiService) return;

    // Cancel any ongoing telemetry loading
    if (this.telemetryLoadAbortController) {
      this.telemetryLoadAbortController.abort();
    }

    const url = `/fleet/vehicles?skip=${this.skip}&take=${this.take}&search=${this.search}&filter=${this.filter}`;

    const response = await this.apiService.callApi<FleetVehiclesResponse>(
      'GET',
      url,
      null,
      true, // auth required
      true  // oracle endpoint
    );

    if (response.success && response.data) {
      this.vehicles = response.data.items;
      this.totalCount = response.data.totalCount;

      // Start loading telemetry progressively
      this.loadTelemetryProgressively();
    } else {
      console.error('Failed to load vehicles:', response.error);
    }
  }

  private async loadTelemetryProgressively() {
    if (!this.apiService || this.vehicles.length === 0) return;

    // Create a new abort controller for this batch of telemetry loading
    this.telemetryLoadAbortController = new AbortController();
    const signal = this.telemetryLoadAbortController.signal;

    // Load telemetry sequentially from top to bottom
    for (let i = 0; i < this.vehicles.length; i++) {
      // Check if we should abort
      if (signal.aborted) {
        break;
      }

      const vehicle = this.vehicles[i];

      // Skip if already has telemetry data or no token ID
      if (vehicle.last_telemetry || !vehicle.vehicle_token_id) {
        continue;
      }

      try {
        const response = await this.apiService.callApi<TelemetryInfo>(
          'GET',
          `/fleet/vehicles/telemetry-info/${vehicle.vehicle_token_id}`,
          null,
          true, // auth required
          true  // oracle endpoint
        );

        if (response.success && response.data && !signal.aborted) {
          const telemetryData = response.data;

          // Extract last telemetry timestamp from currentLocationCoordinates
          const lastTelemetry = telemetryData.signalsLatest?.currentLocationCoordinates?.timestamp || '';

          // Extract engine blocked status - 0 means not blocked (green), 1 means blocked (red)
          // Default to 'running' (UNBLOCKED)
          const engineBlockedValue = telemetryData.signalsLatest?.obdIsEngineBlocked?.value;
          let engineStatus = 'running'; // Default to running (UNBLOCKED)

          if (engineBlockedValue !== undefined && engineBlockedValue !== null) {
            engineStatus = engineBlockedValue === 0 ? 'running' : 'blocked';
          }

          // Update the specific vehicle in the array
          this.vehicles = this.vehicles.map((v, idx) =>
            idx === i ? { ...v, last_telemetry: lastTelemetry, engine: engineStatus } : v
          );
        } else {
          // If API call failed, still set default to 'running' (UNBLOCKED)
          this.vehicles = this.vehicles.map((v, idx) =>
            idx === i ? { ...v, engine: v.engine || 'running' } : v
          );
        }
      } catch (error) {
        // Silently fail for individual telemetry loads, but ensure default is 'running'
        console.debug(`Failed to load telemetry for vehicle ${vehicle.vehicle_token_id}`, error);
        this.vehicles = this.vehicles.map((v, idx) =>
          idx === i ? { ...v, engine: v.engine || 'running' } : v
        );
      }
    }
  }

  private async loadFleetGroups() {
    try {
      this.fleetGroups = await FleetService.getInstance().getFleetGroups() as unknown as FleetGroup[];
    } catch (error) {
      console.error('Error loading fleet groups:', error);
    }
  }

  private handleVehicleClick(tokenId: number) {
    location.hash = `/vehicles/${tokenId}`;
  }

  private handleTabClick(tab: 'vehicles-list' | 'fleet-groups') {
    this.activeTab = tab;
  }

  private openCreateGroupModal() {
    this.groupToEdit = null; // Clear any edit state
    this.showCreateGroupModal = true;
  }

  private handleEditClick(group: FleetGroup) {
    this.groupToEdit = group;
    this.showCreateGroupModal = true;
  }

  private handleManageVehiclesClick(group: FleetGroup) {
    this.groupToManage = group;
    this.showManageVehiclesModal = true;
  }

  private handleVehiclesUpdated() {
    // Reload fleet groups to update vehicle counts
    this.loadFleetGroups();
  }

  private handleManageVehiclesModalClosed() {
    this.showManageVehiclesModal = false;
    this.groupToManage = null;
  }

  private handleGroupCreated(e: CustomEvent) {
    console.log('Group created:', e.detail.group);
    this.showCreateGroupModal = false;
    this.groupToEdit = null;
    // Reload fleet groups list
    this.loadFleetGroups();
  }

  private handleGroupUpdated(e: CustomEvent) {
    console.log('Group updated:', e.detail.group);
    this.showCreateGroupModal = false;
    this.groupToEdit = null;
    // Reload fleet groups list
    this.loadFleetGroups();
  }

  private handleModalClosed() {
    this.showCreateGroupModal = false;
    this.groupToEdit = null;
  }

  private handleDeleteClick(group: FleetGroup) {
    this.groupToDelete = group;
    this.showDeleteConfirmModal = true;
  }

  private handleDeleteCancel() {
    this.showDeleteConfirmModal = false;
    this.groupToDelete = null;
  }

  private async handleDeleteConfirm() {
    if (!this.apiService || !this.groupToDelete) return;

    this.showDeleteConfirmModal = false;

    try {
      const response = await this.apiService.callApi(
        'DELETE',
        `/fleet/groups/${this.groupToDelete.id}`,
        null,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success) {
        console.log('Group deleted successfully');
        // Reload fleet groups list
        await this.loadFleetGroups();
      } else {
        console.error('Failed to delete group:', response.error);
        // TODO: Show error notification to user
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      // TODO: Show error notification to user
    } finally {
      this.groupToDelete = null;
    }
  }

  private handleExportCsv = async () => {
    if (!this.apiService || this.exporting) return;

    this.exporting = true;
    try {
      const url = `/vehicles/export?search=${encodeURIComponent(this.search)}&filter=${encodeURIComponent(this.filter)}`;
      await this.apiService.downloadFile(
        url,
        true, // auth
        true, // useOracle
        true  // includeTenantId
      );
    } catch (error) {
      console.error('Export CSV failed:', error);
    } finally {
      this.exporting = false;
    }
  }

  private handleSearchInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;

    // Clear existing timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    // Set new timer for 500ms debounce
    this.searchDebounceTimer = window.setTimeout(() => {
      this.search = value;
      this.skip = 0; // Reset to first page when searching
      this.loadVehicles();
    }, 500);
  }

  private handleGroupFilterChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.filter = select.value;
    this.skip = 0; // Reset to first page when filtering
    this.loadVehicles();
  }

  private getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'connected': return 'status-connected';
      case 'succeeded': return 'status-connected';
      case 'disconnected':
      case 'offline': return 'status-offline';
      case 'never': return 'status-never';
      default: return '';
    }
  }

  private getInventoryClass(inventory: string): string {
    return inventory ? `status-${inventory.toLowerCase()}` : '';
  }

  private getEngineClass(engine: string): string {
    if (engine) return `status-${engine.toLowerCase()}`;

    return 'status-running';
  }

  private getEngineDisplay(engine: string): string {
    if (!engine || engine.toLowerCase() === 'running') return 'UNBLOCKED';
    if (engine.toLowerCase() === 'blocked') return 'BLOCKED';
    return engine.toUpperCase();
  }

  private formatLastTelemetry(timestamp: string): string {
    if (!timestamp) return '—';
    const date = dayjs(timestamp);
    const now = dayjs();
    const diffInDays = now.diff(date, 'day');

    if (diffInDays < 7) {
      return date.fromNow();
    } else {
      return date.format('MMM D, YYYY h:mm A');
    }
  }

  private get currentPage(): number {
    return Math.floor(this.skip / this.take) + 1;
  }

  private get totalPages(): number {
    return Math.ceil(this.totalCount / this.take);
  }

  private get showingStart(): number {
    return this.totalCount === 0 ? 0 : this.skip + 1;
  }

  private get showingEnd(): number {
    return Math.min(this.skip + this.take, this.totalCount);
  }

  private handlePageChange(page: number) {
    this.skip = (page - 1) * this.take;
    this.loadVehicles();
  }

  private getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;

    if (this.totalPages <= maxVisible) {
      // Show all pages if total is less than max
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      // Calculate range around current page
      let startPage = Math.max(2, this.currentPage - 1);
      let endPage = Math.min(this.totalPages - 1, this.currentPage + 1);

      // Add ellipsis and pages
      if (startPage > 2) {
        pages.push(-1); // -1 represents ellipsis
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < this.totalPages - 1) {
        pages.push(-1); // -1 represents ellipsis
      }

      // Always show last page
      pages.push(this.totalPages);
    }

    return pages;
  }

  render() {
    return html`
        <div class="page active" id="page-vehicles">
            <div class="inner-tabs">
                <div
                  class="inner-tab ${this.activeTab === 'vehicles-list' ? 'active' : ''}"
                  data-subtab="vehicles-list"
                  @click=${() => this.handleTabClick('vehicles-list')}
                >Vehicles</div>
                <div
                  class="inner-tab ${this.activeTab === 'fleet-groups' ? 'active' : ''}"
                  data-subtab="fleet-groups"
                  @click=${() => this.handleTabClick('fleet-groups')}
                >Fleet Groups</div>
            </div>

            <!-- Vehicles List Sub-tab -->
            <div id="subtab-vehicles-list" style="display: ${this.activeTab === 'vehicles-list' ? 'block' : 'none'}">
                <div class="toolbar">
                    <input
                      type="text"
                      class="search-box"
                      placeholder="Search by VIN, IMEI, or Nickname..."
                      @input=${this.handleSearchInput}
                      .value=${this.search}
                    >
                    <select>
                        <option value="">All Inventory Status</option>
                        <option value="inventory">Inventory</option>
                        <option value="customer">Customer Owned</option>
                    </select>
                    <select @change=${this.handleGroupFilterChange} .value=${this.filter}>
                        <option value="">All Groups</option>
                        ${this.fleetGroups.map(group => html`
                          <option value=${'group:' + group.id}>${group.name}</option>
                        `)}
                    </select>
                    <button class="btn btn-sm ${this.exporting ? 'processing' : ''}" 
                            style="margin-left: 8px; display: inline-flex; align-items: center; gap: 6px;" 
                            @click=${this.handleExportCsv}
                            ?disabled=${this.exporting}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Export CSV
                    </button>
                  
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                        <tr>
                            <th>Vehicle</th>
                            <th>IMEI</th>
                            <th>VIN</th>
                            <th>Status</th>
                            <th>Last Telemetry</th>
                            <th>Inventory</th>
                            <th>Groups</th>
                            <th>Fuel</th>
                            <th>Engine</th>
                        </tr>
                        </thead>
                        <tbody>
                        ${this.vehicles.map(vehicle => html`
                          <tr>
                            <td class="link" title="${vehicle.vehicle_token_id}" @click=${() => this.handleVehicleClick(vehicle.vehicle_token_id)} style="cursor:pointer">${vehicle.make.toUpperCase()} ${vehicle.model.toUpperCase()} ${vehicle.year}</td>
                            <td>${vehicle.imei}</td>
                            <td>${vehicle.vin}</td>
                            <td><span class="status ${this.getStatusClass(vehicle.connection_status)}">${vehicle.connection_status}</span></td>
                            <td title="${vehicle.last_telemetry}">${this.formatLastTelemetry(vehicle.last_telemetry)}</td>
                            <td>${vehicle.inventory ? html`<span class="status ${this.getInventoryClass(vehicle.inventory)}">${vehicle.inventory}</span>` : '—'}</td>
                            <td>${vehicle.groups.length > 0 ? vehicle.groups.map(group => html`<span class="badge" style="background-color: ${group.color}; color: #fff;">${group.name}</span>`) : '—'}</td>
                            <td>${vehicle.fuel ? 'Yes' : 'No'}</td>
                            <td><span class="status ${this.getEngineClass(vehicle.engine)}">${this.getEngineDisplay(vehicle.engine)}</span></td>
                          </tr>
                        `)}
                        </tbody>
                    </table>
                </div>

                <div class="pagination mt-16">
                    ${this.getPageNumbers().map(pageNum =>
                      pageNum === -1
                        ? html`<span>...</span>`
                        : html`<button
                            class="pagination-btn ${pageNum === this.currentPage ? 'active' : ''}"
                            @click=${() => this.handlePageChange(pageNum)}
                          >${pageNum}</button>`
                    )}
                    <span style="margin-left: 16px; color: #666;">
                      Showing ${this.showingStart}-${this.showingEnd} of ${this.totalCount} vehicles
                    </span>
                </div>
            </div>

            <!-- Fleet Groups Sub-tab -->
            <div id="subtab-fleet-groups" style="display: ${this.activeTab === 'fleet-groups' ? 'block' : 'none'}">
                <div class="toolbar">
                    <button class="btn btn-primary" @click=${this.openCreateGroupModal}>+ CREATE GROUP</button>
                </div>

                <div class="group-list">
                    ${this.fleetGroups.length === 0 ? html`
                        <div style="text-align: center; padding: 2rem; color: #666;">
                            No fleet groups yet. Click "CREATE GROUP" to add one.
                        </div>
                    ` : this.fleetGroups.map(group => html`
                        <div class="group-item">
                            <div class="group-info">
                                <span class="group-name" style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="display: inline-block; width: 12px; height: 12px; background-color: ${group.color}; border-radius: 50%; border: 1px solid #ddd;"></span>
                                    ${group.name}
                                </span>
                                <span class="group-stats">${group.vehicle_count} vehicle${group.vehicle_count !== 1 ? 's' : ''}</span>
                            </div>
                            <div>
                                <button class="btn btn-sm" @click=${() => this.handleEditClick(group)}>EDIT</button>
                                <button class="btn btn-sm" @click=${() => this.handleManageVehiclesClick(group)}>MANAGE VEHICLES</button>
                                <button class="btn btn-sm btn-danger" @click=${() => this.handleDeleteClick(group)}>DELETE</button>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        </div>

        <!-- Create/Edit Fleet Group Modal -->
        <create-fleet-group-modal-element
          .show=${this.showCreateGroupModal}
          .editGroup=${this.groupToEdit}
          @group-created=${this.handleGroupCreated}
          @group-updated=${this.handleGroupUpdated}
          @modal-closed=${this.handleModalClosed}
        ></create-fleet-group-modal-element>

        <!-- Delete Confirmation Modal -->
        <confirm-modal-element
          .show=${this.showDeleteConfirmModal}
          .title=${'Delete Fleet Group'}
          .message=${this.groupToDelete ? `Are you sure you want to delete "${this.groupToDelete.name}"? This action cannot be undone.` : ''}
          .confirmText=${'Delete'}
          .cancelText=${'Cancel'}
          .confirmButtonClass=${'btn-danger'}
          @modal-confirm=${this.handleDeleteConfirm}
          @modal-cancel=${this.handleDeleteCancel}
        ></confirm-modal-element>

        <!-- Manage Group Vehicles Modal -->
        <manage-group-vehicles-modal-element
          .show=${this.showManageVehiclesModal}
          .group=${this.groupToManage}
          @vehicles-updated=${this.handleVehiclesUpdated}
          @modal-closed=${this.handleManageVehiclesModalClosed}
        ></manage-group-vehicles-modal-element>
    `;
  }
}