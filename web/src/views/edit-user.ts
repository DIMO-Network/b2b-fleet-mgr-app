import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { IdentityService } from "@services/identity-service";
import { FleetService, FleetGroup } from "@services/fleet-service";

@customElement("edit-user-view")
export class EditUserView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .form-container {
        max-width: 600px;
        margin: 0 auto;
      }
      .permissions-grid, .fleets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
        margin-top: 8px;
      }
      .checkbox-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid #eee;
      }
      .checkbox-item:hover {
        background-color: #f9f9f9;
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
      .disabled-section {
        opacity: 0.5;
        pointer-events: none;
      }
    `,
  ];

  @property({ type: String }) walletAddress = "";

  @state() private email = "";
  @state() private selectedPermissions: string[] = [];
  @state() private selectedFleetGroupIds: string[] = [];
  
  @state() private availablePermissions: string[] = [];
  @state() private availableFleetGroups: FleetGroup[] = [];
  
  @state() private loading = true;
  @state() private submitting = false;
  @state() private errorMessage = "";
  @state() private successMessage = "";

  private identityService = IdentityService.getInstance();
  private fleetService = FleetService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchData();
  }

  private async fetchData() {
    this.loading = true;
    try {
      const [user, permissions, fleets] = await Promise.all([
        this.identityService.getAdminUser(this.walletAddress),
        this.identityService.getAvailablePermissions(),
        this.fleetService.getFleetGroups()
      ]);

      if (user) {
        this.email = user.email || "";
        this.selectedPermissions = user.permissions || [];
        this.selectedFleetGroupIds = user.fleetGroupIds || [];
      } else {
        this.errorMessage = "User not found.";
      }

      this.availablePermissions = permissions;
      this.availableFleetGroups = fleets;
    } catch (error) {
      console.error("Failed to fetch data:", error);
      this.errorMessage = "Failed to load user data.";
    } finally {
      this.loading = false;
    }
  }

  private handlePermissionToggle(perm: string) {
    if (this.selectedPermissions.includes(perm)) {
      this.selectedPermissions = this.selectedPermissions.filter((p) => p !== perm);
    } else {
      this.selectedPermissions = [...this.selectedPermissions, perm];
    }
  }

  private handleFleetToggle(fleetId: string) {
    if (this.selectedFleetGroupIds.includes(fleetId)) {
      this.selectedFleetGroupIds = this.selectedFleetGroupIds.filter((id) => id !== fleetId);
    } else {
      this.selectedFleetGroupIds = [...this.selectedFleetGroupIds, fleetId];
    }
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    this.errorMessage = "";
    this.successMessage = "";
    this.submitting = true;

    try {
      // If view_all_fleets is selected, we should probably clear fleetGroupIds or the API handles it
      // The requirement says "only an option if they don't have the role view_all_fleets"
      const fleetGroupIds = this.selectedPermissions.includes('view_all_fleets') ? [] : this.selectedFleetGroupIds;

      const res = await this.identityService.updateAdminUser({
        walletAddress: this.walletAddress,
        permissions: this.selectedPermissions,
        fleetGroupIds: fleetGroupIds
      });

      if (res.success) {
        this.successMessage = "User updated successfully!";
        // Refresh data to be sure
        await this.fetchData();
      } else {
        this.errorMessage = res.error || "Failed to update user.";
      }
    } catch (error: any) {
      this.errorMessage = error.message || "An unexpected error occurred.";
    } finally {
      this.submitting = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="page active"><div class="panel"><div class="panel-body">Loading user data...</div></div></div>`;
    }

    const hasViewAllFleets = this.selectedPermissions.includes('view_all_fleets');

    return html`
      <div class="page active">
        <div class="section-header">
          <span>Edit Admin User</span>
        </div>

        <div class="panel form-container">
          <div class="panel-body">
            ${this.errorMessage ? html`<div class="alert alert-error">${this.errorMessage}</div>` : ""}
            ${this.successMessage ? html`<div class="alert alert-success">${this.successMessage}</div>` : ""}
            
            <div class="form-group">
              <label class="form-label">Email</label>
              <div style="padding: 8px 0;">${this.email || "N/A"}</div>
            </div>

            <div class="form-group">
              <label class="form-label">Wallet Address</label>
              <div style="padding: 8px 0; font-family: monospace;">${this.walletAddress}</div>
            </div>

            <form @submit=${this.handleSubmit}>
              <div class="form-group">
                <label class="form-label">Permissions</label>
                <div class="permissions-grid">
                  ${this.availablePermissions.map(
                    (perm) => html`
                      <div class="checkbox-item">
                        <input
                          type="checkbox"
                          id="perm-${perm}"
                          .checked=${this.selectedPermissions.includes(perm)}
                          @change=${() => this.handlePermissionToggle(perm)}
                          ?disabled=${this.submitting}
                        />
                        <label for="perm-${perm}">${perm}</label>
                      </div>
                    `
                  )}
                </div>
              </div>

              <div class="form-group ${hasViewAllFleets ? 'disabled-section' : ''}">
                <label class="form-label">Controlled Fleets</label>
                ${hasViewAllFleets 
                  ? html`<div style="font-size: 12px; color: #666; margin-bottom: 8px;">Disabled because 'view_all_fleets' is selected.</div>` 
                  : ""}
                <div class="fleets-grid">
                  ${this.availableFleetGroups.map(
                    (fleet) => html`
                      <div class="checkbox-item">
                        <input
                          type="checkbox"
                          id="fleet-${fleet.id}"
                          .checked=${this.selectedFleetGroupIds.includes(fleet.id)}
                          @change=${() => this.handleFleetToggle(fleet.id)}
                          ?disabled=${this.submitting || hasViewAllFleets}
                        />
                        <label for="fleet-${fleet.id}" class="fleet-info">
                          <span class="fleet-color" style="background-color: ${fleet.color}"></span>
                          <span>${fleet.name}</span>
                          <span class="fleet-count">(${fleet.vehicle_count} vehicles)</span>
                        </label>
                      </div>
                    `
                  )}
                  ${this.availableFleetGroups.length === 0 ? html`<div>No fleet groups available.</div>` : ""}
                </div>
              </div>

              <div style="margin-top: 24px; display: flex; gap: 16px;">
                <button 
                  type="submit" 
                  class="btn btn-primary ${this.submitting ? 'processing' : ''}"
                  ?disabled=${this.submitting}
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  class="btn"
                  @click=${() => (window.location.hash = "/users")}
                  ?disabled=${this.submitting}
                >
                  Back to Users
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "edit-user-view": EditUserView;
  }
}
