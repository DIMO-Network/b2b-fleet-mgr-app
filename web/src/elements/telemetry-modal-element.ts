import {html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {LitElement} from 'lit';

interface TelemetryData {
    dateReceived: string;
    telemetryBlob: string;
}

@customElement('telemetry-modal-element')
export class TelemetryModalElement extends LitElement {
    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: true})
    public vehicleVin = ""

    @state()
    private telemetryData: TelemetryData[] = []

    @state()
    private loading = false

    @state()
    private error = ""

    constructor() {
        super();
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
                        <h3>Telemetry Data - ${this.vehicleVin}</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
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
                                                    <td>${item.dateReceived}</td>
                                                    <td class="telemetry-blob">${item.telemetryBlob}</td>
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
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    // Method to load telemetry data (to be called from parent)
    public async loadTelemetryData() {
        this.loading = true;
        this.error = "";
        
        try {
            // TODO: Replace with actual API call
            // For now, simulate loading with mock data
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.telemetryData = [
                {
                    dateReceived: "2024-01-15 10:30:45",
                    telemetryBlob: "{\"speed\": 65, \"location\": {\"lat\": 40.7128, \"lng\": -74.0060}, \"fuel\": 75.5}"
                },
                {
                    dateReceived: "2024-01-15 10:25:12",
                    telemetryBlob: "{\"speed\": 0, \"location\": {\"lat\": 40.7128, \"lng\": -74.0060}, \"fuel\": 75.2, \"engine\": \"on\"}"
                },
                {
                    dateReceived: "2024-01-15 10:20:33",
                    telemetryBlob: "{\"speed\": 45, \"location\": {\"lat\": 40.7100, \"lng\": -74.0080}, \"fuel\": 75.8, \"engine\": \"on\"}"
                }
            ];
        } catch (err) {
            this.error = "Failed to load telemetry data";
            console.error("Error loading telemetry data:", err);
        } finally {
            this.loading = false;
        }
    }
}
