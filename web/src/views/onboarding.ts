import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";

@customElement('onboarding-view')
export class OnboardingView extends LitElement {
    static styles = [ globalStyles,
        css`` ]

  render() {
    return html`
        <!-- Show these elements only if user has access to the selected oracle -->
        <add-vin-element @item-changed=${this.handleItemChanged}></add-vin-element>
        <vehicle-list-element @item-changed=${this.handleItemChanged}></vehicle-list-element>
    `;
  }

    private async reloadVehicleList() {
        // Reload the vehicle list by calling the vehicle-list-element's load method
        const vehicleListElement = this.querySelector('vehicle-list-element') as any;
        if (vehicleListElement && vehicleListElement.loadVehicles) {
            await vehicleListElement.loadVehicles();
        }
    }

    private async handleItemChanged() {
        // When items are added/changed, reload the vehicle list
        await this.reloadVehicleList();
    }
}