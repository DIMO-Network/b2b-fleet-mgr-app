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

interface Manufacturer {
    tokenId: number;
    name: string;
}

interface DeviceDefinition {
    model: string;
    year: number;
    manufacturer: Manufacturer;
}

interface DefinitionResponse {
    data: {
        deviceDefinition: DeviceDefinition;
    };
}

interface TopDefinitionsResponse {
    definitions: string[];
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

    @state()
    private validatingVins: Set<string> = new Set()

    @state()
    private validDefinitions: Set<string> = new Set()

    @state()
    private invalidDefinitions: Set<string> = new Set()

    @state()
    private topDefinitions: string[] = []

    private apiService: ApiService;
    private validationTimers: Map<string, number> = new Map();

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
            this.loadTopDefinitions();
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
                                            <div style="position: relative; display: flex; align-items: center; gap: 0.5rem;">
                                                <input 
                                                    type="text" 
                                                    placeholder="make_model_year" 
                                                    list="definitions-datalist-${vin}"
                                                    .value=${this.vehicleDefinitions.get(vin) || ''}
                                                    @input=${(e: InputEvent) => this.handleDefinitionInput(vin, e)}
                                                    ?disabled=${this.decodingVins.has(vin)}
                                                    class=${this.invalidVins.has(vin) || this.invalidDefinitions.has(vin) ? 'invalid' : ''}
                                                    required
                                                    style="width: 100%; margin-top: 0.25rem; flex: 1;">
                                                <datalist id="definitions-datalist-${vin}">
                                                    ${this.topDefinitions.map(def => html`
                                                        <option value=${def}></option>
                                                    `)}
                                                </datalist>
                                                ${this.validatingVins.has(vin) ? html`
                                                    <span class="spinner" style="display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #333; border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0;"></span>
                                                ` : this.validDefinitions.has(vin) ? html`
                                                    <span style="color: #16a34a; font-size: 1.25rem; flex-shrink: 0; margin-top: 0.25rem;">✓</span>
                                                ` : this.invalidDefinitions.has(vin) ? html`
                                                    <span style="color: #dc2626; font-size: 1.25rem; flex-shrink: 0; margin-top: 0.25rem;">✗</span>
                                                ` : nothing}
                                            </div>
                                        </label>
                                        ${this.invalidVins.has(vin) ? html`
                                            <div style="color: #dc2626; font-size: 0.875rem; margin-top: 0.25rem;">
                                                This field is required
                                            </div>
                                        ` : this.invalidDefinitions.has(vin) ? html`
                                            <div style="color: #dc2626; font-size: 0.875rem; margin-top: 0.25rem;">
                                                This definition does not exist
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
        
        // Clear previous validation states
        this.validDefinitions.delete(vin);
        this.invalidDefinitions.delete(vin);
        
        // Clear any existing validation timer for this VIN
        const existingTimer = this.validationTimers.get(vin);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        
        // If empty, don't validate yet (will be caught by required validation)
        if (!value.trim()) {
            this.requestUpdate();
            return;
        }
        
        // Set up debounced validation (1 second delay)
        const timerId = setTimeout(() => {
            this.validateDefinition(vin, value.trim());
        }, 1000) as unknown as number;
        
        this.validationTimers.set(vin, timerId);
        this.requestUpdate();
    }

    private async validateDefinition(vin: string, definitionId: string) {
        // Validate the definition exists
        this.validatingVins.add(vin);
        this.requestUpdate();
        
        try {
            const response = await this.getDefinitionById(definitionId);
            
            if (response.success && response.data?.data?.deviceDefinition?.model) {
                // Definition is valid
                this.validDefinitions.add(vin);
                this.invalidDefinitions.delete(vin);
            } else {
                // Definition is invalid
                this.invalidDefinitions.add(vin);
                this.validDefinitions.delete(vin);
            }
        } catch (error) {
            console.error(`Error validating definition for VIN ${vin}:`, error);
            // On error, mark as invalid
            this.invalidDefinitions.add(vin);
            this.validDefinitions.delete(vin);
        } finally {
            this.validatingVins.delete(vin);
            this.validationTimers.delete(vin);
            this.requestUpdate();
        }
    }

    private closeModal() {
        this.show = false;
        
        // Clear all validation timers
        this.validationTimers.forEach(timerId => clearTimeout(timerId));
        this.validationTimers.clear();
        
        // Clear invalid states when closing
        this.invalidVins.clear();
        this.validDefinitions.clear();
        this.invalidDefinitions.clear();
        
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
        
        // Check if any definitions are invalid (don't exist)
        if (this.invalidDefinitions.size > 0) {
            // Don't submit if there are invalid definitions
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
                    // Mark as valid since it came from the decode endpoint
                    this.validDefinitions.add(vin);
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

    private async loadTopDefinitions() {
        try {
            const response = await this.apiService.callApi<TopDefinitionsResponse>('GET', '/definitions/top', null, true, true);
            
            if (response.success && response.data?.definitions) {
                this.topDefinitions = response.data.definitions;
            }
        } catch (error) {
            console.error('Error loading top definitions:', error);
        }
    }

    private async getDefinitionById(id: string): Promise<ApiResponse<DefinitionResponse>> {
        return await this.apiService.callApi<DefinitionResponse>('GET', `/identity/definition/${id}`, null, true, false);
    }
}

