import {html} from 'lit'
import {SettingsService} from "@services/settings-service";
import {customElement, property, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import './session-timer';
import {range} from "lodash";
import {BaseOnboardingElement, SacdInput} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";

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

    @property({attribute: false})
    private enableSetOwner: boolean;

    @property({attribute: false})
    private ownerAddress: string | null;

    @state() sessionExpiresIn: number = 0;

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
        this.enableSetOwner = false;
        this.ownerAddress = "";
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

    toggleEnableSetOwner() {
        this.enableSetOwner = !this.enableSetOwner;
    }

    render() {
        return html`
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <div>
                <form class="grid">
                    <label>- OR - Bulk Upload VINs (newline separated)
                        <textarea class="" style="display: block; height: 10em; width: 100%" placeholder="VIN1\nVIN2\nVIN3" @input="${(e: InputEvent) => this.vinsBulk = (e.target as HTMLInputElement).value}"></textarea>
                    </label>
                </form>
            </div>
            <form class="grid">
                <label>
                    <input type="checkbox" .checked="${this.enableSacd}" @click=${this.toggleEnableSacd}> Share onboarded vehicles
                </label>
                <label>
                    <input type="checkbox" .checked="${this.enableSetOwner}" @click=${this.toggleEnableSetOwner}> Set different owner
                </label>
            </form>
            <div ?hidden=${!this.enableSacd}>
                <form class="grid" >
                    <fieldset>
                        <label>Grantee 0x Client ID
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
            <div ?hidden=${!this.enableSetOwner}>
                <form class="grid" >
                    <fieldset>
                        <label>Owner 0x Account Address
                            <input type="text" placeholder="0x" maxlength="42"
                                   value=${this.ownerAddress} @input="${(e: InputEvent) => this.ownerAddress = (e.target as HTMLInputElement).value}">
                        </label>
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

        if (this.vinsBulk !== null && this.vinsBulk !== undefined && this.vinsBulk?.length > 0) {
            vinsArray = this.vinsBulk.split('\n');
        } else {
            this.processing = false;
            return this.displayFailure("no vin provided");
        }

        try {
            await this.performOnboarding(vinsArray);
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
                    enabled: true,
                    grantee: this.sacdGrantee!,
                    permissions: this.sacdPermissions,
                }

                this.settings.saveSharingInfo()

                console.debug('SACD', sacdInput)
            }
            type HexString = `0x${string}`;

            const status = await this.onboardVINs(vinsArray, sacdInput, this.ownerAddress as HexString)
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
