import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { query, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";

import { ApiService } from "@services/api-service";
import { SettingsService } from "../services/settings-service";

import "../elements/user-profile-card-element.ts";
import "../elements/owner-vehicles-table-element.ts";

@customElement("users-view")
export class UsersView extends LitElement {
  static styles = [globalStyles, css``];

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

  @query("#user-search-input")
  private searchInput!: HTMLInputElement;

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

    const query = isWallet
      ? `walletAddress=${encodeURIComponent(input)}`
      : `email=${encodeURIComponent(input)}`;

    const settings = SettingsService.getInstance();
    if (!settings.privateSettings) await settings.fetchPrivateSettings();

    const accountsApiUrl = settings.privateSettings?.accountsApiUrl;
    if (!accountsApiUrl) return;

    const endpointUrl = `${accountsApiUrl}/api/account?${query}`;

    const res = await ApiService.getInstance().callApi(
      "GET",
      endpointUrl,
      null,
      false,
      false,
      false
    );

    if (!res.success || !res.data || (res.data as any)?.error === "User not found") {
      this.notFound = true;
      return;
    }

    this.accountInfo = res.data;

    if (isWallet) {
      await this.loadVehiclesPage(0);
    }
  }

  private async fetchOwnedVehicles(wallet: string, after?: string) {
    const base = `/identity/owner/${wallet}?first=${this.vehiclesPageSize}`;
    const url = after ? `${base}&after=${encodeURIComponent(after)}` : base;

    const res = await ApiService.getInstance().callApi(
      "GET",
      url,
      null,
      true,
      false,
      false
    );

    if (!res.success || !res.data) {
      this.ownedVehicles = [];
      this.vehiclesPageInfo = undefined;
      return;
    }

    const vehicles = (res.data as any)?.data?.vehicles;
    this.ownedVehicles = vehicles?.nodes ?? [];
    this.vehiclesPageInfo = vehicles?.pageInfo;
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
        <div class="section-header">User Lookup</div>

        <div class="panel mb-24">
          <div class="panel-body">
            <div class="form-row">
              <div class="form-group" style="flex: 1; margin: 0;">
                <label class="form-label">Search by Email, Wallet Address, or Phone</label>
                <input
                  type="text"
                  id="user-search-input"
                  class="search-box"
                  style="width: 100%;"
                  placeholder="Enter email, 0x... wallet, or phone number..."
                />
              </div>

              <button class="btn btn-primary" @click=${this.searchUser.bind(this)}>
                SEARCH
              </button>
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
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "users-view": UsersView;
  }
}