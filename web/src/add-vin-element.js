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

    _submitVIN(event) {
        this.processing = true;
        console.log(this.vin);
        // todo if _submitVIN can be async, then can change below to use await for each one.
        this.addToCompass().then(() => {
            this.addToUserDevicesAndDecode().then(res => {
                this.getMintVehicle(res.userDeviceId, res.definitionId).then(mintRes => {
                    // need to sign the payload
                    console.log("payload to sign", mintRes);
                    this.signMintVehiclePayload(mintRes).then(res => {
                        console.log("signed mint vehicle", res);
                    })
                })
            });
        });

        // todo: we don't have the tokenid yet, i think we need to do polling somwewhere to get the tokenid to be able to call below
        // const result = await kernelSigner.setVehiclePermissions({
        //     tokenId, // the token id from the post response from devices-api? or do we get this later?
        //     grantee, // same as above grantee
        //     perms,
        //     expiration,
        //     source: `ipfs://${ipfsRes.data?.cid}`,
        // });
        // does devices-api already do this? ^

        // reset form
        this.processing = false;
        this.vin = "";
    }

    async addToCompass() {
        // we'll need a configuration settings api endpoint we call on load -> could this be passed into the element?
        // call api
        const url = this.settings.getDevicesApiUrl() + "/v1/vehicles"

        const data = {
            vins: [this.vin], // Example VINs
            email: this.email,
        };

        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.token}`
            },
            body: JSON.stringify(data)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                console.log("Success adding to compass:", result);

            })
            .catch(error => {
                console.error("Error:", error);
            });
    }

    async addToUserDevicesAndDecode() {
        const url = this.settings.getDevicesApiUrl() + "/v1/user/devices/fromvin"

        const data = {
            countryCode: "USA",
            vin: this.vin,
        };

        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.token}`
            },
            body: JSON.stringify(data)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                console.log("Success adding to compass:", result);
                const definitionId = result.deviceDefinition.definitionId;
                const userDeviceId = result.id;

                return {
                    definitionId: definitionId,
                    userDeviceId: userDeviceId,
                };

            })
            .catch(error => {
                console.error("Error:", error);
            });
    }

    async getMintVehicle(userDeviceId, definitionId) {
        // returns content to sign
        const url = `${this.settings.getDevicesApiUrl()}/v1/user/devices/${userDeviceId}/commands/mint`;

        fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${this.token}`
            },
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                console.log("Success adding to compass:", result);
                return result;
            })
            .catch(error => {
                console.error("Error:", error);
            });
    }

    /**
     * calls devices-api to mint a vehicle from a signed payload
     */
    async postMintVehicle(userDeviceId, signedNftPayload) {
        const url = `${this.settings.getDevicesApiUrl()}/v1/user/devices/${userDeviceId}/commands/mint`;

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