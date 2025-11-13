import {html, nothing, LitElement} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import {VehicleWithDefinition} from "@elements/base-onboarding-element.ts";

@customElement('confirm-onboarding-modal-element')
export class ConfirmOnboardingModalElement extends LitElement {
    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: false})
    public vins: string[] = []

    @state()
    private vehicleDefinitions: Map<string, string> = new Map()

    constructor() {
        super();
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
                                            Definition (optional):
                                            <input 
                                                type="text" 
                                                placeholder="make_model_year" 
                                                .value=${this.vehicleDefinitions.get(vin) || ''}
                                                @input=${(e: InputEvent) => this.handleDefinitionInput(vin, e)}
                                                style="width: 100%; margin-top: 0.25rem;">
                                        </label>
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
        this.requestUpdate();
    }

    private closeModal() {
        this.show = false;
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private confirmOnboarding() {
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
}

