import {css, html, nothing} from 'lit';
import {msg, str} from '@lit/localize';
import {customElement, property, state} from "lit/decorators.js";
import {LitElement} from 'lit';
import { ApiService } from '../services/api-service';
import {globalStyles} from "../global-styles.ts";
import {decodeIo} from "../services/ruptela-io-types.ts";
import {getIoName} from "../services/ruptela-io-names.ts";
import './confirm-modal-element';

interface IoElement {
    id: number;
    value: string;
}

interface RawTelemetryEntry {
    header?: Record<string, any>;
    io_elements?: IoElement[];
}

interface TelemetryData {
    // API can return an array of entries, a single entry object, or a stringified JSON
    rawTelemetry: RawTelemetryEntry[] | RawTelemetryEntry | string;
    receivedAt?: string;
}

@customElement('telemetry-modal-element')
export class TelemetryModalElement extends LitElement {
    static styles = [ globalStyles,
        css``
    ];
    @property({attribute: true, type: Boolean})
    public show = false;

    @property({attribute: true})
    public imei = "";

    @property({attribute: true})
    public vin = "";

    @state()
    private telemetryData: TelemetryData[] = [];

    @state()
    private identityData: TelemetryData[] = [];

    @state()
    private loading = false;

    @state()
    private error = "";

    @state()
    private resetting = false;

    @state()
    private removingVin = false;

    @state()
    private showRemoveVinConfirm = false;

    @state()
    private odometerDisplay: string = "—";

    @state()
    private rpmDisplay: string = "—";

    @state()
    private ignitionDisplay: string = "—";

    @state()
    private engineBlockDisplay: string = "—";

    @state()
    private ioSearchValue: string = "";

    @state()
    private ioSearchResult: string = "—";

    @state()
    private immobilizerLoading = false;

    @state()
    private immobilizerError = "";

    // Paging over raw telemetry rows
    @state()
    private currentIndex: number = 0;

    @state()
    private currentIdentityIndex: number = 0;

    // Live mode: epoch ms of the newest frame received, and a clock tick refreshed each
    // poll so the "live" indicator re-evaluates without new data.
    @state()
    private lastFrameMs: number = 0;

    @state()
    private nowMs: number = Date.now();

    // Poll the telemetry endpoint while the modal is open so the panel stays current
    // during a hardware install. Cross-replica safe: reads go through Postgres.
    private static readonly POLL_INTERVAL_MS = 5000;
    // Safety stop so a forgotten-open modal doesn't poll forever.
    private static readonly POLL_MAX_MS = 15 * 60 * 1000;
    // A frame seen within this window means the device is currently connected.
    private static readonly LIVE_WINDOW_MS = 40 * 1000;

    private pollTimer: number | null = null;
    private pollDeadline: number = 0;

    private apiService: ApiService;

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
    }

    connectedCallback() {
        super.connectedCallback();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.stopPolling();
    }

    // True when a frame was received within the live window (device currently connected).
    private get isLive(): boolean {
        return this.lastFrameMs > 0 && (this.nowMs - this.lastFrameMs) < TelemetryModalElement.LIVE_WINDOW_MS;
    }

    // Use shadow DOM; styles are provided via globalStyles

    render() {
        if (!this.show) {
            return nothing;
        }

        return html`
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content telemetry-modal" @click=${(e: Event) => e.stopPropagation()} style="width: 90%; max-width: 90%;">

                    <div class="modal-header">
                        <h3 style="display: flex; align-items: center; gap: 0.6rem;">
                            ${msg('Telemetry Data')} - ${this.imei}${this.vin ? ` (${this.vin})` : ''}
                            <span
                                title=${this.isLive ? msg('Device connected — receiving data') : msg('No data received recently')}
                                style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 600; color: ${this.isLive ? '#16a34a' : '#9ca3af'};">
                                <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${this.isLive ? '#16a34a' : '#9ca3af'}; ${this.isLive ? 'box-shadow: 0 0 0 3px rgba(22,163,74,0.2);' : ''}"></span>
                                ${this.isLive ? msg('Live') : msg('Offline')}
                            </span>
                        </h3>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <button type="button"
                                    class="btn btn-secondary"
                                    ?disabled=${this.resetting}
                                    @click=${this.resetTelemetry}
                                    style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                ${this.resetting ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                                ${msg('Reset Telemetry')}
                            </button>
                            <button type="button"
                                    class="btn btn-danger"
                                    ?disabled=${this.removingVin || !this.vin}
                                    @click=${this.showRemoveVinConfirmModal}
                                    style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                ${this.removingVin ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #ffffff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                                ${msg('Remove VIN')}
                            </button>
                            <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                        </div>
                    </div>
                    <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" 
                                class="btn btn-danger" 
                                ?disabled=${this.immobilizerLoading}
                                @click=${this.immobilizerOn}
                                style="font-size: 0.875rem; padding: 0.5rem 1rem; background-color: #dc2626; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
                            ${this.immobilizerLoading ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #ffffff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                            ${msg('Immobilizer On')}
                        </button>
                        <button type="button" 
                                class="btn btn-success" 
                                ?disabled=${this.immobilizerLoading}
                                @click=${this.immobilizerOff}
                                style="font-size: 0.875rem; padding: 0.5rem 1rem; background-color: #16a34a; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
                            ${this.immobilizerLoading ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #ffffff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                            ${msg('Immobilizer Off')}
                        </button>
                        ${this.immobilizerError ? html`
                            <div style="color: #dc2626; font-size: 0.875rem;">${this.immobilizerError}</div>
                        ` : ''}
                    </div>
                    <div class="modal-body">
                        ${this.loading ? html`
                            <div class="loading-message">${msg('Loading telemetry data...')}</div>
                        ` : html`
                            ${this.error ? html`
                                <div class="alert alert-error">${this.error}</div>
                            ` : html`
                                <div class="telemetry-metrics" style="display: flex; align-items: baseline; gap: 2rem; margin-bottom: 0.5rem;">
                                    <div><span style="opacity: 0.8;">${msg('Odometer:')}</span> <strong>${this.odometerDisplay}</strong></div>
                                    <div><span style="opacity: 0.8;">${msg('RPM:')}</span> <strong>${this.rpmDisplay}</strong></div>
                                    <div><span style="opacity: 0.8;">${msg('Ignition:')}</span> <strong>${this.ignitionDisplay}</strong></div>
                                    <div><span style="opacity: 0.8;">${msg('Engine Block:')}</span> <strong>${this.engineBlockDisplay}</strong></div>
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <input
                                            type="text"
                                            .placeholder=${msg('Search IO')}
                                            .value=${this.ioSearchValue}
                                            @input=${this.handleIoSearch}
                                            style="width: 100px; padding: 0.25rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.875rem;"
                                        >
                                        <strong>${this.ioSearchResult} ${msg('(decimal)')}</strong>
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 8px;">
                                    <!-- Telemetry Data Panel -->
                                    <div class="panel">
                                        <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                                            <div style="font-weight: bold;">
                                                ${msg('Telemetry Data')}
                                            </div>
                                            ${this.pages.length > 0 ? html`
                                                <div class="pagination" style="margin:0;">
                                                    <button class="pagination-btn" @click=${this.prevPage} ?disabled=${this.currentIndex <= 0} aria-label="Previous">
                                                        ←
                                                    </button>
                                                    <span>${msg(str`Record ${this.currentIndex + 1} of ${this.pages.length}`)}</span>
                                                    <button class="pagination-btn" @click=${this.nextPage} ?disabled=${this.currentIndex >= this.pages.length - 1} aria-label="Next">
                                                        →
                                                    </button>
                                                </div>
                                            ` : ''}
                                        </div>
                                        <div class="panel-body" style="display:grid; gap:12px; max-height:50vh; overflow:auto;">
                                            ${this.pages.length > 0 ? html`
                                                <div>
                                                    <div class="tile-label" style="margin-bottom:6px;">${this.currentTitle}</div>
                                                </div>
                                                <div>
                                                    <div class="tile-label" style="margin-bottom:6px;">${msg('Header')}</div>
                                                    <pre class="telemetry-blob" style="max-height:30vh; overflow:auto;">${this.formatJsonForDisplay(this.pages[this.currentIndex].header)}</pre>
                                                </div>
                                                <div>
                                                    <div class="tile-label" style="margin-bottom:6px;">${msg('IO Elements')}</div>
                                                    ${this.renderIoElements(this.pages[this.currentIndex].io_elements)}
                                                </div>
                                            ` : html`
                                                <div class="no-data">${msg('No telemetry data available')}</div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- Identification Data Panel -->
                                    <div class="panel">
                                        <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                                            <div style="font-weight: bold;">
                                                ${msg('Identification Data')}
                                            </div>
                                            ${this.identityPages.length > 0 ? html`
                                                <div class="pagination" style="margin:0;">
                                                    <button class="pagination-btn" @click=${this.prevIdentityPage} ?disabled=${this.currentIdentityIndex <= 0} aria-label="Previous">
                                                        ←
                                                    </button>
                                                    <span>${msg(str`Record ${this.currentIdentityIndex + 1} of ${this.identityPages.length}`)}</span>
                                                    <button class="pagination-btn" @click=${this.nextIdentityPage} ?disabled=${this.currentIdentityIndex >= this.identityPages.length - 1} aria-label="Next">
                                                        →
                                                    </button>
                                                </div>
                                            ` : ''}
                                        </div>
                                        <div class="panel-body" style="display:grid; gap:12px; max-height:50vh; overflow:auto;">
                                            ${this.identityPages.length > 0 ? html`
                                                <div>
                                                    <div class="tile-label" style="margin-bottom:6px;">${this.currentIdentityTitle}</div>
                                                </div>
                                                <div>
                                                    <div class="tile-label" style="margin-bottom:6px;">${msg('Identity Information')}</div>
                                                    <pre class="telemetry-blob" style="max-height:50vh; overflow:auto;">${this.formatJsonForDisplay(this.identityPages[this.currentIdentityIndex].data)}</pre>
                                                </div>
                                            ` : html`
                                                <div class="no-data">${msg('No identity data available')}</div>
                                            `}
                                        </div>
                                    </div>
                                </div>
                            `}
                        `}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="action-btn secondary" @click=${this.closeModal}>
                            ${msg('Close')}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Remove VIN Confirmation Modal -->
            <confirm-modal-element
              .show=${this.showRemoveVinConfirm}
              .title=${msg('Remove VIN')}
              .message=${msg('Are you sure you want to remove VIN from this device? This action cannot be undone.')}
              .confirmText=${msg('Remove')}
              .cancelText=${msg('Cancel')}
              .confirmButtonClass=${'btn-danger'}
              @modal-confirm=${this.handleRemoveVinConfirm}
              @modal-cancel=${this.handleRemoveVinCancel}
            ></confirm-modal-element>
        `;
    }

    private closeModal() {
        this.stopPolling();
        this.show = false;
        this.telemetryData = [];
        this.identityData = [];
        this.lastFrameMs = 0;
        this.error = "";
        this.loading = false;
        this.resetting = false;
        this.removingVin = false;
        this.showRemoveVinConfirm = false;
        this.immobilizerLoading = false;
        this.immobilizerError = "";
        this.odometerDisplay = "—";
        this.rpmDisplay = "—";
        this.ignitionDisplay = "—";
        this.engineBlockDisplay = "—";
        this.ioSearchValue = "";
        this.ioSearchResult = "—";
        this.currentIndex = 0;
        this.currentIdentityIndex = 0;

        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private async resetTelemetry() {
        if (!this.imei) {
            this.error = msg("No IMEI provided");
            return;
        }

        this.resetting = true;
        this.error = "";

        try {
            const response = await this.apiService.callApi('DELETE', `/pending-vehicle-telemetry/${this.imei}`, null, true, true);
            if (response.success) {
                // Clear the telemetry data after successful reset
                this.telemetryData = [];
                this.odometerDisplay = "—";
                this.rpmDisplay = "—";
                this.ignitionDisplay = "—";
                this.engineBlockDisplay = "—";
                this.currentIndex = 0;
                console.log("Telemetry data reset successfully");
            } else {
                this.error = response.error || msg("Failed to reset telemetry data");
            }
        } catch (err) {
            this.error = msg("Failed to reset telemetry data");
            console.error("Error resetting telemetry data:", err);
        } finally {
            this.resetting = false;
        }
    }

    private showRemoveVinConfirmModal() {
        this.showRemoveVinConfirm = true;
    }

    private handleRemoveVinCancel() {
        this.showRemoveVinConfirm = false;
    }

    private async handleRemoveVinConfirm() {
        this.showRemoveVinConfirm = false;
        await this.deletePendingVehicle();
    }

    private async deletePendingVehicle() {
        if (!this.imei) {
            this.error = msg("No IMEI provided");
            return;
        }

        this.removingVin = true;
        this.error = "";

        try {
            const response = await this.apiService.callApi('DELETE', `/pending-vehicle/vin-to-imei/${this.imei}`, null, true, true);
            if (response.success) {
                console.log("Pending vehicle deleted successfully");
                // Close the modal after successful deletion
                this.closeModal();
            } else {
                this.error = response.error || msg("Failed to delete pending vehicle");
            }
        } catch (err) {
            this.error = msg("Failed to delete pending vehicle");
            console.error("Error deleting pending vehicle:", err);
        } finally {
            this.removingVin = false;
        }
    }

    private async sendImmobilizerCommand(state: 'on' | 'off') {
        if (!this.imei) {
            this.immobilizerError = msg("No IMEI provided");
            return;
        }

        this.immobilizerLoading = true;
        this.immobilizerError = "";
        
        try {
            const response = await this.apiService.callApi(
                'POST', 
                `/pending-vehicle/command/${this.imei}`, 
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
        this.sendImmobilizerCommand('on');
    }

    private immobilizerOff() {
        this.sendImmobilizerCommand('off');
    }

    // Method to load telemetry data (to be called from parent). Performs the initial
    // load with a spinner, then starts the live poll loop.
    public async loadTelemetryData() {
        await this.applyTelemetry(true);
        this.startPolling();
    }

    // applyTelemetry fetches the latest telemetry + identity frames and refreshes the view.
    // `initial` shows the loading spinner and resets paging; subsequent (poll) refreshes do
    // neither, so the installer's scroll position and the panel don't flicker.
    private async applyTelemetry(initial: boolean) {
        if (!this.imei) {
            this.error = msg("No IMEI provided");
            return;
        }

        if (initial) {
            this.loading = true;
            this.error = "";
        }

        try {
            // Fetch both telemetry and identity data in parallel
            const [telemetryResponse, identityResponse] = await Promise.all([
                this.apiService.callApi<TelemetryData[]>('GET', `/pending-vehicle-telemetry/${this.imei}?type=telemetry`, null, true, true),
                this.apiService.callApi<TelemetryData[]>('GET', `/pending-vehicle-telemetry/${this.imei}?type=identification`, null, true, true)
            ]);

            // Handle telemetry data
            if (telemetryResponse.success && telemetryResponse.data) {
                this.telemetryData = Array.isArray(telemetryResponse.data) ? telemetryResponse.data : [];
                if (this.telemetryData.length > 0) {
                    const first = this.telemetryData[0];
                    this.updateOdometerDisplay(this.telemetryData);
                    this.updateRpmDisplay(first);
                    this.updateIgnitionDisplay(first);
                    this.updateEngineBlockDisplay(first);
                }
            } else {
                console.error("Failed to load telemetry data:", telemetryResponse.error);
            }

            // Handle identity data
            if (identityResponse.success && identityResponse.data) {
                this.identityData = Array.isArray(identityResponse.data) ? identityResponse.data : [];
            } else {
                console.error("Failed to load identity data:", identityResponse.error);
            }

            // If the modal opened without an authoritative VIN (brand-new device), derive it
            // from the polled frames once it appears. No-op once a VIN is known.
            this.maybeDeriveVin();

            if (initial) {
                this.currentIndex = 0;
                this.currentIdentityIndex = 0;
                // Only surface an error on the initial load; a transient poll failure should
                // not blow away a working view.
                if (!telemetryResponse.success && !identityResponse.success) {
                    this.error = msg("Failed to load telemetry and identity data");
                }
            } else {
                this.clampIndices();
            }

            this.updateLiveness();
        } catch (err) {
            if (initial) {
                this.error = msg("Failed to load telemetry data");
            }
            console.error("Error loading telemetry data:", err);
        } finally {
            if (initial) {
                this.loading = false;
            }
        }
    }

    // updateLiveness records the newest frame timestamp (across both feeds) and ticks the
    // clock so the "Live" indicator re-evaluates on every poll.
    private updateLiveness() {
        this.nowMs = Date.now();
        let latest = 0;
        for (const arr of [this.telemetryData, this.identityData]) {
            for (const it of arr) {
                if (!it.receivedAt) continue;
                const t = new Date(it.receivedAt).getTime();
                if (!isNaN(t) && t > latest) latest = t;
            }
        }
        this.lastFrameMs = latest;
    }

    // Keep the paging indices in range after a refresh changes the number of frames.
    private clampIndices() {
        const maxT = this.pages.length - 1;
        if (this.currentIndex > maxT) this.currentIndex = Math.max(0, maxT);
        const maxI = this.identityPages.length - 1;
        if (this.currentIdentityIndex > maxI) this.currentIdentityIndex = Math.max(0, maxI);
    }

    private startPolling() {
        this.stopPolling();
        if (!this.show || !this.imei) return;
        this.pollDeadline = Date.now() + TelemetryModalElement.POLL_MAX_MS;
        this.pollTimer = window.setInterval(() => {
            if (!this.show || Date.now() > this.pollDeadline) {
                this.stopPolling();
                return;
            }
            void this.applyTelemetry(false);
        }, TelemetryModalElement.POLL_INTERVAL_MS);
    }

    private stopPolling() {
        if (this.pollTimer !== null) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    // Decode a record's IO elements (hex values) into a typed, human-readable table.
    private renderIoElements(ioElements: unknown) {
        if (!Array.isArray(ioElements) || ioElements.length === 0) {
            return html`<pre class="telemetry-blob" style="max-height:30vh; overflow:auto;">${this.formatJsonForDisplay(ioElements)}</pre>`;
        }
        const rows = ioElements
            .filter((el: any) => el && typeof el === 'object' && 'id' in el)
            .map((el: any) => {
                const id = Number(el.id);
                const decoded = decodeIo(id, typeof el.value === 'string' ? el.value : '');
                return {id, name: getIoName(id), ...decoded};
            });
        return html`
            <div style="max-height:30vh; overflow:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                    <thead>
                        <tr style="text-align:left; border-bottom:1px solid #e5e7eb;">
                            <th style="padding:2px 6px;">${msg('IO')}</th>
                            <th style="padding:2px 6px;">${msg('Name')}</th>
                            <th style="padding:2px 6px;">${msg('Type')}</th>
                            <th style="padding:2px 6px;">${msg('Value')}</th>
                            <th style="padding:2px 6px;">${msg('Hex')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => html`
                            <tr style="border-bottom:1px solid #f3f4f6;">
                                <td style="padding:2px 6px; font-variant-numeric: tabular-nums;">${r.id}</td>
                                <td style="padding:2px 6px;">${r.name}</td>
                                <td style="padding:2px 6px; opacity:0.7;">${r.type}</td>
                                <td style="padding:2px 6px; font-weight:600; font-variant-numeric: tabular-nums;">${r.display}</td>
                                <td style="padding:2px 6px; opacity:0.6;"><code>${r.hex}</code></td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
            <details style="margin-top:6px;">
                <summary style="cursor:pointer; font-size:0.75rem; opacity:0.7;">${msg('Raw')}</summary>
                <pre class="telemetry-blob" style="max-height:30vh; overflow:auto;">${this.formatJsonForDisplay(ioElements)}</pre>
            </details>
        `;
    }

    // VIN is transmitted across IO 104/105/106 (OBD VIN), each an ASCII chunk, in order.
    private static readonly VIN_IO_IDS = [104, 105, 106];

    // maybeDeriveVin fills the VIN label from polled frames only when the modal opened
    // without an authoritative VIN (set by the parent on load). The !this.vin guard means
    // once a VIN is known — authoritative or derived — we stop scanning IO 104-106.
    private maybeDeriveVin() {
        if (this.vin) return;
        const derived = this.extractVinFromFrames();
        if (derived) this.vin = derived;
    }

    // extractVinFromFrames concatenates the decoded ASCII of IO 104/105/106 within a single
    // record across the polled telemetry frames, returning the first VIN-length result.
    private extractVinFromFrames(): string {
        for (const item of this.telemetryData) {
            for (const row of this.getRawTelemetryRows(item)) {
                const io = row.io_elements;
                if (!Array.isArray(io)) continue;
                const part = (id: number): string => {
                    const el = (io as IoElement[]).find(e => e && typeof e === 'object' && e.id === id);
                    if (!el || typeof el.value !== 'string') return '';
                    const decoded = decodeIo(id, el.value);
                    return decoded.display !== '—' ? decoded.display : '';
                };
                const vin = TelemetryModalElement.VIN_IO_IDS.map(part).join('').trim();
                // Mirror the backend's "looks like a VIN" threshold (length > 10).
                if (vin.length > 10) return vin;
            }
        }
        return '';
    }

    private getRawTelemetryRows(item: TelemetryData): { header: unknown; io_elements: unknown }[] {
        const raw = item.rawTelemetry;

        // If it's already an array of entries
        if (Array.isArray(raw)) {
            return raw.map(entry => ({
                header: entry?.header ?? {},
                io_elements: entry?.io_elements ?? []
            }));
        }

        // If it's an object entry
        if (raw && typeof raw === 'object') {
            const entry = raw as RawTelemetryEntry;
            return [{
                header: entry?.header ?? {},
                io_elements: entry?.io_elements ?? []
            }];
        }

        // If it's a string (possibly stringified JSON)
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw) as RawTelemetryEntry | RawTelemetryEntry[];
                if (Array.isArray(parsed)) {
                    return parsed.map(entry => ({
                        header: entry?.header ?? {},
                        io_elements: entry?.io_elements ?? []
                    }));
                }
                return [{
                    header: parsed?.header ?? {},
                    io_elements: parsed?.io_elements ?? []
                }];
            } catch {
                // Fallback: can't parse, return raw string in header column
                return [{ header: raw, io_elements: [] }];
            }
        }

        return [{ header: {}, io_elements: [] }];
    }

    // Flatten all incoming telemetry entries to page over
    private get pages(): { header: unknown; io_elements: unknown }[] {
        if (!this.telemetryData || this.telemetryData.length === 0) return [];
        const all: { header: unknown; io_elements: unknown }[] = [];
        for (const item of this.telemetryData) {
            all.push(...this.getRawTelemetryRows(item));
        }
        return all;
    }

    // Flatten all incoming identity entries to page over
    private get identityPages(): { data: unknown; receivedAt: string }[] {
        if (!this.identityData || this.identityData.length === 0) return [];
        return this.identityData.map(item => ({
            data: item.rawTelemetry,
            receivedAt: item.receivedAt || ''
        }));
    }

    private get currentTitle(): string {
        const page = this.pages[this.currentIndex];
        if (!page) return msg('Telemetry Record');
        // Try to extract header.timestamp
        const header: any = page.header as any;
        const ts = header?.timestamp ?? header?.time ?? null;
        if (ts == null) return msg('Telemetry Record');
        return `Timestamp: ${this.formatTimestamp(ts)}`;
    }

    private get currentIdentityTitle(): string {
        const page = this.identityPages[this.currentIdentityIndex];
        if (!page) return msg('Identity Record');
        if (page.receivedAt) {
            return `Received At: ${new Date(page.receivedAt).toLocaleString()}`;
        }
        return msg('Identity Record');
    }

    private formatTimestamp(ts: any): string {
        try {
            if (typeof ts === 'number') {
                // Heuristic: if in seconds, multiply to ms
                const ms = ts < 1e12 ? ts * 1000 : ts;
                return new Date(ms).toLocaleString();
            }
            if (typeof ts === 'string') {
                const num = Number(ts);
                if (!Number.isNaN(num)) {
                    const ms = num < 1e12 ? num * 1000 : num;
                    return new Date(ms).toLocaleString();
                }
                // Assume ISO-like
                const d = new Date(ts);
                if (!isNaN(d.getTime())) return d.toLocaleString();
                return ts;
            }
            return String(ts);
        } catch {
            return String(ts);
        }
    }

    private nextPage = () => {
        if (this.currentIndex < this.pages.length - 1) {
            this.currentIndex += 1;
        }
    };

    private prevPage = () => {
        if (this.currentIndex > 0) {
            this.currentIndex -= 1;
        }
    };

    private nextIdentityPage = () => {
        if (this.currentIdentityIndex < this.identityPages.length - 1) {
            this.currentIdentityIndex += 1;
        }
    };

    private prevIdentityPage = () => {
        if (this.currentIdentityIndex > 0) {
            this.currentIdentityIndex -= 1;
        }
    };

    private formatJsonForDisplay(data: unknown): string {
        try {
            const toFormat = typeof data === 'string' ? JSON.parse(data) : data;
            return JSON.stringify(toFormat, null, 2);
        } catch {
            // If not JSON string, display as-is or as JSON
            return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        }
    }

    private updateOdometerDisplay(items: TelemetryData[]): void {
        if (!items || items.length === 0) {
            this.odometerDisplay = "—";
            return;
        }

        // Filter out error values between 4261412864 and 4294967295
        const MIN_ERROR_VALUE = 4261412864;
        const MAX_ERROR_VALUE = 4294967295;

        for (const item of items) {
            // Check both IO 645 and IO 114 for odometer value
            const value645 = this.findIoValueDecimal(item, 645);
            const value114 = this.findIoValueDecimal(item, 114);
            
            // Helper function to check if value is valid
            const isValidValue = (val: number | null): boolean => {
                if (val === null) return false;
                if (val === 0) return false;
                if (val >= MIN_ERROR_VALUE && val <= MAX_ERROR_VALUE) return false;
                return true;
            };
            
            // Use value from IO 645 if valid
            if (isValidValue(value645)) {
                this.odometerDisplay = String(value645);
                return;
            }
            
            // Otherwise use value from IO 114 if valid
            if (isValidValue(value114)) {
                this.odometerDisplay = String(value114);
                return;
            }
        }

        // No valid value found in any record
        this.odometerDisplay = "—";
    }

    private hexStringToDecimal(value: string): number | null {
        let hex = value.trim();
        if (hex.startsWith('0x') || hex.startsWith('0X')) {
            hex = hex.slice(2);
        }
        // reject non-hex strings
        if (!/^[0-9a-fA-F]+$/.test(hex)) {
            return null;
        }
        try {
            return parseInt(hex, 16);
        } catch {
            return null;
        }
    }

    private findIoValueDecimal(item: TelemetryData | undefined, ioId: number): number | null {
        if (!item) return null;
        const rows = this.getRawTelemetryRows(item);
        if (!rows || rows.length === 0) return null;
        const io = rows[0].io_elements as any;
        if (!Array.isArray(io)) return null;
        const match = io.find((el: any) => el && typeof el === 'object' && 'id' in el && el.id === ioId);
        const valueStr = match?.value;
        if (typeof valueStr !== 'string') return null;
        return this.hexStringToDecimal(valueStr);
    }

    private updateRpmDisplay(item: TelemetryData | undefined): void {
        if (!item) {
            this.rpmDisplay = "—";
            return;
        }

        const decimal = this.findIoValueDecimal(item, 94);
        // IO 94 reports RPM in 0.25-rpm units; divide by 4 for actual RPM (frontend-only).
        this.rpmDisplay = decimal !== null ? String(decimal / 4) : "—";
    }

    private updateIgnitionDisplay(item: TelemetryData | undefined): void {
        if (!item) {
            this.ignitionDisplay = "—";
            return;
        }

        const decimal = this.findIoValueDecimal(item, 409);
        this.ignitionDisplay = decimal !== null ? String(decimal) : "—";
    }

    private updateEngineBlockDisplay(item: TelemetryData | undefined): void {
        if (!item) {
            this.engineBlockDisplay = "—";
            return;
        }

        const decimal = this.findIoValueDecimal(item, 405);
        this.engineBlockDisplay = decimal !== null ? String(decimal) : "—";
    }

    private handleIoSearch(e: Event) {
        const input = e.target as HTMLInputElement;
        const value = input.value.trim();
        this.ioSearchValue = input.value;

        if (value === "") {
            this.ioSearchResult = "—";
            return;
        }

        const ioId = parseInt(value, 10);
        if (isNaN(ioId)) {
            this.ioSearchResult = msg("Invalid ID");
            return;
        }

        // Search through all telemetry data for the first match
        for (const item of this.telemetryData) {
            const decimal = this.findIoValueDecimal(item, ioId);
            if (decimal !== null) {
                this.ioSearchResult = `${getIoName(ioId)}: ${decimal}`;
                return;
            }
        }

        this.ioSearchResult = msg("Not found");
    }
}
