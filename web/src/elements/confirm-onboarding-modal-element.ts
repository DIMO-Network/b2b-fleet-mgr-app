import {html, nothing, LitElement} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import {VehicleWithDefinition} from "@elements/base-onboarding-element.ts";
import {ApiService} from "@services/api-service.ts";
import {ApiResponse} from "@datatypes/api-response.ts";

interface DecodeVinResponse {
    deviceDefinitionId: string;
    newTransactionHash: string;
}

@customElement('confirm-onboarding-modal-element')
export class ConfirmOnboardingModalElement extends LitElement {
    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: false})
    public vins: string[] = []

    @state()
    private vehicleDefinitions: Map<string, string> = new Map()

    @state()
    private decodingVins: Set<string> = new Set()

    @state()
    private invalidVins: Set<string> = new Set()

    private apiService: ApiService;

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Initialize definitions map when vins are provided
        this.initializeDefinitions();
    }

    updated(changedProperties: Map<string, any>) {
        super.updated(changedProperties);
        if (changedProperties.has('vins')) {
            this.initializeDefinitions();
        }
        if (changedProperties.has('show') && this.show) {
            this.decodeAllVins();
        }
    }

    private initializeDefinitions() {
        const newDefinitions = new Map<string, string>();
        for (const vin of this.vins) {
            // Preserve existing definition if available, otherwise empty string
            newDefinitions.set(vin, this.vehicleDefinitions.get(vin) || '');
        }
        this.vehicleDefinitions = newDefinitions;
    }

    render() {
        if (!this.show) {
            return nothing;
        }

        return html`
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
                    <div class="modal-header">
                        <h3>Confirm Vehicle Onboarding</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>
                    <div class="modal-body">
                        <p>Review and optionally update the vehicle definitions before onboarding:</p>
                        <div style="margin-top: 1rem;">
                            ${repeat(this.vins, (vin) => vin, (vin, index) => html`
                                <div style="margin-bottom: 1rem; padding: 1rem; border: 1px solid #ddd; border-radius: 4px;">
                                    <div style="margin-bottom: 0.5rem;">
                                        <strong>Vehicle ${index + 1}</strong>
                                    </div>
                                    <div style="margin-bottom: 0.5rem;">
                                        <label style="display: block; font-size: 0.9rem; color: #666;">
                                            VIN:
                                        </label>
                                        <div style="font-family: monospace; padding: 0.5rem; background: #f5f5f5; border-radius: 4px;">
                                            ${vin}
                                        </div>
                                    </div>
                                    <div>
                                        <label style="display: block; margin-bottom: 0.25rem;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span>Definition (required):</span>
                                                ${this.decodingVins.has(vin) ? html`
                                                    <span style="font-size: 0.9rem; color: #666;">
                                                        <span class="spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid #ccc; border-top-color: #333; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
                                                        Decoding...
                                                    </span>
                                                ` : nothing}
                                            </div>
                                            <input 
                                                type="text" 
                                                placeholder="make_model_year" 
                                                .value=${this.vehicleDefinitions.get(vin) || ''}
                                                @input=${(e: InputEvent) => this.handleDefinitionInput(vin, e)}
                                                ?disabled=${this.decodingVins.has(vin)}
                                                class=${this.invalidVins.has(vin) ? 'invalid' : ''}
                                                required
                                                style="width: 100%; margin-top: 0.25rem;">
                                        </label>
                                        ${this.invalidVins.has(vin) ? html`
                                            <div style="color: #dc2626; font-size: 0.875rem; margin-top: 0.25rem;">
                                                This field is required
                                            </div>
                                        ` : nothing}
                                    </div>
                                </div>
                            `)}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" @click=${this.closeModal}>
                            Cancel
                        </button>
                        <button type="button" class="btn-primary" @click=${this.confirmOnboarding}>
                            Confirm Onboarding
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    private handleDefinitionInput(vin: string, e: InputEvent) {
        const value = (e.target as HTMLInputElement).value;
        this.vehicleDefinitions.set(vin, value);
        
        // Clear invalid state when user types
        if (value.trim()) {
            this.invalidVins.delete(vin);
        }
        
        this.requestUpdate();
    }

    private closeModal() {
        this.show = false;
        
        // Clear invalid states when closing
        this.invalidVins.clear();
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private confirmOnboarding() {
        // Validate all definitions are filled
        const newInvalidVins = new Set<string>();
        
        for (const vin of this.vins) {
            const definition = this.vehicleDefinitions.get(vin) || '';
            if (!definition.trim()) {
                newInvalidVins.add(vin);
            }
        }
        
        // If there are invalid fields, show errors and don't submit
        if (newInvalidVins.size > 0) {
            this.invalidVins = newInvalidVins;
            this.requestUpdate();
            return;
        }
        
        // Build array of vehicles with their definitions
        const vehiclesWithDefinitions: VehicleWithDefinition[] = this.vins.map(vin => ({
            vin,
            definition: this.vehicleDefinitions.get(vin) || ''
        }));

        // Dispatch event with the vehicle data
        this.dispatchEvent(new CustomEvent('onboarding-confirmed', {
            detail: { vehicles: vehiclesWithDefinitions },
            bubbles: true,
            composed: true
        }));

        this.show = false;
    }
    
    private async decodeAllVins() {
        // Decode VINs sequentially (not in parallel)
        for (const vin of this.vins) {
            // Skip if already has a definition
            if (this.vehicleDefinitions.get(vin)) {
                continue;
            }
            
            // Mark as decoding
            this.decodingVins.add(vin);
            this.requestUpdate();
            
            try {
                // TODO: Get country code from appropriate source
                const countryCode = 'USA';
                const response = await this.decodeVin(vin, countryCode);
                
                if (response.success && response.data) {
                    // Set the decoded definition
                    this.vehicleDefinitions.set(vin, response.data.deviceDefinitionId);
                }
            } catch (error) {
                console.error(`Error decoding VIN ${vin}:`, error);
            } finally {
                // Remove from decoding set
                this.decodingVins.delete(vin);
                this.requestUpdate();
            }
        }
    }

    private async decodeVin(vin: string, countryCode: string): Promise<ApiResponse<DecodeVinResponse>> {
        const payload = {
            vin: vin,
            countryCode: countryCode
        }
        return await this.apiService.callApi<DecodeVinResponse>('POST', '/definitions/decodevin', payload, true, false);
    }
}

