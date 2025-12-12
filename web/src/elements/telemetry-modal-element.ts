import {css, html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {LitElement} from 'lit';
import { ApiService } from '../services/api-service';
import {globalStyles} from "../global-styles.ts";

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
    ]
    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: true})
    public imei = ""

    @property({attribute: true})
    public vin = ""

    @state()
    private telemetryData: TelemetryData[] = []

    @state()
    private loading = false

    @state()
    private error = ""

    @state()
    private resetting = false

    @state()
    private odometerDisplay: string = "—"

    @state()
    private rpmDisplay: string = "—"

    @state()
    private ignitionDisplay: string = "—"

    @state()
    private engineBlockDisplay: string = "—"

    @state()
    private immobilizerLoading = false

    @state()
    private immobilizerError = ""

    private apiService: ApiService;

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
    }

    connectedCallback() {
        super.connectedCallback();
    }

    // Use shadow DOM; styles are provided via globalStyles

    render() {
        if (!this.show) {
            return nothing;
        }

        return html`
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content telemetry-modal" @click=${(e: Event) => e.stopPropagation()}>
                    <div class="modal-header">
                        <h3>Telemetry Data - ${this.imei}${this.vin ? ` (${this.vin})` : ''}</h3>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <button type="button" 
                                    class="btn-secondary" 
                                    ?disabled=${this.resetting}
                                    @click=${this.resetTelemetry}
                                    style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                ${this.resetting ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                                Reset Telemetry
                            </button>
                            <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                        </div>
                    </div>
                    <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" 
                                class="btn-danger" 
                                ?disabled=${this.immobilizerLoading}
                                @click=${this.immobilizerOn}
                                style="font-size: 0.875rem; padding: 0.5rem 1rem; background-color: #dc2626; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
                            ${this.immobilizerLoading ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #ffffff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                            Immobilizer On
                        </button>
                        <button type="button" 
                                class="btn-success" 
                                ?disabled=${this.immobilizerLoading}
                                @click=${this.immobilizerOff}
                                style="font-size: 0.875rem; padding: 0.5rem 1rem; background-color: #16a34a; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
                            ${this.immobilizerLoading ? html`<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #ffffff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></span>` : ''}
                            Immobilizer Off
                        </button>
                        ${this.immobilizerError ? html`
                            <div style="color: #dc2626; font-size: 0.875rem;">${this.immobilizerError}</div>
                        ` : ''}
                    </div>
                    <div class="modal-body">
                        ${this.loading ? html`
                            <div class="loading-message">Loading telemetry data...</div>
                        ` : html`
                            ${this.error ? html`
                                <div class="alert alert-error">${this.error}</div>
                            ` : html`
                                <div class="telemetry-metrics" style="display: flex; align-items: baseline; gap: 2rem; margin-bottom: 0.5rem;">
                                    <div><span style="opacity: 0.8;">Odometer:</span> <strong>${this.odometerDisplay}</strong></div>
                                    <div><span style="opacity: 0.8;">RPM:</span> <strong>${this.rpmDisplay}</strong></div>
                                    <div><span style="opacity: 0.8;">Ignition:</span> <strong>${this.ignitionDisplay}</strong></div>
                                    <div><span style="opacity: 0.8;">Engine Block:</span> <strong>${this.engineBlockDisplay}</strong></div>
                                </div>
                                ${this.telemetryData.length > 0 ? html`
                                    <table class="telemetry-table">
                                        <thead>
                                            <tr>
                                                <th>Header</th>
                                                <th>IO Elements</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${this.telemetryData.flatMap(item => this.getRawTelemetryRows(item)).map(row => html`
                                                <tr>
                                                    <td><pre class="telemetry-blob">${this.formatJsonForDisplay(row.header)}</pre></td>
                                                    <td><pre class="telemetry-blob">${this.formatJsonForDisplay(row.io_elements)}</pre></td>
                                                </tr>
                                            `)}
                                        </tbody>
                                    </table>
                                ` : html`
                                    <div class="no-data">No telemetry data available for this vehicle.</div>
                                `}
                            `}
                        `}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" @click=${this.closeModal}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    private closeModal() {
        this.show = false;
        this.telemetryData = [];
        this.error = "";
        this.loading = false;
        this.resetting = false;
        this.immobilizerLoading = false;
        this.immobilizerError = "";
        this.odometerDisplay = "—";
        this.rpmDisplay = "—";
        this.ignitionDisplay = "—";
        this.engineBlockDisplay = "—";
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private async resetTelemetry() {
        if (!this.imei) {
            this.error = "No IMEI provided";
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
                console.log("Telemetry data reset successfully");
            } else {
                this.error = response.error || "Failed to reset telemetry data";
            }
        } catch (err) {
            this.error = "Failed to reset telemetry data";
            console.error("Error resetting telemetry data:", err);
        } finally {
            this.resetting = false;
        }
    }

    private async sendImmobilizerCommand(state: 'on' | 'off') {
        if (!this.imei) {
            this.immobilizerError = "No IMEI provided";
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

    // Method to load telemetry data (to be called from parent)
    public async loadTelemetryData() {
        if (!this.imei) {
            this.error = "No IMEI provided";
            return;
        }

        this.loading = true;
        this.error = "";
        
        try {
            const response = await this.apiService.callApi<TelemetryData[]>('GET', `/pending-vehicle-telemetry/${this.imei}`, null, true, true);
            if (response.success && response.data) {
                this.telemetryData = Array.isArray(response.data) ? response.data : [];
                if (this.telemetryData.length > 0) {
                    const first = this.telemetryData[0];
                    this.updateOdometerDisplay(this.telemetryData);
                    this.updateRpmDisplay(first);
                    this.updateIgnitionDisplay(first);
                    this.updateEngineBlockDisplay(first);
                }
            } else {
                this.error = response.error || "Failed to load telemetry data";
            }
        } catch (err) {
            this.error = "Failed to load telemetry data";
            console.error("Error loading telemetry data:", err);
        } finally {
            this.loading = false;
        }
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
        this.rpmDisplay = decimal !== null ? String(decimal) : "—";
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
}
