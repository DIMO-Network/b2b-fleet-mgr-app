import {html, LitElement, css} from 'lit'
import {Settings} from "./settings.js";
import {KernelSigner, newKernelConfig, sacdPermissionValue} from '@dimo-network/transactions';
import {WebauthnStamper} from '@turnkey/webauthn-stamper';
import { TurnkeyClient } from '@turnkey/http';
import { createAccount } from '@turnkey/viem';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { KERNEL_V3_1, getEntryPoint } from '@zerodev/sdk/constants'
import { createPublicClient, http} from 'viem';
import { polygonAmoy } from 'viem/chains';
import {createKernelAccount} from '@zerodev/sdk';

export class AddVinElement extends LitElement {
    static properties = {
        vin: { type: String },
        email: { type: String },
        processing: { type: Boolean },
        token: {type: String },
        alertText: {type: String },
        processingMessage: {type: String },
    }
    // we're gonna need a way to handle errors and display them in the frontend, as well as continuation for something that
    // errored half way
    constructor() {
        super();
        this.vin = "";
        this.processing = false;
        this.processingMessage = "";
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
            <div class="alert alert-success" ?hidden=${this.processingMessage === "" || this.alertText.length > 0}>
                ${this.processingMessage}
            </div>
        `;
    }

    async _submitVIN(event) {
        this.alertText = "";
        this.processing = true;
        console.log("onboarding vin", this.vin);

        const lookupResp = await this.getCompassLookup(this.vin);
        let userDeviceId = "";
        let vehicleTokenId = 0;
        let syntheticDeviceTokenId = 0;
        let definitionId = "";
        if (lookupResp.success) {
            userDeviceId = lookupResp.data.userDeviceId;
            vehicleTokenId = lookupResp.data.vehicleTokenId;
            syntheticDeviceTokenId = lookupResp.data.syntheticDeviceTokenId;
            this.processingMessage = "found existing device with vin: " + this.vin
        }

        const compassResp = await this.addToCompass(this.vin);
        if (!compassResp.success) {
            this.alertText = "failed to add vin to compass:" + compassResp.error;
            return;
        }
        this.processingMessage = "added to compass OK"
        if(userDeviceId === "") {
            const fromVinResp = await this.addToUserDevicesAndDecode(this.vin); // this call is idempotent
            if (!fromVinResp.success) {
                this.alertText = "failed to add vin to user devices:" + fromVinResp.error;
                return;
            }
            definitionId = fromVinResp.data.userDevice.deviceDefinition.definitionId;
            userDeviceId = fromVinResp.data.userDevice.id;
            this.processingMessage = "VIN decoded OK"
        }
        if(syntheticDeviceTokenId === 0) {
            const registerResp = await this.registerIntegration(userDeviceId); // this call is idempotent
            if (!registerResp.success) {
                this.alertText = "failed to register devices-api integration to compass: " + registerResp.error;
                return;
            }
            this.processingMessage = "integration registered";
            if (vehicleTokenId > 0) {
                // this means already minted but missing synthetic device
                const syntheticMintResp = await this.getMintSyntheticDevice(userDeviceId);
                if (!syntheticMintResp.success) {
                    this.alertText = "failed to register synthetic device: " + syntheticMintResp.error;
                    return;
                }
                // fix number
                syntheticMintResp.data.domain.chainId = Number(syntheticMintResp.data.domain.chainId);
                const signedResp = await this.signPayloadWithTurnkeyZerodev(syntheticMintResp.data);
                if (!signedResp.success) {
                    this.alertText = "failed to sign synthetic device payload: " + signedResp.error;
                    return;
                }
                const postSyntheticMintResp = await this.postMintSyntheticDevice(userDeviceId, signedResp.signature);
                if (!postSyntheticMintResp.success) {
                    this.alertText = "failed to post synthetic device: " + postSyntheticMintResp.error;
                    return;
                }
                this.processingMessage = "synthetic device minted OK";
            }
        }
        // mint vehicle if hasn't been minted already. Since register is called above, synthetic will automatically get minted too
        if (vehicleTokenId === 0) {
            const mintResp = await this.getMintVehicle(userDeviceId, definitionId)
            if (!mintResp.success) {
                this.alertText = "failed to get the message to mint" + mintResp.error;
                return;
            }
            // saw this fix in the mobile app https://github.com/DIMO-Network/dimo-driver/blob/development/src/hooks/custom/useSignCallback.ts#L40
            mintResp.data.domain.chainId = Number(mintResp.data.domain.chainId);

            const signedNftResp = await this.signPayloadWithTurnkeyZerodev(mintResp.data)
            if (!signedNftResp.success) {
                this.alertText = "failed to get the message to mint" + signedNftResp.error;
                return;
            }
            console.log("signed mint vehicle:", signedNftResp.signature);

            //const sdkSignResult = await this.signPayloadWithSDK(mintResp.data);

            const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAIRlWElmTU0AKgAAAAgABQESAAMAAAABAAEAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAIdpAAQAAAABAAAAWgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAABigAwAEAAAAAQAAABgAAAAAEQ8YrgAAAAlwSFlzAAALEwAACxMBAJqcGAAAAVlpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDYuMC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iPgogICAgICAgICA8dGlmZjpPcmllbnRhdGlvbj4xPC90aWZmOk9yaWVudGF0aW9uPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KGV7hBwAAAe5JREFUSA3tlE9LlVEQh9XK/oKEFLgQFKqNmyDEArFMwoXgxm/gxzC3gkQrI9rkIsFFgUWRFSEVtGtTKxW/gBCWYKRo9ud53pzj4fJeLy6ijT94fIeZc+bMmTnXuroD/e8O1O9RQAMxqabfBH5WC9byH6q1YCd+uNa6shtY9S84DTd2bD5JVn4U5uETeMg2lKrygCOs+gHH4AOswVdoBBMr92xCF4zCfXC9+2KN37Ax//Y6b8sjfFNFpPqfdkKrMFSyxCJSvnyQZwjchqVskwvdkOON1EX4AjfhGlyAExBKuVvwPIFFeAHnQXl1lSfXVnFIJ/ZTeA8fwbnMQhsk3cF6DseTZ9dIV911JcthV8piH8M9A3GFk9ivYAOuwEt4AwPgW7daD8oxucPuhjl4Db2wDO4tbhgHWHlM/Rn2W5iEB+Br2QIPyjF5K8yAe3wYtuos+KIsunjDfq1+BBzWQ7gFyoG9A+OnIIpwDt/gOtyFCVBN4BxXYAyK4flVHTAMPXAZrNbBr8MkNIM+5c1XYRAugW1StvYzjMMCpAPsbWyexvb5fYcNuAp7yYGeA9ti5f2g8pyFw19xyKQOOORAjefoC/VhRGJ98YQjnr72VnLFQ8h9YddcX5nMjfoiqf/0YrDGyrTf9WU5Dnz/sAN/ACNpW1chdOTAAAAAAElFTkSuQmCC"
            const sacd = this.buildPermissions();

            const postMintResp = await this.postMintVehicle(userDeviceId, signedNftResp.signature, imageBase64, sacd);
            if (!postMintResp.success) {
                this.alertText = "failed mint vehicle: " + postMintResp.error;
            }
            this.processingMessage = "Vehicle NFT mint accepted";
        }

        // start polling to get token id and synthetic token_id, just users/devices/me

        // todo: we don't have the tokenid yet, i think we need to do polling somwewhere to get the tokenid to be able to call below

        // reset form
        this.processing = false;
        this.processingMessage = "VIN add Succeeded!";
        this.sleepSync(2000)
        this.processingMessage = "";

        // this.vin = ""; // to reset the input this won't work since it doesn't push up to the input, ie. this is not mvvm.
    }

    sleepSync(ms) {
        const start = Date.now();
        while (Date.now() - start < ms) {
            // Busy-wait loop (blocks execution)
        }
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

    /**
     * @typedef {Object} VehicleLookup
     * @property {string} vin
     * @property {string} userDeviceId
     * @property {number} vehicleTokenId - populated if vehicle is minted
     * @property {number} syntheticDeviceTokenId - populated if synthetic device is minted
     */
    /**
     *
     * @param {string} vin
     * @returns {Promise<{success: boolean, data: VehicleLookup}|{success: boolean, error: string}|{success: boolean, error: any, status: number}>}
     */
    async getCompassLookup(vin) {
        const url = this.settings.getBackendUrl() + "/v1/compass/device-by-vin/" + vin;

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
                    error: result.message || result,
                    status: response.status,
                };
            }
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            console.error("Error in get compass lookup:", error);
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

    async registerIntegration(userDeviceId) {
        const url = `${this.settings.getBackendUrl()}/v1/user/devices/${userDeviceId}/integrations/${this.settings.getCompassIntegrationId()}`;
        const data = {}

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify(data)
            });
            // this doesn't return anything in the body
            // Check for HTTP errors
            if (!response.ok) {
                let errorMsg = "";
                // check for json error message
                const body = await response.text();
                if (body.length > 0) {
                    const result = await response.json();
                    errorMsg = result.message;
                }
                return {
                    success: false,
                    error: errorMsg,
                    status: response.status,
                };
            }
            console.log("Success registering compass integration devices-api:", result);
            return {
                success: true,
            };
        } catch (error) {
            // Handle network or parsing errors
            console.error("Error in registerIntegration:", error);
            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    async getMintSyntheticDevice(userDeviceId) {
        const url = `${this.settings.getBackendUrl()}/v1/user/devices/${userDeviceId}/integrations/${this.settings.getCompassIntegrationId()}/commands/mint`;

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

            if (!response.ok) {
                return {
                    success: false,
                    error: result.message || result,
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
     * @param {string} userDeviceId
     * @param {`0x${string}`} signature
     * calls devices-api to mint a vehicle from a signed payload
     */
    async postMintSyntheticDevice(userDeviceId, signature) {
        const url = `${this.settings.getBackendUrl()}/v1/user/devices/${userDeviceId}/integrations/${this.settings.getCompassIntegrationId()}/commands/mint`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    signature: signature,
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
                    error: errorDetail.message || errorDetail || `HTTP error! Status: ${response.status}`,
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
     * @param {string} userDeviceId
     * @param {`0x${string}`} payloadSignature
     * @param {string} base64Image
     * @param {Object} sacdInput the SACD permissions input
     * calls devices-api to mint a vehicle from a signed payload
     */
    async postMintVehicle(userDeviceId, payloadSignature, base64Image, sacdInput) {
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
                    signature: payloadSignature,
                    imageData: base64Image,
                    sacdInput: sacdInput,
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
                    error: errorDetail.message || errorDetail || `HTTP error! Status: ${response.status}`,
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
     * @param mintPayload {Object} challenge payload to be signed, as original object
     * @returns {Promise<{success: boolean, error: string}|{success: boolean, signature: `0x${string}`}>}
     */
    async signPayloadWithTurnkeyZerodev(mintPayload) {

        try{
            console.log("payload to sign", mintPayload);

            const httpClient = new TurnkeyClient(
                { baseUrl: "https://api.turnkey.com" },
                this.stamper
            );
            const turnkeyAccount = await createAccount({
                client: httpClient,
                organizationId: this.settings.getTurnkeySubOrgId(), // sub org id
                signWith: this.settings.getUserWalletAddress(), // normally the wallet address
            })
            const publicClient = await createPublicClient({
                // Use your own RPC provider (e.g. Infura/Alchemy).
                transport: http(this.settings.getRpcUrl()),
                chain: polygonAmoy,
            })
            const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
                signer: turnkeyAccount,
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1
            })
            const kernelAccount = await createKernelAccount(publicClient, {
                plugins: {
                    sudo: ecdsaValidator,
                },
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1,
            });
            // have to use signTypedData
            const signature = await kernelAccount.signTypedData(mintPayload)

            console.log(signature)

            return {
                success: true,
                signature: signature,
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

    // const result = await kernelSigner.setVehiclePermissions({
    //     tokenId, // the token id from the post response from devices-api? or do we get this later?
    //     grantee, // same as above grantee
    //     perms,
    //     expiration,
    //     source: `ipfs://${ipfsRes.data?.cid}`,
    // });

    buildPermissions() {
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
            driverID: this.settings.getUserWalletAddress(), // current user's wallet address
            appID: this.settings.getAppClientId(), // assuming clientId
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