import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";

@customElement("user-profile-card")
export class UserProfileCard extends LitElement {
  static styles = [globalStyles];

  @property({ type: Object }) accountInfo: any;
  @property({ type: String }) searchedBy?: "email" | "wallet";
  @property({ type: String }) searchValue?: string;

  private renderRow(label: string, value: string) {
    return html`
      <div class="detail-row">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${value}</span>
      </div>
    `;
  }

  render() {
    const info = this.accountInfo ?? {};

    const email =
      info?.email ?? (this.searchedBy === "email" ? this.searchValue : "—");

    const wallet =
      info?.walletAddress ??
      (this.searchedBy === "wallet" ? this.searchValue : "—");

    const created = info?.authenticators?.[0]?.creationDate ?? "—";

    return html`
      <div class="panel mb-16">
        <div class="panel-header">User Profile</div>
        <div class="panel-body">
          ${this.renderRow("Email", email)}
          ${this.renderRow("Wallet Address", wallet)}
          ${this.renderRow("Phone Number", "—")}
          ${this.renderRow("Account Created", created)}

          <div class="detail-row">
            <span class="detail-label">Auth Methods</span>
            <span class="detail-value">
              ${info?.hasPasskey ? html`<span class="badge">Passkey</span>` : null}
              ${info?.emailVerified ? html`<span class="badge">Email</span>` : null}
            </span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Account Status</span>
            <span class="detail-value">
              ${info?.isDeployed
                ? html`<span class="status status-connected">Active</span>`
                : html`<span class="status status-disconnected">Inactive</span>`}
            </span>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "user-profile-card": UserProfileCard;
  }
}
