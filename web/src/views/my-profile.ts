import { LitElement, css, html } from "lit";
import { msg } from "@lit/localize";
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { IdentityService } from "@services/identity-service";
import { FleetService, FleetGroup } from "@services/fleet-service";
import { ApiService } from "@services/api-service";

@customElement("my-profile-view")
export class MyProfileView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .profile-container {
        max-width: 600px;
        margin: 0 auto;
      }
      .roles-grid, .fleets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
        margin-top: 8px;
      }
      .role-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid #eee;
        font-size: 13px;
      }
      .role-item.assigned {
        border-color: #bbf7d0;
        background-color: #f0fdf4;
      }
      .role-item.unassigned {
        color: #999;
      }
      .role-mark {
        width: 18px;
        text-align: center;
        font-weight: 600;
      }
      .role-item.assigned .role-mark {
        color: #16a34a;
      }
      .fleet-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }
      .fleet-color {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }
      .fleet-count {
        color: #666;
        font-size: 11px;
      }
      .all-fleets-note {
        font-size: 12px;
        color: #166534;
        background-color: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-radius: 4px;
        padding: 8px;
        margin-top: 8px;
      }
    `,
  ];

  @state() private myPermissions: string[] = [];
  @state() private availablePermissions: string[] = [];
  @state() private fleetGroups: FleetGroup[] = [];
  @state() private loading = true;
  @state() private errorMessage = "";

  private identityService = IdentityService.getInstance();
  private fleetService = FleetService.getInstance();
  private apiService = ApiService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchData();
  }

  private async fetchData() {
    this.loading = true;
    try {
      const [mine, available, fleets] = await Promise.all([
        this.identityService.getUserPermissions(),
        this.identityService.getAvailablePermissions(),
        this.fleetService.getFleetGroups(),
      ]);
      this.myPermissions = mine || [];
      this.availablePermissions = available || [];
      this.fleetGroups = fleets || [];
    } catch (error) {
      console.error("Failed to load profile data:", error);
      this.errorMessage = msg("Failed to load your profile data.");
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="page active"><div class="panel"><div class="panel-body">${msg("Loading your profile...")}</div></div></div>`;
    }

    const email = localStorage.getItem("email") || "";
    const wallet = this.apiService.getWalletAddress() || "";
    const hasViewAllFleets = this.myPermissions.includes("view_all_fleets");
    const accessibleGroups = this.fleetGroups.filter(g => g.has_access);

    return html`
      <div class="page active">
        <div class="section-header">
          <span>${msg("My Profile")}</span>
        </div>

        <div class="panel profile-container">
          <div class="panel-body">
            ${this.errorMessage ? html`<div class="alert alert-error">${this.errorMessage}</div>` : ""}

            <div class="form-group">
              <label class="form-label">${msg("Email")}</label>
              <div style="padding: 8px 0;">${email || "N/A"}</div>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Wallet Address")}</label>
              <div style="padding: 8px 0; font-family: monospace;">${wallet}</div>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Roles")}</label>
              <div class="roles-grid">
                ${this.availablePermissions.map((perm) => {
                  const assigned = this.myPermissions.includes(perm);
                  return html`
                    <div class="role-item ${assigned ? "assigned" : "unassigned"}">
                      <span class="role-mark">${assigned ? "✓" : "—"}</span>
                      <span>${perm}</span>
                    </div>
                  `;
                })}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Fleet Group Access")}</label>
              ${hasViewAllFleets
                ? html`<div class="all-fleets-note">${msg("You can view all fleet groups in this tenant.")}</div>`
                : accessibleGroups.length === 0
                  ? html`<div style="padding: 8px 0; color: #666;">${msg("You don't have access to any fleet groups. Contact your administrator.")}</div>`
                  : ""}
              <div class="fleets-grid">
                ${(hasViewAllFleets ? this.fleetGroups : accessibleGroups).map(
                  (fleet) => html`
                    <div class="role-item assigned">
                      <span class="fleet-info">
                        <span class="fleet-color" style="background-color: ${fleet.color}"></span>
                        <span>${fleet.name}</span>
                        <span class="fleet-count">(${fleet.vehicle_count} ${msg("vehicles")})</span>
                      </span>
                    </div>
                  `
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "my-profile-view": MyProfileView;
  }
}
