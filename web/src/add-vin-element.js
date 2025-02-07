import {html, LitElement, css} from 'lit'
import {Settings} from "./settings.js";
import {KernelSigner, newKernelConfig, sacdPermissionValue} from '@dimo-network/transactions';
import {WebauthnStamper} from "@turnkey/webauthn-stamper";

export class AddVinElement extends LitElement {
    static properties = {
        vin: { type: String },
        email: { type: String },
        processing: { type: Boolean },
        token: {type: String },
        alertText: {type: String },
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
        this.alertText = "";
    }

    async connectedCallback() {
        super.connectedCallback(); // Always call super.connectedCallback()
        await this.settings.fetchSettings(); // Fetch settings on load
        // todo email should come from LIWD, but if qs empty prompt for it in login.html
        await this.settings.fetchAccountInfo("james@dimo.zone"); // load account info

        const r = this.setupKernelSigner();
        this.kernelSigner = r.kernelSigner;
        this.stamper = r.stamper;
    }

    static styles = css`
        /* Base style for all alerts */
        .alert {
            padding: 1rem;
            margin: 1rem 0;
            border: 1px solid transparent;
            border-radius: 4px;
            font-size: 1rem;
            font-family: sans-serif;
            transition: background-color 0.2s ease, border-color 0.2s ease;
        }

        /* Success alert theme */
        .alert-success {
            color: #155724;
            background-color: #d4edda;
            border-color: #c3e6cb;
        }

        /* Error (failure) alert theme */
        .alert-error {
            color: #721c24;
            background-color: #f8d7da;
            border-color: #f5c6cb;
        }
    `;

    render() {
        return html`
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
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
        this.alertText = "";
        this.processing = true;
        console.log("onboarding vin", this.vin);
// temporary - ok to test with this in prod to get over passkey signing
        const userDeviceId = "2sbhun5x8pyte98RfwHNAYx6Jjn";
        const definitionId = "jeep_wagoneer-l_2024";

        if(userDeviceId == null) {
            const compassResp = await this.addToCompass(this.vin);
            if (!compassResp.success) {
                this.alertText = "failed to add vin to compass:" + compassResp.error;
                return;
            }

            const fromVinResp = await this.addToUserDevicesAndDecode(this.vin);
            if (!fromVinResp.success) {
                this.alertText = "failed to add vin to user devices:" + fromVinResp.error;
                return;
            }

            const definitionId = fromVinResp.data.userDevice.deviceDefinition.definitionId;
            const userDeviceId = fromVinResp.data.userDevice.id;
        }

        const mintResp = await this.getMintVehicle(userDeviceId, definitionId)
        if (!mintResp.success) {
            this.alertText = "failed to get the message to mint" + mintResp.error;
            return;
        }
        console.log("payload to sign", mintResp.data);

        const signedNftResp = await this.signMintVehiclePayload(mintResp.data)
        if (!signedNftResp.success) {
            this.alertText = "failed to get the message to mint" + signedNftResp.error;
            return;
        }
        console.log("signed mint vehicle", signedNftResp.signature);

        const postMintResp = await this.postMintVehicle(userDeviceId, signedNftResp.signature);
        if (!postMintResp.success) {
            this.alertText = "failed to get the message to mint" + postMintResp.error;
        }

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

    setupKernelSigner() {
        const kernelConfig = newKernelConfig({
            rpcUrl: this.settings.getRpcUrl(),
            bundlerUrl: this.settings.getBundlerUrl(),
            paymasterUrl: this.settings.getPaymasterUrl(),
            clientId: this.settings.getAppClientId(),
            // todo more things that should be configurable /dynamic
            domain: "dimo.org",
            redirectUri: "https://fleet-onboard.dimo.org/login.html",
            environment: "dev",
            useWalletSession: true,
        })
        // use the webauthn stamper
        const stamper = new WebauthnStamper({
            rpId: "dimo.org", // passkeys need to be on the same rpid - must match LIWD. should be: dimo.org, works on subdomain
        });
        const kernelSigner = new KernelSigner(kernelConfig);

        return {
            kernelSigner,
            stamper,
        };
    }
    /**
     * calls devices-api to mint a vehicle from a signed payload
     */
    async postMintVehicle(userDeviceId, signedNftPayload) {
        const url = `${this.settings.getBackendUrl()}/v1/user/devices/${userDeviceId}/commands/mint`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    signature: signedNftPayload,
                    // Optionally add imageData here
                }),
            });

            // Check if the HTTP status indicates an error.
            if (!response.ok) {
                // Optionally, try to parse additional error information from the response.
                let errorDetail;
                try {
                    errorDetail = await response.json();
                } catch (parseError) {
                    errorDetail = await response.text();
                }
                return {
                    success: false,
                    error: errorDetail.error || errorDetail || `HTTP error! Status: ${response.status}`,
                    status: response.status,
                };
            }
            return { success: true };

        } catch (error) {
            console.error("Error in postMintVehicle:", error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    async signMintVehiclePayload(userDeviceId, nft) {
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

        try{

            await this.kernelSigner.init(this.settings.getTurnkeySubOrgId(), this.stamper);

            // this part already succeeded, temporarily commenting out
            // const ipfsRes = await this.kernelSigner.signAndUploadSACDAgreement({
            //     driverID: this.settings.getOrgWalletAddress(), // current user wallet addres??
            //     appID: this.settings.getAppClientId(), // assuming clientId
            //     appName: "B2B Fleet Manager App DEV", // todo from app prompt
            //     expiration: expiration,
            //     permissions: perms,
            //     grantee: this.settings.getOrgWalletAddress(), // granting the organization the perms
            //     attachments: [],
            //     grantor: this.settings.getOrgWalletAddress, // current user...
            // });
            // if (!ipfsRes.success) {
            //     throw new Error(`Failed to upload SACD agreement`);
            // }
            // console.log("ipfs sacd CID: " + ipfsRes.cid);
            // before calling devices-api need to sign the nft payload variable that is input here
            // this may need to be signtypeddata

            const signedNFT = await this.kernelSigner.signChallenge(nft);
            return {
                success: true,
                signature: signedNFT,
            }
        } catch (error) {
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);

            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            }
        }
    }

}
window.customElements.define('add-vin-element', AddVinElement);