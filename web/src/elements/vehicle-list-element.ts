import {html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {customElement, property} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";

@customElement('vehicle-list-element')
export class VehicleListElement extends LitElement {
    static properties = {
        items: {type: Array},
        alertText: {type: String },
    }

    @property({attribute: true})
    private items: Vehicle[];

    private alertText: string;


    constructor() {
        super();
        this.items = [];

        this.alertText = "";
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    render() {
        return html`
            <h2>Onboarded Vehicles</h2>
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <table style="font-size: 80%">
                <tr>
                    <th>VIN</th>
                    <th>Make Model Year</th>
                    <th>IMEI</th>
                    <th>Token ID</th>
                    <th>Synthetic <br/>Device ID</th>
                    <th>Vendor <br />Connection</th>
                    <th></th>
                </tr>
                ${repeat(this.items, (item) => item.id, (item) => html`
          <vehicle-list-item-element .item="${item}">`)}
            </table>
        `
    }
}
