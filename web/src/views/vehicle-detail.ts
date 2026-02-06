import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { globalStyles } from "../global-styles.ts";
import { consume } from '@lit/context';
import { apiServiceContext } from '../context';
import { ApiService } from '@services/api-service.ts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

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

interface Vehicle {
  vin: string;
  vehicle_token_id: number;
  make: string;
  model: string;
  year: number;
}

@customElement('vehicle-detail-view')
export class VehicleDetailView extends LitElement {
  static styles = [globalStyles, css``];

  @property({ type: String })
  vin: string = '';

  @consume({ context: apiServiceContext, subscribe: true })
  @state()
  apiService?: ApiService;

  @state()
  private lastTelemetry: string = '';

  @state()
  private vehicle: Vehicle | null = null;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadVehicleData();
  }

  async updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    // Reload if VIN changes
    if (changedProperties.has('vin') && this.vin) {
      await this.loadVehicleData();
    }
  }

  private async loadVehicleData() {
    if (!this.apiService || !this.vin) return;

    try {
      // First, get vehicle info to obtain the token ID
      // Assuming there's an endpoint to get vehicle by VIN
      // You may need to adjust this based on your actual API
      const vehicleResponse = await this.apiService.callApi<Vehicle>(
        'GET',
        `/identity/vehicle/vin/${this.vin}`,
        null,
        true, // auth required
        false  // not oracle endpoint
      );

      if (vehicleResponse.success && vehicleResponse.data) {
        this.vehicle = vehicleResponse.data;

        // Load telemetry if we have a token ID
        if (this.vehicle.vehicle_token_id) {
          await this.loadTelemetry(this.vehicle.vehicle_token_id);
        }
      }
    } catch (error) {
      console.error('Error loading vehicle data:', error);
    }
  }

  private async loadTelemetry(tokenId: number) {
    if (!this.apiService) return;

    try {
      const response = await this.apiService.callApi<TelemetryInfo>(
        'GET',
        `/fleet/vehicles/telemetry-info/${tokenId}`,
        null,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success && response.data) {
        const telemetryData = response.data;
        // Extract last telemetry timestamp from currentLocationCoordinates
        this.lastTelemetry = telemetryData.signalsLatest?.currentLocationCoordinates?.timestamp || '';
      }
    } catch (error) {
      console.error('Error loading telemetry:', error);
    }
  }

  render() {
    return html`
      <!-- VEHICLE DETAIL PAGE -->
      <div class="page active" id="page-vehicle-detail">
        <div class="toolbar mb-16">
          <button class="btn" @click=${this.goBack}">← BACK TO VEHICLES</button>
        </div>

        <!-- Header Block -->
        <div class="panel mb-16">
          <div class="panel-body">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h2 style="font-size: 18px; margin-bottom: 8px;" id="detail-vehicle-name">JEEP COMPASS 2021</h2>
                <div style="margin-bottom: 8px;">
                  <span style="color: #666;">VIN:</span> ${this.vin}
                </div>
                <div>
                  <span class="status status-connected">Connected</span>
                  <span class="status status-customer">Customer Owned</span>
                  <span class="badge">Fleet A</span>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="color: #666; font-size: 10px;">LAST TELEMETRY</div>
                <div title="${this.lastTelemetry}">${this.lastTelemetry ? this.formatLastTelemetry(this.lastTelemetry) : 'Loading...'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- User Information Panel -->
        <div class="panel mb-16" id="vehicle-user-panel">
          <div class="panel-header">Owner Information</div>
          <div class="panel-body">
            <div id="vehicle-user-info">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
                <div>
                  <div class="detail-row">
                    <span class="detail-label">Owner Email</span>
                    <span class="detail-value">maria.gonzalez@kaufmann.cl</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Phone</span>
                    <span class="detail-value">+56 9 1234 5678</span>
                  </div>
                </div>
                <div>
                  <div class="detail-row">
                    <span class="detail-label">Wallet</span>
                    <span class="detail-value" style="font-size: 11px;">0x7a23...4f8b</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">User Created</span>
                    <span class="detail-value">2024-03-15</span>
                  </div>
                </div>
                <div style="text-align: right;">
                  <button class="btn btn-sm" onclick="viewUserFromVehicle('maria.gonzalez@kaufmann.cl')">VIEW USER PROFILE →</button>
                </div>
              </div>
            </div>
            <!-- Inventory vehicle state (hidden by default) -->
            <div id="vehicle-no-user" style="display: none; color: #666;">
              No user assigned — vehicle is in inventory.
            </div>
          </div>
        </div>

        <div class="detail-grid">
          <!-- Left Column -->
          <div>
            <!-- Location -->
            <div class="panel mb-16">
              <div class="panel-header">Location</div>
              <div class="panel-body">
                <div class="map-placeholder">[MAP EMBED]</div>
                <div class="mt-16">
                  <div class="detail-row">
                    <span class="detail-label">Latitude</span>
                    <span class="detail-value">-33.4489</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Longitude</span>
                    <span class="detail-value">-70.6693</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Address</span>
                    <span class="detail-value">Av. Libertador Bernardo O'Higgins 1449, Santiago, Chile</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Vehicle Controls -->
            <div class="panel">
              <div class="panel-header">Vehicle Controls</div>
              <div class="panel-body">
                <div class="controls-section">
                  <div class="control-status">
                    <div style="font-size: 10px; color: #666; margin-bottom: 4px;">ENGINE STATUS</div>
                    <div><span class="status status-unblocked">UNBLOCKED</span></div>
                    <div style="font-size: 10px; color: #666; margin-top: 8px;">Last action: Unblocked on 2025-11-28 14:30</div>
                  </div>
                  <div class="control-buttons">
                    <button class="btn btn-danger" onclick="confirmBlock()">BLOCK VEHICLE</button>
                    <button class="btn" disabled>UNBLOCK VEHICLE</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column -->
          <div>
            <!-- CAN / Telemetry -->
            <div class="panel mb-16">
              <div class="panel-header">CAN / Telemetry Snapshot</div>
              <div class="panel-body">
                <div class="detail-row">
                  <span class="detail-label">Ignition</span>
                  <span class="detail-value" style="color: green;">ON</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Speed</span>
                  <span class="detail-value">0 km/h</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Fuel Level</span>
                  <span class="detail-value">72%</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Odometer</span>
                  <span class="detail-value">34,521 km</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">RPM</span>
                  <span class="detail-value">850</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Battery Voltage</span>
                  <span class="detail-value">12.8V</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Active DTCs</span>
                  <span class="detail-value">None</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Last CAN Update</span>
                  <span class="detail-value">2025-12-05 12:34:56</span>
                </div>
              </div>
            </div>

            <!-- Recent Trips -->
            <div class="panel">
              <div class="panel-header">Recent Activity</div>
              <div class="panel-body" style="padding: 0;">
                <table>
                  <thead>
                  <tr>
                    <th>Start</th>
                    <th>End</th>
                    <th>Distance</th>
                    <th>Avg/Max Speed</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td>Dec 5, 08:15</td>
                    <td>Dec 5, 09:42</td>
                    <td>28.4 km</td>
                    <td>32 / 78 km/h</td>
                  </tr>
                  <tr>
                    <td>Dec 4, 17:30</td>
                    <td>Dec 4, 18:15</td>
                    <td>15.2 km</td>
                    <td>28 / 65 km/h</td>
                  </tr>
                  <tr>
                    <td>Dec 4, 12:00</td>
                    <td>Dec 4, 12:45</td>
                    <td>8.7 km</td>
                    <td>22 / 55 km/h</td>
                  </tr>
                  <tr>
                    <td>Dec 4, 08:00</td>
                    <td>Dec 4, 09:30</td>
                    <td>31.2 km</td>
                    <td>35 / 82 km/h</td>
                  </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private goBack() {
    location.hash = '/vehicles-fleets';
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
}
