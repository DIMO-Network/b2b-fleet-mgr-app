import {html, nothing} from 'lit'
import {customElement, property} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";

import {BaseOnboardingElement} from "@elements/base-onboarding-element.ts";

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
                      class=${this.processing ? 'processing' : ''}
                      @click=${this.disconnectVehicle}
                  >disconnect
                  </button>
                  <button ?hidden=${!this.canConnect(this.item)}
                          type="button"
                          ?disabled=${this.processing}
                          class=${this.processing ? 'processing' : ''}
                          @click=${this.connectVehicle}
                  >connect
                  </button>
              </td>
              <td>
                  <button 
                      type="button" 
                      ?disabled=${this.item.syntheticDevice.tokenId}
                      @click=${this.deleteVehicle}
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

    async connectVehicle() {
        if (!this.item) {
            return;
        }

        this.processing = true
        await this.onboardVINs([this.item.vin], null)
        this.processing = false
    }

    async disconnectVehicle() {
        if (!this.item) {
            return;
        }

        this.processing = true
        await this.disconnectVins([this.item.vin])
        this.processing = false
    }

    async deleteVehicle() {
        if (!this.item) {
            return;
        }

        this.processing = true
        await this.deleteVins([this.item.vin])
        this.processing = false
    }
}
