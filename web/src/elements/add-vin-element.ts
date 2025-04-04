import {html, LitElement} from 'lit'
import {SettingsService} from "@services/settings-service";
import {KernelSigner, sacdPermissionValue} from '@dimo-network/transactions';
import {customElement, property} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {SigningService} from "@services/signing-service.ts";


interface CompassAddVINStatus {
    vin: string;
    status: string;
}

interface VehicleLookup {
    vin: string;
    userDeviceId: string;
    definitionId: string;
    vehicleTokenId: number;
    syntheticDeviceTokenId: number;
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
            this.returnFailure("email was not set, please make sure you allow sharing email on Login");
        }
        await this.settings.fetchAccountInfo(this.email!); // load account info
    }

    render() {
        return html`
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            /* todo: bulk upload section, textarea, button below checks which field to get VINs from */
            <form class="grid">
                <label>Bulk Upload VINs (newline separated)
                    <textarea placeholder="VIN1\nVIN2\nVIN3" @input="${(e: InputEvent) => this.vinsBulk = e.data}"></textarea>/
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
        `;
    }

    returnFailure(alertText: string) {
        this.processing = false;
        this.processingMessage = "";
        this.alertText = alertText;
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
            return this.returnFailure("no vin provided");
        }

        for (const vin of vinsArray) {
            console.log("processing vin: " + vin);
            // todo change below to return a response, and then this controls what we do on the frontend, how we report it
            await this.onboardVIN(vin)
        }


        // this.vin = ""; // to reset the input this won't work since it doesn't push up to the input, ie. this is not mvvm.
    }

    async onboardVIN(vin: string) {
        if (vin?.length !== 17) {
            return this.returnFailure("vin is not 17 characters");
        }

        const lookupResp = await this.getDeviceAPILookup(vin);
        let userDeviceId = "";
        let vehicleTokenId = 0;
        let syntheticDeviceTokenId = 0;
        let definitionId = "";
        if (lookupResp.success && lookupResp.data) {
            userDeviceId = lookupResp.data.userDeviceId;
            vehicleTokenId = lookupResp.data.vehicleTokenId;
            syntheticDeviceTokenId = lookupResp.data.syntheticDeviceTokenId;
            definitionId = lookupResp.data.definitionId;
            this.processingMessage = "found existing device with vin: " + vin
        }
        if (userDeviceId=== "") {
            // todo future, even if userDeviceId is found, check if compass integration exists and is attached to this smartcontract owner
            const vins = [vin]
            const compassResp = await this.addToCompass(vins);
            if (!compassResp.success) {
                return this.returnFailure("error when adding vin to compass:" + compassResp.error);
            }
            console.log(compassResp);
            // process the result
            // @ts-ignore
            const vinAddStatus = compassResp.data.find(x=> x.vin === vin);
            if (vinAddStatus == null || vinAddStatus.status === "FAILED") {
                return this.returnFailure("failed to add vin to compass: " + vinAddStatus?.status || "failed")
            }
            this.processingMessage = "added to compass OK";
        }

        // if (isLocalhost()) {
        //     // locally we're not gonna be doing minting since no passkey, so just return here
        //     this.processing = false;
        //     vin = ""; // todo test this actually updates the form reactively.
        //     return;
        // }
        // 1. create the user device record & register the integration (web2 stuff)
        if(userDeviceId === "") {
            const fromVinResp = await this.addToUserDevicesAndDecode(vin); // this call is idempotent
            if (!fromVinResp.success) {
                return this.returnFailure("failed to add vin to user devices:" + fromVinResp.error)
            }
            definitionId = fromVinResp.data.userDevice.deviceDefinition.definitionId;
            userDeviceId = fromVinResp.data.userDevice.id;
            this.processingMessage = "VIN decoded OK"

            const registerResp = await this.registerIntegration(userDeviceId); // this call is idempotent
            if (!registerResp.success) {
                return this.returnFailure("failed to register devices-api integration to compass: " + registerResp.error);
            }
            this.processingMessage = "integration registered";
        }
        // 2. Mint the vehicle nft with SACD permissions
        if (vehicleTokenId === 0) {
            const mintResp = await this.getMintVehicle(userDeviceId, definitionId)
            if (!mintResp.success) {
                return this.returnFailure("failed to get the message to mint vehicle" + mintResp.error);
            }
            // saw this fix in the mobile app https://github.com/DIMO-Network/dimo-driver/blob/development/src/hooks/custom/useSignCallback.ts#L40
            mintResp.data.domain.chainId = Number(mintResp.data.domain.chainId);

            const signedNftResp = await this.signingService.signTypedData(mintResp.data)
            if (!signedNftResp.success) {
                return this.returnFailure("failed to get signature for the message to mint" + signedNftResp?.error)
            }
            console.log("signed mint vehicle:", signedNftResp.signature);

            //const sdkSignResult = await this.signPayloadWithSDK(mintResp.data);

            const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAIRlWElmTU0AKgAAAAgABQESAAMAAAABAAEAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAIdpAAQAAAABAAAAWgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAABigAwAEAAAAAQAAABgAAAAAEQ8YrgAAAAlwSFlzAAALEwAACxMBAJqcGAAAAVlpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDYuMC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iPgogICAgICAgICA8dGlmZjpPcmllbnRhdGlvbj4xPC90aWZmOk9yaWVudGF0aW9uPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KGV7hBwAAAe5JREFUSA3tlE9LlVEQh9XK/oKEFLgQFKqNmyDEArFMwoXgxm/gxzC3gkQrI9rkIsFFgUWRFSEVtGtTKxW/gBCWYKRo9ud53pzj4fJeLy6ijT94fIeZc+bMmTnXuroD/e8O1O9RQAMxqabfBH5WC9byH6q1YCd+uNa6shtY9S84DTd2bD5JVn4U5uETeMg2lKrygCOs+gHH4AOswVdoBBMr92xCF4zCfXC9+2KN37Ax//Y6b8sjfFNFpPqfdkKrMFSyxCJSvnyQZwjchqVskwvdkOON1EX4AjfhGlyAExBKuVvwPIFFeAHnQXl1lSfXVnFIJ/ZTeA8fwbnMQhsk3cF6DseTZ9dIV911JcthV8piH8M9A3GFk9ivYAOuwEt4AwPgW7daD8oxucPuhjl4Db2wDO4tbhgHWHlM/Rn2W5iEB+Br2QIPyjF5K8yAe3wYtuos+KIsunjDfq1+BBzWQ7gFyoG9A+OnIIpwDt/gOtyFCVBN4BxXYAyK4flVHTAMPXAZrNbBr8MkNIM+5c1XYRAugW1StvYzjMMCpAPsbWyexvb5fYcNuAp7yYGeA9ti5f2g8pyFw19xyKQOOORAjefoC/VhRGJ98YQjnr72VnLFQ8h9YddcX5nMjfoiqf/0YrDGyrTf9WU5Dnz/sAN/ACNpW1chdOTAAAAAAElFTkSuQmCC"
            const sacd = this.buildPermissions();

            const postMintResp = await this.postMintVehicle(userDeviceId, signedNftResp.signature, imageBase64, sacd);
            if (!postMintResp.success) {
                return this.returnFailure("failed mint vehicle: " + postMintResp.error);
            }
            this.processingMessage = "Vehicle NFT mint accepted, waiting for transaction....";

            // before continuing, check that mint went through
            await this.checkIsVehicleMinted(vin);
            this.processingMessage = "vehicle mint completed";
        }
        // 3. Mint the synthetic device
        if(syntheticDeviceTokenId === 0) {
            const registerResp = await this.registerIntegration(userDeviceId); // this call is idempotent
            if (!registerResp.success) {
                return this.returnFailure("failed to register devices-api integration to compass: " + registerResp.error);
            }

            const syntheticMintResp = await this.getMintSyntheticDevice(userDeviceId);
            if (!syntheticMintResp.success) {
                return this.returnFailure("failed to register synthetic device: " + syntheticMintResp.error);
            }
            // fix number
            syntheticMintResp.data.domain.chainId = Number(syntheticMintResp.data.domain.chainId);
            const signedResp = await this.signingService.signTypedData(syntheticMintResp.data);
            if (!signedResp.success) {
                return this.returnFailure("failed to sign synthetic device payload: " + signedResp.error);
            }
            const postSyntheticMintResp = await this.postMintSyntheticDevice(userDeviceId, signedResp.signature);
            if (!postSyntheticMintResp.success) {
                return this.returnFailure("failed to post synthetic device: " + postSyntheticMintResp.error);
            }
            await this.checkIsSyntheticMinted(vin);
            this.processingMessage = "synthetic device minted OK";
        }

        await this.registerInOracle(vin);

        // reset form
        this.processing = false;
        this.processingMessage = "VIN add Succeeded!";
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

    async checkIsVehicleMinted(vin: string) {
        let isMinted = false;
        let count = 0;
        while(!isMinted && vin) {
            const lookup = await this.getDeviceAPILookup(vin);
            count++;
            if (!lookup.success || (lookup.success && lookup.data?.vehicleTokenId === 0)) {
                await this.delay(10_000);
                this.processingMessage = "waiting for vehicle mint." + count;

                if (!lookup.success) {
                    this.processingMessage = "check request failed but will try again: " + lookup.error;
                }
            } else {
                isMinted = true;
            }
        }
        return true;
    }

    async checkIsSyntheticMinted(vin: string) {
        let isMinted = false;
        let count = 0;
        while(!isMinted && vin) {
            const lookup = await this.getDeviceAPILookup(vin);
            count++;
            if (!lookup.success || (lookup.success && lookup.data?.syntheticDeviceTokenId === 0)) {
                await this.delay(10_000);
                this.processingMessage = "waiting for synthetic mint." + count;

                if (!lookup.success) {
                    this.processingMessage = "check request failed but will try again: " + lookup.error;
                }
            } else {
                isMinted = true;
            }
        }
        return true;
    }

    async addToCompass(vins: string[]) {
        const url = "/v1/vehicles";
        const body = { vins: vins, email: this.email };
        return await this.api.callApi<CompassAddVINStatus[]>('POST', url, body, true);
    }

    async getDeviceAPILookup(vin: string) {
        const url = "/v1/compass/device-by-vin/" + vin;
        return await this.api.callApi<VehicleLookup>('GET', url, null, true);
    }

    async addToUserDevicesAndDecode(vin: string) {
        const url = "/v1/user/devices/fromvin";
        const body = { countryCode: "USA", vin: vin };
        return await this.api.callApi<any>('POST', url, body, true);
    }

    async registerIntegration(userDeviceId: string) {
        const url = `/v1/user/devices/${userDeviceId}/integrations/${this.settings.getCompassIntegrationId()}`;
        return await this.api.callApi<any>('POST', url, {}, true);
    }

    async getMintSyntheticDevice(userDeviceId: string) {
        const url = `/v1/user/devices/${userDeviceId}/integrations/${this.settings.getCompassIntegrationId()}/commands/mint`;
        return await this.api.callApi<any>('GET', url, null, true);
    }

    /**
     * @param {string} userDeviceId
     * @param {`0x${string}`} signature
     * calls devices-api to mint a vehicle from a signed payload
     */
    async postMintSyntheticDevice(userDeviceId: any, signature: `0x${string}` | undefined) {
        const url = `/v1/user/devices/${userDeviceId}/integrations/${this.settings.getCompassIntegrationId()}/commands/mint`;
        const body = {
            signature: signature,
        }

        return await this.api.callApi<any>('POST', url, body, true);
    }

    async getMintVehicle(userDeviceId: string, _definitionId: string) {
        const url = `/v1/user/devices/${userDeviceId}/commands/mint`;
        return await this.api.callApi<any>('GET', url, null, true);
    }

    /**
     * @param {string} userDeviceId
     * @param {`0x${string}`} payloadSignature
     * @param {string} base64Image
     * @param {Object} sacdInput the SACD permissions input
     * calls devices-api to mint a vehicle from a signed payload
     */
    async postMintVehicle(userDeviceId: string, payloadSignature: `0x${string}` | undefined, base64Image: string, sacdInput: Object) {
        const url = `/v1/user/devices/${userDeviceId}/commands/mint`;
        const body = {
            signature: payloadSignature,
            imageData: base64Image,
            sacdInput: sacdInput,
            // Optionally add imageData here
        }
        return await this.api.callApi<any>('POST', url, body, true);
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
