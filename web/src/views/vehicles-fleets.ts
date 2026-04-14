import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str } from '@lit/localize';
import {globalStyles} from "../global-styles.ts";
import { consume } from '@lit/context';
import { apiServiceContext } from '../context';
import { ApiService } from '@services/api-service.ts';
import { FleetService, FleetGroup } from '@services/fleet-service.ts';
import { SettingsService } from '@services/settings-service.ts';
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
  odometer: string;
  engine: string;
  license_plate: string;
}

interface TelemetrySignals {
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
    powertrainTransmissionTravelledDistance: {
      value: number;
    };
  };
}


interface FleetVehiclesResponse {
  items: Vehicle[];
  totalCount: number;
  skip: number;
  take: number;
}

@customElement('vehicles-fleets-view')
export class VehiclesFleetsView extends LitElement {
  static styles = [ globalStyles,
    css`
      .license-plate {
        display: inline-block;
        background: #e9ecef;
        border: 1px solid #ced4da;
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }
      .export-dropdown {
        position: relative;
        display: inline-block;
      }
      .export-menu {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 4px;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        z-index: 10;
        min-width: 140px;
      }
      .export-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
      }
      .export-menu-item:hover {
        background: #f5f5f5;
      }
      .export-menu-item:first-child {
        border-radius: 4px 4px 0 0;
      }
      .export-menu-item:last-child {
        border-radius: 0 0 4px 4px;
      }
    ` ];

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

  @state()
  private showExportMenu: boolean = false;

  @state()
  private errorMessage: string = '';

  @state()
  private permissionErrorVehicles: Array<{ tokenId: number; label: string }> = [];

  private searchDebounceTimer?: number;
  private telemetryLoadAbortController?: AbortController;

  private telemetryQuery = `{
  signalsLatest(tokenId: TOKEN_ID) {
    currentLocationCoordinates {
      value {
        latitude
        longitude
      }
      timestamp
    }
    obdIsEngineBlocked {
      value
      timestamp
    }
    powertrainTransmissionTravelledDistance {
      value
    }
  }
}`;

  private boundCloseExportMenu = (e: MouseEvent) => {
    const path = e.composedPath();
    const dropdown = this.shadowRoot?.querySelector('.export-dropdown');
    if (dropdown && !path.includes(dropdown)) {
      this.showExportMenu = false;
    }
  };

  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this.boundCloseExportMenu);
    await this.loadVehicles();
    await this.loadFleetGroups();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.boundCloseExportMenu);
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    // Cancel any ongoing telemetry loading
    if (this.telemetryLoadAbortController) {
      this.telemetryLoadAbortController.abort();
    }
  }

  private async loadVehicles() {
    this.errorMessage = '';
    this.permissionErrorVehicles = [];
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
      this.errorMessage = response.error || msg('Failed to load vehicles');
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
        const query = this.telemetryQuery.replace('TOKEN_ID', vehicle.vehicle_token_id.toString());
        const response = await this.apiService.callApi<TelemetrySignals>(
          'POST',
          `/fleet/vehicles/telemetry/${vehicle.vehicle_token_id}`,
          query,
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

          // Extract odometer
          const odometerValue = telemetryData.signalsLatest?.powertrainTransmissionTravelledDistance?.value;
          const odometer = odometerValue != null ? `${Math.round(odometerValue).toLocaleString()} km` : '';

          // Update the specific vehicle in the array
          this.vehicles = this.vehicles.map((v, idx) =>
            idx === i ? { ...v, last_telemetry: lastTelemetry, engine: engineStatus, odometer } : v
          );
        } else {
          // If API call failed, still set default to 'running' (UNBLOCKED)
          this.vehicles = this.vehicles.map((v, idx) =>
            idx === i ? { ...v, engine: v.engine || 'running' } : v
          );
          if (response.error && response.error.includes('403')) {
            const label = `${vehicle.make} ${vehicle.model} ${vehicle.year}`.trim() || `Token ${vehicle.vehicle_token_id}`;
            this.permissionErrorVehicles = [...this.permissionErrorVehicles, { tokenId: vehicle.vehicle_token_id, label }];
          } else if (response.error) {
            this.errorMessage = response.error;
          }
        }
      } catch (error: any) {
        // Silently fail for individual telemetry loads, but ensure default is 'running'
        console.debug(`Failed to load telemetry for vehicle ${vehicle.vehicle_token_id}`, error);
        const errMsg = error.message || '';
        if (errMsg.includes('403')) {
          const label = `${vehicle.make} ${vehicle.model} ${vehicle.year}`.trim() || `Token ${vehicle.vehicle_token_id}`;
          this.permissionErrorVehicles = [...this.permissionErrorVehicles, { tokenId: vehicle.vehicle_token_id, label }];
        } else {
          this.errorMessage = errMsg || `Failed to load telemetry for vehicle ${vehicle.vehicle_token_id}`;
        }
        this.vehicles = this.vehicles.map((v, idx) =>
          idx === i ? { ...v, engine: v.engine || 'running' } : v
        );
      }
    }
  }

  private async loadFleetGroups() {
    try {
      this.fleetGroups = await FleetService.getInstance().getFleetGroups(true) as unknown as FleetGroup[];
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
      const response = await FleetService.getInstance().deleteFleetGroup(this.groupToDelete.id);

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

  private handleExport = async (format: 'xlsx' | 'csv') => {
    if (this.exporting) return;
    this.showExportMenu = false;

    this.exporting = true;
    try {
      const data = {
        reportName: 'VehiclesExportReport',
        search: this.search,
        filter: this.filter,
        format,
      };

      const result = await FleetService.getInstance().runReport(data);

      if (result && result.reportId) {
        // Signal the reports page to highlight and poll the new report
        sessionStorage.setItem('highlightReportId', result.reportId);
        sessionStorage.setItem('highlightReportName', data.reportName);
        // Navigate to reports page so the user can track progress
        location.hash = '/reports';
      }
    } catch (error) {
      console.error('Export CSV failed:', error);
    } finally {
      this.exporting = false;
    }
  };

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

  private buildShareUrl(tokenId: number): string {
    const settings = SettingsService.getInstance().tenantSettings;
    const clientId = settings?.dimo_client_id ?? '';
    const expiration = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const redirectUri = window.location.origin + '/';

    const params = new URLSearchParams({
      clientId,
      entryState: 'VEHICLE_MANAGER',
      expirationDate: expiration,
      permissions: '11111010',
      redirectUri,
    });
    params.append('vehicles', tokenId.toString());

    return `https://login.dimo.org/?${params.toString()}`;
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
      const startPage = Math.max(2, this.currentPage - 1);
      const endPage = Math.min(this.totalPages - 1, this.currentPage + 1);

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
            ${this.errorMessage ? html`<div class="alert alert-error">${this.errorMessage}</div>` : ''}
            ${this.permissionErrorVehicles.length > 0 ? html`
              <div class="alert alert-error" style="display: flex; flex-direction: column; gap: 8px;">
                <strong>${msg('Permission expired for the following vehicles:')}</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                  ${this.permissionErrorVehicles.map(v => html`
                    <a href=${this.buildShareUrl(v.tokenId)} target="_blank" rel="noopener"
                       class="btn btn-sm" style="display: inline-flex; align-items: center; gap: 4px; text-decoration: none;">
                      ${v.label}
                      <span style="font-size: 11px;">${msg('Re-share')}</span>
                    </a>
                  `)}
                </div>
              </div>
            ` : ''}
            <div class="inner-tabs">
                <div
                  class="inner-tab ${this.activeTab === 'vehicles-list' ? 'active' : ''}"
                  data-subtab="vehicles-list"
                  @click=${() => this.handleTabClick('vehicles-list')}
                >${msg('Vehicles')}</div>
                <div
                  class="inner-tab ${this.activeTab === 'fleet-groups' ? 'active' : ''}"
                  data-subtab="fleet-groups"
                  @click=${() => this.handleTabClick('fleet-groups')}
                >${msg('Fleet Groups')}</div>
            </div>

            <!-- Vehicles List Sub-tab -->
            <div id="subtab-vehicles-list" style="display: ${this.activeTab === 'vehicles-list' ? 'block' : 'none'}">
                <div class="toolbar">
                    <input
                      type="text"
                      class="search-box"
                      .placeholder=${msg('Search by VIN, IMEI, or Nickname...')}
                      @input=${this.handleSearchInput}
                      .value=${this.search}
                    >
                    <select>
                        <option value="">${msg('All Inventory Status')}</option>
                        <option value="inventory">${msg('Inventory')}</option>
                        <option value="customer">${msg('Customer Owned')}</option>
                    </select>
                    <select @change=${this.handleGroupFilterChange} .value=${this.filter}>
                        <option value="">${msg('All Groups')}</option>
                        ${this.fleetGroups.map(group => html`
                          <option value=${'group:' + group.id}>${group.name}</option>
                        `)}
                    </select>
                    <div class="export-dropdown" style="margin-left: 8px;">
                        <button class="btn btn-sm ${this.exporting ? 'processing' : ''}"
                                style="display: inline-flex; align-items: center; gap: 6px;"
                                @click=${() => { this.showExportMenu = !this.showExportMenu; }}
                                ?disabled=${this.exporting}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            ${msg('Export')}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        ${this.showExportMenu ? html`
                          <div class="export-menu">
                            <div class="export-menu-item" @click=${() => this.handleExport('xlsx')}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#217346" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>
                              ${msg('Excel (.xlsx)')}
                            </div>
                            <div class="export-menu-item" @click=${() => this.handleExport('csv')}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              ${msg('CSV (.csv)')}
                            </div>
                          </div>
                        ` : ''}
                    </div>
                  
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                        <tr>
                            <th>${msg('Vehicle')}</th>
                            <th>${msg('IMEI')}</th>
                            <th>${msg('VIN')}</th>
                            <th>${msg('Status')}</th>
                            <th>${msg('Last Telemetry')}</th>
                            <th>${msg('Inventory')}</th>
                            <th>${msg('Groups')}</th>
                            <th>${msg('Odometer')}</th>
                            <th>${msg('Engine')}</th>
                        </tr>
                        </thead>
                        <tbody>
                        ${this.vehicles.map(vehicle => html`
                          <tr>
                            <td>${vehicle.license_plate ? html`<span class="license-plate">${vehicle.license_plate}</span><br>` : ''}<span class="link" title="${vehicle.vehicle_token_id}" @click=${() => this.handleVehicleClick(vehicle.vehicle_token_id)} style="cursor:pointer">${vehicle.make.toUpperCase()} ${vehicle.model.toUpperCase()} ${vehicle.year}</span></td>
                            <td>${vehicle.imei}</td>
                            <td>${vehicle.vin}</td>
                            <td><span class="status ${this.getStatusClass(vehicle.connection_status)}">${vehicle.connection_status}</span></td>
                            <td title="${vehicle.last_telemetry}">${this.formatLastTelemetry(vehicle.last_telemetry)}</td>
                            <td>${vehicle.inventory ? html`<span class="status ${this.getInventoryClass(vehicle.inventory)}">${vehicle.inventory}</span>` : '—'}</td>
                            <td>${vehicle.groups.length > 0 ? vehicle.groups.map(group => html`<span class="badge" style="background-color: ${group.color}; color: #fff;">${group.name}</span>`) : '—'}</td>
                            <td>${vehicle.odometer || '—'}</td>
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
                      ${msg(str`Showing ${this.showingStart}-${this.showingEnd} of ${this.totalCount} vehicles`)}
                    </span>
                </div>
            </div>

            <!-- Fleet Groups Sub-tab -->
            <div id="subtab-fleet-groups" style="display: ${this.activeTab === 'fleet-groups' ? 'block' : 'none'}">
                <div class="toolbar">
                    <button class="btn btn-primary" @click=${this.openCreateGroupModal}>${msg('+ CREATE GROUP')}</button>
                </div>

                <div class="group-list">
                    ${this.fleetGroups.length === 0 ? html`
                        <div style="text-align: center; padding: 2rem; color: #666;">
                            ${msg('No fleet groups yet. Click "CREATE GROUP" to add one.')}
                        </div>
                    ` : this.fleetGroups.map(group => html`
                        <div class="group-item">
                            <div class="group-info">
                                <span class="group-name" style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="display: inline-block; width: 12px; height: 12px; background-color: ${group.color}; border-radius: 50%; border: 1px solid #ddd;"></span>
                                    ${group.name}
                                </span>
                                <span class="group-stats">${msg(str`${group.vehicle_count} vehicle${group.vehicle_count !== 1 ? 's' : ''}`)}</span>
                            </div>
                            <div>
                                <button class="btn btn-sm" @click=${() => this.handleEditClick(group)}>${msg('EDIT')}</button>
                                <button class="btn btn-sm" @click=${() => this.handleManageVehiclesClick(group)}>${msg('MANAGE VEHICLES')}</button>
                                <button class="btn btn-sm btn-danger" @click=${() => this.handleDeleteClick(group)}>${msg('DELETE')}</button>
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
          .title=${msg('Delete Fleet Group')}
          .message=${this.groupToDelete ? msg(str`Are you sure you want to delete "${this.groupToDelete.name}"? This action cannot be undone.`) : ''}
          .confirmText=${msg('Delete')}
          .cancelText=${msg('Cancel')}
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