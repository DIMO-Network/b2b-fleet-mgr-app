import {css, html, LitElement} from 'lit';
import {msg} from '@lit/localize';
import {customElement, property, state} from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";
import {consume} from '@lit/context';
import {apiServiceContext} from '../context';
import {ApiService} from '@services/api-service.ts';
import {
  DeviceDefinitionDetail,
  IdentityService,
  VehicleIdentityData,
} from '@services/identity-service.ts';
import {OracleTenantService} from '@services/oracle-tenant-service.ts';
import {SettingsService} from '@services/settings-service.ts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import '../elements/update-inventory-modal-element';
import '../elements/fleet-map';
import '../elements/click-to-copy-element';
import '../elements/share-vehicle-modal-element';
import '../elements/edit-device-definition-modal-element';

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
      value: number | null;
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
    powertrainFuelSystemAbsoluteLevel?: {
      value: number | null;
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
      value: string[] | string | null | undefined;
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

interface UserProfileInfo {
  wallet: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  business_name?: string;
  government_id_type?: string;
  government_id_number?: string;
  created_at?: string;
  updated_at?: string;
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
  vendor_data?: Record<string, string>;
  license_plate?: string;
}

@customElement('vehicle-detail-view')
export class VehicleDetailView extends LitElement {
  private static readonly LITERS_PER_GALLON = 3.78541;

  static styles = [globalStyles, css`
    .license-plate {
      display: inline-block;
      background: #e9ecef;
      border: 1px solid #ced4da;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      margin-left: 12px;
      vertical-align: middle;
    }
  `];

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
  private vehicleIdentity: VehicleIdentityData | null = null;

  @state()
  private fuelTankCapacity: number | null = null;

  @state()
  private trips: Trip[] = [];

  @state()
  private ownerInfo: UserProfileInfo | null = null;
  
  @state()
  private ownerWalletAddress: string | null = null;

  @state()
  private ownerProfileMissing: boolean = false;

  @state()
  private selectedWeekIndex: number = 0;

  @state()
  private selectedTrip: Trip | null = null;

  @state()
  private tripRoutePoints: Array<[number, number]> = [];

  @state()
  private activeActivityTab: 'trips' | 'commands' | 'inventory' = 'trips';

  @state()
  private showInventoryModal: boolean = false;

  @state()
  private showShareModal: boolean = false;

  @state()
  private showEditDefinitionModal: boolean = false;

  @state()
  private editingPlate: boolean = false;

  @state()
  private editPlateValue: string = '';

  @state()
  private savingPlate: boolean = false;

  @state()
  private errorMessage: string = '';

  @state()
  private successMessage: string = '';

  @state()
  private syncingApimaz: boolean = false;

  @state()
  private currentAddress: string = '';

  @state()
  private immobilizerLoading: boolean = false;

  @state()
  private immobilizerError: string = '';

  @state()
  private showImmobilizerConfirm: boolean = false;

  @state()
  private immobilizerAction: 'on' | 'off' = 'on';

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
    powertrainFuelSystemAbsoluteLevel {
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
}`;

  tripsQuery = `{
  segments(
    tokenId: 189345
    from: "FROM_DATE"
    to: "TO_DATE"
    mechanism: TRIP_MECHANISM
    limit: 10
    config: { minSegmentDurationSeconds: 240 }
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
}`;

  async connectedCallback() {
    super.connectedCallback();
  }

  async updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('tokenID') || changedProperties.has('apiService')) {
      await this.loadVehicleData();
    }
  }

  private async loadVehicleData(): Promise<[Vehicle | null, string | null]> {
    this.errorMessage = '';
    this.vehicle = null;
    this.vehicleIdentity = null;
    this.fuelTankCapacity = null;
    this.lastTelemetry = null;
    this.trips = [];
    this.ownerInfo = null;
    this.ownerWalletAddress = null;
    if (!this.apiService || !this.tokenID) {
      const error = 'API service or token ID is missing';
      console.error(error, this.tokenID);
      this.errorMessage = error;
      return [null, error];
    }

    const [vehicle, vehicleError] = await this.loadVehicle(this.tokenID);
    if (!vehicle) {
      this.vehicle = null;
      this.errorMessage = vehicleError || msg('Failed to load vehicle data');
      return [null, this.errorMessage];
    }

    const [[telemetry, telemetryError], [vehicleIdentity, identityError]] = await Promise.all([
      this.loadTelemetry(this.tokenID),
      this.loadVehicleIdentity(this.tokenID)
    ]);

    this.vehicle = vehicle;
    this.vehicleIdentity = vehicleIdentity;
    this.lastTelemetry = telemetry;
    this.fuelTankCapacity = await this.loadFuelTankCapacity(vehicle, vehicleIdentity);

    const errors = [vehicleError, telemetryError, identityError].filter((err): err is string => !!err);
    this.errorMessage = errors.length > 0 ? errors.join(' | ') : '';

    // Continue loading auxiliary sections even if telemetry/identity are unavailable.
    await this.loadTrips(this.tokenID);
    await this.loadOwnerInfo(this.tokenID);

    return [this.vehicle, this.errorMessage || null];
  }

  private async loadVehicle(tokenId: number): Promise<[Vehicle | null, string | null]> {
    if (!this.apiService) return [null, 'API service is missing'];

    try {
      const vehicleResponse = await this.apiService.callApi<Vehicle>(
        'GET',
        `/fleet/vehicles/${tokenId}`,
        null,
        true,
        true
      );

      if (!vehicleResponse.success || !vehicleResponse.data) {
        return [null, vehicleResponse.error || msg('Failed to load vehicle data')];
      }

      return [vehicleResponse.data, null];
    } catch (error: any) {
      console.error('Error loading vehicle data:', error);
      return [null, error.message || 'Error loading vehicle data'];
    }
  }

  private async loadTelemetry(tokenId: number): Promise<[TelemetryInfo | null, string | null]> {
    if (!this.apiService) return [null, 'API service is missing'];

    try {
      const query = this.telemetryQuery.replace('187955', tokenId.toString());
      const response = await this.apiService.callApi<TelemetryInfo>(
        'POST',
        `/fleet/vehicles/telemetry/${tokenId}`,
        query,
        true, // auth required
        true  // oracle endpoint
      );

      if (!response.success || !response.data) {
        return [null, response.error || msg('Failed to load telemetry')];
      }

      return [response.data, null];
    } catch (error: any) {
      console.error('Error loading telemetry:', error);
      return [null, error.message || 'Error loading telemetry'];
    }
  }

  private async loadVehicleIdentity(tokenId: number): Promise<[VehicleIdentityData | null, string | null]> {
    try {
      const identityService = IdentityService.getInstance();
      const identityData = await identityService.getVehicleIdentity(tokenId);
      if (!identityData) {
        return [null, msg('Failed to load vehicle identity')];
      }
      return [identityData, null];
    } catch (error: any) {
      console.error('Error loading vehicle identity:', error);
      return [null, error.message || 'Error loading vehicle identity'];
    }
  }

  private async loadFuelTankCapacity(
    vehicle: Vehicle,
    vehicleIdentity: VehicleIdentityData | null
  ): Promise<number | null> {
    try {
      const identityService = IdentityService.getInstance();
      const tokenDID = vehicleIdentity?.vehicle?.tokenDID?.trim() || '';
      const deviceDefinitionId =
        vehicle.device_definition_id?.trim() || vehicleIdentity?.vehicle?.definition?.id?.trim() || '';

      const [latestCloudEvent, identityDefinition] = await Promise.all([
        tokenDID ? identityService.getLatestDeviceDefinitionCloudEvent(tokenDID) : Promise.resolve(null),
        deviceDefinitionId ? identityService.getDeviceDefinitionById(deviceDefinitionId) : Promise.resolve(null),
      ]);

      return (
        this.getFuelTankCapacityFromDefinition(latestCloudEvent?.data) ??
        this.getFuelTankCapacityFromDefinition(identityDefinition)
      );
    } catch (error) {
      console.error('Error loading fuel tank capacity:', error);
      return null;
    }
  }

  private getFuelTankCapacityFromDefinition(definition: DeviceDefinitionDetail | null | undefined): number | null {
    const fuelTankCapacityAttribute = definition?.attributes?.find((attribute) =>
      this.isFuelTankCapacityAttribute(attribute.name)
    );

    return this.parseFuelTankCapacity(fuelTankCapacityAttribute?.value);
  }

  private isFuelTankCapacityAttribute(attributeName?: string): boolean {
    const normalizedName = (attributeName || '').replace(/[_-\s]/g, '').toLowerCase();
    return normalizedName === 'fueltankcapacitygal';
  }

  private parseFuelTankCapacity(value?: string | null): number | null {
    if (value == null) {
      return null;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return null;
    }

    return parsedValue;
  }

  private getFuelLevelDisplay(): string {
    const relativeFuelLevel = this.lastTelemetry?.signalsLatest.powertrainFuelSystemRelativeLevel?.value;
    if (relativeFuelLevel != null && Number.isFinite(relativeFuelLevel)) {
      return `${Math.round(relativeFuelLevel)}%`;
    }

    const absoluteFuelLevel = this.lastTelemetry?.signalsLatest.powertrainFuelSystemAbsoluteLevel?.value;
    if (absoluteFuelLevel == null || !Number.isFinite(absoluteFuelLevel) || absoluteFuelLevel < 0) {
      return 'N/A';
    }

    if (this.fuelTankCapacity == null || this.fuelTankCapacity <= 0) {
      return 'N/A';
    }

    const fuelTankCapacityLiters = this.fuelTankCapacity * VehicleDetailView.LITERS_PER_GALLON;
    if (!Number.isFinite(fuelTankCapacityLiters) || fuelTankCapacityLiters <= 0) {
      return 'N/A';
    }

    const fuelLevelPercentage = (absoluteFuelLevel / fuelTankCapacityLiters) * 100;
    const clampedFuelLevelPercentage = Math.min(100, Math.max(0, fuelLevelPercentage));

    return `${Math.round(clampedFuelLevelPercentage)}%`;
  }

  private getWeekIntervals(): { label: string; from: string; to: string }[] {
    const intervals = [];
    for (let i = 0; i < 6; i++) {
      const to = dayjs().subtract(i * 14, 'day');
      const from = to.subtract(14, 'day');
      const label = i === 0
        ? msg('Last 2 weeks')
        : `${from.format('MMM D')} – ${to.format('MMM D')}`;
      intervals.push({ label, from: from.toISOString(), to: to.toISOString() });
    }
    return intervals;
  }

  private async loadTrips(tokenId: number) {
    if (!this.apiService) return;

    try {
      const intervals = this.getWeekIntervals();
      const selected = intervals[this.selectedWeekIndex];
      const fromDate = selected.from;
      const toDate = selected.to;

      const mechanism = this.vehicleIdentity?.vehicle?.aftermarketDevice
        ? 'frequencyAnalysis'
        : 'ignitionDetection';

      const query = this.tripsQuery
        .replace('189345', tokenId.toString())
        .replace('FROM_DATE', fromDate)
        .replace('TO_DATE', toDate)
        .replace('TRIP_MECHANISM', mechanism);

      const response = await this.apiService.callApi<TripsResponse>(
        'POST',
        `/fleet/vehicles/telemetry/${tokenId}`,
        query,
        true, // auth required
        true  // oracle endpoint
      );

      if (response.success && response.data) {
        const segments = response.data.segments || [];
        this.trips = segments.sort((a, b) =>
          new Date(b.start.timestamp).getTime() - new Date(a.start.timestamp).getTime()
        );
      } else {
        this.errorMessage = this.appendError(this.errorMessage, response.error || msg('Failed to load trips'));
      }
    } catch (error: any) {
      console.error('Error loading trips:', error);
      this.errorMessage = this.appendError(this.errorMessage, error.message || 'Error loading trips');
    }
  }

  private async loadOwnerInfo(_tokenId: number) {
    try {
      // Reuse owner from the already-fetched identity data instead of calling identity-api again
      const ownerAddress = this.vehicleIdentity?.vehicle?.owner;

      if (!ownerAddress) {
        this.ownerInfo = null;
        return;
      }

      this.ownerWalletAddress = ownerAddress;

      // Load user profile from kaufmann-oracle backend
      if (this.apiService) {
        const response = await this.apiService.callApi<UserProfileInfo>(
          'GET',
          `/user-profiles/${ownerAddress}`,
          null,
          true,
          true
        );

        if (response.success && response.data) {
          this.ownerInfo = response.data;
          this.ownerProfileMissing = false;
        } else if (response.status === 404) {
          this.ownerInfo = null;
          this.ownerProfileMissing = true;
        }
      }
    } catch (error) {
      console.error('Error loading owner info:', error);
      const message = error instanceof Error ? error.message : 'Error loading owner info';
      this.errorMessage = this.appendError(this.errorMessage, message);
    }
  }

  private appendError(currentError: string, nextError: string | null | undefined): string {
    if (!nextError) return currentError;
    if (!currentError) return nextError;
    return `${currentError} | ${nextError}`;
  }

  render() {
    return html`
      <!-- VEHICLE DETAIL PAGE -->
      <div class="page active" id="page-vehicle-detail">
        ${this.errorMessage ? (this.errorMessage.includes('403')
          ? html`<div class="alert alert-error" style="display: flex; flex-direction: column; gap: 8px;">
              <span>${msg('Permissions have expired for this vehicle. Please re-share to restore access.')}</span>
              <a href=${this.buildShareUrl()} target="_blank" rel="noopener"
                 class="btn btn-sm btn-primary" style="align-self: flex-start; text-decoration: none;">
                ${msg('Re-share Permissions')}
              </a>
            </div>`
          : html`<div class="alert alert-error">${this.errorMessage}</div>`) : ''}
        ${this.successMessage ? html`<div class="alert alert-success">${this.successMessage}</div>` : ''}
        <div class="toolbar mb-16">
          <button class="btn" @click=${this.goBack}>${msg('← BACK TO VEHICLES')}</button>
        </div>

        <!-- Header Block -->
        <div class="panel mb-16">
          <div class="panel-body">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h2 style="font-size: 18px; margin-bottom: 8px;" id="detail-vehicle-name">${this.vehicle?.make} ${this.vehicle?.model} ${this.vehicle?.year}${this.editingPlate ? html`
                  <span style="margin-left:12px;vertical-align:middle;">
                    <input type="text"
                      style="padding:2px 8px;font-size:12px;font-weight:600;letter-spacing:1px;border:1px solid #0066cc;border-radius:4px;width:100px;font-family:inherit;"
                      .value=${this.editPlateValue}
                      @input=${(e: Event) => { this.editPlateValue = (e.target as HTMLInputElement).value.toUpperCase(); }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.saveLicensePlate(); if (e.key === 'Escape') this.editingPlate = false; }}
                    />
                    <button class="btn btn-sm" style="margin-left:4px;padding:2px 8px;" @click=${this.saveLicensePlate} ?disabled=${this.savingPlate}>${this.savingPlate ? '...' : msg('Save')}</button>
                    <button class="btn btn-sm" style="padding:2px 8px;" @click=${() => { this.editingPlate = false; }}>${msg('Cancel')}</button>
                  </span>
                ` : html`
                  <span class="license-plate" style="cursor:pointer;" title="${msg('Click to edit')}"
                    @click=${() => { this.editPlateValue = this.vehicle?.license_plate || ''; this.editingPlate = true; }}>
                    ${this.vehicle?.license_plate || msg('+ Plate')}
                  </span>
                  <button class="btn btn-sm" style="margin-left:12px;vertical-align:middle;" @click=${this.openEditDefinitionModal}>
                    ${msg('UPDATE')}
                  </button>
                `}</h2>
                <div style="margin-bottom: 8px;">
                  <span style="color: #666;">${msg('VIN:')}</span> ${this.vehicle?.vin}
                  <span style="color: #666; margin-left: 16px;">${msg('Minted At:')}</span> ${this.formatMintedAt(this.vehicleIdentity?.vehicle?.mintedAt)}
                </div>
                <div>
                  <span class="status status-connected">${msg('Connected')}</span>
                  <span class="status status-${(this.vehicle?.inventory || 'Inventory').toLowerCase()}"
                        style="cursor: pointer;"
                        @click=${this.openInventoryModal}
                        title="${msg('Click to update inventory status')}">${this.vehicle?.inventory || msg('Inventory')}</span>
                  ${this.vehicle?.groups?.map(group => html`<span class="badge" style="background-color: ${group.color}; color: #fff;">${group.name}</span>`)}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="color: #666; font-size: 10px;">${msg('LAST TELEMETRY')}</div>
                <div>${this.lastTelemetry ? this.formatLastTelemetry(this.lastTelemetry.signalsLatest.currentLocationCoordinates.timestamp) : msg('Loading...')}</div>
                <div style="color: #666; font-size: 10px; margin-top: 12px;">${msg('HARDWARE')}</div>
                <div>${this.renderHardwareDetails()}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Vendor Data Panel -->
        ${this.vehicle?.vendor_data && Object.keys(this.vehicle.vendor_data).length > 0 || this.isKaufmannTenant() ? html`
        <div class="panel mb-16">
          <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;">
            <span>${msg('Vendor Information')}</span>
            ${this.isKaufmannTenant() ? html`
              <button class="btn btn-sm ${this.syncingApimaz ? 'processing' : ''}"
                      @click=${this.syncApimaz}
                      ?disabled=${this.syncingApimaz || !this.vehicle?.vin}>
                ${this.syncingApimaz ? msg('Syncing...') : msg('Synchronize')}
              </button>
            ` : ''}
          </div>
          <div class="panel-body">
            ${this.vehicle?.vendor_data && Object.keys(this.vehicle.vendor_data).length > 0
              ? Object.entries(this.vehicle.vendor_data).map(([key, value]) => html`
                <div class="detail-row">
                  <span class="detail-label">${this.formatVendorLabel(key)}</span>
                  <span class="detail-value">${value || msg('N/A')}</span>
                </div>
              `)
              : html`<div style="color:#666;">${msg('No vendor data available. Click Synchronize to fetch.')}</div>`
            }
          </div>
        </div>
        ` : ''}

        <!-- User Information Panel -->
        <div class="panel mb-16" id="vehicle-user-panel">
          <div class="panel-header">${msg('Owner Information')}</div>
          <div class="panel-body">
            ${this.ownerInfo ? html`
              <div id="vehicle-user-info">
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
                  <div>
                    <div class="detail-row">
                      <span class="detail-label">${msg('Name')}</span>
                      <span class="detail-value">${[this.ownerInfo.first_name, this.ownerInfo.last_name].filter(Boolean).join(' ') || msg('Not available')}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">${msg('Email')}</span>
                      <span class="detail-value">${this.ownerInfo.email || msg('Not available')}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">${msg('Phone')}</span>
                      <span class="detail-value">${this.ownerInfo.phone || msg('Not available')}</span>
                    </div>
                  </div>
                  <div>
                    <div class="detail-row">
                      <span class="detail-label">${msg('Wallet')}</span>
                      <click-to-copy-element .valueToCopy="${this.ownerWalletAddress || ''}">
                        <span
                          class="detail-value clickable"
                          style="font-size: 11px;"
                        >
                          ${this.ownerWalletAddress ? this.formatWalletAddress(this.ownerWalletAddress) : 'N/A'}
                        </span>
                      </click-to-copy-element>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">${msg('Business')}</span>
                      <span class="detail-value">${this.ownerInfo.business_name || msg('Not available')}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">${msg('User Created')}</span>
                      <span class="detail-value">${this.ownerInfo.created_at ? this.formatCreatedDate(this.ownerInfo.created_at) : msg('Not available')}</span>
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <button class="btn btn-sm" @click=${this.viewUserProfile}>${msg('VIEW USER PROFILE →')}</button>
                  </div>
                </div>
              </div>
            ` : this.ownerProfileMissing && this.ownerWalletAddress ? html`
              <!-- Owner wallet found but no profile in DB -->
              <div id="vehicle-user-info">
                <div class="detail-row">
                  <span class="detail-label">${msg('Wallet')}</span>
                  <click-to-copy-element .valueToCopy="${this.ownerWalletAddress}">
                    <span class="detail-value clickable" style="font-size: 11px;">
                      ${this.formatWalletAddress(this.ownerWalletAddress)}
                    </span>
                  </click-to-copy-element>
                </div>
                <div style="color: #666; margin-top: 8px; margin-bottom: 12px;">
                  ${msg('No additional user profile information found.')}
                </div>
                <button class="btn btn-success btn-sm" @click=${this.addUserProfile}>${msg('+ ADD PROFILE INFO')}</button>
              </div>
            ` : html`
              <!-- Inventory vehicle state (no owner) -->
              <div id="vehicle-no-user" style="color: #666;">
                ${this.vehicle?.inventory === 'Inventory' ? msg('No user assigned — vehicle is in inventory.') : msg('Loading owner information...')}
              </div>
            `}
          </div>
        </div>

        <div class="detail-grid">
          <!-- Left Column -->
          <div>
            <!-- Location -->
            <div class="panel mb-16">
              <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;">
                <span>${msg('Location')} ${this.selectedTrip ? html`<span style="color:#0066cc;font-size:11px;font-weight:400;"> — ${msg('Viewing Trip')}</span>` : ''}</span>
                <div style="display:flex;gap:8px;">
                  ${this.selectedTrip ? html`<button class="btn btn-sm" @click=${this.clearTripSelection}>${msg('Back to Live')}</button>` : ''}
                  <button class="btn btn-sm" @click=${() => { this.showShareModal = true; }}>${msg('Share Tracking')}</button>
                </div>
              </div>
              <div class="panel-body">
                <fleet-map class="map-placeholder"
                    .lat="${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.latitude ?? 0.0}"
                    .lng="${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.longitude ?? 0.0}"
                    .routePoints=${this.tripRoutePoints}
                    @address-updated=${this.handleAddressUpdated}>
                </fleet-map>
                <div class="mt-16">
                  <div class="detail-row">
                    <span class="detail-label">${msg('Latitude')}</span>
                    <span class="detail-value">${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.latitude ?? 0.0}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">${msg('Longitude')}</span>
                    <span class="detail-value">${this.lastTelemetry?.signalsLatest.currentLocationCoordinates.value.longitude ?? 0.0}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">${msg('Address')}</span>
                    <span class="detail-value">${this.currentAddress || msg('Click on map pointer to get address')}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">${msg('Last Location Update')}</span>
                    <span class="detail-value">${this.formatLastTelemetry(this.lastTelemetry?.signalsLatest.currentLocationCoordinates?.timestamp)}</span>
                  </div>
                </div>
              </div>
            </div>

            ${this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked?.value != null ? html`
              <!-- Vehicle Controls -->
              <div class="panel">
                <div class="panel-header">${msg('Vehicle Controls')}</div>
                <div class="panel-body">
                  <div class="controls-section">
                    <div class="control-status">
                      <div style="font-size: 10px; color: #666; margin-bottom: 4px;">${msg('ENGINE STATUS')}</div>
                      <div><span class="status ${(this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked.value ? 'status-blocked' : 'status-unblocked')}">
                        ${(this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked.value ? msg('BLOCKED') : msg('UNBLOCKED'))}</span></div>
                      <div style="font-size: 10px; color: #666; margin-top: 8px;">${msg('Last update:')} ${this.formatLastTelemetry(this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked.timestamp) ?? 'N/A'}</div>
                    </div>
                    <div class="control-buttons">
                      <button class="btn btn-danger" 
                              ?disabled=${this.immobilizerLoading || !!this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked?.value}
                              @click=${this.immobilizerOn}>
                        ${this.immobilizerLoading ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #ffffff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                        ${msg('IMMOBILIZER ON')}
                      </button>
                      <button class="btn"
                              style="background-color: #16a34a; color: white;"
                              ?disabled=${this.immobilizerLoading || !this.lastTelemetry?.signalsLatest?.obdIsEngineBlocked?.value}
                              @click=${this.immobilizerOff}>
                        ${this.immobilizerLoading ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #ffffff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                        ${msg('IMMOBILIZER OFF')}
                      </button>
                    </div>
                    ${this.immobilizerError ? html`
                      <div style="color: #dc2626; font-size: 0.875rem; margin-top: 8px;">${this.immobilizerError}</div>
                    ` : ''}
                  </div>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Right Column -->
          <div>
            <!-- CAN / Telemetry -->
            <div class="panel mb-16">
              <div class="panel-header">${msg('CAN / Telemetry Snapshot')}</div>
              <div class="panel-body">
                <div class="detail-row">
                  <span class="detail-label">${msg('Ignition')}</span>
                  <span class="detail-value" style="color: ${this.lastTelemetry?.signalsLatest.isIgnitionOn != null ? (this.lastTelemetry.signalsLatest.isIgnitionOn.value ? 'green' : 'red') : '#666'};">${this.lastTelemetry?.signalsLatest.isIgnitionOn?.value != null ? (this.lastTelemetry.signalsLatest.isIgnitionOn.value ? 'ON' : 'OFF') : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${msg('Speed')}</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.speed != null ? `${this.lastTelemetry.signalsLatest.speed.value} km/h` : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${msg('Fuel Level')}</span>
                  <span class="detail-value">${this.getFuelLevelDisplay()}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${msg('Odometer')}</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.powertrainTransmissionTravelledDistance != null ? `${this.lastTelemetry.signalsLatest.powertrainTransmissionTravelledDistance.value.toLocaleString()} km` : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${msg('RPM')}</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.powertrainCombustionEngineSpeed != null ? this.lastTelemetry.signalsLatest.powertrainCombustionEngineSpeed.value : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${msg('Battery Voltage')}</span>
                  <span class="detail-value">${this.lastTelemetry?.signalsLatest.lowVoltageBatteryCurrentVoltage != null ? `${this.lastTelemetry.signalsLatest.lowVoltageBatteryCurrentVoltage.value.toFixed(1)}V` : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${msg('Active DTCs')}</span>
                  <span class="detail-value">${this.formatObdDtcList(this.lastTelemetry?.signalsLatest.obdDTCList?.value)}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${msg('Last CAN Update')}</span>
                  <span class="detail-value">${this.formatLastTelemetry(this.lastTelemetry?.signalsLatest.powertrainTransmissionTravelledDistance?.timestamp)}</span>
                </div>
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="panel">
              <div class="panel-header">${msg('Recent Activity')}</div>
              <div class="inner-tabs" style="margin: 0; border-bottom: 1px solid #ddd;">
                <div
                  class="inner-tab ${this.activeActivityTab === 'trips' ? 'active' : ''}"
                  @click=${() => this.activeActivityTab = 'trips'}
                >${msg('Trips')}</div>
                <div
                  class="inner-tab ${this.activeActivityTab === 'commands' ? 'active' : ''}"
                  @click=${() => this.activeActivityTab = 'commands'}
                >${msg('Commands')}</div>
                <div
                  class="inner-tab ${this.activeActivityTab === 'inventory' ? 'active' : ''}"
                  @click=${() => this.activeActivityTab = 'inventory'}
                >${msg('Inventory')}</div>
              </div>

              <!-- Trips Tab -->
              <div class="panel-body" style="display: ${this.activeActivityTab === 'trips' ? 'block' : 'none'};">
                <div style="margin-bottom: 12px;">
                  <select
                    style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;"
                    .value=${String(this.selectedWeekIndex)}
                    @change=${this.handleWeekChange}
                  >
                    ${this.getWeekIntervals().map((interval, i) => html`
                      <option value=${i} ?selected=${i === this.selectedWeekIndex}>${interval.label}</option>
                    `)}
                  </select>
                </div>
                <table>
                  <thead>
                  <tr>
                    <th>${msg('Start')}</th>
                    <th>${msg('End')}</th>
                    <th>${msg('Distance')}</th>
                    <th>${msg('Avg/Max Speed')}</th>
                  </tr>
                  </thead>
                  <tbody>
                  ${this.trips && this.trips.length > 0 ? this.trips.map(trip => {
                    const distance = this.calculateTripDistance(trip);
                    const avgSpeed = this.getTripSignalValue(trip, 'speed', 'AVG');
                    const maxSpeed = this.getTripSignalValue(trip, 'speed', 'MAX');
                    return html`
                      <tr style="cursor:pointer;${this.selectedTrip === trip ? 'background:#e8f4fd;' : ''}" @click=${() => this.selectTrip(trip)}>
                        <td>${this.formatTripTime(trip.start.timestamp)}</td>
                        <td>${trip.isOngoing ? msg('Ongoing') : this.formatTripTime(trip.end.timestamp)}</td>
                        <td>${distance.toFixed(1)} km</td>
                        <td>${avgSpeed != null ? Math.round(avgSpeed) : 'N/A'} / ${maxSpeed != null ? Math.round(maxSpeed) : 'N/A'} km/h</td>
                      </tr>
                    `;
                  }) : html`
                    <tr>
                      <td colspan="4" style="text-align: center; color: #666; padding: 2rem;">${msg('No trip history available')}</td>
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
                    <th>${msg('Command')}</th>
                    <th>${msg('Status')}</th>
                    <th>${msg('Created')}</th>
                    <th>${msg('Command ID')}</th>
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
                      <td colspan="4" style="text-align: center; color: #666; padding: 2rem;">${msg('No command history available')}</td>
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
                    <th>${msg('State')}</th>
                    <th>${msg('Note')}</th>
                    <th>${msg('Created')}</th>
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
                      <td colspan="3" style="text-align: center; color: #666; padding: 2rem;">${msg('No inventory history available')}</td>
                    </tr>
                  `}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Vehicle Sharing -->
        <div class="panel">
          <div class="panel-header">${msg('Vehicle Sharing')}</div>
          <div class="panel-body" style="padding: 0;">
            <table>
              <thead>
              <tr>
                <th>${msg('Grantee')}</th>
                <th>${msg('Permissions')}</th>
                <th>${msg('Source')}</th>
                <th>${msg('Created At')}</th>
                <th>${msg('Expires At')}</th>
              </tr>
              </thead>
              <tbody>
              ${this.vehicleIdentity?.vehicle?.sacds?.nodes && this.vehicleIdentity.vehicle.sacds.nodes.length > 0 ? this.vehicleIdentity.vehicle.sacds.nodes.map(sacd => html`
                <tr>
                  <td style="font-size: 11px;"><click-to-copy-element .valueToCopy="${sacd.grantee || ''}">${this.formatWalletAddress(sacd.grantee || '')}</click-to-copy-element></td>
                  <td>${sacd.permissions}</td>
                  <td>${sacd.source}</td>
                  <td>${sacd.createdAt ? dayjs(sacd.createdAt).format('MMM D, YYYY') : 'N/A'}</td>
                  <td>${sacd.expiresAt ? dayjs(sacd.expiresAt).format('MMM D, YYYY') : 'N/A'}</td>
                </tr>
              `) : html`
                <tr>
                  <td colspan="5" style="text-align: center; color: #666; padding: 2rem;">${msg('No sharing information available')}</td>
                </tr>
              `}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Share Vehicle Tracking Modal -->
      <share-vehicle-modal-element
        .show=${this.showShareModal}
        .vehicleTokenID=${this.vehicle?.vehicle_token_id || 0}
        @modal-closed=${() => { this.showShareModal = false; }}
      ></share-vehicle-modal-element>

      <edit-device-definition-modal-element
        .show=${this.showEditDefinitionModal}
        .deviceDefinitionId=${this.vehicle?.device_definition_id || this.vehicleIdentity?.vehicle?.definition?.id || ''}
        .tokenDID=${this.vehicleIdentity?.vehicle?.tokenDID || ''}
        @modal-closed=${this.handleEditDefinitionModalClosed}
        @device-definition-update-requested=${this.handleDeviceDefinitionUpdated}
      ></edit-device-definition-modal-element>

      <!-- Update Inventory Modal -->
      <update-inventory-modal-element
        .show=${this.showInventoryModal}
        .imei=${this.vehicle?.imei || ''}
        @modal-closed=${this.handleInventoryModalClosed}
        @inventory-updated=${this.handleInventoryUpdated}
      ></update-inventory-modal-element>

      <!-- Immobilizer Confirmation Modal -->
      <confirm-modal-element
        .show=${this.showImmobilizerConfirm}
        .title=${`Immobilizer ${this.immobilizerAction.toUpperCase()}`}
        .message=${`Are you sure you want to turn the immobilizer ${this.immobilizerAction} for this vehicle?`}
        .confirmText=${`Turn ${this.immobilizerAction.toUpperCase()}`}
        .confirmButtonClass=${this.immobilizerAction === 'on' ? 'btn-danger' : 'btn-success'}
        @modal-confirm=${this.handleImmobilizerConfirm}
        @modal-cancel=${this.handleImmobilizerCancel}
      ></confirm-modal-element>
    `;
  }

  private openInventoryModal() {
    this.showInventoryModal = true;
  }

  private handleInventoryModalClosed() {
    this.showInventoryModal = false;
  }

  private openEditDefinitionModal() {
    this.showEditDefinitionModal = true;
  }

  private handleEditDefinitionModalClosed() {
    this.showEditDefinitionModal = false;
  }

  private async handleDeviceDefinitionUpdated(_event: CustomEvent) {
    this.showEditDefinitionModal = false;
    this.successMessage = msg('Device definition update submitted.');

    await new Promise((resolve) => window.setTimeout(resolve, 250));
    await this.loadVehicleData();
  }

  private async handleInventoryUpdated(event: CustomEvent) {
    this.showInventoryModal = false;
    console.log('Inventory updated:', event.detail);

    // Reload vehicle data to get updated inventory status
    await this.loadVehicleData();
  }

  private async handleWeekChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.selectedWeekIndex = Number(select.value);
    await this.loadTrips(this.tokenID);
  }

  private handleAddressUpdated(event: CustomEvent) {
    this.currentAddress = event.detail.address;
  }

  private async sendImmobilizerCommand(state: 'on' | 'off') {
    if (!this.vehicle?.imei || !this.apiService) {
      this.immobilizerError = msg("No IMEI or API service provided");
      return;
    }

    this.immobilizerLoading = true;
    this.immobilizerError = "";

    try {
      const response = await this.apiService.callApi(
        'POST',
        `/pending-vehicle/command/${this.vehicle.imei}`,
        { command: `immobilizer/${state}` },
        true,
        true
      );
      if (response.success) {
        console.log(`Immobilizer ${state} command sent successfully`);
      } else {
        this.immobilizerError = response.error || `Failed to send immobilizer ${state} command`;
      }
    } catch (err) {
      this.immobilizerError = `Failed to send immobilizer ${state} command`;
      console.error(`Error sending immobilizer ${state} command:`, err);
    } finally {
      this.immobilizerLoading = false;
    }
  }

  private immobilizerOn() {
    this.immobilizerAction = 'on';
    this.showImmobilizerConfirm = true;
  }

  private immobilizerOff() {
    this.immobilizerAction = 'off';
    this.showImmobilizerConfirm = true;
  }

  private handleImmobilizerConfirm() {
    this.showImmobilizerConfirm = false;
    this.sendImmobilizerCommand(this.immobilizerAction);
  }

  private handleImmobilizerCancel() {
    this.showImmobilizerConfirm = false;
  }

  private goBack() {
    location.hash = '/vehicles-fleets';
  }

  private formatLastTelemetry(timestamp: string | undefined): string {
    if (timestamp === undefined) {
      return '-';
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

  private async selectTrip(trip: Trip) {
    this.selectedTrip = trip;
    await this.loadTripRoute(trip);
  }

  private clearTripSelection() {
    this.selectedTrip = null;
    this.tripRoutePoints = [];
  }

  private async loadTripRoute(trip: Trip) {
    if (!this.apiService || !this.tokenID) return;
    try {
      const query = `{
  signals(tokenId: ${this.tokenID}, interval: "3s", from: "${trip.start.timestamp}", to: "${trip.end.timestamp}") {
    currentLocationCoordinates(agg: FIRST) {
      latitude
      longitude
    }
  }
}`;
      const response = await this.apiService.callApi<{ data: { signals: Array<{ currentLocationCoordinates: { latitude: number; longitude: number } }> } }>(
        'POST',
        `/fleet/vehicles/telemetry/${this.tokenID}`,
        query,
        true,
        true
      );
      if (response.success && response.data) {
        const signals = (response.data as any)?.signals ?? response.data?.data?.signals;
        if (signals) {
          this.tripRoutePoints = signals
            .filter((s: any) => s.currentLocationCoordinates?.latitude && s.currentLocationCoordinates?.longitude)
            .map((s: any) => [s.currentLocationCoordinates.latitude, s.currentLocationCoordinates.longitude] as [number, number]);
        }
      }
    } catch (e: any) {
      console.error('Failed to load trip route:', e);
      this.tripRoutePoints = [];
    }
  }

  private formatWalletAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private renderHardwareDetails(): string {
    const aftermarketDevice = this.vehicleIdentity?.vehicle?.aftermarketDevice;
    if (!aftermarketDevice) {
      return `Smart5 | IMEI: ${this.vehicle?.imei || 'N/A'}`;
    }

    const serial = aftermarketDevice.serial || 'N/A';
    const imei = aftermarketDevice.imei || 'N/A';
    const manufacturer = aftermarketDevice.manufacturer?.name || 'N/A';
    return `Serial: ${serial} | IMEI: ${imei} | Manufacturer: ${manufacturer}`;
  }

  private buildShareUrl(): string {
    const settings = SettingsService.getInstance().tenantSettings;
    const clientId = settings?.dimo_client_id ?? '';
    const expiration = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const redirectUri = window.location.origin;

    const params = new URLSearchParams({
      clientId,
      entryState: 'VEHICLE_MANAGER',
      expirationDate: expiration,
      permissions: '11111010',
      redirectUri,
    });
    params.append('vehicles', this.tokenID.toString());

    return `https://login.dimo.org/?${params.toString()}`;
  }

  private formatMintedAt(timestamp: string | undefined): string {
    if (!timestamp) return 'N/A';
    const date = dayjs(timestamp);
    return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : 'N/A';
  }

  private formatObdDtcList(value: string[] | string | null | undefined): string {
    if (value == null) return 'N/A';
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'None';
    if (typeof value === 'string') return value.trim().length > 0 ? value : 'None';
    return 'N/A';
  }

  private formatCreatedDate(dateString: string | undefined): string {
    if (!dateString) return 'N/A';
    return dayjs(dateString).format('YYYY-MM-DD');
  }

  private formatVendorLabel(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private viewUserProfile() {
    if (this.ownerInfo?.wallet) {
      window.location.hash = `/users/profile/${this.ownerInfo.wallet}`;
    }
  }

  private async saveLicensePlate() {
    if (!this.apiService || !this.vehicle) return;
    this.savingPlate = true;
    this.errorMessage = '';
    this.successMessage = '';

    const response = await this.apiService.callApi(
      'PATCH',
      `/fleet/vehicles/${this.vehicle.vehicle_token_id}/license-plate`,
      { license_plate: this.editPlateValue.trim() },
      true,
      true
    );

    if (response.success) {
      this.vehicle = { ...this.vehicle, license_plate: this.editPlateValue.trim() };
      this.editingPlate = false;
      this.successMessage = msg('License plate updated.');
    } else {
      this.errorMessage = response.error || msg('Failed to update license plate.');
    }
    this.savingPlate = false;
  }

  private addUserProfile() {
    if (this.ownerWalletAddress) {
      window.location.hash = `/users/profile/${this.ownerWalletAddress}?edit=true`;
    }
  }

  private isKaufmannTenant(): boolean {
    const tenant = OracleTenantService.getInstance().getSelectedTenant();
    return tenant?.name?.toLowerCase().includes('kaufmann') ?? false;
  }

  private async syncApimaz() {
    if (!this.apiService || !this.vehicle?.vin) return;

    this.syncingApimaz = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const response = await this.apiService.callApi<{ message: string }>(
        'POST',
        `/fleet/vehicles/apimaz/${this.vehicle.vin}/sync`,
        null,
        true,
        true
      );

      if (response.success) {
        this.successMessage = msg('Vendor data synchronized successfully.');
        // Reload vehicle to show updated data
        const [vehicleData] = await this.loadVehicleData();
        if (vehicleData) {
          this.vehicle = vehicleData;
        }
      } else {
        this.errorMessage = response.error || msg('Failed to synchronize vendor data.');
      }
    } catch (error: any) {
      this.errorMessage = error.message || msg('Failed to synchronize vendor data.');
    } finally {
      this.syncingApimaz = false;
    }
  }
}
