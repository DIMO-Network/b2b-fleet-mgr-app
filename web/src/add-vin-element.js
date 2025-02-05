import {html, LitElement} from 'lit'
import {Settings} from "./settings.js";
import {KernelSigner, newKernelConfig, sacdPermissionValue} from '@dimo-network/transactions';
import { WebauthnStamper } from "@turnkey/webauthn-stamper";

export class AddVinElement extends LitElement {
    static properties = {
        vin: { type: String },
        email: { type: String },
        processing: { type: Boolean },
        token: {type: String },
    }
    // we're gonna need a way to handle errors and display them in the frontend, as well as continuation for something that
    // errored half way
    constructor() {
        super();
        this.vin = "";
        this.processing = false;
        this.email = "";
        this.token = localStorage.getItem("token");
        this.settings = new Settings();
    }

    async connectedCallback() {
        super.connectedCallback(); // Always call super.connectedCallback()
        await this.settings.fetchSettings(); // Fetch settings on load
        console.log("Loaded Settings:");
    }

    render() {
        return html`
            <form class="grid">
                <label>VIN
                    <input type="text" placeholder="VIN" maxlength="17"
                           value="${this.vin}" @input="${e => this.vin = e.target.value}"></label>
                <label>Consent Email
                    <input type="text" placeholder="me@company.com" maxlength="60"
                           value="${this.email}" @input="${e => this.email = e.target.value}"></label>
                <button type="button" @click=${this._submitVIN} ?disabled=${this.processing}>
                    Onboard VIN
                </button>
            </form>
        `;
    }

    async _submitVIN(event) {
        this.processing = true;
        console.log("onboarding vin", this.vin);

        const compassResp = await this.addToCompass(this.vin);
        if (!compassResp.success) {
            // todo have an area for showing errors
            alert("failed to add vin to compass:" + compassResp.error)
            return;
        }

        const fromVinResp = await this.addToUserDevicesAndDecode(this.vin);
        if (!fromVinResp.success) {
            alert("failed to add vin to user devices:" + fromVinResp.error);
            return;
        }

        const definitionId = fromVinResp.data.userDevice.deviceDefinition.definitionId;
        const userDeviceId = fromVinResp.data.userDevice.id;

        const mintResp = await this.getMintVehicle(userDeviceId, definitionId)
        if (!mintResp.success) {
            alert("failed to get the message to mint" + mintResp.error);
            return;
        }
        console.log("payload to sign", mintResp.data);

        const signResp = await this.signMintVehiclePayload(mintResp.data)
        console.log("signed mint vehicle", signResp);

        // start polling to get token id and synthetic token_id, just users/devices/me

        // todo: we don't have the tokenid yet, i think we need to do polling somwewhere to get the tokenid to be able to call below
        // const result = await kernelSigner.setVehiclePermissions({
        //     tokenId, // the token id from the post response from devices-api? or do we get this later?
        //     grantee, // same as above grantee
        //     perms,
        //     expiration,
        //     source: `ipfs://${ipfsRes.data?.cid}`,
        // });
        // does devices-api already do this? ^ My understanding is above is not needed.

        // reset form
        this.processing = false;
        // this.vin = ""; // to reset the input this won't work since it doesn't push up to the input, ie. this is not mvvm.
    }

    async addToCompass(vin) {
        // Construct the target URL and payload.
        const url = this.settings.getBackendUrl() + "/v1/vehicles";
        const data = {
            vins: [vin],
            email: this.email,
        };

        try {
            // Make the POST request using fetch and await the response.
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify(data)
            });
            //const result = await response.json();

            // Check if the response was not OK and return a standardized error.
            if (!response.ok) {
                return {
                    success: false,
                    error: response.text, // Depending on the API, error details might be here.
                    status: response.status,
                };
            }

            console.log("Success adding to compass:");
            return {
                success: true,
                // data: result,
            };

        } catch (error) {
            // Handle network or parsing errors and return a standardized error object.
            console.error("Error in addToCompass:", error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    async addToUserDevicesAndDecode(vin) {
        const url = this.settings.getBackendUrl() + "/v1/user/devices/fromvin";
        const data = {
            countryCode: "USA",
            vin: vin,
        };

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            // Check for HTTP errors
            if (!response.ok) {
                return {
                    success: false,
                    error: result.error || result,
                    status: response.status,
                };
            }
            console.log("Success registering with devices-api:", result);
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            // Handle network or parsing errors
            console.error("Error in addToUserDevicesAndDecode:", error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    async getMintVehicle(userDeviceId, definitionId) {
        const url = `${this.settings.getBackendUrl()}/v1/user/devices/${userDeviceId}/commands/mint`;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
            });
            const result = await response.json();

            // Check if the response was not OK and return a standardized error object.
            if (!response.ok) {
                return {
                    success: false,
                    error: result.error || result,
                    status: response.status,
                };
            }
            console.log("Success getting mint vehicle:", result);
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            // Handle network or parsing errors and return a standardized error object.
            console.error("Error in getMintVehicle:", error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    /**
     * calls devices-api to mint a vehicle from a signed payload
     */
    async postMintVehicle(userDeviceId, signedNftPayload) {
        const url = `${this.settings.getBackendUrl()}/v1/user/devices/${userDeviceId}/commands/mint`;

        fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.token}`
            },
            body: JSON.stringify({
                signature: signedNftPayload,
                // we could also add the imageData
            }),
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
            })
            .catch(error => {
                console.error("Error:", error);
            });
    }

    async signMintVehiclePayload(userDeviceId, nft) {
        const kernelConfig = newKernelConfig({
            rpcUrl: this.settings.getRpcUrl(),
            bundlerUrl: this.settings.getBundlerUrl(),
            paymasterUrl: this.settings.getPaymasterUrl(),
            // todo more things that should be configurable /dynamic
            clientId: this.settings.getAppClientId(),
            domain: "localhost:3008",
            redirectUri: "http://localhost:3008/login.html",
            environment: "dev",
            useWalletSession: true,
        })
        // use the webauthn stamper
        const stamper = new WebauthnStamper({
            rpId: "localhost:3008",
        });
        const kernelSigner = new KernelSigner(kernelConfig);
        await kernelSigner.init(this.settings.getAppSubOrganizationId(), stamper); // not sure if value here is correct
        await kernelSigner.openSessionWithPasskey(); // is this needed?

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
        const expiration = BigInt(2933125200); // 40 years
    // convert to JS, todo settings for appId and grantee
        const ipfsRes = await kernelSigner.signAndUploadSACDAgreement({
            driverID: this.settings.getAppSubOrganizationId(), // current user wallet addres??
            appID: this.settings.getAppClientId(), // assuming clientId
            appName: "B2B Fleet Manager App DEV", // todo from app prompt
            expiration: expiration,
            permissions: perms,
            grantee: this.settings.getAppSubOrganizationId(), // granting the organization the perms
            attachments: [],
            grantor: this.settings.getAppSubOrganizationId, // current user...
        });
        if (!ipfsRes.success) {
            throw new Error(`Failed to upload SACD agreement`);
        }
        // mint vehicle by calling devices-api here
        // before calling devices-api need to sign the nft payload variable that is input here
        const signedNft = await kernelSigner.signChallenge(nft);// this may need to be signtypeddata
        // now send this to devices-api post (wrap it in a function)
        console.log("signedNft", signedNft);
        await this.postMintVehicle(userDeviceId, signedNft);
    }

}
window.customElements.define('add-vin-element', AddVinElement);