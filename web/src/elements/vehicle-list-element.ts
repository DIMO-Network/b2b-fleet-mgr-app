import {html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {customElement, property, state} from "lit/decorators.js";
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

    @state()
    private searchTerm: string = "";

    private searchDebounce?: number;


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

    private get filteredItems(): Vehicle[] {
        const term = this.searchTerm?.trim().toLowerCase();
        if (!term) return this.items;
        return this.items.filter((item) => {
            const vin = item.vin?.toLowerCase() || "";
            const imei = item.imei?.toLowerCase() || "";
            return vin.includes(term) || imei.includes(term);
        });
    }

    private onSearchInput = (e: InputEvent) => {
        this.searchTerm = (e.target as HTMLInputElement).value;
        if (this.searchDebounce) {
            clearTimeout(this.searchDebounce);
        }
        this.searchDebounce = window.setTimeout(() => {
            this.requestUpdate();
        }, 600);
    }

    render() {
        return html`
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem;">
                <h2 style="margin: 0;">Onboarded Vehicles</h2>
                <input type="text"
                       placeholder="Search by IMEI or VIN"
                       style="width: 40%; min-width: 200px;"
                       .value=${this.searchTerm}
                       @input=${this.onSearchInput}>
            </div>
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <table style="font-size: 80%">
                <tr>
                    <th>VIN</th>
                    <th>Make Model Year</th>
                    <th>IMEI</th>
                    <th>Token ID</th>
                    <th>Vendor <br />Connection</th>
                    <th></th>
                </tr>
                ${repeat(this.filteredItems, (item) => item.id, (item) => html`
          <vehicle-list-item-element .item="${item}">`)}
            </table>
        `
    }
}
