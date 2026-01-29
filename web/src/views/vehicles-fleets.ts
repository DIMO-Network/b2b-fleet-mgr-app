import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";
import { consume } from '@lit/context';
import { apiServiceContext } from '../context';
import { ApiService } from '@services/api-service.ts';

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

interface FleetVehiclesResponse {
  data: Vehicle[];
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
  private take: number = 50;

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

  private searchDebounceTimer?: number;

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
  }

  private async loadVehicles() {
    if (!this.apiService) return;

    const url = `/fleet/vehicles?skip=${this.skip}&take=${this.take}&search=${this.search}&filter=${this.filter}`;

    const response = await this.apiService.callApi<FleetVehiclesResponse>(
      'GET',
      url,
      null,
      true, // auth required
      true  // oracle endpoint
    );

    if (response.success && response.data) {
      this.vehicles = response.data.data;
      this.totalCount = response.data.totalCount;
    } else {
      console.error('Failed to load vehicles:', response.error);
    }
  }

  private async loadFleetGroups() {
    if (!this.apiService) return;

    const response = await this.apiService.callApi<FleetGroup[]>(
      'GET',
      '/fleet/groups',
      null,
      true, // auth required
      true  // oracle endpoint
    );

    if (response.success && response.data) {
      this.fleetGroups = response.data;
    } else {
      console.error('Failed to load fleet groups:', response.error);
    }
  }

  private handleVehicleClick(vin: string) {
    location.hash = `/vehicles/${vin}`;
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
    return engine ? `status-${engine.toLowerCase()}` : '';
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
                    <select>
                        <option value="">All Connection Status</option>
                        <option value="connected">Connected</option>
                        <option value="offline">Offline</option>
                        <option value="never">Never Reported</option>
                    </select>
                    <select @change=${this.handleGroupFilterChange} .value=${this.filter}>
                        <option value="">All Groups</option>
                        ${this.fleetGroups.map(group => html`
                          <option value=${'group:' + group.id}>${group.name}</option>
                        `)}
                    </select>
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
                            <td class="link" @click=${() => this.handleVehicleClick(vehicle.vin)} style="cursor:pointer">${vehicle.make.toUpperCase()} ${vehicle.model.toUpperCase()} ${vehicle.year}</td>
                            <td>${vehicle.imei}</td>
                            <td>${vehicle.vin}</td>
                            <td><span class="status ${this.getStatusClass(vehicle.connection_status)}">${vehicle.connection_status}</span></td>
                            <td>${vehicle.last_telemetry || '—'}</td>
                            <td>${vehicle.inventory ? html`<span class="status ${this.getInventoryClass(vehicle.inventory)}">${vehicle.inventory}</span>` : '—'}</td>
                            <td>${vehicle.groups.length > 0 ? vehicle.groups.map(group => html`<span class="badge" style="background-color: ${group.color}; color: #fff;">${group.name}</span>`) : '—'}</td>
                            <td>${vehicle.fuel ? 'Yes' : 'No'}</td>
                            <td><span class="status ${this.getEngineClass(vehicle.engine)}">${vehicle.engine}</span></td>
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