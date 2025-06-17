import {html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";

import {BaseOnboardingElement} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";

enum ConnectionStatus {
    UNKNOWN,
    CONNECTING,
    CONNECTION_FAILED,
    CONNECTED,
    DISCONNECTING,
    DISCONNECTION_FAILED,
    DISCONNECTED
}

const ConnectionStatusMap:  Record<ConnectionStatus, string> = {
    [ConnectionStatus.UNKNOWN]: "Unknown",
    [ConnectionStatus.CONNECTING]: "Connecting...",
    [ConnectionStatus.CONNECTION_FAILED]: "Connection failed",
    [ConnectionStatus.CONNECTED]: "Connected",
    [ConnectionStatus.DISCONNECTING]: "Disconnecting...",
    [ConnectionStatus.DISCONNECTION_FAILED]: "Disconnection failed",
    [ConnectionStatus.DISCONNECTED]: "Disconnected",
}

@customElement('vehicle-list-item-element')
export class VehicleListItemElement extends BaseOnboardingElement {
    @property({attribute: true})
    public item?: Vehicle

    @state()
    private connectionProcessing = false
    private deletionProcessing = false

    constructor() {
        super();
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
              <td>${ConnectionStatusMap[this.getConnectionStatus(this.item)]}</td>
              <td>
                  <button ?hidden=${!this.canDisconnect(this.item)}
                      type="button" 
                      ?disabled=${this.processing || !this.item.syntheticDevice.tokenId}
                      class=${this.connectionProcessing ? 'processing' : ''}
                      @click=${this.disconnectVehicle}
                  >disconnect
                  </button>
                  <button ?hidden=${!this.canConnect(this.item)}
                          type="button"
                          ?disabled=${this.processing}
                          class=${this.connectionProcessing ? 'processing' : ''}
                          @click=${this.connectVehicle}
                  >connect
                  </button>
              </td>
              <td>
                  <button 
                      type="button" 
                      ?disabled=${this.item.syntheticDevice.tokenId || this.processing}
                      @click=${this.deleteVehicle}
                      class=${this.deletionProcessing ? 'processing' : ''}
                  >delete</button></td>
          ` : nothing
    }

    getConnectionStatus(item: Vehicle): ConnectionStatus {
        if (["inQueue", "inProgress"].includes(item.disconnectionStatus)) {
            return ConnectionStatus.DISCONNECTING
        }

        if (["inQueue", "inProgress"].includes(item.connectionStatus)) {
            return ConnectionStatus.CONNECTING
        }

        if (item.disconnectionStatus === "failed") {
            return ConnectionStatus.DISCONNECTION_FAILED
        }

        if (item.disconnectionStatus === "succeeded") {
            return ConnectionStatus.DISCONNECTED
        }

        if (item.connectionStatus === "failed") {
            return ConnectionStatus.CONNECTION_FAILED
        }

        if (item.connectionStatus === "succeeded") {
            return ConnectionStatus.CONNECTED
        }

        return ConnectionStatus.UNKNOWN
    }

    canConnect(item: Vehicle): boolean {
        return [ConnectionStatus.UNKNOWN, ConnectionStatus.DISCONNECTED, ConnectionStatus.CONNECTION_FAILED].includes(this.getConnectionStatus(item))
    }

    canDisconnect(item: Vehicle): boolean {
        return [ConnectionStatus.CONNECTED, ConnectionStatus.DISCONNECTION_FAILED].includes(this.getConnectionStatus(item))
    }

    canDelete(item: Vehicle): boolean {
        return [ConnectionStatus.CONNECTED, ConnectionStatus.DISCONNECTION_FAILED].includes(this.getConnectionStatus(item))
    }

    private dispatchItemChanged() {
        this.dispatchEvent(new CustomEvent('item-changed', {
            detail: { value: this.item },
            bubbles: true,
            composed: true
        }));
    }

    async connectVehicle() {
        if (!this.item) {
            return;
        }

        if (!confirm("Are you sure you want to re-connect the vehicle?")) {
            return;
        }

        this.processing = true
        this.connectionProcessing = true
        await this.onboardVINs([this.item.vin], null)
        await delay(5000)
        this.processing = false
        this.connectionProcessing = false
        this.dispatchItemChanged()
    }

    async disconnectVehicle() {
        if (!this.item) {
            return;
        }

        if (!confirm("Are you sure you want to disconnect the vehicle?")) {
            return;
        }

        this.processing = true
        this.connectionProcessing = true
        await this.disconnectVins([this.item.vin])
        await delay(5000)
        this.processing = false
        this.connectionProcessing = false
        this.dispatchItemChanged()
    }

    async deleteVehicle() {
        if (!this.item) {
            return;
        }

        if (!confirm("Are you sure you want to delete the vehicle?")) {
            return;
        }

        this.processing = true
        this.deletionProcessing = true
        await this.deleteVins([this.item.vin])
        await delay(5000)
        this.processing = false
        this.deletionProcessing = false
        this.dispatchItemChanged()
    }
}
