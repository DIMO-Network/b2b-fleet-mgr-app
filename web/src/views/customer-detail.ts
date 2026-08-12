import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg } from "@lit/localize";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { globalStyles } from "../global-styles.ts";
import { CustomerTenant, TenancyService } from "@services/tenancy-service.ts";
import "../elements/customer-users-panel-element.ts";
import "../elements/customer-vehicles-panel-element.ts";
import "../elements/customer-settings-panel-element.ts";
import "../elements/stub-data-banner-element.ts";

dayjs.extend(relativeTime);

type Tab = "users" | "vehicles" | "settings";

// One customer, configured from the outside.
//
// Three tabs, matching the three things an operator controls: who may use it,
// which vehicles it can see, and the tenant's own settings. Note what is absent
// — there is no way to view the customer's fleet as they see it, because
// operator staff are b2b-only and impersonation was deliberately dropped from
// the design.
@customElement("customer-detail-view")
export class CustomerDetailView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .back {
        display: inline-block;
        margin-bottom: 12px;
        font-size: 14px;
      }
      .header-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .meta {
        color: #666;
        font-size: 13px;
        margin-top: 4px;
      }
      .suspended-note {
        margin-bottom: 16px;
      }
    `,
  ];

  @property({ type: String }) customerId = "";

  @state() private customer?: CustomerTenant;
  @state() private loading = false;
  @state() private error = "";
  @state() private tab: Tab = "users";

  private tenancy = TenancyService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("customerId") && changed.get("customerId") !== undefined) {
      this.load();
    }
  }

  private async load() {
    if (!this.customerId) return;
    this.loading = true;
    this.error = "";
    const res = await this.tenancy.getCustomer(this.customerId);
    if (res.success) {
      this.customer = res.data;
    } else {
      this.error = res.error || msg("Failed to load customer");
    }
    this.loading = false;
  }

  // Panels emit this after any change that moves a count or a status, so the
  // header stays honest without each panel knowing how the header is built.
  private onCustomerChanged = () => {
    this.load();
  };

  private renderTab(id: Tab, label: string) {
    return html`
      <div class="inner-tab ${this.tab === id ? "active" : ""}" @click=${() => (this.tab = id)}>
        ${label}
      </div>
    `;
  }

  render() {
    if (this.loading && !this.customer) {
      return html`<div class="page active">${msg("Loading customer...")}</div>`;
    }
    if (this.error && !this.customer) {
      return html`
        <div class="page active">
          <a class="link back" href="#/customers">${msg("← Back to customers")}</a>
          <div class="alert alert-error">${this.error}</div>
        </div>
      `;
    }
    const c = this.customer;
    if (!c) return nothing;

    return html`
      <div class="page active" id="page-customer-detail">
        <a class="link back" href="#/customers">${msg("← Back to customers")}</a>

        <div class="section-header">
          <div class="header-row">
            <span>${c.name}</span>
            <span class="status ${c.status === "active" ? "status-connected" : "status-blocked"}">
              ${c.status === "active" ? msg("Active") : msg("Suspended")}
            </span>
          </div>
          <div class="meta">
            ${c.vehicleCount} ${msg("vehicles")} · ${c.userCount} ${msg("users")} ·
            ${c.lastActivityAt
              ? html`${msg("last active")} ${dayjs(c.lastActivityAt).fromNow()}`
              : msg("never signed in")}
          </div>
        </div>

        <stub-data-banner></stub-data-banner>

        ${c.status === "suspended"
          ? html`
              <div class="alert suspended-note">
                ${msg(
                  "This customer is suspended. Their users cannot sign in, and their vehicle assignments are kept so resuming restores everything.",
                )}
              </div>
            `
          : nothing}

        <div class="inner-tabs">
          ${this.renderTab("users", msg("Users"))}
          ${this.renderTab("vehicles", msg("Vehicles"))}
          ${this.renderTab("settings", msg("Settings"))}
        </div>

        <div class="mt-16">
          ${this.tab === "users"
            ? html`
                <customer-users-panel
                  .customer=${c}
                  @customer-changed=${this.onCustomerChanged}
                ></customer-users-panel>
              `
            : nothing}
          ${this.tab === "vehicles"
            ? html`
                <customer-vehicles-panel
                  .customer=${c}
                  @customer-changed=${this.onCustomerChanged}
                ></customer-vehicles-panel>
              `
            : nothing}
          ${this.tab === "settings"
            ? html`
                <customer-settings-panel
                  .customer=${c}
                  @customer-changed=${this.onCustomerChanged}
                ></customer-settings-panel>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "customer-detail-view": CustomerDetailView;
  }
}
