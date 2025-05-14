import {html, LitElement} from 'lit'
import {SettingsService} from "@services/settings-service";
import {KernelSigner, sacdPermissionValue} from '@dimo-network/transactions';
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {SigningService} from "@services/signing-service.ts";
import {repeat} from "lit/directives/repeat.js";
import './session-timer';
import qs from 'qs';
import {range} from "lodash";

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


@customElement('add-vin-element')
export class AddVinElement extends LitElement {
    @property({attribute: false})
    private vin: string | null;

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

    @state() sessionExpiresIn: number = 0;

    private settings: SettingsService;
    private api: ApiService;

    // @ts-ignore
    private kernelSigner: KernelSigner | undefined;
    private walletAddress: string | undefined;
    private signingService: SigningService;
    constructor() {
        super();
        this.vin = "";
        this.vinsBulk = "";
        this.processing = false;
        this.processingMessage = "";
        this.email = localStorage.getItem("email");
        this.settings = SettingsService.getInstance();
        this.api = ApiService.getInstance();
        this.alertText = "";
        this.signingService = SigningService.getInstance();

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
    }

    render() {
        return html`
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            <form class="grid">
                <label>Bulk Upload VINs (newline separated)
                    <textarea style="display: block; height: 10em" placeholder="VIN1\nVIN2\nVIN3" @input="${(e: InputEvent) => this.vinsBulk = e.data}"></textarea>
                </label>
            </form>
            <form class="grid">
                <label>VIN
                    <input type="text" placeholder="VIN" maxlength="17"
                           value=${this.vin} @input="${(e: InputEvent) => this.vin = e.data}">
                </label>
                <label>Consent Email
                    <input type="text" placeholder="me@company.com" maxlength="60"
                           value="${this.email}" @input="${(e: InputEvent) => this.email = e.data}">
                </label>
                <button type="button" @click=${this._submitVIN} ?disabled=${this.processing} class=${this.processing ? 'processing' : ''} >
                    Onboard VIN
                </button>
            </form>
            <div class="alert alert-success" ?hidden=${this.processingMessage === "" || this.alertText.length > 0}>
                ${this.processingMessage}
            </div>
            <session-timer .expirationTime=${this.sessionExpiresIn}></session-timer>
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

    async _submitVIN(_event: MouseEvent) {
        this.alertText = "";
        this.processingMessage = "";
        this.processing = true;
        let vinsArray: string[] = []

        console.log("submitting vin(s)");

        if (this.vinsBulk !== null && this.vinsBulk !== undefined && this.vinsBulk?.length > 0) {
            vinsArray = this.vinsBulk.split('\n');
        } else if (this.vin !== null && this.vin !== undefined && this.vin?.length > 0) {
            vinsArray.push(this.vin);
        } else {
            return this.displayFailure("no vin provided");
        }

        try {
            const status = await this.onboardVINs(vinsArray)
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

        const submitStatus = await this.api.callApi('POST', '/v1/vehicle/verify', payload, true);
        if (!submitStatus.success) {
            return false;
        }

        let success = true
        for (const attempt of range(10)) {
            success = true
            const query = qs.stringify({vins: vins.join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/v1/vehicle/verify?${query}`, null, true);

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
                await this.delay(5000);
            }
        }

        return success;
    }

    async getMintingData(vins: string[]) {
        const query = qs.stringify({vins: vins.join(',')}, {arrayFormat: 'comma'});
        const mintData = await this.api.callApi<VinsMintDataResult>('GET', `/v1/vehicle/mint?${query}`, null, true);
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

    async submitMintingData(mintingData: VinMintData[]) {
        const payload = {
            vinMintingData: mintingData
        }

        const mintResponse = await this.api.callApi('POST', '/v1/vehicle/mint', payload, true);
        if (!mintResponse.success || !mintResponse.data) {
            return false;
        }

        let success = true
        for (const attempt of range(30)) {
            success = true
            const query = qs.stringify({vins: mintingData.map(m => m.vin).join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/v1/vehicle/mint/status?${query}`, null, true);

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
                await this.delay(5000);
            }
        }

        return success;
    }

    async onboardVINs(vins: string[]): Promise<boolean> {
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
        const minted = await this.submitMintingData(signedMintData);

        if (!minted) {
            this.displayFailure("Failed to onboard at least one VIN");
            return false;
        }

        return true
    }

    delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async registerInOracle(vin :string) {
        if (vin) {
            const lookup = await this.getDeviceAPILookup(vin);
            if (lookup.success && lookup.data) {
                const {vin, vehicleTokenId} = lookup.data;

                const url = "/v1/vehicle/register";
                const body = {vin, token_id: vehicleTokenId};
                await this.api.callApi<any>('POST', url, body, true);
            }
        }

    }

    async getDeviceAPILookup(vin: string) {
        const url = "/v1/compass/device-by-vin/" + vin;
        return await this.api.callApi<VehicleLookup>('GET', url, null, true);
    }

    async buildPermissions() {
        const expiration = BigInt(2933125200); // 40 years
        const perms = sacdPermissionValue({
            NONLOCATION_TELEMETRY: true,
            COMMANDS: true,
            CURRENT_LOCATION: true,
            ALLTIME_LOCATION: true,
            CREDENTIALS: true,
            STREAMS: true,
            RAW_DATA: true,
            APPROXIMATE_LOCATION: true,
        });
        const permsStr = perms.toString(); // bigint so can't be json.stringify
        const expirationStr = expiration.toString();

        const sacdInput = {
            driverID: this.walletAddress, // current user's wallet address
            appID: this.settings.publicSettings?.clientId!, // assuming clientId
            // appName: "DIMO Fleet Onboard", // todo from app prompt call identity-api, doesn't seem this is required
            expiration: Number(expirationStr),
            permissions: Number(permsStr),
            grantee: this.settings.getOrgSmartContractAddress(), // this is the kernel account address, that owns the NFT
            attachments: [],
            grantor: this.settings.getOrgSmartContractAddress(), // seems this is fine
            // todo set source, or i think we'd just use SDK signAndUploadSACDAgreement once it works
        }
        return sacdInput;
    }

    // todo future would be to be able to use this instead of devices-api, but it is not ready yet
    async uploadSACDPermissions() {
        // todo move this permissions stuff elsewhere
        // @ts-ignore
        const perms = sacdPermissionValue({
            NONLOCATION_TELEMETRY: true,
            COMMANDS: true,
            CURRENT_LOCATION: true,
            ALLTIME_LOCATION: true,
            CREDENTIALS: true,
            STREAMS: true,
            RAW_DATA: true,
            APPROXIMATE_LOCATION: true,
        });
        // @ts-ignore
        const expiration = BigInt(2933125200); // 40 years

        // const ipfsRes = await this.kernelSigner.signAndUploadSACDAgreement({
        //     driverID: this.settings.getOrgWalletAddress(), // current user wallet addres??
        //     appID: this.settings.getAppClientId(), // assuming clientId
        //     appName: "DIMO Fleet Onboard", // todo from app prompt call identity-api
        //     expiration: expiration,
        //     permissions: perms,
        // todo this is wrong, should be the wallet address i think
        //     grantee: this.settings.getOrgWalletAddress(), // granting the organization the perms
        //     attachments: [],
        //     grantor: this.settings.getOrgWalletAddress, // current user...
        // });
        // if (!ipfsRes.success) {
        //     throw new Error(`Failed to upload SACD agreement`);
        // }
        // console.log("ipfs sacd CID: " + ipfsRes.cid);
    }
}
