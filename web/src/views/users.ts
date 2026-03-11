import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { msg } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";

import "../elements/admin-users-table-element.ts";
import "../elements/all-users-table-element.ts";

@customElement("users-view")
export class UsersView extends LitElement {
  static styles = [
    globalStyles,
    css`
    `,
  ];

  @state() private activeTab: "admin" | "all" = "all";

  render() {
    return html`
      <div class="page active" id="page-users">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>${msg('Users')}</span>
          <button class="btn btn-success" @click=${() => window.location.hash = "/users/create"}>
            ${msg('+ CREATE NEW USER')}
          </button>
        </div>

        <div class="inner-tabs mt-24">
          <div
            class="inner-tab ${this.activeTab === "admin" ? "active" : ""}"
            @click=${() => (this.activeTab = "admin")}
          >
            ${msg('Admin Users')}
          </div>
          <div
            class="inner-tab ${this.activeTab === "all" ? "active" : ""}"
            @click=${() => (this.activeTab = "all")}
          >
            ${msg('All Users')}
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