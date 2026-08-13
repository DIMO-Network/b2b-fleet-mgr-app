import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import { ApiService } from "@services/api-service.ts";
import { FleetGroup, FleetService } from "@services/fleet-service.ts";
import { OperatorFleetVehicle, TenancyService } from "@services/tenancy-service.ts";

// Shape of the existing, already-deployed GET /fleet/vehicles response.
interface OracleFleetVehicle {
  vin: string;
  vehicle_token_id: number | null;
  license_plate: string | null;
  make: string;
  model: string;
  year: number;
  groups: { id: string; name: string; color: string }[];
}

interface OracleFleetVehiclesResponse {
  items: OracleFleetVehicle[];
  totalCount: number;
}

const PAGE_SIZE = 50;

// Pick vehicles out of the operator's fleet and entitle them to a customer.
//
// ONLY MINTED VEHICLES CAN BE ASSIGNED. An entitlement is keyed by vehicle token
// id, and an unminted VIN does not have one. Unminted vehicles are listed but
// unselectable rather than filtered out — an operator looking for a VIN they
// just claimed needs to see why it isn't offered, not wonder where it went.
//
// The vehicle list is the real one: GET /fleet/vehicles is already deployed,
// already paged and filtered, and is the same view the Vehicles & Fleets screen
// uses. Only the entitlement write is stubbed. When no backend is reachable at
// all the picker falls back to fixtures so the flow can still be exercised.
@customElement("assign-vehicles-modal-element")
export class AssignVehiclesModalElement extends LitElement {
  static styles = [
    globalStyles,
    css`
      .modal-content {
        max-width: 900px;
        width: 90vw;
      }
      .mode-tabs {
        display: flex;
        gap: 0;
        margin-bottom: 16px;
      }
      .mode-tab {
        padding: 8px 16px;
        border: 1px solid #000;
        cursor: pointer;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background: #fff;
      }
      .mode-tab.active {
        background: #000;
        color: #fff;
      }
      .list {
        max-height: 45vh;
        overflow-y: auto;
        border: 1px solid #ccc;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-bottom: 1px solid #eee;
        font-size: 14px;
      }
      .row:last-child {
        border-bottom: none;
      }
      .row.disabled {
        color: #999;
        background: #fafafa;
      }
      .row-main {
        flex: 1;
        display: flex;
        gap: 12px;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .vin {
        font-family: monospace;
      }
      .why {
        font-size: 12px;
        color: #856404;
        background: #fff3cd;
        padding: 1px 6px;
      }
      .selected-count {
        font-size: 14px;
        margin-right: auto;
      }
      .muted {
        color: #666;
      }
      .group-summary {
        font-size: 14px;
        margin-top: 12px;
      }
    `,
  ];

  @property({ type: Boolean }) public show = false;
  @property({ type: String }) public customerId = "";
  @property({ type: String }) public customerName = "";
  @property({ attribute: false }) public alreadyAssigned: number[] = [];

  @state() private mode: "individual" | "group" = "individual";
  @state() private vehicles: OperatorFleetVehicle[] = [];
  @state() private groups: FleetGroup[] = [];
  @state() private selectedGroupId = "";
  @state() private selected = new Set<number>();
  @state() private holders: Record<number, string> = {};
  @state() private search = "";
  @state() private loading = false;
  @state() private processing = false;
  @state() private error = "";
  @state() private usingFallback = false;

  private api = ApiService.getInstance();
  private tenancy = TenancyService.getInstance();
  private searchDebounce?: number;

  async connectedCallback() {
    super.connectedCallback();
    await Promise.all([this.loadVehicles(), this.loadGroups()]);
    this.holders = await this.tenancy.entitlementHolders();
  }

  disconnectedCallback() {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    super.disconnectedCallback();
  }

  private async loadVehicles() {
    this.loading = true;
    this.error = "";

    const url = `/fleet/vehicles?skip=0&take=${PAGE_SIZE}&search=${encodeURIComponent(this.search)}&filter=`;
    const res = await this.api.callApi<OracleFleetVehiclesResponse>("GET", url, null, true, true);

    if (res.success && res.data?.items) {
      this.usingFallback = false;
      this.vehicles = res.data.items.map((v) => ({
        vehicleTokenId: v.vehicle_token_id ? v.vehicle_token_id : null,
        vin: v.vin,
        licensePlate: v.license_plate ?? null,
        make: v.make,
        model: v.model,
        year: v.year,
        groups: (v.groups ?? []).map((g) => ({ id: g.id, name: g.name })),
      }));
    } else {
      // No oracle reachable. In stub mode that is expected (nobody is running a
      // backend); in live mode it is a real failure and says so.
      if (this.tenancy.isStubbed()) {
        const fallback = await this.tenancy.listOperatorFleetFallback(this.search);
        this.usingFallback = true;
        this.vehicles = fallback.data ?? [];
      } else {
        this.error = res.error || msg("Failed to load vehicles");
        this.vehicles = [];
      }
    }
    this.loading = false;
  }

  private async loadGroups() {
    try {
      const groups = await FleetService.getInstance().getFleetGroups();
      this.groups = groups ?? [];
    } catch {
      this.groups = [];
    }
  }

  private onSearchInput(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value;
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = window.setTimeout(() => {
      this.search = value;
      this.loadVehicles();
    }, 400);
  }

  // Why a vehicle can't be picked, or null if it can.
  private blockedReason(v: OperatorFleetVehicle): string | null {
    if (v.vehicleTokenId === null) return msg("not minted");
    if (this.alreadyAssigned.includes(v.vehicleTokenId)) return msg("already assigned");
    const holder = this.holders[v.vehicleTokenId];
    if (holder && holder !== this.customerName) return msg(str`held by ${holder}`);
    return null;
  }

  private toggle(tokenId: number, on: boolean) {
    const next = new Set(this.selected);
    if (on) next.add(tokenId);
    else next.delete(tokenId);
    this.selected = next;
  }

  private selectAllVisible() {
    const next = new Set(this.selected);
    for (const v of this.vehicles) {
      if (this.blockedReason(v) === null && v.vehicleTokenId !== null) next.add(v.vehicleTokenId);
    }
    this.selected = next;
  }

  private clearSelection() {
    this.selected = new Set();
  }

  private renderVehicleRow(v: OperatorFleetVehicle) {
    const blocked = this.blockedReason(v);
    const tokenId = v.vehicleTokenId;
    const checked = tokenId !== null && this.selected.has(tokenId);
    const description = [v.year, v.make, v.model].filter(Boolean).join(" ");

    return html`
      <label class="row ${blocked ? "disabled" : ""}">
        <input
          type="checkbox"
          .checked=${checked}
          ?disabled=${blocked !== null || this.processing}
          @change=${(e: Event) =>
            tokenId !== null && this.toggle(tokenId, (e.target as HTMLInputElement).checked)}
        />
        <span class="row-main">
          <span class="vin">${v.vin}</span>
          <span>${description}</span>
          ${v.licensePlate ? html`<span class="muted">${v.licensePlate}</span>` : nothing}
          ${v.groups.map((g) => html`<span class="badge">${g.name}</span>`)}
        </span>
        ${blocked ? html`<span class="why">${blocked}</span>` : nothing}
      </label>
    `;
  }

  private get groupCandidates(): OperatorFleetVehicle[] {
    if (!this.selectedGroupId) return [];
    return this.vehicles.filter((v) => v.groups.some((g) => g.id === this.selectedGroupId));
  }

  private renderIndividual() {
    return html`
      <div class="toolbar">
        <input
          type="text"
          class="search-box"
          .placeholder=${msg("Search by VIN, plate or model...")}
          @input=${this.onSearchInput}
          ?disabled=${this.processing}
        />
        <button class="btn btn-sm" @click=${this.selectAllVisible} ?disabled=${this.processing}>
          ${msg("SELECT ALL SHOWN")}
        </button>
        <button class="btn btn-sm" @click=${this.clearSelection} ?disabled=${this.processing}>
          ${msg("CLEAR")}
        </button>
      </div>

      ${this.loading
        ? html`<div>${msg("Loading vehicles...")}</div>`
        : this.vehicles.length === 0
          ? html`<div class="muted">${msg("No vehicles match that search.")}</div>`
          : html`<div class="list">${this.vehicles.map((v) => this.renderVehicleRow(v))}</div>`}

      <p class="muted" style="font-size: 13px; margin-top: 8px;">
        ${msg(str`Showing up to ${PAGE_SIZE} vehicles. Narrow with search to find more.`)}
      </p>
    `;
  }

  private renderByGroup() {
    const candidates = this.groupCandidates;
    const assignable = candidates.filter((v) => this.blockedReason(v) === null);
    const blocked = candidates.length - assignable.length;

    return html`
      <div class="form-group">
        <label class="form-label">${msg("Fleet group")}</label>
        <select
          .value=${this.selectedGroupId}
          @change=${(e: Event) => (this.selectedGroupId = (e.target as HTMLSelectElement).value)}
          ?disabled=${this.processing}
          style="width: 100%;"
        >
          <option value="">${msg("Select a group...")}</option>
          ${this.groups.map(
            (g) => html`<option value=${g.id} ?selected=${this.selectedGroupId === g.id}>${g.name}</option>`,
          )}
        </select>
      </div>

      ${this.selectedGroupId
        ? html`
            <div class="group-summary">
              ${msg(str`${assignable.length} vehicle(s) will be assigned.`)}
              ${blocked > 0
                ? html`<span class="muted">
                    ${msg(str`${blocked} skipped — unminted, already assigned, or held by another customer.`)}
                  </span>`
                : nothing}
              <p class="muted" style="font-size: 13px;">
                ${msg(
                  "This records the group as the source, so vehicles added to it later show up as drift you can re-apply. They are never granted automatically.",
                )}
              </p>
            </div>
          `
        : nothing}

      ${this.groups.length === 0
        ? html`<p class="muted">${msg("No fleet groups found for this operator.")}</p>`
        : nothing}
    `;
  }

  render() {
    if (!this.show) return nothing;

    const groupAssignable =
      this.mode === "group"
        ? this.groupCandidates.filter((v) => this.blockedReason(v) === null)
        : [];
    const count = this.mode === "individual" ? this.selected.size : groupAssignable.length;

    return html`
      <div class="modal-overlay" @click=${this.close}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${msg(str`Assign vehicles to ${this.customerName}`)}</h3>
            <button type="button" class="modal-close" @click=${this.close}>×</button>
          </div>
          <div class="modal-body">
            ${this.error
              ? html`<div class="alert alert-error" style="margin-bottom: 1rem;">${this.error}</div>`
              : nothing}
            ${this.usingFallback
              ? html`
                  <div class="alert" style="margin-bottom: 1rem;">
                    ${msg(
                      "No oracle reachable, so these are sample vehicles. The real picker reads your fleet from the oracle.",
                    )}
                  </div>
                `
              : nothing}

            <div class="mode-tabs">
              <div
                class="mode-tab ${this.mode === "individual" ? "active" : ""}"
                @click=${() => (this.mode = "individual")}
              >
                ${msg("Individual")}
              </div>
              <div
                class="mode-tab ${this.mode === "group" ? "active" : ""}"
                @click=${() => (this.mode = "group")}
              >
                ${msg("By fleet group")}
              </div>
            </div>

            ${this.mode === "individual" ? this.renderIndividual() : this.renderByGroup()}
          </div>
          <div class="modal-footer">
            <span class="selected-count">${msg(str`${count} selected`)}</span>
            <button
              type="button"
              class="btn btn-secondary"
              @click=${this.close}
              ?disabled=${this.processing}
            >
              ${msg("Cancel")}
            </button>
            <button
              type="button"
              class="btn btn-primary ${this.processing ? "processing" : ""}"
              @click=${this.submit}
              ?disabled=${this.processing || count === 0}
            >
              ${this.processing ? msg("Assigning...") : msg("Assign")}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private close() {
    if (this.processing) return;
    this.show = false;
    this.dispatchEvent(new CustomEvent("modal-closed", { bubbles: true, composed: true }));
  }

  private async submit() {
    this.processing = true;
    this.error = "";
    try {
      const group = this.groups.find((g) => g.id === this.selectedGroupId);
      const input =
        this.mode === "individual"
          ? { tokenIds: [...this.selected] }
          : {
              tokenIds: this.groupCandidates
                .filter((v) => this.blockedReason(v) === null)
                .map((v) => v.vehicleTokenId as number),
              fromGroupId: this.selectedGroupId,
              fromGroupName: group?.name ?? this.selectedGroupId,
            };

      const res = await this.tenancy.assignVehicles(this.customerId, input);
      if (res.success) {
        this.show = false;
        this.dispatchEvent(
          new CustomEvent("vehicles-assigned", {
            detail: { result: res.data },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.error = res.error || msg("Failed to assign vehicles");
      }
    } catch (e: any) {
      this.error = e?.message || msg("An unexpected error occurred");
    } finally {
      this.processing = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "assign-vehicles-modal-element": AssignVehiclesModalElement;
  }
}
