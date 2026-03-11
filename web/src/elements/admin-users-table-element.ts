import { LitElement, css, html } from "lit";
import { msg } from '@lit/localize';
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { IdentityService } from "@services/identity-service";
import { OracleTenantService } from "../services/oracle-tenant-service";

interface AdminUser {
  email: string;
  walletAddress: string;
  permissions: string[];
}

@customElement("admin-users-table")
export class AdminUsersTable extends LitElement {
  static styles = [globalStyles, css``];

  @state() private adminUsers: AdminUser[] = [];
  @state() private adminUsersLoading = false;
  @state() private adminTotalCount = 0;
  @state() private adminSkip = 0;
  @state() private adminTake = 10;
  @state() private adminSearch = "";
  @state() private showDeleteConfirm = false;
  @state() private userToDelete: AdminUser | null = null;

  private adminSearchDebounceTimer?: number;

  async connectedCallback() {
    super.connectedCallback();
    const params = new URLSearchParams(window.location.hash.split("?")[1]);
    const searchParam = params.get("search");
    if (searchParam) {
      this.adminSearch = searchParam;
    }
    await this.fetchAdminUsers();
  }

  private async fetchAdminUsers() {
    this.adminUsersLoading = true;
    try {
      const result = await IdentityService.getInstance().getAdminUsers(
        this.adminSkip,
        this.adminTake,
        this.adminSearch
      );
      if (result) {
        this.adminUsers = result.items || [];
        this.adminTotalCount = result.totalCount || 0;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to fetch admin users:", error);
    } finally {
      this.adminUsersLoading = false;
    }
  }

  private handleAdminSearchInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;

    if (this.adminSearchDebounceTimer) {
      clearTimeout(this.adminSearchDebounceTimer);
    }

    this.adminSearchDebounceTimer = window.setTimeout(() => {
      this.adminSearch = value;
      this.adminSkip = 0;
      this.fetchAdminUsers();
    }, 500);
  }

  private handleAdminPageChange(skip: number) {
    this.adminSkip = skip;
    this.fetchAdminUsers();
  }

  private handleDeleteClick(user: AdminUser) {
    this.userToDelete = user;
    this.showDeleteConfirm = true;
  }

  private async handleConfirmDelete() {
    if (!this.userToDelete) return;
    try {
      const res = await IdentityService.getInstance().deleteAdminUser(
        this.userToDelete.walletAddress
      );
      if (res.success) {
        await this.fetchAdminUsers();
      } else {
        alert(res.error || msg("Failed to delete admin user."));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error deleting admin user:", error);
      alert(msg("An unexpected error occurred."));
    } finally {
      this.showDeleteConfirm = false;
      this.userToDelete = null;
    }
  }

  private handleCancelDelete() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
  }

  render() {
    const tenantName =
      OracleTenantService.getInstance().getSelectedTenant()?.name ||
      msg("No Tenant Selected");

    return html`
      <div
        class="section-header"
        style="display: flex; justify-content: space-between; align-items: center;"
      >
        <span>${msg('Admin Users')} - ${tenantName}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input
            type="text"
            class="search-box"
            style="width: 250px; margin: 0; font-size: 14px; padding: 5px 10px;"
            .placeholder=${msg('Search admin users...')}
            .value=${this.adminSearch}
            @input=${this.handleAdminSearchInput}
          />
        </div>
      </div>

      <div class="panel">
        <div class="panel-body">
          ${this.adminUsersLoading
            ? html`<div>${msg('Loading admin users...')}</div>`
            : this.adminUsers.length === 0
            ? html`<div>${msg('No admin users found.')}</div>`
            : html`
                <div class="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>${msg('Email')}</th>
                        <th>${msg('Wallet Address')}</th>
                        <th>${msg('Permissions')}</th>
                        <th>${msg('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.adminUsers.map(
                        (admin) => html`
                          <tr>
                            <td>${admin.email || "-"}</td>
                            <td style="font-family: monospace; font-size: 14px;">
                              ${admin.walletAddress}
                            </td>
                            <td>
                              ${(admin.permissions || []).map(
                                (p: string) =>
                                  html`<span class="badge">${p}</span>`
                              )}
                            </td>
                            <td>
                              <button
                                class="btn btn-sm"
                                @click=${() =>
                                  (window.location.hash = `/users/edit/${admin.walletAddress}`)}
                              >
                                ${msg('EDIT')}
                              </button>
                              <button
                                class="btn btn-sm btn-danger"
                                @click=${() => this.handleDeleteClick(admin)}
                              >
                                ${msg('DELETE')}
                              </button>
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
                    ?disabled=${this.adminSkip === 0}
                    @click=${() =>
                      this.handleAdminPageChange(
                        Math.max(0, this.adminSkip - this.adminTake)
                      )}
                  >
                    ${msg('PREV')}
                  </button>
                  <span style="margin: 0 8px; font-size: 14px;">
                    ${msg('Showing')} ${this.adminSkip + 1} -
                    ${Math.min(
                      this.adminSkip + this.adminTake,
                      this.adminTotalCount
                    )}
                    ${msg('of')} ${this.adminTotalCount}
                  </span>
                  <button
                    class="pagination-btn"
                    ?disabled=${this.adminSkip + this.adminTake >=
                    this.adminTotalCount}
                    @click=${() =>
                      this.handleAdminPageChange(
                        this.adminSkip + this.adminTake
                      )}
                  >
                    ${msg('NEXT')}
                  </button>
                </div>
              `}
        </div>
      </div>

      <confirm-modal-element
        .show=${this.showDeleteConfirm}
        .title=${msg("Delete Admin User")}
        .message=${msg(`Are you sure you want to delete this admin user? This will revoke all their admin permissions and access to this tool.`)}
        .confirmText=${msg("Delete")}
        .confirmButtonClass=${"btn-danger"}
        @modal-confirm=${this.handleConfirmDelete}
        @modal-cancel=${this.handleCancelDelete}
      ></confirm-modal-element>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "admin-users-table": AdminUsersTable;
  }
}
