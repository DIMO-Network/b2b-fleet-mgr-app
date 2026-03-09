import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { ApiService } from "../services/api-service.ts";

interface UserProfile {
  wallet: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  business_name: string;
  government_id_type: string;
  government_id_number: string;
  created_at: string;
  updated_at: string;
}

interface VehicleRow {
  tokenId: number;
  mintedAt: string;
  definition?: { make: string; model: string; year: number };
  vin?: string;
  licensePlate?: string;
}

interface FleetVehicleInfo {
  vin?: string;
  license_plate?: string;
  vehicle_token_id?: number;
}

@customElement("user-detail-view")
export class UserDetailView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .panels-row {
        display: flex;
        gap: 24px;
        align-items: flex-start;
      }
      .detail-panel {
        flex: 0 0 480px;
      }
      .vehicles-panel {
        flex: 1;
        min-width: 0;
      }
      .field-row {
        display: flex;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid #eee;
        gap: 16px;
      }
      .field-row:last-child {
        border-bottom: none;
      }
      .field-label {
        width: 180px;
        flex-shrink: 0;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #666;
      }
      .field-value {
        flex: 1;
        font-size: 16px;
      }
      .field-value input {
        width: 100%;
      }
      .field-value.readonly {
        color: #333;
      }
      .field-value.monospace {
        font-family: monospace;
        font-size: 14px;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }
    `,
  ];

  @property({ type: String }) wallet = "";

  // profile state
  @state() private profile?: UserProfile;
  @state() private loading = true;
  @state() private editing = false;
  @state() private saving = false;
  @state() private errorMessage = "";
  @state() private successMessage = "";

  // editable field state
  @state() private firstName = "";
  @state() private lastName = "";
  @state() private phone = "";
  @state() private businessName = "";
  @state() private govIdType = "";
  @state() private govIdNumber = "";

  // vehicles state
  private readonly vehiclesPageSize = 20;
  @state() private vehicles: VehicleRow[] = [];
  @state() private vehiclesLoading = false;
  @state() private vehiclesHasNextPage = false;
  @state() private vehiclesPageIndex = 0;
  // cursor chain: index 0 = undefined (first page), index N = cursor for page N
  @state() private vehiclesCursors: (string | undefined)[] = [undefined];

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchProfile();
    this.fetchVehicles(0); // fire and forget alongside profile render
  }

  private async fetchProfile() {
    this.loading = true;
    this.errorMessage = "";
    try {
      const result = await ApiService.getInstance().callApi<UserProfile>(
        "GET",
        `/user-profiles/${this.wallet}`,
        null,
        true,
        true
      );
      if (result.success && result.data) {
        this.profile = result.data;
        this.syncEditFields(result.data);
      } else {
        this.errorMessage = result.error || "Failed to load user profile.";
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to fetch user profile:", error);
      this.errorMessage = "An unexpected error occurred.";
    } finally {
      this.loading = false;
    }
  }

  private async fetchVehicles(pageIndex: number) {
    this.vehiclesLoading = true;
    try {
      const cursor = this.vehiclesCursors[pageIndex];
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `{
        vehicles(first: ${this.vehiclesPageSize}${afterClause}, filterBy: { owner: "${this.wallet}" }) {
          nodes {
            tokenId
            mintedAt
            definition {
              make
              model
              year
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`;

      const identityResult = await ApiService.getInstance().callApi(
        "POST",
        "/identity/proxy",
        { query },
        false,
        false,
        false
      );

      const vehiclesData = (identityResult.data as any)?.vehicles;
      const nodes: VehicleRow[] = vehiclesData?.nodes ?? [];
      const pageInfo = vehiclesData?.pageInfo;

      this.vehiclesHasNextPage = pageInfo?.hasNextPage ?? false;

      // Store the next cursor if we haven't seen this page before
      if (pageInfo?.endCursor && this.vehiclesCursors.length === pageIndex + 1) {
        this.vehiclesCursors = [...this.vehiclesCursors, pageInfo.endCursor];
      }

      this.vehiclesPageIndex = pageIndex;

      if (nodes.length === 0) {
        this.vehicles = [];
        return;
      }

      // Enrich each vehicle with VIN + license plate from fleet endpoint in parallel
      const enriched = await Promise.all(
        nodes.map(async (v) => {
          try {
            const fleetResult = await ApiService.getInstance().callApi<FleetVehicleInfo>(
              "GET",
              `/fleet/vehicles/${v.tokenId}`,
              null,
              true,
              true
            );
            if (fleetResult.success && fleetResult.data) {
              return {
                ...v,
                vin: fleetResult.data.vin,
                licensePlate: fleetResult.data.license_plate,
              };
            }
          } catch {
            // vehicle not in fleet — leave vin/license undefined
          }
          return v;
        })
      );

      this.vehicles = enriched;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to fetch vehicles:", error);
      this.vehicles = [];
    } finally {
      this.vehiclesLoading = false;
    }
  }

  private syncEditFields(p: UserProfile) {
    this.firstName = p.first_name || "";
    this.lastName = p.last_name || "";
    this.phone = p.phone || "";
    this.businessName = p.business_name || "";
    this.govIdType = p.government_id_type || "";
    this.govIdNumber = p.government_id_number || "";
  }

  private handleEdit() {
    if (this.profile) this.syncEditFields(this.profile);
    this.editing = true;
    this.successMessage = "";
    this.errorMessage = "";
  }

  private handleCancel() {
    if (this.profile) this.syncEditFields(this.profile);
    this.editing = false;
    this.errorMessage = "";
  }

  private async handleSave() {
    this.saving = true;
    this.errorMessage = "";
    this.successMessage = "";
    try {
      const result = await ApiService.getInstance().callApi(
        "PATCH",
        `/user-profiles/${this.wallet}`,
        {
          first_name: this.firstName,
          last_name: this.lastName,
          phone: this.phone,
          business_name: this.businessName,
          government_id_type: this.govIdType,
          government_id_number: this.govIdNumber,
        },
        true,
        true
      );
      if (result.success) {
        this.successMessage = "Profile updated successfully.";
        this.editing = false;
        await this.fetchProfile();
      } else {
        this.errorMessage = result.error || "Failed to update profile.";
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update user profile:", error);
      this.errorMessage = "An unexpected error occurred.";
    } finally {
      this.saving = false;
    }
  }

  private formatDate(iso: string): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleString();
  }

  private renderField(
    label: string,
    value: string,
    editValue: string,
    onInput: (v: string) => void,
    editable = true,
    monospace = false
  ) {
    return html`
      <div class="field-row">
        <div class="field-label">${label}</div>
        <div
          class="field-value ${monospace ? "monospace" : ""} ${!editable ||
          !this.editing
            ? "readonly"
            : ""}"
        >
          ${editable && this.editing
            ? html`<input
                type="text"
                .value=${editValue}
                @input=${(e: Event) =>
                  onInput((e.target as HTMLInputElement).value)}
                ?disabled=${this.saving}
              />`
            : html`${value || "-"}`}
        </div>
      </div>
    `;
  }

  private renderVehiclesPanel() {
    return html`
      <div class="panel vehicles-panel">
        <div class="panel-header">Vehicles</div>
        <div class="panel-body">
          ${this.vehiclesLoading
            ? html`<div>Loading vehicles...</div>`
            : this.vehicles.length === 0
            ? html`<div>No vehicles found.</div>`
            : html`
                <div class="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Token ID</th>
                        <th>MMY</th>
                        <th>VIN</th>
                        <th>License</th>
                        <th>Minted On</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.vehicles.map(
                        (v) => html`
                          <tr>
                            <td style="font-family: monospace;">
                              <span
                                class="link"
                                @click=${() => (window.location.hash = `/vehicles/${v.tokenId}`)}
                              >${v.tokenId}</span>
                            </td>
                            <td>
                              ${v.definition
                                ? `${v.definition.year} ${v.definition.make} ${v.definition.model}`
                                : "-"}
                            </td>
                            <td style="font-family: monospace; font-size: 13px;">
                              ${v.vin || "-"}
                            </td>
                            <td>${v.licensePlate || "-"}</td>
                            <td style="font-size: 13px;">
                              ${this.formatDate(v.mintedAt)}
                            </td>
                          </tr>
                        `
                      )}
                    </tbody>
                  </table>
                </div>
                <div class="pagination mt-16">
                  <button
                    class="pagination-btn"
                    ?disabled=${this.vehiclesPageIndex === 0}
                    @click=${() => this.fetchVehicles(this.vehiclesPageIndex - 1)}
                  >
                    PREV
                  </button>
                  <span style="margin: 0 8px; font-size: 14px;">
                    Page ${this.vehiclesPageIndex + 1}
                  </span>
                  <button
                    class="pagination-btn"
                    ?disabled=${!this.vehiclesHasNextPage}
                    @click=${() => this.fetchVehicles(this.vehiclesPageIndex + 1)}
                  >
                    NEXT
                  </button>
                </div>
              `}
        </div>
      </div>
    `;
  }

  render() {
    if (this.loading) {
      return html`
        <div class="page active">
          <div class="panel detail-panel">
            <div class="panel-body">Loading user profile...</div>
          </div>
        </div>
      `;
    }

    const p = this.profile;

    return html`
      <div class="page active">
        <div
          class="section-header"
          style="display: flex; justify-content: space-between; align-items: center;"
        >
          <span>User Profile</span>
          <button class="btn" @click=${() => (window.location.hash = "/users")}>
            BACK TO USERS
          </button>
        </div>

        <div class="panels-row">
          <div class="panel detail-panel">
            <div class="panel-header">Profile Info</div>
            <div class="panel-body">
              ${this.errorMessage
                ? html`<div class="alert alert-error">${this.errorMessage}</div>`
                : ""}
              ${this.successMessage
                ? html`<div class="alert alert-success">${this.successMessage}</div>`
                : ""}

              ${this.renderField("Wallet", p?.wallet ?? "-", "", () => {}, false, true)}
              ${this.renderField("Email", p?.email ?? "-", "", () => {}, false)}
              ${this.renderField("First Name", p?.first_name ?? "-", this.firstName, (v) => (this.firstName = v))}
              ${this.renderField("Last Name", p?.last_name ?? "-", this.lastName, (v) => (this.lastName = v))}
              ${this.renderField("Phone", p?.phone ?? "-", this.phone, (v) => (this.phone = v))}
              ${this.renderField("Business Name", p?.business_name ?? "-", this.businessName, (v) => (this.businessName = v))}
              ${this.renderField("Gov ID Type", p?.government_id_type ?? "-", this.govIdType, (v) => (this.govIdType = v))}
              ${this.renderField("Gov ID Number", p?.government_id_number ?? "-", this.govIdNumber, (v) => (this.govIdNumber = v))}
              ${this.renderField("Created At", this.formatDate(p?.created_at ?? ""), "", () => {}, false)}
              ${this.renderField("Updated At", this.formatDate(p?.updated_at ?? ""), "", () => {}, false)}

              <div class="actions">
                ${this.editing
                  ? html`
                      <button
                        class="btn btn-primary ${this.saving ? "processing" : ""}"
                        ?disabled=${this.saving}
                        @click=${this.handleSave}
                      >
                        SAVE
                      </button>
                      <button
                        class="btn"
                        ?disabled=${this.saving}
                        @click=${this.handleCancel}
                      >
                        CANCEL
                      </button>
                    `
                  : html`
                      <button class="btn btn-primary" @click=${this.handleEdit}>
                        EDIT
                      </button>
                    `}
              </div>
            </div>
          </div>

          ${this.renderVehiclesPanel()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "user-detail-view": UserDetailView;
  }
}
