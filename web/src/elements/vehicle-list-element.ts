import {html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {ApiService} from "@services/api-service.ts";
import {customElement} from "lit/decorators.js";

interface DeviceDefinition {
    id: string;
    make: string;
    model: string;
    year: number;
}

interface SynteticDevice {
    id: string;
    tokenId: number;
    mintedAt: string;
}

interface Vehicle {
    vin: string;
    id: string;
    tokenId: number;
    mintedAt: string;
    owner: `0x${string}`
    definition: DeviceDefinition;
    syntheticDevice: SynteticDevice;
}

interface VehiclesResponse {
    vehicles: Vehicle[];
}

@customElement('vehicle-list-element')
export class VehicleListElement extends LitElement {
    static properties = {
        items: {type: Array},
        alertText: {type: String },
    }
    private items: Vehicle[];
    private alertText: string;
    private api: ApiService;

    constructor() {
        super();
        this.items = [];
        this.api = ApiService.getInstance();
        this.alertText = "";
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    async connectedCallback() {
        super.connectedCallback();
        // call func to load items
        const userVehiclesResponse = await this.getUserVehicles();
        if(!userVehiclesResponse.success) {
            this.alertText = "failed to get vehicles: " + userVehiclesResponse.error;
        }
        console.debug('user vehicles', userVehiclesResponse)
        this.items = userVehiclesResponse.data?.vehicles || [];
    }

    render() {
        return html`
            <h2>My Vehicles</h2>
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <table style="font-size: 80%">
                <tr>
                    <th>VIN</th>
                    <th>Make Model Year</th>
                    <th>Token ID</th>
                    <th>Synthetic </br>Device ID</th>
                    <th></th>
                </tr>
                ${repeat(this.items, (item) => item.id, (item) => html`
          <tr>
              <td>${item.vin}</td>
              <td>${item.definition.make} ${item.definition.model} ${item.definition.year}</td>
              <td>${item.tokenId}</td>
              <td>${item.syntheticDevice?.tokenId || ''}</td>
              <td><button>delete</button></td>
          </tr>`)}
            </table>
        `
    }

    async getUserVehicles() {
        const url = "/v1/vehicles";
        return await this.api.callApi<VehiclesResponse>('GET', url, null, true);
    }
}
