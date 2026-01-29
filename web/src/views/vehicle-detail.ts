import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { globalStyles } from "../global-styles.ts";

@customElement('vehicle-detail-view')
export class VehicleDetailView extends LitElement {
  static styles = [globalStyles, css``];

  @property({ type: String })
  vin: string = '';

  render() {
    return html`
      <div class="page active" id="page-vehicle-detail">
        <div class="card">
          <h2>Vehicle Detail</h2>
          <p><strong>VIN:</strong> ${this.vin}</p>
          <p>Vehicle details will be displayed here.</p>
          <button class="btn btn-primary" @click=${this.goBack}>Back to Vehicles</button>
        </div>
      </div>
    `;
  }

  private goBack() {
    location.hash = '/vehicles-fleets';
  }
}
