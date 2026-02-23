import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { query, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";

import { ApiService } from "@services/api-service";
import { IdentityService } from "@services/identity-service";
import { OracleTenantService } from "../services/oracle-tenant-service";

import "../elements/user-profile-card-element.ts";
import "../elements/owner-vehicles-table-element.ts";
import "./edit-user.ts";

@customElement("users-view")
export class UsersView extends LitElement {
  static styles = [
    globalStyles,
    css`
    `,
  ];

  private readonly vehiclesPageSize = 25;

  @state() private accountInfo?: any;
  @state() private searchValue?: string;
  @state() private notFound = false;
  @state() private searchedBy?: "email" | "wallet";

  @state() private ownedVehicles: any[] = [];
  @state() private vehiclesLoading = false;

  @state() private vehiclesPageInfo?: { hasNextPage: boolean; endCursor?: string };
  @state() private vehiclesPageIndex = 0;

  // cursor chain & caches for paging
  @state() private vehiclesCursors: (string | undefined)[] = [undefined];
  @state() private vehiclesPageCache = new Map<number, any[]>();
  @state() private vehiclesPageInfoCache = new Map<
    number,
    { hasNextPage: boolean; endCursor?: string }
  >();

  @state() private adminUsers: any[] = [];
  @state() private adminUsersLoading = false;

  @query("#user-search-input")
  private searchInput!: HTMLInputElement;

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchAdminUsers();
  }

  private async fetchAdminUsers() {
    this.adminUsersLoading = true;
    try {
      const res = await ApiService.getInstance().callApi<any[]>(
        "GET",
        "/accounts/admin",
        null,
        true,
        true,
        true
      );
      if (res.success && Array.isArray(res.data)) {
        this.adminUsers = res.data;
      }
    } catch (error) {
      console.error("Failed to fetch admin users:", error);
    } finally {
      this.adminUsersLoading = false;
    }
  }

  private isWalletAddress(value: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }

  private async searchUser() {
    const input = this.searchInput?.value?.trim();
    if (!input) return;

    // reset state
    this.searchValue = input;
    this.notFound = false;
    this.accountInfo = undefined;

    this.ownedVehicles = [];
    this.vehiclesPageInfo = undefined;
    this.vehiclesLoading = false;

    this.vehiclesPageIndex = 0;
    this.vehiclesCursors = [undefined];
    this.vehiclesPageCache = new Map();
    this.vehiclesPageInfoCache = new Map();

    const isWallet = this.isWalletAddress(input);
    this.searchedBy = isWallet ? "wallet" : "email";

    const identityService = IdentityService.getInstance();
    const accountInfo = await identityService.getAccountInfo(input);

    if (!accountInfo) {
      this.notFound = true;
      return;
    }

    this.accountInfo = accountInfo;

    if (isWallet) {
      await this.loadVehiclesPage(0);
    }
  }

  private async fetchOwnedVehicles(wallet: string, after?: string) {
    const identityService = IdentityService.getInstance();
    const result = await identityService.getOwnedVehicles(wallet, this.vehiclesPageSize, after);

    if (!result) {
      this.ownedVehicles = [];
      this.vehiclesPageInfo = undefined;
      return;
    }

    this.ownedVehicles = result.nodes;
    this.vehiclesPageInfo = result.pageInfo;
  }

  private async loadVehiclesPage(pageIndex: number) {
    if (!this.searchValue || this.searchedBy !== "wallet") return;

    // can't jump to a page if we don't have its cursor yet
    if (pageIndex > 0 && !this.vehiclesCursors[pageIndex]) return;

    const cached = this.vehiclesPageCache.get(pageIndex);
    if (cached) {
      this.ownedVehicles = cached;
      this.vehiclesPageInfo = this.vehiclesPageInfoCache.get(pageIndex);
      this.vehiclesPageIndex = pageIndex;
      return;
    }

    this.vehiclesLoading = true;
    try {
      const after = this.vehiclesCursors[pageIndex];
      await this.fetchOwnedVehicles(this.searchValue, after);

      // cache nodes + pageInfo
      this.vehiclesPageCache.set(pageIndex, this.ownedVehicles);
      this.vehiclesPageInfoCache.set(
        pageIndex,
        this.vehiclesPageInfo ?? { hasNextPage: false }
      );

      // store cursor for next page
      const endCursor = this.vehiclesPageInfo?.endCursor;
      if (endCursor && this.vehiclesCursors.length === pageIndex + 1) {
        this.vehiclesCursors = [...this.vehiclesCursors, endCursor];
      }

      this.vehiclesPageIndex = pageIndex;
    } finally {
      this.vehiclesLoading = false;
    }
  }

  private renderWalletHint() {
    return html`
      <div class="panel mt-16">
        <div class="panel-body" style="color:#666;">
          To view owned vehicles and full account details, please search using the user’s
          wallet address (0x…).
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="page active" id="page-users">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>User Lookup</span>
          <button class="btn btn-success" @click=${() => window.location.hash = "/users/create"}>
            + CREATE NEW USER
          </button>
        </div>

        <div class="panel mb-24">
          <div class="panel-body">
            <div class="form-row">
              <div class="form-group" style="flex: 1; margin: 0;">
                <form>
                <label class="form-label">Search by Email, Wallet Address, or Phone</label>
                <input
                  type="text"
                  autofocus
                  id="user-search-input"
                  class="search-box"
                  style="width: 100%;"
                  placeholder="Enter email, 0x... wallet, or phone number..."
                />
              </div>

              <button class="btn btn-primary" @click=${this.searchUser.bind(this)}>
                SEARCH
              </button>
              </form>
            </div>
          </div>
        </div>

        <div id="user-results-container">
          ${!this.searchValue
            ? html`
                <div class="panel">
                  <div class="panel-body" style="text-align:center; padding:48px; color:#666;">
                    Enter an email, wallet address, or phone number to look up a user.
                  </div>
                </div>
              `
            : this.notFound
            ? html`
                <div class="panel">
                  <div class="panel-body" style="padding:48px;">
                    No user found for "${this.searchValue}"
                  </div>
                </div>
              `
            : this.accountInfo
            ? html`
                <user-profile-card
                  .accountInfo=${this.accountInfo}
                  .searchedBy=${this.searchedBy}
                  .searchValue=${this.searchValue}
                ></user-profile-card>

                ${this.searchedBy === "email" ? this.renderWalletHint() : null}

                ${this.searchedBy === "wallet"
                  ? html`
                      <owned-vehicles-table
                        .vehicles=${this.ownedVehicles}
                        .pageInfo=${this.vehiclesPageInfo}
                        .pageIndex=${this.vehiclesPageIndex}
                        .loading=${this.vehiclesLoading}
                        @prev=${async () => await this.loadVehiclesPage(this.vehiclesPageIndex - 1)}
                        @next=${async () => await this.loadVehiclesPage(this.vehiclesPageIndex + 1)}
                      ></owned-vehicles-table>
                    `
                  : null}
              `
            : null}
        </div>

        <div class="section-header mt-24">
          <span>Admin Users - ${OracleTenantService.getInstance().getSelectedTenant()?.name || 'No Tenant Selected'}</span>
        </div>

        <div class="panel">
          <div class="panel-body">
            ${this.adminUsersLoading
              ? html`<div>Loading admin users...</div>`
              : this.adminUsers.length === 0
              ? html`<div>No admin users found.</div>`
              : html`
                  <div class="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Wallet Address</th>
                          <th>Permissions</th>
                          <th>Actions</th>
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
                                  (p: string) => html`<span class="badge">${p}</span>`
                                )}
                              </td>
                              <td>
                                <button class="btn btn-sm" @click=${() => window.location.hash = `/users/edit/${admin.walletAddress}`}>
                                  EDIT
                                </button>
                              </td>
                            </tr>
                          `
                        )}
                      </tbody>
                    </table>
                  </div>
                `}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "users-view": UsersView;
  }
}