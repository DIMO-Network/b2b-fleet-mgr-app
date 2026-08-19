import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";

@customElement('onboarding-view')
export class OnboardingView extends LitElement {
    static styles = [ globalStyles,
        css`` ];

  render() {
    return html`
        <!-- Show these elements only if user has access to the selected oracle -->
        <!-- No item-changed binding on vehicle-list-element: it reloads itself on its
             own rows' events, which then bubble here — a binding would reload twice. -->
        <add-vin-element @item-changed=${this.handleItemChanged}></add-vin-element>
        <vehicle-list-element @item-deleted=${this.handleItemDeleted}></vehicle-list-element>
    `;
  }

    private async reloadVehicleList() {
        // The list lives in this element's shadow root, so it must be looked up via
        // renderRoot — this.querySelector only sees light-DOM children and finds nothing.
        const vehicleListElement = this.renderRoot.querySelector('vehicle-list-element') as any;
        if (vehicleListElement && vehicleListElement.loadVehicles) {
            await vehicleListElement.loadVehicles();
        }
    }

    private async reloadPendingVehicles() {
        const addVinElement = this.renderRoot.querySelector('add-vin-element') as any;
        if (addVinElement && addVinElement.reloadPendingVehicles) {
            await addVinElement.reloadPendingVehicles();
        }
    }

    private async handleItemChanged() {
        // When items are added/changed, reload the vehicle list
        await this.reloadVehicleList();
    }

    // Deleting a vehicle burns its NFT, and the oracle then returns the record to the
    // pending pool so it can be onboarded again without a separate Reset Onboarding step.
    // The row removes itself from the vehicle list locally, but the pending list above it
    // only reloads if asked — without this the device would not reappear until a page
    // refresh, which reads as the delete having lost it.
    private async handleItemDeleted() {
        await this.reloadPendingVehicles();
    }
}