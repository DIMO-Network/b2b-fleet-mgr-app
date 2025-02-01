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
        // call backend endpoint
        // call dd-api decode vin
        this.addToCompass().then(() => {
            this.addToUserDevicesAndDecode().then(res => {
                this.getMintVehicle(res.userDeviceId, res.definitionId).then(mintRes => {
                    // need to sign the payload
                    console.log("payload to sign", mintRes);

                })
            });
        });

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

    async signMintVehiclePayload(nft) {
        const kernelConfig = newKernelConfig({
            rpcUrl: this.settings.getRpcUrl(),
            bundlerUrl: this.settings.getBundlerUrl(),
            paymasterUrl: this.settings.getPaymasterUrl(),
            // todo more things that should be configurable
            clientId: "0x51dacC165f1306Abfbf0a6312ec96E13AAA826DB",
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
        await kernelSigner.init("todo?", stamper);

        // // do i need this?
        // const perms = kernelSigner.getDefaultPermissionValue();

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
    // convert to JS, todo settings for appId and grantee
        const ipfsRes = await kernelSigner.signAndUploadSACDAgreement({
            driverID: args.owner,
            appID: process.env.SACD_DEFAULT_GRANTEE as `0x${string}`, // my client id? or is there still and app id
            appName: "dimo-driver",
            expiration: BigInt(2933125200), // 40 years
            permissions: perms,
            grantee: process.env.SACD_DEFAULT_GRANTEE as `0x${string}`, // the dev license ?
            attachments: [],
            grantor: args.owner,
        });
        if (!ipfsRes.success) {
            throw new Error(`Failed to upload SACD agreement`);
        }
        const result = await kernelSigner.setVehiclePermissions({
            tokenId,
            grantee,
            perms,
            expiration,
            source: `ipfs://${ipfsRes.data?.cid}`,
        });
        // instead of doing below, call devices-api b/c it will do mint vehicle and synthetic
    // convert to js
    //     const response = await kernelSigner.mintVehicleWithDeviceDefinition(
    //         {
    //             manufacturerNode: args.manufacturerNode,
    //             owner: args.owner, // 0x addr of my wallet address of the person that will own the nft
    //             deviceDefinitionID: args.deviceDefinitionID,
    //             attributeInfo: args.attributeInfo, // make model year
    //             sacdInput: {
    //                 grantee: process.env.SACD_DEFAULT_GRANTEE as `0x${string}`,
    //                 permissions: perms,
    //                 expiration: BigInt(2933125200), // 40 years
    //                 source: `ipfs://${ipfsRes.cid}`,
    //             },
    //         },
    //         false // dont wait for transaction, probably set to true
    //     );
        // synthetic device?
    }

}
window.customElements.define('add-vin-element', AddVinElement);