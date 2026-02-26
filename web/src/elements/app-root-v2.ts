import {LitElement, html, css} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import { provide } from '@lit/context';
import { apiServiceContext } from '../context';
import {ApiService} from "@services/api-service.ts";
import {IdentityService} from "@services/identity-service.ts";
import { Router } from '@lit-labs/router';
import {globalStyles} from "../global-styles.ts";
import './click-to-copy-element';
// import {OracleTenantService} from "@services/oracle-tenant-service.ts";

@customElement('app-root-v2')
export class AppRootV2 extends LitElement {
    private router: Router;
    private boundOnHashChange = () => this.onHashChange();

    static styles = [ globalStyles,
        css`
            .sidebar-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }

            .nav-item.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .nav-item.disabled a {
                pointer-events: none;
            }

            .switch-tenant-btn {
                white-space: normal; /* allow breaking at space to fit nicely */
                text-align: center;
                line-height: 1.1;
            }

            .header-right {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            /* Stack email and wallet vertically while keeping Logout button to the right */
            .user-block {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                line-height: 1.2;
            }

            .user-info {
                display: block;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 360px; /* fallback clamp; can be adjusted or removed if global styles set width */
            }

            .user-wallet.clickable {
                cursor: pointer;
            }

            .update-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }

            .update-modal {
                background: var(--background-color, #fff);
                border: 1px solid #000;
                border-radius: 8px;
                padding: 24px;
                max-width: 400px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }

            .update-modal h3 {
                margin-top: 0;
                margin-bottom: 12px;
            }

            .update-modal p {
                margin-bottom: 20px;
            }

            .update-modal-actions {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }
        ` ];

    @provide({ context: apiServiceContext })
    apiService = ApiService.getInstance(); // app-level singleton

    //private oracleTenantService = OracleTenantService.getInstance();

    @state()
    private hasOracleAccess: boolean = true;

    @state()
    private currentPath: string = '/';

    @state()
    private showUpdateModal: boolean = false;

    @state()
    private permissions: string[] = [];

    private currentCommit: string | null = null;
    private versionCheckInterval: number | null = null;

    constructor() {
        super();

        this.router = new Router(this, [
            // Handle direct loads to the html entry file (e.g., /app-v2.html)
            // so the router doesn't error before hash-based navigation kicks in.
            { path: '/', render: () => html`<home-view></home-view>` },
            { path: '/vehicles-fleets', render: () => html`<vehicles-fleets-view></vehicles-fleets-view>` },
            { path: '/vehicles/:tokenID', render: ({ tokenID }) => html`<vehicle-detail-view .tokenID=${tokenID}></vehicle-detail-view>` },
            { path: '/users', render: () => html`<users-view></users-view>` },
            { path: '/users/create', render: () => html`<create-user-view></create-user-view>` },
            { path: '/users/edit/:walletAddress', render: ({ walletAddress }) => html`<edit-user-view .walletAddress=${walletAddress}></edit-user-view>` },
            { path: '/reports', render: () => html`<reports-view></reports-view>` },
            { path: '/onboarding', render: () => html`<onboarding-view></onboarding-view>` },
            { path: '/tenant-selector', render: () => html`<tenant-selector-view></tenant-selector-view>` },
            { path: '/tenant-settings', render: () => html`<tenant-settings-view></tenant-settings-view>` },
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

        // Ensure oracle in global state and verify access TODO
        this.hasOracleAccess = true;  //await this.oracleTenantService.verifyOracleAccess();

        await this.fetchUserPermissions();

        // Start version checking only if not in local environment
        if (!window.location.href.includes('local')) {
            await this.checkVersion();
            this.versionCheckInterval = window.setInterval(() => this.checkVersion(), 60000);
        }
    }

    disconnectedCallback(): void {
        window.removeEventListener('hashchange', this.boundOnHashChange);
        if (this.versionCheckInterval !== null) {
            clearInterval(this.versionCheckInterval);
        }
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
        this.currentPath = path;
        await this.router.goto(path);
    }

    private async fetchUserPermissions() {
        try {
            this.permissions = await IdentityService.getInstance().getUserPermissions();
        } catch (e) {
            console.error('Failed to fetch user permissions', e);
        }
    }

    private isActive(targetPath: string): boolean {
        return this.currentPath === targetPath;
    }

    private getPageTitle(): string {
        const path = this.currentPath || '/';
        if (path === '/') return 'Home';
        if (path.startsWith('/onboarding')) return 'Onboarding';
        if (path.startsWith('/vehicles/')) return 'Vehicle Detail';
        if (path.startsWith('/vehicles-fleets')) return 'Vehicles & Fleets';
        if (path.startsWith('/reports')) return 'Reports';
        if (path.startsWith('/users/create')) return 'Create User';
        if (path.startsWith('/users/edit')) return 'Edit User';
        if (path.startsWith('/users')) return 'Users';
        if (path.startsWith('/tenant-selector')) return 'Tenant Selector';
        if (path.startsWith('/tenant-settings')) return 'Tenant Settings';
        return 'Home';
    }

    private truncateWalletToEmail(wallet: string, email: string): string {
        if (!wallet) return '';
        if (!email) return wallet; // nothing to match against

        const targetLen = email.length;
        if (wallet.length <= targetLen) return wallet;

        // Middle ellipsis to fit within targetLen
        // keep at least 6 chars on each side when possible
        const ellipsis = '…';
        const available = Math.max(0, targetLen - ellipsis.length);
        const left = Math.max(6, Math.floor(available / 2));
        const right = Math.max(6, available - left);
        if (left + right <= 0) return ellipsis;
        const start = wallet.slice(0, left);
        const end = wallet.slice(-right);
        return `${start}${ellipsis}${end}`;
    }

    private async checkVersion() {
        try {
            const response = await fetch('/version');
            if (!response.ok) return;

            const data = await response.json();
            const serverCommit = data.commit;

            // Store the first commit we see
            if (this.currentCommit === null) {
                this.currentCommit = serverCommit;
                sessionStorage.setItem('appCommit', serverCommit);
                return;
            }

            // Check if version has changed
            if (serverCommit !== this.currentCommit) {
                this.showUpdateModal = true;
            }
        } catch (e) {
            console.error('Failed to check version', e);
        }
    }

    private handleRefresh() {
        window.location.reload();
    }

    private handleDismissUpdate() {
        this.showUpdateModal = false;
    }

    render() {
        const userEmail = localStorage.getItem("email") || "";
        const userWalletAddress = this.apiService.getWalletAddress() || "";
        const walletDisplay = this.truncateWalletToEmail(userWalletAddress, userEmail);
        return html`
            <div class="app-container">
                <!-- Sidebar -->
                <aside class="sidebar">
                    <div class="sidebar-header" @click=${this.onSidebarClick}>
                        <img src="/assets/dimo-logo-d.png" alt="DIMO" class="logo" />
                        <a class="btn btn-sm switch-tenant-btn" href="#/tenant-selector">Switch Tenant</a>
                    </div>
                    <nav class="sidebar-nav" @click=${this.onSidebarClick}>
                        <div class="nav-item ${this.isActive('/') ? 'active' : ''}" data-page="home">
                            <a data-page="home" href="#/" aria-current="${this.isActive('/') ? 'page' : 'false'}">Home</a>
                        </div>
                        <div class="nav-item ${this.isActive('/onboarding') ? 'active' : ''} ${!this.permissions.includes('onboard_vehicles') ? 'disabled' : ''}" 
                             title="${!this.permissions.includes('onboard_vehicles') ? 'You don\'t have access' : ''}">
                            <a data-page="onboarding" 
                               href="#/onboarding" 
                               aria-current="${this.isActive('/onboarding') ? 'page' : 'false'}"
                               tabindex="${!this.permissions.includes('onboard_vehicles') ? '-1' : '0'}"
                               aria-disabled="${!this.permissions.includes('onboard_vehicles') ? 'true' : 'false'}">Onboarding</a>
                        </div>
                        <div class="nav-item ${this.isActive('/vehicles-fleets') ? 'active' : ''}">
                            <a data-page="vehicles" href="#/vehicles-fleets" aria-current="${this.isActive('/vehicles-fleets') ? 'page' : 'false'}">Vehicles & Fleets</a>
                        </div>
                        
                        <div class="nav-item hidden" data-page="vehicle-detail" id="nav-vehicle-detail">Vehicle Detail</div>
                        <div class="nav-divider"></div>
                        <div class="nav-item ${this.isActive('/reports') ? 'active' : ''} ${!this.permissions.includes('reports') ? 'disabled' : ''}"
                             title="${!this.permissions.includes('reports') ? 'You don\'t have access' : ''}">
                            <a data-page="reports" 
                               href="#/reports" 
                               aria-current="${this.isActive('/reports') ? 'page' : 'false'}"
                               tabindex="${!this.permissions.includes('reports') ? '-1' : '0'}"
                               aria-disabled="${!this.permissions.includes('reports') ? 'true' : 'false'}">Reports</a>
                        </div>
                        <div class="nav-item ${this.isActive('/users') ? 'active' : ''} ${!this.permissions.includes('manage_admin_users') ? 'disabled' : ''}"
                             title="${!this.permissions.includes('manage_admin_users') ? 'You don\'t have access' : ''}">
                            <a data-page="users" 
                               href="#/users" 
                               aria-current="${this.isActive('/users') ? 'page' : 'false'}"
                               tabindex="${!this.permissions.includes('manage_admin_users') ? '-1' : '0'}"
                               aria-disabled="${!this.permissions.includes('manage_admin_users') ? 'true' : 'false'}">Users</a>
                        </div>
                        <div class="nav-divider"></div>
                        <div class="nav-item ${this.isActive('/tenant-settings') ? 'active' : ''}">
                            <a data-page="tenant-settings" href="#/tenant-settings" aria-current="${this.isActive('/tenant-settings') ? 'page' : 'false'}">Settings</a>
                        </div>
                    </nav>
                </aside>

                <!-- Main Content -->
                <main class="main-area">
                    <!-- Top Header -->
                    <header class="top-header">
                        <div class="header-title" id="page-title">${this.getPageTitle()}</div>
                        <div class="header-right">
                            <div class="user-block">
                                <span class="user-info user-email" title="${userEmail}">${userEmail}</span>
                                <click-to-copy-element .valueToCopy="${userWalletAddress}">
                                    <span
                                      class="user-info user-wallet clickable"
                                    >${walletDisplay}</span>
                                </click-to-copy-element>
                            </div>
                            <button class="btn btn-sm" @click=${this.handleLogout}>LOGOUT</button>
                        </div>
                    </header>

                    <!-- Content Area -->
                    <div class="content">
                        <div class="content-inner">
                            ${!this.hasOracleAccess ? html`
                                <!-- Show access denied notice if user doesn't have access -->
                                <div class="access-denied-notice">
                                    <div class="icon">🚫</div>
                                    <h3>Access Denied</h3>
                                    <p>
                                        You do not have access to the selected oracle. Please pick a different Oracle.
                                    </p>
                                </div>
                         ` : html`
                                <span></span>
                         `} 
                         ${this.router.outlet()}
                        </div>
                    </div>
                    
                </main>
            </div>

            ${this.showUpdateModal ? html`
                <div class="update-modal-overlay">
                    <div class="update-modal">
                        <h3>Update Available</h3>
                        <p>A new version of the application is available. Would you like to refresh to get the latest updates?</p>
                        <div class="update-modal-actions">
                            <button class="btn btn-sm" @click=${this.handleDismissUpdate}>Cancel</button>
                            <button class="btn btn-sm btn-primary" @click=${this.handleRefresh}>Refresh</button>
                        </div>
                    </div>
                </div>
            ` : ''}
    `;
    }

    private onSidebarClick = async (e: MouseEvent) => {
        // Delegate anchor clicks to ensure hash navigation triggers our router.
        const target = e.target as HTMLElement | null;
        const anchor = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
        if (!anchor || anchor.closest('.nav-item.disabled')) return;
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
    };

    // Oracle persistence is handled by OracleTenantService

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