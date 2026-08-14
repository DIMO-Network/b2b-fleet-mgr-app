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
        <vehicle-list-element></vehicle-list-element>
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

    private async handleItemChanged() {
        // When items are added/changed, reload the vehicle list
        await this.reloadVehicleList();
    }
}