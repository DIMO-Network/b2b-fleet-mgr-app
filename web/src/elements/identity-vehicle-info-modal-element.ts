import {html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {LitElement} from 'lit';
import { ApiService } from '../services/api-service';

interface VehicleIdentityData {
    data?: {
        vehicle?: any;
    };
    errors?: any[];
}

@customElement('identity-vehicle-info-modal-element')
export class IdentityVehicleInfoModalElement extends LitElement {
    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: true})
    public tokenId = ""

    @property({attribute: true})
    public imei = ""

    @property({attribute: true})
    public vin = ""

    @state()
    private identityData: VehicleIdentityData | null = null

    @state()
    private loading = false

    @state()
    private error = ""

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
                <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="max-width: 800px;">
                    <div class="modal-header">
                        <h3>Vehicle Identity Information - Token ID: ${this.tokenId}</h3>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            ${this.imei ? html`
                                <button type="button" 
                                        class="btn-primary" 
                                        @click=${this.openTelemetryModal}
                                        style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                    Telemetry & Command
                                </button>
                            ` : ''}
                            <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                        </div>
                    </div>
                    <div class="modal-body">
                        ${this.loading ? html`
                            <div class="loading-message">Loading vehicle identity data...</div>
                        ` : html`
                            ${this.error ? html`
                                <div class="alert alert-error">${this.error}</div>
                            ` : html`
                                ${this.identityData ? html`
                                    <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow: auto; max-height: 60vh;">${this.formatJsonForDisplay(this.identityData)}</pre>
                                ` : html`
                                    <div class="no-data">No identity data available for this vehicle.</div>
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
        this.identityData = null;
        this.error = "";
        this.loading = false;
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private openTelemetryModal() {
        if (!this.imei) {
            console.error("No IMEI available to open telemetry modal");
            return;
        }

        console.log("Opening telemetry modal for IMEI:", this.imei, "VIN:", this.vin);
        
        // Create the telemetry modal using the separate component
        const modal = document.createElement('telemetry-modal-element') as any;
        modal.show = true;
        modal.imei = this.imei;
        modal.vin = this.vin || '';
        
        // Add event listener for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });
        
        // Add to body
        document.body.appendChild(modal);
        
        // Load telemetry data after the modal is added to the DOM
        setTimeout(() => {
            modal.loadTelemetryData();
        }, 100);
    }

    // Method to load identity data (to be called from parent)
    public async loadIdentityData() {
        if (!this.tokenId) {
            this.error = "No Token ID provided";
            return;
        }

        this.loading = true;
        this.error = "";
        
        try {
            const response = await this.apiService.callApi<VehicleIdentityData>('GET', `/identity/vehicle/${this.tokenId}`, null, false, false);
            if (response.success && response.data) {
                this.identityData = response.data;
            } else {
                this.error = response.error || "Failed to load vehicle identity data";
            }
        } catch (err) {
            this.error = "Failed to load vehicle identity data";
            console.error("Error loading vehicle identity data:", err);
        } finally {
            this.loading = false;
        }
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
}

