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
            // Handle direct loads to the html entry file (e.g., /app-v2.html)
            // so the router doesn't error before hash-based navigation kicks in.
            { path: '/', render: () => html`<home-view></home-view>` },
            { path: '/vehicles-fleets', render: () => html`<vehicles-fleets-view></vehicles-fleets-view>` },
            { path: '/users', render: () => html`<users-view></users-view>` },
            { path: '/reports', render: () => html`<reports-view></reports-view>` },
            { path: '/onboarding', render: () => html`<onboarding-view></onboarding-view>` },
        ]);
    }

    async connectedCallback() {
        super.connectedCallback();
        // Start listening for hash changes as early as possible
        window.addEventListener('hashchange', this.boundOnHashChange);
        // Sync the current hash immediately
        if (!location.hash) {
            // Normalize to hash-based routing on first load
            location.hash = '/';
        }
        await this.onHashChange();

        this.hasOracleAccess = await this.apiService.setOracle(this.oracle);
    }

    disconnectedCallback(): void {
        window.removeEventListener('hashchange', this.boundOnHashChange);
        super.disconnectedCallback();
    }

    async firstUpdated() {
        // Ensure navigation on first render as well
        await this.onHashChange();
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
        // Debug aid
        // console.debug('[app-root-v2] onHashChange ->', path);
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
                        <img src="/assets/kaufmann-logo.svg" alt="Kaufmann" class="logo" />
                    </div>
                    <nav class="sidebar-nav" @click=${this.onSidebarClick}>
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

    private onSidebarClick = async (e: MouseEvent) => {
        // Delegate anchor clicks to ensure hash navigation triggers our router.
        const target = e.target as HTMLElement | null;
        const anchor = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
        if (!anchor) return;
        // Prevent the browser default and set the hash ourselves to guarantee a hashchange.
        e.preventDefault();
        const hash = anchor.getAttribute('href') || '#/';
        const path = hash.startsWith('#') ? hash.slice(1) : hash;
        if (location.hash !== `#${path}`) {
            location.hash = path;
        } else {
            // If same hash, manually invoke router to refresh view if needed.
            await this.router.goto(path || '/');
        }
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
        window.location.href = '/login.html';
    }
}