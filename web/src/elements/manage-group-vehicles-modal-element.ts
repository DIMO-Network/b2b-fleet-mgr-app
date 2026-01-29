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
  data: Vehicle[];
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

  private apiService: ApiService;

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
              <div style="flex: 1;">
                <input
                  type="text"
                  placeholder="Enter IMEI"
                  .value=${this.newVehicleImei}
                  @input=${this.handleImeiInput}
                  ?disabled=${this.isAdding}
                  @keypress=${this.handleKeyPress}
                  style="width: 100%;"
                />
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
        this.vehicles = response.data.data;
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
