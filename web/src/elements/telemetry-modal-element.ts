import {html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {LitElement} from 'lit';
import { ApiService } from '../services/api-service';

interface TelemetryData {
    rawTelemetry: string;
    receivedAt: string;
}

@customElement('telemetry-modal-element')
export class TelemetryModalElement extends LitElement {
    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: true})
    public imei = ""

    @state()
    private telemetryData: TelemetryData[] = []

    @state()
    private loading = false

    @state()
    private error = ""

    @state()
    private resetting = false

    private apiService: ApiService;

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
    }

    connectedCallback() {
        super.connectedCallback();
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        return this;
    }

    render() {
        if (!this.show) {
            return nothing;
        }

        return html`
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content telemetry-modal" @click=${(e: Event) => e.stopPropagation()}>
                    <div class="modal-header">
                        <h3>Telemetry Data - ${this.imei}</h3>
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
                    <div class="modal-body">
                        ${this.loading ? html`
                            <div class="loading-message">Loading telemetry data...</div>
                        ` : html`
                            ${this.error ? html`
                                <div class="alert alert-error">${this.error}</div>
                            ` : html`
                                ${this.telemetryData.length > 0 ? html`
                                    <table class="telemetry-table">
                                        <thead>
                                            <tr>
                                                <th>Date Received</th>
                                                <th>Telemetry Blob</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${this.telemetryData.map(item => html`
                                                <tr>
                                                    <td>${item.receivedAt}</td>
                                                    <td><pre class="telemetry-blob">${JSON.stringify(JSON.parse(item.rawTelemetry), null, 2)}</pre></td>
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
}
