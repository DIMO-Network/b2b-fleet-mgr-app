import { html, nothing, LitElement, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ApiService } from '@services/api-service.ts';
import { globalStyles } from '../global-styles.ts';

interface Vehicle {
  vin: string;
  imei: string;
  make: string;
  model: string;
  year: number;
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
}

@customElement('manage-group-vehicles-modal-element')
export class ManageGroupVehiclesModalElement extends LitElement {
  static styles = [
    globalStyles,
    css`
      .modal-content {
        max-width: 800px;
        width: 90vw;
      }

      .add-vehicle-section {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        align-items: flex-start;
      }

      .add-vehicle-section input {
        flex: 1;
      }

      .vehicles-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1rem;
      }

      .vehicles-table th,
      .vehicles-table td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }

      .vehicles-table th {
        background-color: #f5f5f5;
        font-weight: 600;
      }

      .vehicles-table tbody tr:hover {
        background-color: #f9f9f9;
      }

      .empty-state {
        text-align: center;
        padding: 2rem;
        color: #666;
      }

      .error-message {
        padding: 0.75rem;
        background-color: #fee;
        border: 1px solid #fcc;
        border-radius: 4px;
        margin-bottom: 1rem;
        color: #c00;
        font-size: 0.875rem;
      }

      .success-message {
        padding: 0.75rem;
        background-color: #efe;
        border: 1px solid #cfc;
        border-radius: 4px;
        margin-bottom: 1rem;
        color: #060;
        font-size: 0.875rem;
      }

      .autocomplete-container {
        position: relative;
        flex: 1;
      }

      .autocomplete-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-top: none;
        max-height: 300px;
        overflow-y: auto;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
      }

      .autocomplete-item {
        padding: 0.75rem;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .autocomplete-item:hover {
        background-color: #f5f5f5;
      }

      .autocomplete-item-main {
        font-weight: 500;
      }

      .autocomplete-item-secondary {
        font-size: 0.875rem;
        color: #666;
      }

      .autocomplete-item-imei {
        font-family: monospace;
        font-size: 0.875rem;
        color: #999;
      }

      .autocomplete-empty {
        padding: 0.75rem;
        color: #666;
        text-align: center;
      }
    `
  ];

  @property({ attribute: true, type: Boolean })
  public show = false;

  @property({ attribute: false, type: Object })
  public group: FleetGroup | null = null;

  @state()
  private vehicles: Vehicle[] = [];

  @state()
  private isLoading: boolean = false;

  @state()
  private newVehicleImei: string = '';

  @state()
  private isAdding: boolean = false;

  @state()
  private removingImeis: Set<string> = new Set();

  @state()
  private errorMessage: string = '';

  @state()
  private successMessage: string = '';

  @state()
  private searchSuggestions: Vehicle[] = [];

  @state()
  private showSuggestions: boolean = false;

  @state()
  private isLoadingSuggestions: boolean = false;

  private apiService: ApiService;
  private searchDebounceTimer?: number;

  constructor() {
    super();
    this.apiService = ApiService.getInstance();
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);

    // Load vehicles when modal is opened
    if (changedProperties.has('show') && this.show && this.group) {
      this.loadVehicles();
    }

    // Clear messages when modal is closed
    if (changedProperties.has('show') && !this.show) {
      this.errorMessage = '';
      this.successMessage = '';
      this.newVehicleImei = '';
      this.showSuggestions = false;
      this.searchSuggestions = [];
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  render() {
    if (!this.show || !this.group) {
      return nothing;
    }

    return html`
      <div class="modal-overlay" @click=${this.closeModal}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>Manage Vehicles - ${this.group.name}</h3>
            <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
          </div>
          <div class="modal-body">
            ${this.errorMessage ? html`
              <div class="error-message">${this.errorMessage}</div>
            ` : nothing}

            ${this.successMessage ? html`
              <div class="success-message">${this.successMessage}</div>
            ` : nothing}

            <!-- Add Vehicle Section -->
            <div class="add-vehicle-section">
              <div class="autocomplete-container">
                <input
                  type="text"
                  placeholder="Search by VIN, IMEI, or Token ID"
                  .value=${this.newVehicleImei}
                  @input=${this.handleImeiInput}
                  @focus=${this.handleInputFocus}
                  @blur=${this.handleInputBlur}
                  ?disabled=${this.isAdding}
                  @keypress=${this.handleKeyPress}
                  style="width: 100%;"
                />
                ${this.showSuggestions ? html`
                  <div class="autocomplete-dropdown">
                    ${this.isLoadingSuggestions ? html`
                      <div class="autocomplete-empty">Loading suggestions...</div>
                    ` : this.searchSuggestions.length === 0 ? html`
                      <div class="autocomplete-empty">No vehicles found</div>
                    ` : this.searchSuggestions.map(vehicle => html`
                      <div
                        class="autocomplete-item"
                        @mousedown=${(e: Event) => this.handleSuggestionClick(vehicle, e)}
                      >
                        <div>
                          <div class="autocomplete-item-main">
                            ${vehicle.make} ${vehicle.model} ${vehicle.year}
                          </div>
                          <div class="autocomplete-item-secondary">
                            VIN: ${vehicle.vin}
                          </div>
                        </div>
                        <div class="autocomplete-item-imei">
                          ${vehicle.imei}
                        </div>
                      </div>
                    `)}
                  </div>
                ` : nothing}
              </div>
              <button
                class="btn btn-primary"
                @click=${this.handleAddVehicle}
                ?disabled=${this.isAdding || !this.newVehicleImei.trim()}
              >
                ${this.isAdding ? 'Adding...' : 'Add Vehicle'}
              </button>
            </div>

            <!-- Vehicles Table -->
            ${this.isLoading ? html`
              <div class="empty-state">Loading vehicles...</div>
            ` : this.vehicles.length === 0 ? html`
              <div class="empty-state">No vehicles in this group yet.</div>
            ` : html`
              <table class="vehicles-table">
                <thead>
                  <tr>
                    <th>IMEI</th>
                    <th>VIN</th>
                    <th>Vehicle</th>
                    <th style="width: 100px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.vehicles.map(vehicle => html`
                    <tr>
                      <td>${vehicle.imei}</td>
                      <td style="font-family: monospace; font-size: 0.9em;">${vehicle.vin}</td>
                      <td>${vehicle.make} ${vehicle.model} ${vehicle.year}</td>
                      <td>
                        <button
                          class="btn btn-sm btn-danger"
                          @click=${() => this.handleRemoveVehicle(vehicle.imei)}
                          ?disabled=${this.removingImeis.has(vehicle.imei)}
                        >
                          ${this.removingImeis.has(vehicle.imei) ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            `}
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-primary"
              @click=${this.closeModal}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private async loadVehicles() {
    if (!this.apiService || !this.group) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const url = `/fleet/vehicles?skip=0&take=1000&search=&filter=group:${this.group.id}`;

      const response = await this.apiService.callApi<FleetVehiclesResponse>(
        'GET',
        url,
        null,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success && response.data) {
        this.vehicles = response.data.items;
      } else {
        this.errorMessage = response.error || 'Failed to load vehicles';
      }
    } catch (error: any) {
      console.error('Error loading vehicles:', error);
      this.errorMessage = error.message || 'An unexpected error occurred';
    } finally {
      this.isLoading = false;
    }
  }

  private handleImeiInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.newVehicleImei = input.value;
    // Clear messages when user types
    this.errorMessage = '';
    this.successMessage = '';

    // Clear existing timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    const searchValue = input.value.trim();

    // Show suggestions if there's text
    if (searchValue.length > 0) {
      this.showSuggestions = true;
      // Set new timer for 300ms debounce
      this.searchDebounceTimer = window.setTimeout(() => {
        this.loadSearchSuggestions(searchValue);
      }, 400);
    } else {
      this.showSuggestions = false;
      this.searchSuggestions = [];
    }
  }

  private handleInputFocus() {
    // Show suggestions if there's already text in the input
    if (this.newVehicleImei.trim().length > 0) {
      this.showSuggestions = true;
    }
  }

  private handleInputBlur() {
    // Delay hiding to allow click events to register
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  private handleSuggestionClick(vehicle: Vehicle, e: Event) {
    e.preventDefault();
    // Set the IMEI value from the selected vehicle
    this.newVehicleImei = vehicle.imei;
    this.showSuggestions = false;
    this.searchSuggestions = [];
  }

  private async loadSearchSuggestions(searchText: string) {
    if (!this.apiService) return;

    this.isLoadingSuggestions = true;

    try {
      const url = `/fleet/vehicles?skip=0&take=10&search=${encodeURIComponent(searchText)}`;

      const response = await this.apiService.callApi<FleetVehiclesResponse>(
        'GET',
        url,
        null,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success && response.data) {
        this.searchSuggestions = response.data.items;
      } else {
        this.searchSuggestions = [];
      }
    } catch (error: any) {
      console.error('Error loading search suggestions:', error);
      this.searchSuggestions = [];
    } finally {
      this.isLoadingSuggestions = false;
    }
  }

  private handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter' && this.newVehicleImei.trim() && !this.isAdding) {
      this.handleAddVehicle();
    }
  }

  private async handleAddVehicle() {
    if (!this.apiService || !this.group || !this.newVehicleImei.trim()) return;

    this.isAdding = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const imei = this.newVehicleImei.trim();
      const response = await this.apiService.callApi<Vehicle>(
        'POST',
        `/fleet/vehicles/${imei}/group/${this.group.id}`,
        null,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success && response.data) {
        // Add the vehicle to the list
        this.vehicles = [...this.vehicles, response.data];
        this.newVehicleImei = '';
        this.successMessage = 'Vehicle added successfully';

        // Dispatch event to refresh parent view
        this.dispatchEvent(new CustomEvent('vehicles-updated', {
          bubbles: true,
          composed: true
        }));

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      } else {
        this.errorMessage = response.error || 'Failed to add vehicle';
      }
    } catch (error: any) {
      console.error('Error adding vehicle:', error);
      this.errorMessage = error.message || 'An unexpected error occurred';
    } finally {
      this.isAdding = false;
    }
  }

  private async handleRemoveVehicle(imei: string) {
    if (!this.apiService || !this.group) return;

    this.removingImeis.add(imei);
    this.errorMessage = '';
    this.successMessage = '';
    this.requestUpdate();

    try {
      const response = await this.apiService.callApi(
        'DELETE',
        `/fleet/vehicles/${imei}/group/${this.group.id}`,
        null,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success) {
        // Remove the vehicle from the list
        this.vehicles = this.vehicles.filter(v => v.imei !== imei);
        this.successMessage = 'Vehicle removed successfully';

        // Dispatch event to refresh parent view
        this.dispatchEvent(new CustomEvent('vehicles-updated', {
          bubbles: true,
          composed: true
        }));

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      } else {
        this.errorMessage = response.error || 'Failed to remove vehicle';
      }
    } catch (error: any) {
      console.error('Error removing vehicle:', error);
      this.errorMessage = error.message || 'An unexpected error occurred';
    } finally {
      this.removingImeis.delete(imei);
      this.requestUpdate();
    }
  }

  private closeModal() {
    this.show = false;

    this.dispatchEvent(new CustomEvent('modal-closed', {
      bubbles: true,
      composed: true
    }));
  }
}
