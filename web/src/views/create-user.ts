import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { ApiService } from "@services/api-service";

@customElement("create-user-view")
export class CreateUserView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .form-container {
        max-width: 600px;
        margin: 0 auto;
      }
      .permissions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 8px;
        margin-top: 8px;
      }
      .permission-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    `,
  ];

  @state() private email = "";
  @state() private isAdmin = false;
  @state() private walletAddress = "";
  @state() private selectedPermissions: string[] = [];
  @state() private availablePermissions: string[] = [];
  @state() private loadingPermissions = false;
  @state() private submitting = false;
  @state() private errorMessage = "";
  @state() private successMessage = "";

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchAvailablePermissions();
  }

  private async fetchAvailablePermissions() {
    this.loadingPermissions = true;
    try {
      const res = await ApiService.getInstance().callApi<string[]>(
        "GET",
        "/account/permissions-available",
        null,
        true,
        true,
        false
      );
      if (res.success && Array.isArray(res.data)) {
        this.availablePermissions = res.data;
      }
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
    } finally {
      this.loadingPermissions = false;
    }
  }

  private handleEmailChange(e: Event) {
    this.email = (e.target as HTMLInputElement).value;
  }

  private handleIsAdminChange(e: Event) {
    this.isAdmin = (e.target as HTMLInputElement).checked;
  }

  private handleWalletChange(e: Event) {
    this.walletAddress = (e.target as HTMLInputElement).value;
  }

  private handlePermissionToggle(perm: string) {
    if (this.selectedPermissions.includes(perm)) {
      this.selectedPermissions = this.selectedPermissions.filter((p) => p !== perm);
    } else {
      this.selectedPermissions = [...this.selectedPermissions, perm];
    }
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    this.errorMessage = "";
    this.successMessage = "";
    this.submitting = true;

    try {
      let res;
      if (this.isAdmin) {
        res = await ApiService.getInstance().callApi(
          "POST",
          "/accounts/admin/grant",
          {
            emailAddress: this.email,
            walletAddress: this.walletAddress,
            permissions: this.selectedPermissions,
          },
          true,
          true,
          true
        );
      } else {
        res = await ApiService.getInstance().callApi(
          "POST",
          "/account",
          { email: this.email },
          true,
          true,
          true
        );
      }

      if (res.success) {
        this.successMessage = "User created successfully!";
        // Optional: clear form or redirect
        if (!this.isAdmin) {
          this.email = "";
        } else {
          this.email = "";
          this.walletAddress = "";
          this.selectedPermissions = [];
        }
      } else {
        this.errorMessage = res.error || "Failed to create user.";
      }
    } catch (error: any) {
      this.errorMessage = error.message || "An unexpected error occurred.";
    } finally {
      this.submitting = false;
    }
  }

  render() {
    return html`
      <div class="page active">
        <div class="section-header">
          <span>Create New User</span>
        </div>

        <div class="panel form-container">
          <div class="panel-body">
            ${this.errorMessage ? html`<div class="alert alert-error">${this.errorMessage}</div>` : ""}
            ${this.successMessage ? html`<div class="alert alert-success">${this.successMessage}</div>` : ""}
            <form @submit=${this.handleSubmit}>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input
                  type="email"
                  class="search-box"
                  style="width: 100%;"
                  .value=${this.email}
                  @input=${this.handleEmailChange}
                  ?disabled=${this.submitting}
                  required
                />
              </div>

              <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
                <input
                  type="checkbox"
                  id="isAdmin"
                  .checked=${this.isAdmin}
                  @change=${this.handleIsAdminChange}
                  ?disabled=${this.submitting}
                />
                <label for="isAdmin" class="form-label" style="margin-bottom: 0;">Is Admin</label>
              </div>

              ${this.isAdmin
                ? html`
                    <div class="form-group">
                      <label class="form-label">Wallet Address</label>
                      <input
                        type="text"
                        class="search-box"
                        style="width: 100%;"
                        .value=${this.walletAddress}
                        @input=${this.handleWalletChange}
                        placeholder="0x..."
                        ?disabled=${this.submitting}
                        required
                      />
                      <div style="font-size: 12px; color: #666; margin-top: 4px;">
                        For existing accounts only provide 0x, not email.
                      </div>
                    </div>

                    <div class="form-group">
                      <label class="form-label">Permissions</label>
                      ${this.loadingPermissions
                        ? html`<div>Loading permissions...</div>`
                        : html`
                            <div class="permissions-grid">
                              ${this.availablePermissions.map(
                                (perm) => html`
                                  <div class="permission-item">
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
                          `}
                    </div>
                  `
                : null}

              <div style="margin-top: 24px; display: flex; gap: 16px;">
                <button 
                  type="submit" 
                  class="btn btn-primary ${this.submitting ? 'processing' : ''}"
                  ?disabled=${this.submitting}
                >
                  Create User
                </button>
                <button
                  type="button"
                  class="btn"
                  @click=${() => (window.location.hash = "/users")}
                  ?disabled=${this.submitting}
                >
                  Cancel
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
    "create-user-view": CreateUserView;
  }
}
