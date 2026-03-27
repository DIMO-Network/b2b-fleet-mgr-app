import { LitElement, html, css } from 'lit';
import { msg } from '@lit/localize';
import { customElement, state } from 'lit/decorators.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { isLocalhost } from '@utils/utils.ts';
import { getLocale, setLocale } from '../localization.ts';

dayjs.extend(relativeTime);

interface TrackingInfo {
  vehicle_token_id: number;
  vin?: string;
  make?: string;
  model?: string;
  year?: string;
  license_plate?: string;
}

interface TelemetryData {
  signalsLatest: {
    currentLocationCoordinates?: {
      value: { latitude: number; longitude: number };
      timestamp: string;
    };
    obdIsEngineBlocked?: { value: number; timestamp: string };
    isIgnitionOn?: { value: boolean };
    speed?: { value: number };
    powertrainFuelSystemRelativeLevel?: { value: number };
    powertrainTransmissionTravelledDistance?: { value: number; timestamp: string };
    powertrainCombustionEngineSpeed?: { value: number };
    lowVoltageBatteryCurrentVoltage?: { value: number };
  };
}

interface Trip {
  start: { value: { latitude: number; longitude: number }; timestamp: string };
  end: { value: { latitude: number; longitude: number }; timestamp: string };
  isOngoing: boolean;
  signals: { name: string; agg: string; value: number }[];
}

@customElement('tracking-app')
export class TrackingApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 600px;
      margin: 0 auto;
      padding: 12px;
      box-sizing: border-box;
    }
    * { box-sizing: border-box; }

    .header {
      background: #1a1a2e;
      color: #fff;
      padding: 14px 16px;
      border-radius: 10px;
      margin-bottom: 12px;
    }
    .header h1 { font-size: 16px; margin: 0 0 4px 0; }
    .header .subtitle { font-size: 12px; color: #aaa; }
    .header .plate {
      display: inline-block;
      background: #e9ecef;
      color: #333;
      border: 1px solid #ced4da;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      margin-top: 6px;
    }

    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #28a745;
      color: #fff;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .live-badge.paused { background: #6c757d; }
    .live-badge .dot {
      width: 6px; height: 6px;
      background: #fff;
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    .live-badge.paused .dot { animation: none; opacity: 0.5; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    .card {
      background: #fff;
      border-radius: 10px;
      border: 1px solid #e0e0e0;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .card-header {
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-body { padding: 0; }

    .map-container { height: 280px; width: 100%; }

    .telemetry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }
    .telemetry-item {
      padding: 10px 14px;
      border-bottom: 1px solid #f5f5f5;
      border-right: 1px solid #f5f5f5;
    }
    .telemetry-item:nth-child(2n) { border-right: none; }
    .telemetry-label { font-size: 10px; text-transform: uppercase; color: #999; letter-spacing: 0.5px; }
    .telemetry-value { font-size: 18px; font-weight: 600; margin-top: 2px; }
    .telemetry-value.small { font-size: 14px; }

    .trip-item {
      padding: 12px 14px;
      border-bottom: 1px solid #f0f0f0;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .trip-item:hover { background: #f8f9fa; }
    .trip-item:last-child { border-bottom: none; }
    .trip-item.selected { background: #e8f4fd; border-left: 3px solid #0066cc; }
    .trip-time { font-size: 13px; font-weight: 500; }
    .trip-meta { font-size: 11px; color: #888; margin-top: 2px; }
    .trip-distance { font-size: 14px; font-weight: 600; color: #333; }

    .error-message {
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 10px;
      padding: 16px;
      color: #c33;
      text-align: center;
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    .expired {
      text-align: center;
      padding: 60px 20px;
      color: #666;
    }
    .expired h2 { color: #333; }

    .back-btn {
      background: none;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }
    .back-btn:hover { background: #f0f0f0; }
  `;

  @state() private shareID: string = '';
  @state() private info: TrackingInfo | null = null;
  @state() private telemetry: TelemetryData | null = null;
  @state() private trips: Trip[] = [];
  @state() private loading = true;
  @state() private error = '';
  @state() private expired = false;
  @state() private selectedTrip: Trip | null = null;
  @state() private tripRoutePoints: Array<[number, number]> = [];
  @state() private isLive = true;

  private refreshTimer?: number;
  private readonly apiBase = isLocalhost() ? 'https://localdev.dimo.org:3007' : '';

  async connectedCallback() {
    super.connectedCallback();

    // Restore saved locale
    const savedLocale = localStorage.getItem('locale');
    const locale = savedLocale ?? (navigator.language.startsWith('es') ? 'es' : 'en');
    if (locale === 'es') {
      await setLocale('es');
    }

    const params = new URLSearchParams(window.location.search);
    this.shareID = params.get('id') || '';

    if (!this.shareID) {
      this.error = msg('No tracking link provided.');
      this.loading = false;
      return;
    }

    this.loadInitialData();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopRefresh();
  }

  private startRefresh() {
    this.stopRefresh();
    this.refreshTimer = window.setInterval(() => {
      if (this.isLive) {
        this.loadTelemetry();
      }
    }, 10000);
  }

  private stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private async apiFetch<T>(path: string, body?: string): Promise<T | null> {
    const opts: RequestInit = {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    };
    if (body) {
      opts.method = 'POST';
      opts.body = body;
    }
    const resp = await fetch(`${this.apiBase}${path}`, opts);

    if (resp.status === 410) {
      this.expired = true;
      return null;
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  private async loadInitialData() {
    this.loading = true;
    try {
      this.info = await this.apiFetch<TrackingInfo>(`/tracking/${this.shareID}`);
      if (!this.info) return;

      await this.loadTelemetry();
      await this.loadTrips();
      this.startRefresh();
    } catch (e: any) {
      this.error = e.message || 'Failed to load tracking data';
    } finally {
      this.loading = false;
    }
  }

  private async loadTelemetry() {
    if (!this.info) return;
    try {
      const query = `{
  signalsLatest(tokenId: ${this.info.vehicle_token_id}) {
    currentLocationCoordinates {
      value { latitude longitude }
      timestamp
    }
    obdIsEngineBlocked { value timestamp }
    isIgnitionOn { value }
    speed { value }
    powertrainFuelSystemRelativeLevel { value }
    powertrainTransmissionTravelledDistance { value timestamp }
    powertrainCombustionEngineSpeed { value }
    lowVoltageBatteryCurrentVoltage { value }
  }
}`;
      const result = await this.apiFetch<{ data: TelemetryData }>(`/tracking/${this.shareID}/telemetry`, query);
      if (result?.data) {
        this.telemetry = result.data;
      }
    } catch (e: any) {
      console.error('Telemetry refresh failed:', e);
    }
  }

  private async loadTrips() {
    if (!this.info) return;
    const now = dayjs();
    const from = now.subtract(7, 'day').toISOString();
    const to = now.toISOString();

    const query = `{
  segments(
    tokenId: ${this.info.vehicle_token_id}
    from: "${from}"
    to: "${to}"
    mechanism: frequencyAnalysis
    limit: 20
    config: { minSegmentDurationSeconds: 240 }
    signalRequests: [
      { name: "powertrainTransmissionTravelledDistance", agg: FIRST }
      { name: "powertrainTransmissionTravelledDistance", agg: LAST }
      { name: "speed", agg: AVG }
      { name: "speed", agg: MAX }
    ]
  ) {
    start { value {latitude longitude} timestamp }
    end { value {latitude longitude} timestamp }
    isOngoing
    signals { name agg value }
  }
}`;
    try {
      const result = await this.apiFetch<{ data: { segments: Trip[] } }>(`/tracking/${this.shareID}/trips`, query);
      if (result?.data?.segments) {
        this.trips = result.data.segments.sort((a, b) => new Date(b.start.timestamp).getTime() - new Date(a.start.timestamp).getTime());
      }
    } catch (e: any) {
      console.error('Trips load failed:', e);
    }
  }

  private async selectTrip(trip: Trip) {
    this.selectedTrip = trip;
    this.isLive = false;
    await this.loadTripRoute(trip);
  }

  private async handleLocaleChange(e: Event) {
    const locale = (e.target as HTMLSelectElement).value as 'en' | 'es';
    localStorage.setItem('locale', locale);
    await setLocale(locale);
    window.location.reload();
  }

  private goLive() {
    this.selectedTrip = null;
    this.tripRoutePoints = [];
    this.isLive = true;
    this.loadTelemetry();
  }

  private async loadTripRoute(trip: Trip) {
    if (!this.info) return;
    try {
      const query = `{
  signals(tokenId: ${this.info.vehicle_token_id}, interval: "3s", from: "${trip.start.timestamp}", to: "${trip.end.timestamp}") {
    currentLocationCoordinates(agg: FIRST) {
      latitude
      longitude
    }
  }
}`;
      const result = await this.apiFetch<{ data: { signals: Array<{ currentLocationCoordinates: { latitude: number; longitude: number } }> } }>(
        `/tracking/${this.shareID}/telemetry`, query
      );
      if (result?.data?.signals) {
        this.tripRoutePoints = result.data.signals
          .filter(s => s.currentLocationCoordinates?.latitude && s.currentLocationCoordinates?.longitude)
          .map(s => [s.currentLocationCoordinates.latitude, s.currentLocationCoordinates.longitude] as [number, number]);
      }
    } catch (e: any) {
      console.error('Failed to load trip route:', e);
      this.tripRoutePoints = [];
    }
  }

  private getTripDistance(trip: Trip): string {
    const first = trip.signals.find(s => s.name === 'powertrainTransmissionTravelledDistance' && s.agg === 'FIRST');
    const last = trip.signals.find(s => s.name === 'powertrainTransmissionTravelledDistance' && s.agg === 'LAST');
    if (first && last) {
      return `${(last.value - first.value).toFixed(1)} km`;
    }
    return '-';
  }

  private getTripAvgSpeed(trip: Trip): string {
    const avg = trip.signals.find(s => s.name === 'speed' && s.agg === 'AVG');
    return avg ? `${Math.round(avg.value)} km/h` : '-';
  }

  render() {
    if (this.expired) {
      return html`
        <div class="expired">
          <h2>${msg('Link Expired')}</h2>
          <p>${msg('This tracking link is no longer active.')}</p>
        </div>
      `;
    }

    if (this.error) {
      return html`<div class="error-message">${this.error}</div>`;
    }

    if (this.loading) {
      return html`<div class="loading">${msg('Loading vehicle tracking...')}</div>`;
    }

    const loc = this.telemetry?.signalsLatest?.currentLocationCoordinates;
    const signals = this.telemetry?.signalsLatest;

    return html`
      <!-- Header -->
      <div class="header">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h1>${this.info?.make || ''} ${this.info?.model || ''} ${this.info?.year || ''}</h1>
            <div class="subtitle">${this.info?.vin || ''}</div>
            ${this.info?.license_plate ? html`<span class="plate">${this.info.license_plate}</span>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
            <div class="live-badge ${this.isLive ? '' : 'paused'}" @click=${this.isLive ? () => {} : this.goLive}>
              <span class="dot"></span>
              ${this.isLive ? 'LIVE' : 'PAUSED'}
            </div>
            <select
              style="padding:3px 6px;border:1px solid rgba(255,255,255,0.3);border-radius:4px;font-size:11px;background:rgba(255,255,255,0.1);color:#fff;font-family:inherit;"
              .value=${getLocale()}
              @change=${this.handleLocaleChange}
            >
              <option value="en" style="color:#333;">English</option>
              <option value="es" style="color:#333;">Español</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Map -->
      <div class="card">
        <div class="card-header">
          ${msg('Location')}
          ${loc?.timestamp ? html`<span style="font-weight:400;text-transform:none;">${dayjs(loc.timestamp).fromNow()}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="map-container">
            <fleet-map
              .lat="${loc?.value?.latitude ?? 0}"
              .lng="${loc?.value?.longitude ?? 0}"
              .zoom="${14}"
              .routePoints=${this.tripRoutePoints}>
            </fleet-map>
          </div>
        </div>
      </div>

      <!-- Telemetry Snapshot -->
      <div class="card">
        <div class="card-header">
          ${msg('Vehicle Status')}
          ${loc?.timestamp ? html`<span style="font-weight:400;text-transform:none;">${dayjs(loc.timestamp).fromNow()}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="telemetry-grid">
            <div class="telemetry-item">
              <div class="telemetry-label">${msg('Ignition')}</div>
              <div class="telemetry-value" style="color:${signals?.isIgnitionOn?.value ? '#28a745' : '#dc3545'}">
                ${signals?.isIgnitionOn?.value ? 'ON' : 'OFF'}
              </div>
            </div>
            <div class="telemetry-item">
              <div class="telemetry-label">${msg('Speed')}</div>
              <div class="telemetry-value">${signals?.speed?.value != null ? `${Math.round(signals.speed.value)} km/h` : '-'}</div>
            </div>
            <div class="telemetry-item">
              <div class="telemetry-label">${msg('Fuel')}</div>
              <div class="telemetry-value">${signals?.powertrainFuelSystemRelativeLevel?.value != null ? `${Math.round(signals.powertrainFuelSystemRelativeLevel.value)}%` : '-'}</div>
            </div>
            <div class="telemetry-item">
              <div class="telemetry-label">${msg('Odometer')}</div>
              <div class="telemetry-value small">${signals?.powertrainTransmissionTravelledDistance?.value != null ? `${Math.round(signals.powertrainTransmissionTravelledDistance.value)} km` : '-'}</div>
            </div>
            <div class="telemetry-item">
              <div class="telemetry-label">${msg('RPM')}</div>
              <div class="telemetry-value">${signals?.powertrainCombustionEngineSpeed?.value != null ? Math.round(signals.powertrainCombustionEngineSpeed.value) : '-'}</div>
            </div>
            <div class="telemetry-item">
              <div class="telemetry-label">${msg('Immobilizer')}</div>
              <div class="telemetry-value" style="color:${signals?.obdIsEngineBlocked?.value === 0 ? '#28a745' : '#dc3545'}">
                ${signals?.obdIsEngineBlocked?.value === 0 ? 'INACTIVE' : signals?.obdIsEngineBlocked?.value === 1 ? 'BLOCKED' : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Trips -->
      <div class="card">
        <div class="card-header">
          ${msg('Recent Trips')}
          ${this.selectedTrip ? html`<button class="back-btn" @click=${this.goLive}>${msg('Back to Live')}</button>` : ''}
        </div>
        <div class="card-body">
          ${this.trips.length === 0
            ? html`<div style="padding:16px;color:#999;text-align:center;">${msg('No trips in the last 7 days')}</div>`
            : this.trips.map(trip => html`
              <div class="trip-item ${this.selectedTrip === trip ? 'selected' : ''}" @click=${() => this.selectTrip(trip)}>
                <div>
                  <div class="trip-time">
                    ${dayjs(trip.start.timestamp).format('MMM D, HH:mm')} - ${dayjs(trip.end.timestamp).format('HH:mm')}
                    ${trip.isOngoing ? html`<span style="color:#28a745;font-size:11px;"> (ongoing)</span>` : ''}
                  </div>
                  <div class="trip-meta">Avg ${this.getTripAvgSpeed(trip)}</div>
                </div>
                <div class="trip-distance">${this.getTripDistance(trip)}</div>
              </div>
            `)
          }
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tracking-app': TrackingApp;
  }
}
