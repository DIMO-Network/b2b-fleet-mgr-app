import {html, LitElement, nothing} from 'lit'
import {ApiService} from "@services/api-service.ts";
import {customElement, property, state} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";
import qs from "qs";
import {delay} from "@utils/utils";
import {range} from "lodash";
import {SigningService} from "@services/signing-service.ts";

interface VinDisconnectData {
    vin: string;
    userOperation: Object;
    hash: string;
    signature?: string;
}

interface VinsDisconnectDataResult {
    vinDisconnectData: VinDisconnectData[];
}

interface VinDisconnectStatus {
    vin: string;
    status: string;
    details: string;
}

interface VinsDisconnectResult {
    statuses: VinDisconnectStatus[];
}

@customElement('vehicle-list-item-element')
export class VehicleListItemElement extends LitElement {
    @property({attribute: true})
    public item?: Vehicle

    @state()
    private disconnectInProgress = false

    private api: ApiService;
    private signingService: SigningService;

    constructor() {
        super();
        this.api = ApiService.getInstance();
        this.signingService = SigningService.getInstance();
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    async connectedCallback() {
        super.connectedCallback();
    }

    render() {
        return this.item ? html`
              <td>${this.item.vin}</td>
              <td>${this.item.definition.make} ${this.item.definition.model} ${this.item.definition.year}</td>
              <td>${this.item.tokenId}</td>
              <td>${this.item.syntheticDevice?.tokenId || ''}</td>
              <td>
                  <button 
                      type="button" 
                      ?disabled=${this.disconnectInProgress || !this.item.syntheticDevice.tokenId}
                      class=${this.disconnectInProgress ? 'processing' : ''}
                      @click=${this.disconnectVehicle}
                  >disconnect
                  </button>
              </td>
              <td><button type="button" ?disabled=${this.item.syntheticDevice.tokenId}>delete</button></td>
          ` : nothing
    }

    async disconnectVehicle() {
        if (!this.item) {
            return;
        }

        this.disconnectInProgress = true

        const disconnectData = await this.getDisconnectData([this.item.vin])

        const signedDisconnectData = await this.signDisconnectData(disconnectData)

        const disconnectStatus = await this.submitDisconnectData(signedDisconnectData)

        this.disconnectInProgress = false

        return;
    }

    async getDisconnectData(vins: string[]) {
        const query = qs.stringify({vins: vins.join(',')}, {arrayFormat: 'comma'});
        const disconnectData = await this.api.callApi<VinsDisconnectDataResult>('GET', `/v1/vehicle/disconnect?${query}`, null, true);
        if (!disconnectData.success || !disconnectData.data) {
            return [];
        }

        return disconnectData.data.vinDisconnectData;
    }

    async signDisconnectData(disconnectData: VinDisconnectData[]) {
        const result: VinDisconnectData[] = [];
        for (const d of disconnectData) {
            const signature = await this.signingService.signUserOperation(d.userOperation);

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

    async submitDisconnectData(disconnectData: VinDisconnectData[]) {
        const payload: {vinDisconnectData: VinDisconnectData[]} = {
            vinDisconnectData: disconnectData,
        }

        const mintResponse = await this.api.callApi('POST', '/v1/vehicle/disconnect', payload, true);
        if (!mintResponse.success || !mintResponse.data) {
            return false;
        }

        let success = true
        for (const attempt of range(30)) {
            success = true
            const query = qs.stringify({vins: disconnectData.map(m => m.vin).join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsDisconnectResult>('GET', `/v1/vehicle/disconnect/status?${query}`, null, true);

            if (!status.success || !status.data) {
                return false;
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            if (success) {
                break;
            }

            if (attempt < 19) {
                await delay(5000);
            }
        }

        return success;
    }
}
