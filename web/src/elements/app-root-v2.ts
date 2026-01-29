import {LitElement, html, css} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import { provide } from '@lit/context';
import { apiServiceContext } from '../context';
import {ApiService} from "@services/api-service.ts";
import { Router } from '@lit-labs/router';
import {globalStyles} from "../global-styles.ts";
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
        ` ]

    @provide({ context: apiServiceContext })
    apiService = ApiService.getInstance(); // app-level singleton

    //private oracleTenantService = OracleTenantService.getInstance();

    @state()
    private hasOracleAccess: boolean = true;

    @state()
    private currentPath: string = '/';

    constructor() {
        super();

        this.router = new Router(this, [
            // Handle direct loads to the html entry file (e.g., /app-v2.html)
            // so the router doesn't error before hash-based navigation kicks in.
            { path: '/', render: () => html`<home-view></home-view>` },
            { path: '/vehicles-fleets', render: () => html`<vehicles-fleets-view></vehicles-fleets-view>` },
            { path: '/vehicles/:vin', render: ({ vin }) => html`<vehicle-detail-view .vin=${vin}></vehicle-detail-view>` },
            { path: '/users', render: () => html`<users-view></users-view>` },
            { path: '/users/create', render: () => html`<create-user-view></create-user-view>` },
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
        this.currentPath = path;
        await this.router.goto(path);
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

    private async copyWalletToClipboard(address: string) {
        if (!address) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(address);
            } else {
                // Fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = address;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            // Optional: simple feedback
            console.debug('Wallet address copied to clipboard');
        } catch (e) {
            console.error('Failed to copy wallet address', e);
        }
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
                        <div class="nav-item ${this.isActive('/onboarding') ? 'active' : ''}">
                            <a data-page="onboarding" href="#/onboarding" aria-current="${this.isActive('/onboarding') ? 'page' : 'false'}">Onboarding</a>
                        </div>
                        <div class="nav-item ${this.isActive('/vehicles-fleets') ? 'active' : ''}">
                            <a data-page="vehicles" href="#/vehicles-fleets" aria-current="${this.isActive('/vehicles-fleets') ? 'page' : 'false'}">Vehicles & Fleets</a>
                        </div>
                        
                        <div class="nav-item hidden" data-page="vehicle-detail" id="nav-vehicle-detail">Vehicle Detail</div>
                        <div class="nav-divider"></div>
                        <div class="nav-item ${this.isActive('/reports') ? 'active' : ''}">
                            <a data-page="reports" href="#/reports" aria-current="${this.isActive('/reports') ? 'page' : 'false'}">Reports</a>
                        </div>
                        <div class="nav-item ${this.isActive('/users') ? 'active' : ''}">
                            <a data-page="users" href="#/users" aria-current="${this.isActive('/users') ? 'page' : 'false'}">Users</a>
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
                                <span
                                  class="user-info user-wallet clickable"
                                  title="${userWalletAddress} (click to copy)"
                                  @click=${() => this.copyWalletToClipboard(userWalletAddress)}
                                >${walletDisplay}</span>
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