import {css, html, nothing} from 'lit'
import {SettingsService} from "@services/settings-service";
import {customElement, property, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import './session-timer';
import './confirm-onboarding-modal-element';
import {range} from "lodash";
import {BaseOnboardingElement, SacdInput, VehicleWithDefinition} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";
import {globalStyles} from "../global-styles.ts";


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
    [Permission.COMMANDS]: true,
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
    static styles = [ globalStyles,
        css`
            /* Stack grantee checkboxes vertically with consistent spacing */
            .grantee-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                align-items: flex-start;
            }
            .grantee-item {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin: 0;
            }
        ` ]

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
		{ label: "Kaufmann", value: "0xCa977Abb7eb2706DC1072f266503830D6A8745A8" },
	];
    // select both by default, in future could persist choice in local storage
	@state() private selectedGrantees: string[] = ["0xCa977Abb7eb2706DC1072f266503830D6A8745A8"];
	@state() private useBelow: boolean = false;

    private settings: SettingsService;

    constructor() {
        super();
        this.vinsBulk = "";
        this.email = localStorage.getItem("email");
        this.settings = SettingsService.getInstance();
        this.alertText = "";

        this.enableSacd = false;
        this.sacdGrantee = "";
        this.sacdPermissions = defaultPermissions;
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.settings.fetchPrivateSettings();
        if (this.email === undefined || this.email === "") {
            this.displayFailure("email was not set, please make sure you allow sharing email on Login");
        }
        await this.settings.fetchAccountInfo({ email: this.email! }); // load account info

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

            <div class="onboard-section">
                <div class="panel mb-16">
                    <div class="panel-header">Developer Sharing & OTP</div>
                    <div class="panel-body">
                        <div class="form-row" style="margin: 0 0 8px 0;">
                            <div class="form-group" style="margin: 0;">
                                <label class="form-label" style="display:flex; align-items:center; gap:8px;">
                                    <input type="checkbox" .checked="${this.enableSacd}" @click=${this.toggleEnableSacd}>
                                    Share vehicles with Developer
                                </label>
                            </div>
                        </div>

                        <div class="panel nested" ?hidden=${!this.enableSacd}>
                            <div class="panel-body">
                                <form class="grid" style="gap: 12px;">
                                    <fieldset>
                                        <legend class="form-label">Select Developer Grantees</legend>
                                        <div class="grantee-list">
                                            ${repeat(this.availableGrantees, (g) => g.value, (g) => html`
                                                <label class="checkbox grantee-item">
                                                    <input type="checkbox" .checked=${this.selectedGrantees.includes(g.value)} @click=${() => this.handleGranteeToggle(g.value)}>
                                                    <span>${g.label} : ${g.value}</span>
                                                </label>
                                            `)}
                                        </div>
                                    </fieldset>

                                    <fieldset>
                                        <label class="checkbox">
                                            <input type="checkbox" .checked=${this.useBelow} @click=${this.toggleUseBelow}>
                                            <span>Use below:</span>
                                        </label>
                                    </fieldset>

                                    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                                        <fieldset>
                                            <label class="form-label">Developer License 0x Client ID</label>
                                            <input type="text" placeholder="0x" maxlength="42"
                                                   .value=${this.sacdGrantee}
                                                   @input="${(e: InputEvent) => this.sacdGrantee = (e.target as HTMLInputElement).value}"
                                                   ?disabled=${!this.useBelow}>
                                        </fieldset>

                                        <fieldset>
                                            <legend class="form-label">Permissions</legend>
                                            <div class="grid" style="grid-template-columns: 1fr; gap: 6px;">
                                                ${repeat(range(1, Permission.MAX), (item) => item, (item) => html`
                                                    <label class="checkbox">
                                                        <input type="checkbox" .checked="${this.sacdPermissions?.[item as Permission]}" @click=${() => this.togglePermission(item)}>
                                                        <span>${PERMISSIONS_MAP[item]}</span>
                                                    </label>
                                                `)}
                                            </div>
                                        </fieldset>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <div class="form-row" style="margin-top: 8px;">
                            <div class="form-group" style="margin: 0; display:flex; align-items:center; gap:12px;">
                                <label class="checkbox" style="margin:0;">
                                    <input type="checkbox" .checked="${this.otpLogin}" @click="${this.toggleOtpLogin}" />
                                    <span>Use OTP</span>
                                </label>
                                ${ this.otpLogin ? html`
                                    <button class=${this.processing ? 'btn btn-primary processing' : 'btn btn-primary'} @click=${() => this.initOtpLogin()} ?disabled=${this.processing}>
                                        Sign In
                                    </button>` : nothing }
                            </div>
                        </div>

                        <div class="form-row" style="margin-top: 8px;">
                            <button type="button" @click=${this._submitVINs} ?disabled=${(this.otpLogin && !this.otpLoggedIn) || this.processing} class=${this.processing ? 'btn btn-primary processing' : 'btn btn-primary'}>
                                Onboard Vehicles
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="onboard-section">
                <div class="panel">
                    <div class="panel-header">Onboard Result</div>
                    <div class="panel-body">
                        <div class="alert alert-success" ?hidden=${this.processingMessage === "" || this.alertText.length > 0}>
                            ${this.processingMessage}
                        </div>
                        <session-timer style="margin-bottom: 12px;" .expirationTime=${this.signingService.getSession()?.session.expiresAt}></session-timer>
                        <div class="table-container">
                            <table>
                                <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Result</th>
                                    <th>VIN</th>
                                    <th>Details</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr ?hidden=${this.onboardResult.length > 0}>
                            <td colspan="4" style="text-align: center; color: #666; padding: 24px;">No vehicles pending onboard</td>
                        </tr>
                        ${repeat(this.onboardResult, (item) => item.vin, (item, index) => html`
                    <tr>
                        <td>${index + 1}</td>
                        <td>${item.status}</td>
                        <td>${item.vin}</td>
                        <td>${item.details}</td>
                    </tr>`)}
                        </tbody>
                    </table>
                </div>
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
        this.processing = false; // Don't set processing yet, modal will handle it
        let vinsArray: string[] = []

        console.log("submitting vin(s)");

        // Use selected VINs from checkboxes if available, otherwise use textarea
        if (this.selectedVinsForSubmission.length > 0) {
            vinsArray = [...this.selectedVinsForSubmission];
            console.log("Using selected VINs from checkboxes:", vinsArray);
        } else if (this.vinsBulk !== null && this.vinsBulk !== undefined && this.vinsBulk?.length > 0) {
            vinsArray = this.vinsBulk.split('\n').filter(v => v.trim().length > 0);
            console.log("Using VINs from textarea:", vinsArray);
        }

        if (vinsArray.length === 0) {
            return this.displayFailure("no vin provided");
        }

        // Open the confirmation modal
        this.openConfirmationModal(vinsArray);
    }

    private openConfirmationModal(vinsArray: string[]) {
        const modal = document.createElement('confirm-onboarding-modal-element') as any;
        modal.show = true;
        modal.vins = vinsArray;

        // Listen for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });

        // Listen for onboarding confirmation
        modal.addEventListener('onboarding-confirmed', async (event: CustomEvent) => {
            document.body.removeChild(modal);
            const vehicles: VehicleWithDefinition[] = event.detail.vehicles;
            console.log("Confirmed vehicles with definitions:", vehicles);
            
            this.processing = true;
            try {
                await this.performOnboarding(vehicles);

                // Clear all VIN sources after successful onboarding
                this.selectedPendingVehicles = [];
                this.selectedVinsForSubmission = [];
                this.vinsBulk = "";
                this.requestUpdate();

                // Clear selection and reload pending vehicles component
                const pendingVehiclesElement = this.querySelector('pending-vehicles-element') as any;
                if (pendingVehiclesElement) {
                    pendingVehiclesElement.clearSelection();
                    // Reload the pending vehicles list after successful onboarding
                    await pendingVehiclesElement.loadPendingVehicles();
                }
            } catch (e) {
                this.displayFailure("failed to onboard vins: " + e);
            }

            this.processing = false;
        });

        // Add to body
        document.body.appendChild(modal);
    }

    private dispatchItemChanged() {
        this.dispatchEvent(new CustomEvent('item-changed', {
            detail: { value: null },
            bubbles: true,
            composed: true
        }));
    }

    // todo i think we pass in an array of SacdInput in here and have something that builds the sacd inputs
    private async performOnboarding(vehicles: VehicleWithDefinition[]) {
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

            const status = await this.onboardVINs(vehicles, sacdInput)
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
