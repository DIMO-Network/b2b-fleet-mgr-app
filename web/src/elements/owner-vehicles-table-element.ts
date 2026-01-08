import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";

type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string;
};

@customElement("owned-vehicles-table")
export class OwnedVehiclesTable extends LitElement {
  static styles = [globalStyles];

  @property({ type: Array }) vehicles: any[] = [];
  @property({ type: Object }) pageInfo?: PageInfo;
  @property({ type: Number }) pageIndex = 0;
  @property({ type: Boolean }) loading = false;

  private isVehicleConnected(v: any): boolean {
    const hasSyntheticConnection = !!v?.syntheticDevice?.connection;
    const hasAftermarketPlural =
      Array.isArray(v?.aftermarketDevices) && v.aftermarketDevices.length > 0;
    const hasAftermarketSingular = !!v?.aftermarketDevice;
    return hasSyntheticConnection || hasAftermarketPlural || hasAftermarketSingular;
  }

  private onPrev() {
    this.dispatchEvent(new CustomEvent("prev", { bubbles: true, composed: true }));
  }

  private onNext() {
    this.dispatchEvent(new CustomEvent("next", { bubbles: true, composed: true }));
  }

  render() {
    const page = this.pageIndex + 1;
    const hasPrev = this.pageIndex > 0;
    const hasNext = !!this.pageInfo?.hasNextPage;

    // Loading state
    if (this.loading) {
      return html`
        <div class="section-header mt-24">Owned Vehicles</div>
        <div class="panel">
          <div class="panel-body" style="color:#666; padding:24px;">
            Loading vehicles...
          </div>
        </div>
      `;
    }

    // Empty state
    if (!this.vehicles || this.vehicles.length === 0) {
      return html`
        <div class="section-header mt-24">Owned Vehicles</div>
        <div class="panel">
          <div class="panel-body" style="color:#666; padding:24px;">
            No vehicles are associated with this wallet.
          </div>
        </div>
      `;
    }

    // Table state
    return html`
      <div class="section-header mt-24">Owned Vehicles</div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Token ID</th>
              <th>VIN</th>
              <th>Status</th>
              <th>Engine</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            ${this.vehicles.map((v: any) => {
              const vehicleName = v?.definition
                ? `${v.definition.make} ${v.definition.model} ${v.definition.year}`
                : "—";

              const connected = this.isVehicleConnected(v);

              return html`
                <tr style="cursor:pointer">
                  <td>${vehicleName}</td>
                  <td>${v?.tokenId ?? "—"}</td>
                  <td>-</td>
                  <td>
                    ${connected
                      ? html`<span class="status status-connected">Connected</span>`
                      : html`<span class="status status-offline">Disconnected</span>`}
                  </td>
                  <td>-</td>
                  <td>
                    <button
                      class="btn btn-sm"
                      @click=${(e: Event) => e.stopPropagation()}
                      disabled
                      title="Coming soon"
                    >
                      OPEN
                    </button>
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>

      <div
        class="mt-16"
        style="display:flex; gap:12px; justify-content:center; align-items:center;"
      >
        <button
          class="btn btn-secondary"
          ?disabled=${!hasPrev}
          @click=${this.onPrev}
        >
          Prev
        </button>

        <div style="color:#666;">Page ${page}</div>

        <button
          class="btn btn-secondary"
          ?disabled=${!hasNext}
          @click=${this.onNext}
        >
          Next
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "owned-vehicles-table": OwnedVehiclesTable;
  }
}