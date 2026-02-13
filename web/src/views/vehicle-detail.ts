import {css, html, LitElement} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";
import {consume} from '@lit/context';
import {apiServiceContext} from '../context';
import {ApiService} from '@services/api-service.ts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import '../elements/update-inventory-modal-element';
import '../elements/fleet-map';

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
    isIgnitionOn: {
      value: boolean;
    };
    speed: {
      value: number;
    };
    powertrainFuelSystemRelativeLevel: {
      value: number;
    };
    powertrainTransmissionTravelledDistance: {
      value: number;
      timestamp: string;
    };
    powertrainCombustionEngineSpeed: {
      value: number;
    };
    lowVoltageBatteryCurrentVoltage: {
      value: number;
    };
    obdDTCList: {
      value: string[];
      timestamp: string;
    };
    obdDistanceWithMIL: {
      value: number;
    };
  };
}

interface TripSignal {
  name: string;
  agg: string;
  value: number;
}

interface Trip {
  start: {
    value: {
      latitude: number;
      longitude: number;
    };
    timestamp: string;
  };
  end: {
    value: {
      latitude: number;
      longitude: number;
    };
    timestamp: string;
  };
  isOngoing: boolean;
  signals: TripSignal[];
}

interface TripsResponse {
  segments: Trip[];
}

interface Group {
  id: string;
  name: string;
  color: string;
}

interface Command {
  id: string;
  command: string;
  status: string;
  created_at: string;
  kore_command_sid: string;
}

interface InventoryAudit {
  state: string;
  note: string;
  created_at: string;
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
  inventory: string;
  groups: Group[];
  commands: Command[];
  inventory_audit: InventoryAudit[];
}

@customElement('vehicle-detail-view')
export class VehicleDetailView extends LitElement {
  static styles = [globalStyles, css``];

  @property({ type: Number })
  tokenID: number = 0;

  @consume({ context: apiServiceContext, subscribe: true })
  @state()
  apiService?: ApiService;

  @state()
  private lastTelemetry: TelemetryInfo | null = null;

  @state()
  private vehicle: Vehicle | null = null;

  @state()
  private trips: Trip[] = [];

  @state()
  private activeActivityTab: 'trips' | 'commands' | 'inventory' = 'trips';

  @state()
  private showInventoryModal: boolean = false;

  @state()
  private currentAddress: string = '';

  telemetryQuery = `{
  signalsLatest(tokenId: 187955) {
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
    isIgnitionOn {
      value
    }
    speed {
      value
    }
    powertrainFuelSystemRelativeLevel {
      value
    }
    powertrainTransmissionTravelledDistance {
      value
      timestamp
    }
    powertrainCombustionEngineSpeed {
      value
    }
    lowVoltageBatteryCurrentVoltage {
      value
    }
    obdDTCList {
      value
      timestamp
    }
    obdDistanceWithMIL {
      value
    }
  }
}`

  tripsQuery = `{
  segments(
    tokenId: 189345
    from: "FROM_DATE"
    to: "TO_DATE"
    mechanism: frequencyAnalysis
    limit: 10
    config: { minIdleSeconds: 600, minSegmentDurationSeconds: 60 }
    signalRequests: [
      { name: "powertrainTransmissionTravelledDistance", agg: FIRST }
      { name: "powertrainTransmissionTravelledDistance", agg: LAST }
      { name: "speed", agg: AVG }
      { name: "speed", agg: MAX }
      { name: "powertrainCombustionEngineSpeed", agg: AVG }
      { name: "powertrainCombustionEngineSpeed", agg: MAX }
    ]
  ) {
    start { value {latitude  longitude} timestamp }
    end { value {latitude  longitude} timestamp }
    isOngoing
    signals { name agg value }
  }
}`

  async connectedCallback() {
    super.connectedCallback();
  }

  async updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('tokenID') || changedProperties.has('apiService')) {
      await this.loadVehicleData();
    }
  }

  private async loadVehicleData() {
    if (!this.apiService || !this.tokenID){
      console.error('API service or token ID is missing, cannot load vehicle data', this.tokenID);
      return;
    }

    try {
      // First, get vehicle info to obtain the token ID
      // Assuming there's an endpoint to get vehicle by VIN
      // You may need to adjust this based on your actual API
      const vehicleResponse = await this.apiService.callApi<Vehicle>(
        'GET',
        `/fleet/vehicles/${this.tokenID}`,
        null,
        true,
        true
      );

      if (vehicleResponse.success && vehicleResponse.data) {
        this.vehicle = vehicleResponse.data;
        // next let's load telemetry and trips
        await this.loadTelemetry(this.tokenID);
        await this.loadTrips(this.tokenID);
      }
    } catch (error) {
      console.error('Error loading vehicle data:', error);
    }
  }

  private async loadTelemetry(tokenId: number) {
    if (!this.apiService) return;

    try {
      const query = this.telemetryQuery.replace('187955', tokenId.toString());
      const response = await this.apiService.callApi<TelemetryInfo>(
        'POST',
        `/fleet/vehicles/telemetry/${tokenId}`,
        query,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success && response.data) {
        this.lastTelemetry = response.data;
      }
    } catch (error) {
      console.error('Error loading telemetry:', error);
    }
  }

  private async loadTrips(tokenId: number) {
    if (!this.apiService) return;

    try {
      // Get date range for last 30 days
      const toDate = dayjs().toISOString();
      const fromDate = dayjs().subtract(30, 'day').toISOString();

      const query = this.tripsQuery
        .replace('189345', tokenId.toString())
        .replace('FROM_DATE', fromDate)
        .replace('TO_DATE', toDate);

      const response = await this.apiService.callApi<TripsResponse>(
        'POST',
        `/fleet/vehicles/telemetry/${tokenId}`,
        query,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success && response.data) {
        this.trips = response.data.segments || [];
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    }
  }

  render() {
    return html`
      <!-- VEHICLE DETAIL PAGE -->
      <div class="page active" id="page-vehicle-detail">
        <div class="toolbar mb-16">
          <button class="btn" @click=${this.goBack}>← BACK TO VEHICLES</button>
        </div>

        <!-- Header Block -->
        <div class="panel mb-16">
          <div class="panel-body">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h2 style="font-size: 18px; margin-bottom: 8px;" id="detail-vehicle-name">${this.vehicle?.make} ${this.vehicle?.model} ${this.vehicle?.year}</h2>
                <div style="margin-bottom: 8px;">
                  <span style="color: #666;">VIN:</span> ${this.vehicle?.vin}
                </div>
                <div>
                  <span class="status status-connected">Connected</span>
                  <span class="status status-${(this.vehicle?.inventory || 'Inventory').toLowerCase()}"
                        style="cursor: pointer;"
                        @click=${this.openInventoryModal}
                        title="Click to update inventory status">${this.vehicle?.inventory || 'Inventory'}</span>
                  ${this.vehicle?.groups?.map(group => html`<span class="badge" style="background-color: ${group.color}; color: #fff;">${group.name}</span>`)}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="color: #666; font-size: 10px;">LAST TELEMETRY</div>
                <div>${this.lastTelemetry ? this.formatLastTelemetry(this.lastTelemetry.signalsLatest.currentLocationCoordinates.timestamp) : 'Loading...'}</div>
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
            <div id="vehicle-no-user" style="display: ${this.vehicle?.inventory === 'Inventory' ? 'block' : 'none'}; color: #666;">
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
                <fleet-map class="map-placeholder"
                    .lat="${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.latitude ?? 0.0}"
                    .lng="${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.longitude ?? 0.0}"
                    @address-updated=${this.handleAddressUpdated}>
                </fleet-map>
                <div class="mt-16">
                  <div class="detail-row">
                    <span class="detail-label">Latitude</span>
                    <span class="detail-value">${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.latitude ?? 0.0}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Longitude</span>
                    <span class="detail-value">${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.longitude ?? 0.0}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Address</span>
                    <span class="detail-value">${this.currentAddress || 'Click on map pointer to get address'}</span>
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
                    <div><span class="status ${(this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked.value ? 'status-blocked' : 'status-unblocked')}">
                      ${(this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked.value ? 'BLOCKED' : 'UNBLOCKED')}</span></div>
                    <div style="font-size: 10px; color: #666; margin-top: 8px;">Last update: ${this.formatLastTelemetry(this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked.timestamp) ?? 'N/A'}</div>
                  </div>
                  <div class="control-buttons">
                    <button class="btn btn-danger" onclick="confirmBlock()">BLOCK VEHICLE - TODO</button>
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
                  <span class="detail-value" style="color: ${this.lastTelemetry?.signalsLatest.isIgnitionOn != null ? (this.lastTelemetry.signalsLatest.isIgnitionOn.value ? 'green' : 'red') : '#666'};">${this.lastTelemetry?.signalsLatest.isIgnitionOn?.value != null ? (this.lastTelemetry.signalsLatest.isIgnitionOn.value ? 'ON' : 'OFF') : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Speed</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.speed != null ? `${this.lastTelemetry.signalsLatest.speed.value} km/h` : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Fuel Level</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.powertrainFuelSystemRelativeLevel != null ? `${Math.round(this.lastTelemetry.signalsLatest.powertrainFuelSystemRelativeLevel.value)}%` : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Odometer</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.powertrainTransmissionTravelledDistance != null ? `${this.lastTelemetry.signalsLatest.powertrainTransmissionTravelledDistance.value.toLocaleString()} km` : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">RPM</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.powertrainCombustionEngineSpeed != null ? this.lastTelemetry.signalsLatest.powertrainCombustionEngineSpeed.value : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Battery Voltage</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.lowVoltageBatteryCurrentVoltage != null ? `${this.lastTelemetry.signalsLatest.lowVoltageBatteryCurrentVoltage.value.toFixed(1)}V` : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Active DTCs</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.obdDTCList != null ? (this.lastTelemetry.signalsLatest.obdDTCList.value.length > 0 ? this.lastTelemetry.signalsLatest.obdDTCList.value.join(', ') : 'None') : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Last CAN Update</span>
                  <span class="detail-value">${this.formatLastTelemetry(this.lastTelemetry?.signalsLatest.powertrainTransmissionTravelledDistance?.timestamp)}</span>
                </div>
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="panel">
              <div class="panel-header">Recent Activity</div>
              <div class="inner-tabs" style="margin: 0; border-bottom: 1px solid #ddd;">
                <div
                  class="inner-tab ${this.activeActivityTab === 'trips' ? 'active' : ''}"
                  @click=${() => this.activeActivityTab = 'trips'}
                >Trips</div>
                <div
                  class="inner-tab ${this.activeActivityTab === 'commands' ? 'active' : ''}"
                  @click=${() => this.activeActivityTab = 'commands'}
                >Commands</div>
                <div
                  class="inner-tab ${this.activeActivityTab === 'inventory' ? 'active' : ''}"
                  @click=${() => this.activeActivityTab = 'inventory'}
                >Inventory</div>
              </div>

              <!-- Trips Tab -->
              <div class="panel-body" style="padding: 0; display: ${this.activeActivityTab === 'trips' ? 'block' : 'none'};">
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
                  ${this.trips && this.trips.length > 0 ? this.trips.map(trip => {
                    const distance = this.calculateTripDistance(trip);
                    const avgSpeed = this.getTripSignalValue(trip, 'speed', 'AVG');
                    const maxSpeed = this.getTripSignalValue(trip, 'speed', 'MAX');
                    return html`
                      <tr>
                        <td>${this.formatTripTime(trip.start.timestamp)}</td>
                        <td>${trip.isOngoing ? 'Ongoing' : this.formatTripTime(trip.end.timestamp)}</td>
                        <td>${distance.toFixed(1)} km</td>
                        <td>${avgSpeed != null ? Math.round(avgSpeed) : 'N/A'} / ${maxSpeed != null ? Math.round(maxSpeed) : 'N/A'} km/h</td>
                      </tr>
                    `;
                  }) : html`
                    <tr>
                      <td colspan="4" style="text-align: center; color: #666; padding: 2rem;">No trip history available</td>
                    </tr>
                  `}
                  </tbody>
                </table>
              </div>

              <!-- Commands Tab -->
              <div class="panel-body" style="padding: 0; display: ${this.activeActivityTab === 'commands' ? 'block' : 'none'};">
                <table>
                  <thead>
                  <tr>
                    <th>Command</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Command ID</th>
                  </tr>
                  </thead>
                  <tbody>
                  ${this.vehicle?.commands && this.vehicle.commands.length > 0 ? this.vehicle.commands.map(cmd => html`
                    <tr>
                      <td>${cmd.command.toUpperCase()}</td>
                      <td><span class="status status-${cmd.status.toLowerCase()}">${cmd.status}</span></td>
                      <td>${this.formatLastTelemetry(cmd.created_at)}</td>
                      <td style="font-size: 11px;">${cmd.kore_command_sid}</td>
                    </tr>
                  `) : html`
                    <tr>
                      <td colspan="4" style="text-align: center; color: #666; padding: 2rem;">No command history available</td>
                    </tr>
                  `}
                  </tbody>
                </table>
              </div>

              <!-- Inventory Tab -->
              <div class="panel-body" style="padding: 0; display: ${this.activeActivityTab === 'inventory' ? 'block' : 'none'};">
                <table>
                  <thead>
                  <tr>
                    <th>State</th>
                    <th>Note</th>
                    <th>Created</th>
                  </tr>
                  </thead>
                  <tbody>
                  ${this.vehicle?.inventory_audit && this.vehicle.inventory_audit.length > 0 ? this.vehicle.inventory_audit.map(audit => html`
                    <tr>
                      <td><span class="status status-${audit.state.toLowerCase()}">${audit.state}</span></td>
                      <td>${audit.note}</td>
                      <td>${this.formatLastTelemetry(audit.created_at)}</td>
                    </tr>
                  `) : html`
                    <tr>
                      <td colspan="3" style="text-align: center; color: #666; padding: 2rem;">No inventory history available</td>
                    </tr>
                  `}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Update Inventory Modal -->
      <update-inventory-modal-element
        .show=${this.showInventoryModal}
        .imei=${this.vehicle?.imei || ''}
        @modal-closed=${this.handleInventoryModalClosed}
        @inventory-updated=${this.handleInventoryUpdated}
      ></update-inventory-modal-element>
    `;
  }

  private openInventoryModal() {
    this.showInventoryModal = true;
  }

  private handleInventoryModalClosed() {
    this.showInventoryModal = false;
  }

  private async handleInventoryUpdated(event: CustomEvent) {
    this.showInventoryModal = false;
    console.log('Inventory updated:', event.detail);

    // Reload vehicle data to get updated inventory status
    await this.loadVehicleData();
  }

  private handleAddressUpdated(event: CustomEvent) {
    this.currentAddress = event.detail.address;
  }

  private goBack() {
    location.hash = '/vehicles-fleets';
  }

  private formatLastTelemetry(timestamp: string | undefined): string {
    if (timestamp === undefined) {
      return '-'
    }
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

  private formatTripTime(timestamp: string): string {
    return dayjs(timestamp).format('MMM D, HH:mm');
  }

  private getTripSignalValue(trip: Trip, signalName: string, agg: string): number | null {
    const signal = trip.signals.find(s => s.name === signalName && s.agg === agg);
    return signal ? signal.value : null;
  }

  private calculateTripDistance(trip: Trip): number {
    const first = this.getTripSignalValue(trip, 'powertrainTransmissionTravelledDistance', 'FIRST');
    const last = this.getTripSignalValue(trip, 'powertrainTransmissionTravelledDistance', 'LAST');
    if (first != null && last != null) {
      return last - first;
    }
    return 0;
  }
}
