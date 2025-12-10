import {LitElement, html, css} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import { provide } from '@lit/context';
import { apiServiceContext } from '../context';
import {ApiService} from "@services/api-service.ts";
import { Router } from '@lit-labs/router';
import {globalStyles} from "../global-styles.ts";

const ORACLE_STORAGE_KEY = "oracle"

@customElement('app-root-v2')
export class AppRootV2 extends LitElement {
    private router: Router;
    private boundOnHashChange = () => this.onHashChange();

    static styles = [ globalStyles,
        css`` ]

    @provide({ context: apiServiceContext })
    apiService = ApiService.getInstance(); // app-level singleton

    @state()
    private oracle: string;

    @state()
    private hasOracleAccess: boolean = true;

    constructor() {
        super();
        this.oracle = this.loadOracle("kaufmann")

        this.router = new Router(this, [
            { path: '/', render: () => html`<home-view></home-view>` },
            { path: '/vehicles-fleets', render: () => html`<vehicles-fleets-view></vehicles-fleets-view>` },
            { path: '/users', render: () => html`<users-view></users-view>` },
            { path: '/reports', render: () => html`<reports-view></reports-view>` },
            { path: '/onboarding', render: () => html`<onboarding-view></onboarding-view>` },
        ]);
    }

    async connectedCallback() {
        super.connectedCallback();
        this.hasOracleAccess = await this.apiService.setOracle(this.oracle);

        window.addEventListener('hashchange', this.boundOnHashChange);
    }

    disconnectedCallback(): void {
        window.removeEventListener('hashchange', this.boundOnHashChange);
        super.disconnectedCallback();
    }

    firstUpdated(): void {
        // Navigate to current hash on first render, or default to '/'
        this.onHashChange();
    }

    // private navigate(path: string) {
    //     this.dispatchEvent(new CustomEvent('nav-request', { detail: { path }, bubbles: true, composed: true }));
    // }

    // private onNavigate(e: CustomEvent<{ path: string }>) {
    //     const path = e.detail.path || '/';
    //     if (location.hash !== `#${path}`) {
    //         location.hash = path;
    //     } else {
    //         // If hash is same, still ensure router updates (e.g., initial load)
    //         this.router.goto(path);
    //     }
    // }

    private async onHashChange() {
        const path = location.hash?.slice(1) || '/';
        await this.router.goto(path);
    }

    render() {
        const userEmail = localStorage.getItem("email") || "";
        const userWalletAddress = this.apiService.getWalletAddress() || "";
        return html`
            <div class="app-container">
                <!-- Sidebar -->
                <aside class="sidebar">
                    <div class="sidebar-header">
                        <img src="data:image/webp;base64,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" alt="Logo" class="logo">
                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item active" data-page="home">
                            <a data-page="home" href="#/">Home</a>
                        </div>
                        <div class="nav-item">
                            <a data-page="vehicles" href="#/vehicles-fleets">Vehicles & Fleets</a>
                        </div>
                        <div class="nav-item">
                            <a data-page="users" href="#/users">Users</a>
                        </div>
                        <div class="nav-item hidden" data-page="vehicle-detail" id="nav-vehicle-detail">Vehicle Detail</div>
                        <div class="nav-divider"></div>
                        <div class="nav-item">
                            <a data-page="reports" href="#/reports">Reports</a>
                        </div>
                        <div class="nav-item">
                            <a data-page="onboarding" href="#/onboarding">Onboarding</a>
                        </div>
                    </nav>
                </aside>

                <!-- Main Content -->
                <main class="main-area">
                    <!-- Top Header -->
                    <header class="top-header">
                        <div class="header-title" id="page-title">Home</div>
                        <div class="header-right">
                            <span class="user-info">${userEmail}</span>
                            <span class="user-info">${userWalletAddress}</span>
                            <button class="btn btn-sm" @click=${this.handleLogout}>LOGOUT</button>
                        </div>
                    </header>

                    <!-- Content Area -->
                    <div class="content">
                        <div class="content-inner">
                            <!-- todo: move oracle selector and tenant selector to own screen -->
                            <oracle-selector .selectedOption=${this.oracle} @option-changed=${this.handleOracleChange}></oracle-selector>

                            ${this.hasOracleAccess ? html`
                                ${this.router.outlet()}
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
                            
                        </div>
                    </div>
                    
                </main>
            </div>
            
            
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
            await this.reloadVehicleList();
        }
    }

    private async reloadVehicleList() {
        // Reload the vehicle list by calling the vehicle-list-element's load method
        const vehicleListElement = this.querySelector('vehicle-list-element') as any;
        if (vehicleListElement && vehicleListElement.loadVehicles) {
            await vehicleListElement.loadVehicles();
        }
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
