import {html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {customElement, property} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";

interface PendingVehicle {
    vin: string;
    imei: string;
}

@customElement('pending-vehicles-element')
export class PendingVehiclesElement extends LitElement {
    static properties = {
        items: {type: Array},
        alertText: {type: String},
        loading: {type: Boolean},
    }

    @property({attribute: true})
    private items: PendingVehicle[];

    private alertText: string;
    private loading: boolean;
    private apiService: ApiService;

    constructor() {
        super();
        this.items = [];
        this.alertText = "";
        this.loading = false;
        this.apiService = ApiService.getInstance();
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        return this;
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.loadPendingVehicles();
    }

    private async loadPendingVehicles() {
        this.loading = true;
        this.alertText = "";
        
        const response = await this.apiService.callApi<PendingVehicle[]>(
            'GET',
            '/pending-vehicles',
            null,
            true, // auth required
            true  // oracle endpoint
        );

        this.loading = false;

        if (response.success && response.data) {
            this.items = response.data;
        } else {
            this.alertText = response.error || "Failed to load pending vehicles";
            this.items = [];
        }
    }

    private async onboardVehicle(vin: string, imei: string) {
        console.log(`Onboarding vehicle with VIN: ${vin}, IMEI: ${imei}`);
        
        // Dispatch event to copy VIN to add-vin-element
        this.dispatchEvent(new CustomEvent('onboard-vehicle', {
            detail: { vin: vin, imei: imei },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <h2>Pending to Onboard Vehicles</h2>
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            ${this.loading ? html`<div>Loading...</div>` : html`
                <table style="font-size: 80%">
                    <tr>
                        <th>VIN</th>
                        <th>IMEI</th>
                        <th>Action</th>
                    </tr>
                    ${repeat(this.items, (item) => item.vin, (item) => html`
                        <tr>
                            <td>${item.vin}</td>
                            <td>${item.imei}</td>
                            <td>
                                <button @click=${() => this.onboardVehicle(item.vin, item.imei)}>
                                    Onboard
                                </button>
                            </td>
                        </tr>
                    `)}
                </table>
            `}
        `
    }
}

