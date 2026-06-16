import {css, html, nothing} from 'lit';
import {msg} from '@lit/localize';
import {customElement, property, state} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";

import {BaseOnboardingElement} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";
import {globalStyles} from "../global-styles.ts";

interface SyncFromIdentityResult {
    tokenId: number;
    ownerChanged: boolean;
    newOwner?: string;
    connectionStatusChanged: boolean;
    disconnectionStatusChanged: boolean;
    syntheticTokenIdChanged: boolean;
    onboardingStatusChanged: boolean;
}

enum ConnectionStatus {
    UNKNOWN,
    CONNECTING,
    CONNECTION_FAILED,
    CONNECTED,
    DISCONNECTING,
    DISCONNECTION_FAILED,
    DISCONNECTED,
}

const connectionStatusLabel = (status: ConnectionStatus): string => {
    switch (status) {
        case ConnectionStatus.UNKNOWN: return msg("Unknown");
        case ConnectionStatus.CONNECTING: return msg("Connecting...");
        case ConnectionStatus.CONNECTION_FAILED: return msg("Connection failed");
        case ConnectionStatus.CONNECTED: return msg("Connected");
        case ConnectionStatus.DISCONNECTING: return msg("Disconnecting...");
        case ConnectionStatus.DISCONNECTION_FAILED: return msg("Disconnection failed");
        case ConnectionStatus.DISCONNECTED: return msg("Disconnected");
    }
};

@customElement('vehicle-list-item-element')
export class VehicleListItemElement extends BaseOnboardingElement {
    static styles = [ globalStyles,
        css`` ];

    @property({attribute: true})
    public item?: Vehicle;

    @state()
    private connectionProcessing = false;
    private deletionProcessing = false;

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
              <td>
                  <span class=${this.getConnectionCSSClass(this.item)}>${connectionStatusLabel(this.getConnectionStatus(this.item))}</span>
                  ${this.isExternallyOwned(this.item) ? html`<span class="status status-not-owned" title=${msg('On-chain owner is a different wallet')}>${msg('Not Owned')}</span>` : ''}
              </td>
              <td>
                  <button
                      type="button"
                      ?hidden=${this.item.tokenId == 0}
                      @click=${this.openIdentityInfoModal}
                      title=${msg('View Identity Info')}
                      class="action-btn secondary"
                  >
                      ℹ️
                  </button>
                  <button
                      type="button"
                      ?hidden=${!this.item.imei}
                      @click=${this.openTelemetryModal}
                      title=${msg('Telemetry & Command')}
                      class="action-btn secondary"
                  >
                      ⚡
                  </button>
                  <button ?hidden=${!this.canDisconnect(this.item)}
                      type="button"
                      ?disabled=${this.processing || !this.item.syntheticDevice.tokenId || (!this.item.isCurrentUserOwner && !this.isSharedSigner(this.item))}
                      class=${this.connectionProcessing ? 'processing action-btn secondary' : 'action-btn secondary'}
                      @click=${this.disconnectVehicle}
                  >
                      ${msg('disconnect')}
                      ${(!this.item.isCurrentUserOwner && !this.isSharedSigner(this.item)) ? html`<span class="access-denied-icon-inline">🚫</span>` : ''}
                  </button>
                  <!--
                  <button ?hidden
                          type="button"
                          ?disabled
                          class="action-btn"
                          @click
                  >connect
                  </button>
                  -->
                  <button
                      type="button"
                      ?hidden=${!this.canDelete(this.item)}
                      ?disabled=${this.processing}
                      @click=${this.deleteVehicle}
                      class=${this.deletionProcessing ? 'processing action-btn secondary' : 'action-btn secondary'}
                  >
                      ${msg('delete')}
                  </button>
                  <button
                      type="button"
                      ?hidden=${this.item.tokenId == 0 || (!this.item.isCurrentUserOwner && !this.item.isSharedAccountSigner)}
                      ?disabled=${this.processing}
                      @click=${this.openTransferModal}
                      class="action-btn"
                  >
                      ${msg('transfer')}
                  </button>
                  <button
                      type="button"
                      ?hidden=${this.item.tokenId !== 0}
                      ?disabled=${this.processing}
                      @click=${() => this.resetOnboarding(this.item?.imei || '')}
                      class="action-btn"
                  >
                      ${msg('reset onboarding')}
                  </button>
                  <button
                      type="button"
                      ?hidden=${this.item.tokenId == 0 || this.item.isCurrentUserOwner || this.item.isSharedAccountSigner}
                      ?disabled=${this.processing}
                      @click=${this.forceDeleteVehicle}
                      class=${this.deletionProcessing ? 'processing action-btn secondary' : 'action-btn secondary'}
                  >
                      ${msg('force delete')}
                  </button>
              </td>
            </tr>
          ` : nothing;
    }

    getConnectionStatus(item: Vehicle): ConnectionStatus {
        if (["inQueue", "inProgress"].includes(item.disconnectionStatus)) {
            return ConnectionStatus.DISCONNECTING;
        }

        if (["inQueue", "inProgress"].includes(item.connectionStatus)) {
            return ConnectionStatus.CONNECTING;
        }

        if (item.disconnectionStatus === "failed") {
            return ConnectionStatus.DISCONNECTION_FAILED;
        }

        if (item.disconnectionStatus === "succeeded") {
            return ConnectionStatus.DISCONNECTED;
        }

        if (item.connectionStatus === "failed") {
            return ConnectionStatus.CONNECTION_FAILED;
        }

        if (item.connectionStatus === "succeeded") {
            return ConnectionStatus.CONNECTED;
        }

        return ConnectionStatus.UNKNOWN;
    }

    getConnectionCSSClass(item: Vehicle): string {
        return this.getConnectionStatus(item) === ConnectionStatus.CONNECTED ? "status status-connected" : "status status-offline";
    }

    // True when the vehicle is on-chain (minted) but neither owned by the current user
    // nor controlled via a shared kernel account they signed for.
    isExternallyOwned(item: Vehicle): boolean {
        return item.tokenId !== 0 && !item.isCurrentUserOwner && !item.isSharedAccountSigner;
    }

    canConnect(item: Vehicle): boolean {
        if (!item.isCurrentUserOwner) return false;
        return [ConnectionStatus.UNKNOWN, ConnectionStatus.DISCONNECTED, ConnectionStatus.CONNECTION_FAILED].includes(this.getConnectionStatus(item));
    }

    // isSharedSigner is true when the connected wallet isn't the owner but our tenant can sign
    // for the owning kernel account — the server-signed shared-account flow applies.
    isSharedSigner(item: Vehicle): boolean {
        return !item.isCurrentUserOwner && !!item.isSharedAccountSigner;
    }

    canDisconnect(item: Vehicle): boolean {
        if (!item.isCurrentUserOwner && !this.isSharedSigner(item)) return false;
        return [ConnectionStatus.CONNECTED, ConnectionStatus.DISCONNECTION_FAILED].includes(this.getConnectionStatus(item));
    }

    canDelete(item: Vehicle): boolean {
        if (item.tokenId === 0) return false;
        // Shared-account delete auto-chains the disconnect on the backend, so it may be invoked
        // regardless of connection state (a still-connected vehicle is disconnected first).
        if (this.isSharedSigner(item)) return true;
        if (!item.isCurrentUserOwner) return false;
        return [
            ConnectionStatus.UNKNOWN,
            ConnectionStatus.DISCONNECTED,
            ConnectionStatus.CONNECTION_FAILED,
        ].includes(this.getConnectionStatus(item));
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
        console.log(this.item);
        if (this.item.vin == "") {
            alert(msg("vin is empty!") + this.item.vin);
            return;
        }

        if (!confirm(msg("Are you sure you want to re-connect the vehicle?"))) {
            return;
        }

        this.processing = true;
        this.connectionProcessing = true;
        const success = await this.onboardVINs([{vin: this.item.vin, definition: this.item.definition.id}], null);
        if (success) {
            await delay(5000);
            this.processing = false;
            this.connectionProcessing = false;
            this.dispatchItemChanged();
        } else {
            this.processing = false;
            this.connectionProcessing = false;
            this.openErrorModal(msg('Vehicle connect failed'), msg('Connect Failed'));
        }
    }

    async disconnectVehicle() {
        if (!this.item) {
            return;
        }

        if (!confirm(msg("Are you sure you want to disconnect the vehicle?"))) {
            return;
        }

        this.processing = true;
        this.connectionProcessing = true;
        const result = this.isSharedSigner(this.item)
            ? await this.disconnectSharedAccountVehicle(this.item.tokenId, this.item.vin)
            : await this.disconnectVins([this.item.vin]);
        if (result.success) {
            await delay(5000);
            this.processing = false;
            this.connectionProcessing = false;
            this.dispatchItemChanged();
        } else {
            this.processing = false;
            this.connectionProcessing = false;
            this.openErrorModal(result.error || msg('Vehicle disconnect failed'));
        }
    }

    async deleteVehicle() {
        if (!this.item) {
            return;
        }

        const sharedSigner = this.isSharedSigner(this.item);
        const deleteConfirm = sharedSigner
            ? msg("This will disconnect and delete the vehicle. Are you sure?")
            : msg("Are you sure you want to delete the vehicle?");
        if (!confirm(deleteConfirm)) {
            return;
        }

        this.processing = true;
        this.deletionProcessing = true;
        const result = sharedSigner
            ? await this.deleteSharedAccountVehicle(this.item.tokenId, this.item.vin)
            : await this.deleteVins([this.item.vin]);
        if (result.success) {
            await delay(5000);
            this.processing = false;
            this.deletionProcessing = false;
            this.dispatchItemChanged();
        } else {
            this.processing = false;
            this.deletionProcessing = false;
            this.openErrorModal(result.error || msg('Vehicle delete failed'), msg('Delete Failed'));
        }
    }

    // abandons the NFT
    async forceDeleteVehicle() {
        if (!this.item) {
            return;
        }

        if (!confirm(msg("Are you sure you want to FORCE delete this vehicle? This will abandon all the vehicle history attached to their NFT. Only do this if you are unable to get access to vehicle NFT."))) {
            return;
        }

        this.processing = true;
        this.deletionProcessing = true;
        const result = await this.api.callApi('DELETE', `/vehicle/force/${this.item.imei}`, null, true, true);
        if (result.success) {
            this.processing = false;
            this.deletionProcessing = false;
            this.dispatchItemChanged();
        } else {
            this.processing = false;
            this.deletionProcessing = false;
            this.openErrorModal(result.error || msg('Vehicle force delete failed'), msg('Force Delete Failed'));
        }
    }

    async resetOnboarding(imei: string) {
        if (!imei) {
            return;
        }

        this.processing = true;
        await this.api.callApi('DELETE', `/vehicle/reset-onboarding/${imei}`, null, true, true);
        await delay(1000);
        this.processing = false;
        this.dispatchItemChanged();
    }

    private openTransferModal() {
        console.log("Opening transfer modal for vehicle:", this.item?.vin);

        // Create the transfer modal using the separate component
        const modal = document.createElement('transfer-modal-element') as any;
        modal.show = true;
        modal.vehicleVin = this.item?.vin || '';
        modal.imei = this.item?.imei || '';
        modal.tokenId = this.item?.tokenId || 0;
        // The connected wallet isn't the literal owner but our tenant can sign for the
        // owning kernel — modal will use the server-signed shared-account flow.
        modal.useSharedAccountFlow = !!(this.item && !this.item.isCurrentUserOwner && this.item.isSharedAccountSigner);

        // Add event listener for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
            this.dispatchItemChanged();
        });

        // Add to body
        document.body.appendChild(modal);
    }

    private openErrorModal(message: string, title: string = msg('Disconnect Failed')) {
        const modal = document.createElement('error-modal-element') as any;
        modal.show = true;
        modal.title = title;
        modal.message = message ?? (title.includes('Disconnect')
            ? msg('An unexpected error occurred while disconnecting the vehicle.')
            : msg('An unexpected error occurred while deleting the vehicle.'));

        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });

        document.body.appendChild(modal);
    }

    private async openIdentityInfoModal() {
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

        // Backend-driven reconciliation: kaufmann pulls Identity itself, computes diffs against
        // vins (owner, connection_status, disconnection_status, synthetic_token_id,
        // onboarding_status), and writes only what drifted. We don't trust anything the FE
        // computed about owner/SD — it's an opportunistic refresh.
        try {
            await modal.loadIdentityData();
            void this.syncFromIdentity(this.item?.tokenId);
        } catch (err) {
            console.warn('Failed to load identity data:', err);
        }
    }

    private async syncFromIdentity(tokenId: number | undefined): Promise<void> {
        if (!tokenId) return;

        const resp = await this.api.callApi<SyncFromIdentityResult>(
            'PATCH',
            `/fleet/vehicles/${tokenId}/sync-from-identity`,
            null,
            true,
            true
        );
        if (!resp.success) {
            console.warn('Identity sync failed:', resp.error);
            return;
        }
        const r = resp.data;
        if (r && (r.ownerChanged || r.connectionStatusChanged || r.disconnectionStatusChanged || r.syntheticTokenIdChanged || r.onboardingStatusChanged)) {
            this.dispatchEvent(new CustomEvent('item-changed', { bubbles: true, composed: true }));
        }
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
