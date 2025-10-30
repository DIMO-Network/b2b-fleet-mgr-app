import {html, nothing} from 'lit'
import {SettingsService} from "@services/settings-service";
import {customElement, property, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import './session-timer';
import {range} from "lodash";
import {BaseOnboardingElement, SacdInput} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";
import {ApiService} from "@services/api-service.ts";


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

    @state() otpLogin: boolean = false;

    @state() otpLoggedIn: boolean = false;

    // Pending vehicles properties
    @state() private selectedPendingVehicles: string[] = [];
    @state() private selectedVinsForSubmission: string[] = [];

	// Predefined grantees (temporary until backend provides these)
	@state() private availableGrantees: { label: string; value: string }[] = [
		{ label: "Copiloto", value: "0x8863beed0Db7086b1e3DEca019E0A43431EFE35F" },
        { label: "HoneyRuns", value: "0x9d4Ffa984Bd263c3f308A391172581C0684e81f2" }
	];
    // select both by default, in future could persist choice in local storage
	@state() private selectedGrantees: string[] = ["0x8863beed0Db7086b1e3DEca019E0A43431EFE35F", "0x9d4Ffa984Bd263c3f308A391172581C0684e81f2"];
	@state() private useBelow: boolean = false;

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
    }

    togglePermission(permission: number) {
        const value = this.sacdPermissions?.[permission as Permission]
        this.sacdPermissions![permission as Permission] = !value || false;
    }

    toggleEnableSacd() {
        this.enableSacd = !this.enableSacd;
    }

    toggleOtpLogin() {
        this.otpLogin = !this.otpLogin;
    }

    private toggleUseBelow = () => {
        this.useBelow = !this.useBelow;
        if (!this.useBelow) {
            if (this.selectedGrantees.length > 0) {
                this.sacdGrantee = this.selectedGrantees[0] as any;
            }
        }
    }

    private handleGranteeToggle = (value: string) => {
        const idx = this.selectedGrantees.indexOf(value);
        if (idx >= 0) {
            this.selectedGrantees = [
                ...this.selectedGrantees.slice(0, idx),
                ...this.selectedGrantees.slice(idx + 1)
            ];
        } else {
            this.selectedGrantees = [...this.selectedGrantees, value];
        }
    }

    handlePendingVehiclesSelection(event: CustomEvent) {
        this.selectedPendingVehicles = event.detail.selectedVehicles;
        this.selectedVinsForSubmission = [...this.selectedPendingVehicles];
        console.log("Selected pending vehicles:", this.selectedPendingVehicles);
        this.requestUpdate();
    }

    initOtpLogin() {
        // open modal
        const modal = document.createElement('otp-modal-element') as any;
        modal.open = true;
        modal.email = this.email;

        // send call to init otp and store the otpid
        modal.requestOtp();

        // add listener for close
        modal.addEventListener('otp-closed', () => {
           document.body.removeChild(modal);
        });

        modal.addEventListener('otp-completed', () => {
            document.body.removeChild(modal);
            this.otpLoggedIn = true;
            console.info("otp success");
        });

        // add to body
        document.body.appendChild(modal);
    }

    render() {
        return html`            
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <!-- Pending Vehicles Section -->
            <pending-vehicles-element 
                @selection-changed=${this.handlePendingVehiclesSelection}>
            </pending-vehicles-element>
            <div ?hidden=${this.settings.publicSettings?.oracles.find(oracle => oracle.oracleId === this.apiService.oracle)?.usePendingMode}>
                <form class="grid">
                    <label>Bulk Upload VINs (newline separated)
                        <textarea class="" style="display: block; height: 10em; width: 100%" placeholder="VIN1\nVIN2\nVIN3" @input="${(e: InputEvent) => this.vinsBulk = (e.target as HTMLInputElement).value}"></textarea>
                    </label>
                </form>
            </div>
            <hr />
            <form class="grid" style="display: flex; align-items: center; gap: 1rem;">
                <label>
                    <input type="checkbox" .checked="${this.enableSacd}" @click=${this.toggleEnableSacd}> Share vehicles with Developer
                </label>
            </form>
            <div ?hidden=${!this.enableSacd}>
                <form>
                    <div>
					<fieldset>
						${repeat(this.availableGrantees, (g) => g.value, (g) => html`
						<label style="margin-bottom: 0.5rem">
							<input type="checkbox" .checked=${this.selectedGrantees.includes(g.value)} @click=${() => this.handleGranteeToggle(g.value)}> ${g.label} : ${g.value}
						</label>
						`)}
					</fieldset>
                    </div>
                    <div>
					<fieldset>
						<label>
							<input type="checkbox" .checked=${this.useBelow} @click=${this.toggleUseBelow}> Use below:
						</label>
					</fieldset>
                    </div>
                    <div class="grid">
                    <fieldset>
                        <label>Developer License 0x Client ID
							<input type="text" placeholder="0x" maxlength="42"
								   value=${this.sacdGrantee} @input="${(e: InputEvent) => this.sacdGrantee = (e.target as HTMLInputElement).value}" ?disabled=${!this.useBelow}>
                        </label>
                    </fieldset>

                    <fieldset>
                        ${repeat(range(1, Permission.MAX), (item) => item, (item) => html`
                        <label>
                            <input type="checkbox" .checked="${this.sacdPermissions?.[item as Permission]}" @click=${() => this.togglePermission(item)}> ${PERMISSIONS_MAP[item]}
                        </label>
                    `)}
                    </fieldset>
                    </div>
                </form>
            </div>
            
            <div>
                <div class="grid">
                    <label>
                        <input type="checkbox" .checked="${this.otpLogin}" @click="${this.toggleOtpLogin}" /> Use OTP
                    </label>
                    ${ this.otpLogin ? html`
                        <button @click=${() => this.initOtpLogin()} ?disabled=${this.processing} class=${this.processing ? 'processing' : ''} >
                            Sign In
                        </button>` : nothing } 
                </div>
            </div>
            
            
            <div>
                <form class="grid">
                    <button type="button" @click=${this._submitVINs} ?disabled=${(this.otpLogin && !this.otpLoggedIn) || this.processing} class=${this.processing ? 'processing' : ''} >
                        Onboard Vehicles
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

        // Use selected VINs from checkboxes if available, otherwise use textarea
        if (this.selectedVinsForSubmission.length > 0) {
            vinsArray = [...this.selectedVinsForSubmission];
            console.log("Using selected VINs from checkboxes:", vinsArray);
        } else if (this.vinsBulk !== null && this.vinsBulk !== undefined && this.vinsBulk?.length > 0) {
            vinsArray = this.vinsBulk.split('\n');
            console.log("Using VINs from textarea:", vinsArray);
        }

        if (vinsArray.length === 0) {
            this.processing = false;
            return this.displayFailure("no vin provided");
        }

        try {
            await this.performOnboarding(vinsArray);

            // Clear all VIN sources after successful onboarding
            this.selectedPendingVehicles = [];
            this.selectedVinsForSubmission = [];
            this.vinsBulk = "";
            this.requestUpdate();

            // Clear selection in pending vehicles component
            const pendingVehiclesElement = this.querySelector('pending-vehicles-element') as any;
            if (pendingVehiclesElement) {
                pendingVehiclesElement.clearSelection();
            }
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
// todo i think we pass in an array of SacdInput in here and have something that builds the sacd inputs
    private async performOnboarding(vinsArray: string[]) {
        try {
            let sacdInput: SacdInput[] | null;
            if (!this.enableSacd) {
                sacdInput = null;

                this.settings.sharingInfo = {
                    ...this.settings.sharingInfo,
                    enabled: false
                }

                this.settings.saveSharingInfo();
            } else {
                // create a SACD expiration 40 years in the future.
                const expiration = new Date();
                expiration.setFullYear(expiration.getFullYear() + 40)
                const expirationTimestamp = Math.round(expiration.getTime() / 1000)
                const perms = sacdPermissionValue(this.sacdPermissions!)
                // Build SACD array; append the one from "Use below" if checked, then loop over the selected grantees and append them
                sacdInput = [];
                if (this.useBelow && this.sacdGrantee) {
                    sacdInput.push({
                        grantee: this.sacdGrantee as `0x${string}`,
                        permissions: perms,
                        expiration: BigInt(expirationTimestamp),
                        source: ''
                    });
                }
                for (const grantee of this.selectedGrantees) {
                    sacdInput.push({
                        grantee: grantee as `0x${string}`,
                        permissions: perms,
                        expiration: BigInt(expirationTimestamp),
                        source: ''
                    });
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
