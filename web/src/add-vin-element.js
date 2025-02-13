import {html, LitElement, css} from 'lit'
import {Settings} from "./settings.js";
import {KernelSigner, newKernelConfig, sacdPermissionValue} from '@dimo-network/transactions';
import {WebauthnStamper} from "@turnkey/webauthn-stamper";
import { TurnkeyClient } from "@turnkey/http";

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
        this.email = localStorage.getItem("email");
        this.settings = new Settings();
        this.alertText = "";
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    async connectedCallback() {
        super.connectedCallback(); // Always call super.connectedCallback()
        await this.settings.fetchSettings(); // Fetch settings on load
        await this.settings.fetchAccountInfo(this.email); // load account info

        const r = this.setupKernelSigner();
        this.kernelSigner = r.kernelSigner;
        this.stamper = r.stamper;
    }

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

        const mintResp = await this.getMintVehicle(userDeviceId, definitionId)
        if (!mintResp.success) {
            this.alertText = "failed to get the message to mint" + mintResp.error;
            return;
        }
        // saw this fix in the mobile app https://github.com/DIMO-Network/dimo-driver/blob/development/src/hooks/custom/useSignCallback.ts#L40
        mintResp.data.domain.chainId = Number(mintResp.data.domain.chainId);

        // const payloadString = JSON.stringify(mintResp.data);
        //
        // const signedNftResp = await this.signMintVehiclePayload(payloadString)
        // if (!signedNftResp.success) {
        //     this.alertText = "failed to get the message to mint" + signedNftResp.error;
        //     return;
        // }
        // console.log("signed mint vehicle:", signedNftResp.signature);

        const sdkSignResult = await this.signPayloadWithSDK(mintResp.data);

        const postMintResp = await this.postMintVehicle(userDeviceId, signedNftResp.signature);
        if (!postMintResp.success) {
            this.alertText = "failed mint vehicle: " + postMintResp.error;
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
        // todo we could do something where we check if this vin already exists, use the vin check endpoint for compass

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
                    error: result.message,
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

            // domain: "dimo.org",
            // redirectUri: "https://fleet-onboard.dimo.org/login.html",
            // environment: "dev", // same error if set env to dev, no difference
            // useWalletSession: true,
        })
        const kernelSigner = new KernelSigner(kernelConfig);

        const stamper = new WebauthnStamper({
            rpId: "dimo.org", // passkeys need to be on the same rpid - must match LIWD. should be: dimo.org, works on subdomain
        });

        return {
            kernelSigner,
            stamper,
        };
    }

    /**
     * Converts an ECDSA signature (r, s, v) into a full Ethereum hex signature.
     *
     * Ethereum uses a 65-byte signature format: `r (32 bytes) + s (32 bytes) + v (1 byte)`.
     * This function ensures `v` is correctly formatted (27 or 28) before concatenating.
     *
     * @param {Object} signResult - The signature result object.
     * @param {string} signResult.r - The 32-byte hex string representing the `r` value.
     * @param {string} signResult.s - The 32-byte hex string representing the `s` value.
     * @param {string} signResult.v - The recovery ID as a hex string (typically `"00"` or `"01"`).
     * @returns {`0x${string}`} The full Ethereum signature as a 0x-prefixed hex string.
     */
    formatEthereumSignature(signResult) {
        const { r, s, v } = signResult;
        const vHex = (parseInt(v, 16) + 27).toString(16).padStart(2, '0');
        return `0x${r}${s}${vHex}`;
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

    /**
     *
     * @param mintPayload {string} challenge payload to be signed
     * @returns {Promise<{success: boolean, error: string}|{success: boolean, signature: `0x${string}`}>}
     */
    async signPayloadWithTurnkeyZerodev(mintPayload) {

        try{
            console.log("payload to sign", mintPayload);

            const httpClient = new TurnkeyClient(
                { baseUrl: "https://api.turnkey.com" },
                this.stamper
            );

            const ts = Date.now();

            // Convert byte array to hex string
            // const byteArray = new TextEncoder().encode(mintPayload);
            // const hexString = Array.from(byteArray)
            //     .map(byte => byte.toString(16).padStart(2, '0'))
            //     .join('');
            // const payload = `0x${hexString}`;
            //
            // console.log("payload to sign hex:", payload);

            // signing with turnkey won't work, must use zero dev
            const signRawResult = await httpClient.signRawPayload({
                "type": "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
                "timestampMs": ts.toString(),
                "organizationId": this.settings.getTurnkeySubOrgId(),
                "parameters": {
                    "signWith": this.settings.getUserWalletAddress(),
                    "payload": mintPayload,
                    "encoding": "PAYLOAD_ENCODING_TEXT_UTF8",
                    "hashFunction": "HASH_FUNCTION_SHA256" //HASH_FUNCTION_SHA256, HASH_FUNCTION_KECCAK256
                }
            })
            console.log(JSON.stringify(signRawResult))
            const ethStyleECDSA = this.formatEthereumSignature(signRawResult.activity.result.signRawPayloadResult);

            return {
                success: true,
                signature: ethStyleECDSA,
            }
            // doing any of below resulted in no active client error
            // await this.kernelSigner.passkeyToSession(this.settings.getTurnkeySubOrgId(), this.stamper)
            // await this.kernelSigner.passkeyInit(this.settings.getTurnkeySubOrgId(), this.settings.getOrgWalletAddress(), this.stamper);
            // still need to try this one
            // this.kernelSigner.passkeyToSession()

            // bug? activity type should be set
            // todo blocked: Turnkey error 3: no runner registered with activity type ""

            //
            // // todo blocked: Turnkey error 3: no runner registered with activity type "", if comment above can reach test this one, but got same error
            // const signedNFT = await this.kernelSigner.signTypedData(mintPayload);
            // error 3 means invalid argument
        } catch (error) {
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);

            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            }
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * uses dimo transactions sdk to init kernel signer and then sign the payload object
     * @param {Object} mintPayload
     * @returns {Promise<`0x${string}`>} should be the final eth style ecdsa signature
     */
    async signPayloadWithSDK(mintPayload) {
        // could try with passkeyinit too
        await this.kernelSigner.passkeyInit(this.settings.getTurnkeySubOrgId(), this.settings.getUserWalletAddress(), this.stamper);
        const tc = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, this.stamper);
        this.kernelSigner.passkeyClient.turnkeyClient = tc;
        // error is "no active client"

        const wallets = await tc.getWallets({
            organizationId: this.settings.getTurnkeySubOrgId(),
        });
        const walletAddr = await tc.getWalletAccounts({
            organizationId: this.settings.getTurnkeySubOrgId(),
            walletId: wallets.wallets[0].walletId,
        });
        console.log(walletAddr)

        const signed = await this.kernelSigner.signTypedData(mintPayload);
        console.log("Signature from sdk:", signed);
        console.log(JSON.stringify(signed));

        return signed;
    }

    async uploadSACDPermissions() {
        // todo move this permissions stuff elsewhere
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
window.customElements.define('add-vin-element', AddVinElement);