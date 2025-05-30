import {html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {ApiService} from "@services/api-service.ts";
import {customElement} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";


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
          <vehicle-list-item-element .item="${item}">`)}
            </table>
        `
    }

    async getUserVehicles() {
        const url = "/v1/vehicles";
        return await this.api.callApi<VehiclesResponse>('GET', url, null, true);
    }

    async disconnectVehicle(vin: string) {
        const url = "/v1/vehicle/disconnect";
        const body = {vin};

        return await this.api.callApi<any>('POST', url, body, true);
    }

    async deleteVehicle(vin: string) {
        const url = "/v1/vehicle/delete";
        const body = {vin};
        return await this.api.callApi<any>('POST', url, body, true);
    }
}
