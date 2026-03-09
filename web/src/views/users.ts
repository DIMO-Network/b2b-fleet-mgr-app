import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { query, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";

import { IdentityService } from "@services/identity-service";

import "../elements/user-profile-card-element.ts";
import "../elements/owner-vehicles-table-element.ts";
import "../elements/admin-users-table-element.ts";
import "../elements/all-users-table-element.ts";
import "./edit-user.ts";

@customElement("users-view")
export class UsersView extends LitElement {
  static styles = [
    globalStyles,
    css`
    `,
  ];

  private readonly vehiclesPageSize = 25;

  @state() private searchValue?: string;
  @state() private searchedBy?: "email" | "wallet";

  @state() private ownedVehicles: any[] = [];

  @state() private vehiclesPageInfo?: { hasNextPage: boolean; endCursor?: string };

  // cursor chain & caches for paging
  @state() private vehiclesCursors: (string | undefined)[] = [undefined];
  @state() private vehiclesPageCache = new Map<number, any[]>();
  @state() private vehiclesPageInfoCache = new Map<
    number,
    { hasNextPage: boolean; endCursor?: string }
  >();

  @state() private activeTab: "admin" | "all" = "all";

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

  render() {
    return html`
      <div class="page active" id="page-users">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Users</span>
          <button class="btn btn-success" @click=${() => window.location.hash = "/users/create"}>
            + CREATE NEW USER
          </button>
        </div>
        
        <div class="inner-tabs mt-24">
          <div
            class="inner-tab ${this.activeTab === "admin" ? "active" : ""}"
            @click=${() => (this.activeTab = "admin")}
          >
            Admin Users
          </div>
          <div
            class="inner-tab ${this.activeTab === "all" ? "active" : ""}"
            @click=${() => (this.activeTab = "all")}
          >
            All Users
          </div>
        </div>

        ${this.activeTab === "admin"
          ? html`<admin-users-table></admin-users-table>`
          : html`<all-users-table></all-users-table>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "users-view": UsersView;
  }
}