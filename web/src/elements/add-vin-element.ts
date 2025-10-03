import {html} from 'lit'
import {SettingsService} from "@services/settings-service";
import {customElement, property, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import './session-timer';
import {range} from "lodash";
import {BaseOnboardingElement, SacdInput} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";
import {ApiService} from "@services/api-service.ts";

interface PendingVehicle {
    vin: string;
    imei: string;
    firstSeen: string;
}

enum Permission {
    NONLOCATION_TELEMETRY= 1,
    COMMANDS,
    CURRENT_LOCATION,
    ALLTIME_LOCATION,
    CREDENTIALS,
    STREAMS,
    RAW_DATA,
    APPROXIMATE_LOCATION,
    MAX
}

type Permissions = Record<Permission, boolean>

const PERMISSIONS_MAP: Record<number, string> = {
    [Permission.APPROXIMATE_LOCATION]: "APPROXIMATE_LOCATION",
    [Permission.RAW_DATA]: "RAW_DATA",
    [Permission.STREAMS]: "STREAMS",
    [Permission.CREDENTIALS]: "CREDENTIALS",
    [Permission.ALLTIME_LOCATION]: "ALLTIME_LOCATION",
    [Permission.CURRENT_LOCATION]: "CURRENT_LOCATION",
    [Permission.COMMANDS]: "COMMANDS",
    [Permission.NONLOCATION_TELEMETRY]: "NONLOCATION_TELEMETRY",
}

const sacdPermissionValue = (sacdPerms: Permissions): bigint => {
    const permissionMap = [
        sacdPerms[Permission.APPROXIMATE_LOCATION],
        sacdPerms[Permission.RAW_DATA],
        sacdPerms[Permission.STREAMS],
        sacdPerms[Permission.CREDENTIALS],
        sacdPerms[Permission.ALLTIME_LOCATION],
        sacdPerms[Permission.CURRENT_LOCATION],
        sacdPerms[Permission.COMMANDS],
        sacdPerms[Permission.NONLOCATION_TELEMETRY],
    ];

    const permissionString = permissionMap.map((perm) => (perm ? "11" : "00")).join("") + "00";

    return BigInt(`0b${permissionString}`);
};

const defaultPermissions = {
    [Permission.NONLOCATION_TELEMETRY]: true,
    [Permission.COMMANDS]: false,
    [Permission.CURRENT_LOCATION]: true,
    [Permission.ALLTIME_LOCATION]: true,
    [Permission.CREDENTIALS]: true,
    [Permission.STREAMS]: true,
    [Permission.RAW_DATA]: false,
    [Permission.APPROXIMATE_LOCATION]: false,
    [Permission.MAX]: false,
}

@customElement('add-vin-element')
export class AddVinElement extends BaseOnboardingElement {
    @property({attribute: false})
    private vinsBulk: string | null;

    @property({attribute: false})
    private email: string | null;

    @property({attribute: false})
    private alertText: string;

    @property({attribute: false})
    private enableSacd: boolean;

    @property({attribute: false})
    private sacdGrantee: string | null;

    @property({attribute: false})
    private sacdPermissions: Permissions;

    @state() sessionExpiresIn: number = 0;

    // Pending vehicles properties
    @state() private pendingVehicles: PendingVehicle[] = [];
    @state() private selectedPendingVehicles: Set<string> = new Set();
    @state() private pendingVehiclesLoading: boolean = false;
    @state() private pendingVehiclesError: string = "";
    @state() private currentPage: number = 1;
    @state() private pageSize: number = 10;
    @state() private totalItems: number = 0;
    @state() private shouldShowPagination: boolean = false;

    private settings: SettingsService;
    private apiService: ApiService;

    constructor() {
        super();
        this.vinsBulk = "";
        this.email = localStorage.getItem("email");
        this.settings = SettingsService.getInstance();
        this.apiService = ApiService.getInstance();
        this.alertText = "";

        this.enableSacd = false;
        this.sacdGrantee = "";
        this.sacdPermissions = defaultPermissions;
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.settings.fetchPrivateSettings();
        if (this.email === undefined || this.email === "") {
            this.displayFailure("email was not set, please make sure you allow sharing email on Login");
        }
        await this.settings.fetchAccountInfo(this.email!); // load account info

        this.enableSacd = this.settings.sharingInfo?.enabled || false;
        this.sacdGrantee = this.settings.sharingInfo?.grantee || "";
        this.sacdPermissions = this.settings.sharingInfo?.permissions as Permissions || defaultPermissions;
        
        // Load pending vehicles
        await this.loadPendingVehicles();
    }

    togglePermission(permission: number) {
        const value = this.sacdPermissions?.[permission as Permission]
        this.sacdPermissions![permission as Permission] = !value || false;
    }

    toggleEnableSacd() {
        this.enableSacd = !this.enableSacd;
    }

    // Pending vehicles methods
    private async loadPendingVehicles() {
        this.pendingVehiclesLoading = true;
        this.pendingVehiclesError = "";
        
        const skip = (this.currentPage - 1) * this.pageSize;
        const take = this.pageSize;
        
        const url = `/pending-vehicles?skip=${skip}&take=${take}`;
        
        const response = await this.apiService.callApi<PendingVehicle[]>(
            'GET',
            url,
            null,
            true, // auth required
            true  // oracle endpoint
        );

        this.pendingVehiclesLoading = false;

        if (response.success && response.data) {
            this.pendingVehicles = response.data;
            if (response.data.length < this.pageSize) {
                this.totalItems = skip + response.data.length;
            } else {
                this.totalItems = skip + response.data.length + 1;
            }
            this.shouldShowPagination = this.totalItems > this.pageSize;
        } else {
            this.pendingVehiclesError = response.error || "Failed to load pending vehicles";
            this.pendingVehicles = [];
            this.totalItems = 0;
        }
    }

    private togglePendingVehicle(vin: string) {
        if (this.selectedPendingVehicles.has(vin)) {
            this.selectedPendingVehicles.delete(vin);
        } else {
            this.selectedPendingVehicles.add(vin);
        }
        this.requestUpdate();
    }

    private toggleAllPendingVehicles() {
        const allSelected = this.pendingVehicles.every(vehicle => this.selectedPendingVehicles.has(vehicle.vin));
        
        if (allSelected) {
            // If all are selected, deselect all
            this.selectedPendingVehicles.clear();
        } else {
            // If not all are selected, select all
            this.pendingVehicles.forEach(vehicle => {
                this.selectedPendingVehicles.add(vehicle.vin);
            });
        }
        this.requestUpdate();
    }


    private async goToPage(page: number) {
        if (page < 1) return;
        this.currentPage = page;
        await this.loadPendingVehicles();
    }

    private async nextPage() {
        const maxPage = Math.ceil(this.totalItems / this.pageSize);
        if (this.currentPage < maxPage) {
            await this.goToPage(this.currentPage + 1);
        }
    }

    private async previousPage() {
        if (this.currentPage > 1) {
            await this.goToPage(this.currentPage - 1);
        }
    }

    private get totalPages(): number {
        return Math.ceil(this.totalItems / this.pageSize);
    }

    private get hasNextPage(): boolean {
        return this.currentPage < this.totalPages;
    }

    private get hasPreviousPage(): boolean {
        return this.currentPage > 1;
    }

    render() {
        return html`
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <!-- Pending Vehicles Section -->
            <div>
                <h3>Pending Vehicles to Onboard</h3>
                <div class="alert alert-error" role="alert" ?hidden=${this.pendingVehiclesError === ""}>
                    ${this.pendingVehiclesError}
                </div>
                ${this.pendingVehiclesLoading ? html`<div>Loading pending vehicles...</div>` : html`
                    ${this.pendingVehicles.length > 0 ? html`
                        <table style="font-size: 80%; margin-bottom: 1rem;">
                            <tr>
                                <th>
                                    <input type="checkbox" 
                                           .checked=${this.pendingVehicles.length > 0 && this.pendingVehicles.every(vehicle => this.selectedPendingVehicles.has(vehicle.vin))}
                                           @change=${this.toggleAllPendingVehicles}>
                                           Select
                                </th>
                                <th>VIN</th>
                                <th>IMEI</th>
                                <th>First Seen</th>
                            </tr>
                            ${repeat(this.pendingVehicles, (item) => item.vin, (item) => html`
                                <tr>
                                    <td>
                                        <input type="checkbox" 
                                               .checked=${this.selectedPendingVehicles.has(item.vin)}
                                               @change=${() => this.togglePendingVehicle(item.vin)}>
                                    </td>
                                    <td>${item.vin}</td>
                                    <td>${item.imei}</td>
                                    <td>${item.firstSeen}</td>
                                </tr>
                            `)}
                        </table>
                        
                        <!-- Pagination Controls -->
                        <div ?hidden=${!this.shouldShowPagination}>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.5rem;">
                                <div style="display: flex; gap: 0.5rem; align-items: center;">
                                    <button 
                                        @click=${this.previousPage} 
                                        ?disabled=${!this.hasPreviousPage}
                                        style="padding: 0.25rem 0.5rem; font-size: 0.875rem;"
                                    >
                                        Previous
                                    </button>
                                    <span style="font-size: 0.875rem;">
                                        Page ${this.currentPage} of ${this.totalPages}
                                    </span>
                                    <button 
                                        @click=${this.nextPage} 
                                        ?disabled=${!this.hasNextPage}
                                        style="padding: 0.25rem 0.5rem; font-size: 0.875rem;"
                                    >
                                        Next
                                    </button>
                                </div>
                                <div style="font-size: 0.875rem; color: #666;">
                                    Showing ${this.pendingVehicles.length} of ${this.totalItems} items
                                </div>
                            </div>
                        </div>
                    ` : html`
                        <div style="color: #666; font-style: italic; margin: 1rem 0;">
                            No pending vehicles found.
                        </div>
                    `}
                `}
            </div>
            <div ?hidden=${this.settings.publicSettings?.oracles.find(oracle => oracle.oracleId === this.apiService.oracle)?.usePendingMode}>
                <form class="grid">
                    <label>Bulk Upload VINs (newline separated)
                        <textarea class="" style="display: block; height: 10em; width: 100%" placeholder="VIN1\nVIN2\nVIN3" @input="${(e: InputEvent) => this.vinsBulk = (e.target as HTMLInputElement).value}"></textarea>
                    </label>
                </form>
            </div>
            <hr />
            <form class="grid">
                <label>
                    <input type="checkbox" .checked="${this.enableSacd}" @click=${this.toggleEnableSacd}> Share vehicles with Developer
                </label>
            </form>
            <div ?hidden=${!this.enableSacd}>
                <form class="grid" >
                    <fieldset>
                        <label>Developer License 0x Client ID
                            <input type="text" placeholder="0x" maxlength="42"
                                   value=${this.sacdGrantee} @input="${(e: InputEvent) => this.sacdGrantee = (e.target as HTMLInputElement).value}">
                        </label>
                    </fieldset>

                    <fieldset>
                        ${repeat(range(1, Permission.MAX), (item) => item, (item) => html`
                        <label>
                            <input type="checkbox" .checked="${this.sacdPermissions?.[item as Permission]}" @click=${() => this.togglePermission(item)}> ${PERMISSIONS_MAP[item]}
                        </label>
                    `)}
                    </fieldset>
                </form>
            </div>
            
            <div>
                <form class="grid">
                    <button type="button" @click=${this._submitVINs} ?disabled=${this.processing} class=${this.processing ? 'processing' : ''} >
                        Onboard VINs
                    </button>
                </form>
            </div>
            
            <div class="alert alert-success" ?hidden=${this.processingMessage === "" || this.alertText.length > 0}>
                ${this.processingMessage}
            </div>
            
            <session-timer .expirationTime=${this.signingService.getSession()?.session.expiresAt}></session-timer>
            
            <div class="grid" ?hidden=${this.onboardResult.length === 0}>
                <table style="font-size: 80%">
                    <tr>
                        <th>#</th>
                        <th>Result</th>
                        <th>VIN</th>
                        <th>Details</th>
                    </tr>
                    ${repeat(this.onboardResult, (item) => item.vin, (item, index) => html`
                    <tr>
                        <td>${index + 1}</td>
                        <td>${item.status}</td>
                        <td>${item.vin}</td>
                        <td>${item.details}</td>
                    </tr>`)}
                </table>
            </div>
        `;
    }

    displayFailure(alertText: string) {
        super.displayFailure(alertText);
        this.alertText = alertText;
    }

    async _submitVINs(_event: MouseEvent) {
        this.alertText = "";
        this.processingMessage = "";
        this.processing = true;
        let vinsArray: string[] = []

        console.log("submitting vin(s)");

        // Collect VINs from bulk textarea
        if (this.vinsBulk !== null && this.vinsBulk !== undefined && this.vinsBulk?.length > 0) {
            vinsArray = this.vinsBulk.split('\n');
        }

        // Add selected pending vehicles
        const selectedPendingVins = Array.from(this.selectedPendingVehicles);
        vinsArray = [...vinsArray, ...selectedPendingVins];

        if (vinsArray.length === 0) {
            this.processing = false;
            return this.displayFailure("no vin provided");
        }

        try {
            await this.performOnboarding(vinsArray);
            
            // Clear selected pending vehicles after successful onboarding
            this.selectedPendingVehicles.clear();
            this.vinsBulk = "";
            this.requestUpdate();
        } catch (e) {
            this.displayFailure("failed to onboard vins: " + e);
        }

        this.processing = false;
    }

    private dispatchItemChanged() {
        this.dispatchEvent(new CustomEvent('item-changed', {
            detail: { value: null },
            bubbles: true,
            composed: true
        }));
    }

    public async onboardSingleVin(vin: string) {
        console.log('onboarding single vin:', vin);
        this.requestUpdate();
        
        // Start the onboarding process
        this.alertText = "";
        this.processingMessage = "";
        this.processing = true;

        try {
            await this.performOnboarding([vin]);
        } catch (e) {
            this.displayFailure("failed to onboard vin: " + e);
        }

        this.processing = false;
    }

    private async performOnboarding(vinsArray: string[]) {
        try {
            let sacdInput: SacdInput | null;
            if (!this.enableSacd) {
                sacdInput = null;

                this.settings.sharingInfo = {
                    ...this.settings.sharingInfo,
                    enabled: false
                }

                this.settings.saveSharingInfo();
            } else {
                const expiration = new Date();
                expiration.setFullYear(expiration.getFullYear() + 40)
                const expirationTimestamp = Math.round(expiration.getTime() / 1000)
                sacdInput = {
                    grantee: this.sacdGrantee as `0x${string}`,
                    permissions: sacdPermissionValue(this.sacdPermissions!),
                    expiration: BigInt(expirationTimestamp),
                    source: ''
                }

                this.settings.sharingInfo = {
                    ...this.settings.sharingInfo,
                    enabled: true,
                    grantee: this.sacdGrantee!,
                    permissions: this.sacdPermissions,
                }

                this.settings.saveSharingInfo()

                console.debug('SACD', sacdInput)
            }

            // Save owner settings
            this.settings.sharingInfo = {
                ...this.settings.sharingInfo,
            }
            this.settings.saveSharingInfo()

            const status = await this.onboardVINs(vinsArray, sacdInput)
            if (!status) {
                // Handle failure case if needed
            }
        } catch (e) {
            this.displayFailure("failed to onboard vins: " + e);
            throw e; // Re-throw so caller can handle if needed
        }

        await delay(5000)
        this.dispatchItemChanged()
    }
}
