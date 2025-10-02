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

    @state()
    private hasOracleAccess: boolean = true;

    constructor() {
        super();
        this.vehicles = []
        this.oracle = this.loadOracle("kaufmann")
    }

    // enable inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    render() {
        const userEmail = localStorage.getItem("email") || "";
        return html`
            <div class="header">
                <h1 class="title">Fleet Onboarding App</h1>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span style="font-size: 0.875rem; color: #666;">${userEmail}</span>
                    <button class="logout-btn" @click=${this.handleLogout} >Logout</button>
                </div>
            </div>
            <oracle-selector .selectedOption=${this.oracle} @option-changed=${this.handleOracleChange}></oracle-selector>
            
            ${this.hasOracleAccess ? html`
                <!-- Show these elements only if user has access to the selected oracle -->
                <add-vin-element @item-changed=${this.getUserVehicles}></add-vin-element>
                <vehicle-list-element .items=${this.vehicles} @item-changed=${this.getUserVehicles}></vehicle-list-element>
            ` : html`
                <!-- Show access denied notice if user doesn't have access -->
                <div class="access-denied-notice">
                    <div class="icon">🚫</div>
                    <h3>Access Denied</h3>
                    <p>
                        You do not have access to the selected oracle. Please contact your administrator or select a different oracle.
                    </p>
                </div>
            `}
    `;
    }

    private async handleOracleChange(e: CustomEvent) {
        // Access the selected value from the event detail
        const selectedValue = e.detail.value;
        console.log('Oracle changed to:', selectedValue);

        const access = await this.apiService.setOracle(selectedValue);
        this.hasOracleAccess = access;
        this.saveOracle(selectedValue)

        if (access) {
            await this.getUserVehicles()
        } else {
            // Clear vehicles if no access
            this.vehicles = [];
        }
    }

    async connectedCallback() {
        super.connectedCallback();
        const access = await this.apiService.setOracle(this.oracle);
        this.hasOracleAccess = access;

        if (access) {
            await this.getUserVehicles()
        }
    }

    async getUserVehicles() {
        const url = "/vehicles";
        const userVehiclesResponse = await this.apiService.callApi<VehiclesResponse>('GET', url, null, true);
        console.debug('user vehicles', userVehiclesResponse)
        this.vehicles = userVehiclesResponse.data?.vehicles?.sort((a, b) => a.tokenId - b.tokenId) || [];
    }

    private saveOracle(oracle: string) {
        localStorage.setItem(ORACLE_STORAGE_KEY, oracle)
    }

    private loadOracle(defaultOracle: string) {
        const oracle = localStorage.getItem(ORACLE_STORAGE_KEY)
        return oracle === null ? defaultOracle : oracle;
    }


    private handleLogout() {
        const keysToRemove = ['token', 'email', 'appSettings', 'accountInfo', 'signerPublicKey', 'signerApiKey'];

        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
        });

        console.log('Selected localStorage keys removed for logout.');

        // Optionally, you can also redirect the user after logout:
        window.location.href = '/';
    }
}
