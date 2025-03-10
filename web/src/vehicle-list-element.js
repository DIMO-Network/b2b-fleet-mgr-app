import {html, LitElement, css} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {Settings} from "./settings.js";

export class VehicleListElement extends LitElement {
    static properties = {
        items: {type: Array},
        alertText: {type: String },
    }

    constructor() {
        super();
        this.items = [];
        this.settings = new Settings(); // what is best way to do a singleton?
        this.token = localStorage.getItem("token");
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
        const userDevicesResp = await this.getUserDevicesMe();
        if(!userDevicesResp.success) {
            this.alertText = "failed to get vehicles: " + userDevicesResp.error;
        }
        this.items = userDevicesResp.data.userDevices;
    }

    render() {
        return html`
            <h2>My Vehicles</h2>
            <table style="font-size: 80%">
                <tr>
                    <th>VIN</th>
                    <th>Make Model Year</th>
                    <th>Web2 Status</th>
                    <th>Token ID</th>
                    <th>Synthetic Device ID</th>
                    <th></th>
                </tr>
                ${repeat(this.items, (item) => item.id, (item, index) => html`
          <tr>
              <td>${item.vin}</td>
              <td>${item.deviceDefinition.name}</td>
              <td>${item.integrations.length > 0 ? item.integrations[0].status : 'no integration'}</td>
              <td>${item.nft?.tokenId}</td>
              <td>${item.integrations.length > 0 ? item.integrations[0].syntheticDevice?.tokenId : ''}</td>
              <td><button>delete</button></td>
          </tr>`)}
            </table>
        `
    }

    async getUserDevicesMe() {
        const url = this.settings.getBackendUrl() + "/v1/user/devices/me";
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
            });
            const result = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: result.message || result,
                    status: response.status,
                };
            }
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            console.error("Error in get compass lookup:", error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }
}
window.customElements.define('vehicle-list-element', VehicleListElement);