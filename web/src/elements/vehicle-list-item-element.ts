import {css, html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";

import {BaseOnboardingElement} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";
import {globalStyles} from "../global-styles.ts";

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
    static styles = [ globalStyles,
        css`` ]

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
            <tr>
              <td>${this.item.vin}</td>
              <td>${this.item.definition.make} ${this.item.definition.model} ${this.item.definition.year}</td>
              <td>${this.item.imei}</td>
              <td>${this.item.tokenId}</td>
                <td><span class=${ConnectionStatusMap[this.getConnectionStatus(this.item)] == 'Connected' ? 'status status-connected' : 'status status-offline'}>${ConnectionStatusMap[this.getConnectionStatus(this.item)]}</span></td>
              <td>
                  <button 
                      type="button"
                      ?hidden=${this.item.tokenId == 0}
                      @click=${this.openIdentityInfoModal}
                      title="View Identity Info"
                      class="action-btn secondary"
                  >
                      ℹ️
                  </button>
                  <button 
                      type="button"
                      ?hidden=${!this.item.imei}
                      @click=${this.openTelemetryModal}
                      title="Telemetry & Command"
                      class="action-btn secondary"
                  >
                      ⚡
                  </button>
                  <button ?hidden=${!this.canDisconnect(this.item)}
                      type="button" 
                      ?disabled=${this.processing || !this.item.syntheticDevice.tokenId || !this.item.isCurrentUserOwner}
                      class=${this.connectionProcessing ? 'processing action-btn secondary' : 'action-btn secondary'}
                      @click=${this.disconnectVehicle}
                  >
                      disconnect
                      ${!this.item.isCurrentUserOwner ? html`<span class="access-denied-icon-inline">🚫</span>` : ''}
                  </button>
                  <button ?hidden=${!this.canConnect(this.item)}
                          type="button"
                          ?disabled=${this.processing}
                          class=${this.connectionProcessing ? 'processing action-btn secondary' : 'action-btn'}
                          @click=${this.connectVehicle}
                  >connect
                  </button>
                  <button 
                      type="button"
                      ?hidden=${this.item.tokenId == 0}
                      ?disabled=${this.item.syntheticDevice.tokenId || this.processing || !this.item.isCurrentUserOwner}
                      @click=${this.deleteVehicle}
                      class=${this.deletionProcessing ? 'processing action-btn secondary' : 'action-btn secondary'}
                  >
                      delete
                      ${!this.item.isCurrentUserOwner ? html`<span class="access-denied-icon-inline">🚫</span>` : ''}
                  </button>
                  <button 
                      type="button"
                      ?hidden=${this.item.tokenId == 0}
                      ?disabled=${this.processing || !this.item.isCurrentUserOwner}
                      @click=${this.openTransferModal}
                      class="action-btn"
                  >
                      transfer
                      ${!this.item.isCurrentUserOwner ? html`<span class="access-denied-icon-inline">🚫</span>` : ''}
                  </button>
                  <button
                      type="button"
                      ?hidden=${this.item.tokenId !== 0}
                      ?disabled=${this.processing}
                      @click=${() => this.resetOnboarding(this.item?.imei || '')}
                      class="action-btn"
                  >
                      reset onboarding
                  </button>
              </td>
            </tr>
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
        console.log("connect vehicle:");
        console.log(this.item)
        if (this.item.vin == "") {
            alert("vin is empty!" + this.item.vin);
            return
        }

        if (!confirm("Are you sure you want to re-connect the vehicle?")) {
            return;
        }

        this.processing = true
        this.connectionProcessing = true
        const success = await this.onboardVINs([{vin: this.item.vin, definition: this.item.definition.id}], null);
        if (success) {
            await delay(5000)
            this.processing = false
            this.connectionProcessing = false
            this.dispatchItemChanged()
        } else {
            this.processing = false
            this.connectionProcessing = false
            this.openErrorModal('Vehicle connect failed', 'Connect Failed')
        }
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
        const result = await this.disconnectVins([this.item.vin])
        if (result.success) {
            await delay(5000)
            this.processing = false
            this.connectionProcessing = false
            this.dispatchItemChanged()
        } else {
            this.processing = false
            this.connectionProcessing = false
            this.openErrorModal(result.error || 'Vehicle disconnect failed')
        }
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
        const result = await this.deleteVins([this.item.vin])
        if (result.success) {
            await delay(5000)
            this.processing = false
            this.deletionProcessing = false
            this.dispatchItemChanged()
        } else {
            this.processing = false
            this.deletionProcessing = false
            this.openErrorModal(result.error || 'Vehicle delete failed', 'Delete Failed')
        }
    }

    async resetOnboarding(imei: string) {
        if (!imei) {
            return;
        }

        this.processing = true
        await this.api.callApi('DELETE', `/vehicle/reset-onboarding/${imei}`, null, true, true)
        await delay(1000)
        this.processing = false
        this.dispatchItemChanged()
    }

    private openTransferModal() {
        console.log("Opening transfer modal for vehicle:", this.item?.vin);

        // Create the transfer modal using the separate component
        const modal = document.createElement('transfer-modal-element') as any;
        modal.show = true;
        modal.vehicleVin = this.item?.vin || '';
        modal.imei = this.item?.imei || '';

        // Add event listener for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
            this.dispatchItemChanged()
        });

        // Add to body
        document.body.appendChild(modal);
    }

    private openErrorModal(message: string, title: string = 'Disconnect Failed') {
        const modal = document.createElement('error-modal-element') as any;
        modal.show = true;
        modal.title = title;
        modal.message = message ?? (title.includes('Disconnect')
            ? 'An unexpected error occurred while disconnecting the vehicle.'
            : 'An unexpected error occurred while deleting the vehicle.');

        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });

        document.body.appendChild(modal);
    }

    private openIdentityInfoModal() {
        console.log("Opening identity info modal for token ID:", this.item?.tokenId);

        // Create the identity info modal using the separate component
        const modal = document.createElement('identity-vehicle-info-modal-element') as any;
        modal.show = true;
        modal.tokenId = this.item?.tokenId || '';

        // Add event listener for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });

        // Add to body
        document.body.appendChild(modal);

        // Load identity data after the modal is added to the DOM
        setTimeout(() => {
            modal.loadIdentityData();
        }, 100);
    }

    private openTelemetryModal() {
        console.log("Opening telemetry modal for IMEI:", this.item?.imei, "VIN:", this.item?.vin);
        
        // Create the telemetry modal using the separate component
        const modal = document.createElement('telemetry-modal-element') as any;
        modal.show = true;
        modal.imei = this.item?.imei || '';
        modal.vin = this.item?.vin || '';
        
        // Add event listener for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });
        
        // Add to body
        document.body.appendChild(modal);
        
        // Load telemetry data after the modal is added to the DOM
        setTimeout(() => {
            modal.loadTelemetryData();
        }, 100);
    }
}
