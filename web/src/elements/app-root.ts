import { LitElement, html } from 'lit';
import {customElement, state} from 'lit/decorators.js';
import { provide } from '@lit/context';
import { apiServiceContext } from '../context';
import {ApiService} from "@services/api-service.ts";
import {Vehicle} from "@datatypes/vehicle.ts";

interface VehiclesResponse {
    vehicles: Vehicle[];
}

const ORACLE_STORAGE_KEY = "oracle"

@customElement('app-root')
export class AppRoot extends LitElement {
    @provide({ context: apiServiceContext })
    apiService = ApiService.getInstance(); // app-level singleton

    @state()
    private vehicles: Vehicle[]

    @state()
    private oracle: string;

    constructor() {
        super();
        this.vehicles = []
        this.oracle = this.loadOracle("motorq")
        this.apiService.setOracle(this.oracle)
    }

    // enable inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    render() {
        return html`
            <div class="header">
                <h1 class="title">Fleet Onboarding App</h1>
                <button class="logout-btn">Logout</button>
            </div>
            <oracle-selector .selectedOption=${this.oracle} @option-changed=${this.handleOracleChange}></oracle-selector>
            <add-vin-element></add-vin-element>
            
            <vehicle-list-element .items=${this.vehicles}></vehicle-list-element>
    `;
    }

    private async handleOracleChange(e: CustomEvent) {
        // Access the selected value from the event detail
        const selectedValue = e.detail.value;
        console.log('Oracle changed to:', selectedValue);

        this.apiService.setOracle(selectedValue);
        this.saveOracle(selectedValue)
        await this.getUserVehicles()
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.getUserVehicles()
    }

    async getUserVehicles() {
        const url = "/vehicles";
        const userVehiclesResponse = await this.apiService.callApi<VehiclesResponse>('GET', url, null, true);
        console.debug('user vehicles', userVehiclesResponse)
        this.vehicles = userVehiclesResponse.data?.vehicles || [];
    }

    private saveOracle(oracle: string) {
        localStorage.setItem(ORACLE_STORAGE_KEY, oracle)
    }

    private loadOracle(defaultOracle: string) {
        const oracle = localStorage.getItem(ORACLE_STORAGE_KEY)
        return oracle === null ? defaultOracle : oracle;
    }
}
