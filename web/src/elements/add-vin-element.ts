import {html, LitElement} from 'lit'
import {SettingsService} from "@services/settings-service";
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {SigningService} from "@services/signing-service.ts";
import {repeat} from "lit/directives/repeat.js";
import './session-timer';
import qs from 'qs';
import {range} from "lodash";
import {delay} from "@utils/utils";

interface VehicleLookup {
    vin: string;
    userDeviceId: string;
    definitionId: string;
    vehicleTokenId: number;
    syntheticDeviceTokenId: number;
}

// interface VehicleOracleLookup {
//     vehicle: Vehicle;
// }

// interface Vehicle {
//     vin: string;
//     id: string;
//     tokenId: number;
//     mintedAt: string;
//     owner: string;
//     definition: Definition;
//     syntheticDevice: SyntheticDevice;
// }

// interface Definition {
//     id: string;
//     make: string;
//     model: string;
//     year: number;
// }
// interface SyntheticDevice {
//     id: string;
//     tokenId: number;
//     mintedAt: string;
// }

interface VinOnboardingStatus {
    vin: string;
    status: string;
    details: string;
}

interface VinsOnboardingResult {
    statuses: VinOnboardingStatus[];
}

interface VinMintData {
    vin: string;
    typedData: any;
    signature?: string;
}

interface VinsMintDataResult {
    vinMintingData: VinMintData[];
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

interface SacdInput {
    grantee: `0x${string}`;
    permissions: BigInt;
    expiration: BigInt;
    source: string
}

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
export class AddVinElement extends LitElement {
    @property({attribute: false})
    private vinsBulk: string | null;

    @property({attribute: false})
    private processing: boolean;

    @property({attribute: false})
    private processingMessage: string;

    @property({attribute: false})

    @property({attribute: false})
    private email: string | null;

    @property({attribute: false})
    private alertText: string;

    @property({attribute: false})
    private onboardResult: VinOnboardingStatus[];

    @property({attribute: false})
    private enableSacd: boolean;

    @property({attribute: false})
    private sacdGrantee: string | null;

    @property({attribute: false})
    private sacdPermissions: Permissions;

    @state() sessionExpiresIn: number = 0;

    private settings: SettingsService;
    private api: ApiService;

    // @ts-ignore
    private signingService: SigningService;
    constructor() {
        super();
        this.vinsBulk = "";
        this.processing = false;
        this.processingMessage = "";
        this.email = localStorage.getItem("email");
        this.settings = SettingsService.getInstance();
        this.api = ApiService.getInstance();
        this.alertText = "";
        this.signingService = SigningService.getInstance();

        this.enableSacd = false;
        this.sacdGrantee = "";
        this.sacdPermissions = defaultPermissions;

        this.onboardResult = []
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

    render() {
        return html`
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <div>
                <form class="grid">
                    <label>Bulk Upload VINs (newline separated)
                        <textarea class="" style="display: block; height: 10em; width: 100%" placeholder="VIN1\nVIN2\nVIN3" @input="${(e: InputEvent) => this.vinsBulk = (e.target as HTMLInputElement).value}"></textarea>
                    </label>
                </form>
            </div>
            <form class="grid">
                <label>
                    <input type="checkbox" .checked="${this.enableSacd}" @click=${this.toggleEnableSacd}> Share onboarded vehicles
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
        this.processing = false;
        this.processingMessage = "";
        this.alertText = alertText;
    }

    updateResult(result : VinsOnboardingResult) {
        const statusesByVin: Record<string, VinOnboardingStatus> = {}
        for (const item of result.statuses) {
            statusesByVin[item.vin] = item
        }

        const newResult: VinOnboardingStatus[] = [];

        for (const item of this.onboardResult) {
            newResult.push({
                vin: item.vin,
                status: statusesByVin[item.vin]?.status || "Unknown",
                details: statusesByVin[item.vin]?.details || "Unknown"
            })
        }

        this.onboardResult = newResult
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
            return this.displayFailure("no vin provided");
        }

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


            const status = await this.onboardVINs(vinsArray, sacdInput)
            if (!status) {

            }
        } catch (e) {
            this.displayFailure("failed to onboard vins: " + e);
        }


        this.processing = false;
    }

    async verifyVehicles(vins: string[]) {
        const payload = {
            vins: vins.map(v => ({vin: v, countryCode: 'USA'}))
        }

        const submitStatus = await this.api.callApi('POST', '/vehicle/verify', payload, true);
        if (!submitStatus.success) {
            return false;
        }

        let success = true
        for (const attempt of range(10)) {
            success = true
            const query = qs.stringify({vins: vins.join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/vehicle/verify?${query}`, null, true);

            if (!status.success || !status.data) {
                return false;
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            this.updateResult(status.data)

            if (success) {
                break;
            }

            if (attempt < 9) {
                await delay(5000);
            }
        }

        return success;
    }

    async getMintingData(vins: string[]) {
        const query = qs.stringify({vins: vins.join(',')}, {arrayFormat: 'comma'});
        const mintData = await this.api.callApi<VinsMintDataResult>('GET', `/vehicle/mint?${query}`, null, true);
        if (!mintData.success || !mintData.data) {
            return [];
        }

        return mintData.data.vinMintingData;
    }

    async signMintingData(mintingData: VinMintData[]) {
        const result: VinMintData[] = [];
        for (const d of mintingData) {
            const signature = await this.signingService.signTypedData(d.typedData);

            if (!signature.success || !signature.signature) {
                continue
            }

            result.push({
                ...d,
                signature: signature.signature
            })
        }

        return result;
    }

    async submitMintingData(mintingData: VinMintData[], sacd: SacdInput | null) {
        const payload: {vinMintingData: VinMintData[], sacd?: SacdInput} = {
            vinMintingData: mintingData,
        }

        if (sacd !== null) {
            payload.sacd = sacd
        }

        const mintResponse = await this.api.callApi('POST', '/vehicle/mint', payload, true);
        if (!mintResponse.success || !mintResponse.data) {
            return false;
        }

        let success = true
        for (const attempt of range(30)) {
            success = true
            const query = qs.stringify({vins: mintingData.map(m => m.vin).join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/vehicle/mint/status?${query}`, null, true);

            if (!status.success || !status.data) {
                return false;
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            this.updateResult(status.data)

            if (success) {
                break;
            }

            if (attempt < 19) {
                await delay(5000);
            }
        }

        return success;
    }

    async onboardVINs(vins: string[], sacd: SacdInput | null): Promise<boolean> {
        let allVinsValid = true;
        for (const vin of vins) {
            const validVin = vin?.length === 17
            allVinsValid = allVinsValid && validVin
            this.onboardResult.push({
                vin: vin,
                status: "Unknown",
                details: validVin ? "Valid VIN" : "Invalid VIN"
            })
        }

        if (!allVinsValid) {
            this.displayFailure("Some of the VINs are not valid");
            return false;
        }

        const verified = await this.verifyVehicles(vins);
        if (!verified) {
            this.displayFailure("Failed to verify at least one VIN");
            return false
        }

        const mintData = await this.getMintingData(vins);
        if (mintData.length === 0) {
            this.displayFailure("Failed to fetch minting data");
            return false
        }

        const signedMintData = await this.signMintingData(mintData);
        const minted = await this.submitMintingData(signedMintData, sacd);

        if (!minted) {
            this.displayFailure("Failed to onboard at least one VIN");
            return false;
        }

        return true
    }
    // todo is this deprecated?
    async registerInOracle(vin :string) {
        if (vin) {
            const lookup = await this.getDeviceAPILookup(vin);
            if (lookup.success && lookup.data) {
                const {vin, vehicleTokenId} = lookup.data;

                const url = "/vehicle/register";
                const body = {vin, token_id: vehicleTokenId};
                await this.api.callApi<any>('POST', url, body, true);
            }
        }

    }
// todo is this deprecated?
    async getDeviceAPILookup(vin: string) {
        const url = "/v1/compass/device-by-vin/" + vin;
        return await this.api.callApi<VehicleLookup>('GET', url, null, true);
    }
}
