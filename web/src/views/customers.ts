import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { msg } from "@lit/localize";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { globalStyles } from "../global-styles.ts";
import { CustomerTenant, TenancyService } from "@services/tenancy-service.ts";
import { OracleTenantService } from "@services/oracle-tenant-service.ts";
import "../elements/create-customer-modal-element.ts";
import "../elements/stub-data-banner-element.ts";

dayjs.extend(relativeTime);

// The operator console's customer list.
//
// You are always the operator here. Customers are configuration objects managed
// from the outside — there is no "switch into" action, and deliberately no way
// to open a customer's fleet view from this app. Operator staff are b2b-only.
@customElement("customers-view")
export class CustomersView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .clickable-row {
        cursor: pointer;
      }
      .muted {
        color: #666;
      }
      .count {
        font-variant-numeric: tabular-nums;
      }
      .empty {
        padding: 32px;
        text-align: center;
        color: #666;
      }
      .name-cell {
        font-weight: bold;
      }
      .ext-ref {
        font-weight: normal;
        color: #666;
        font-size: 13px;
      }
    `,
  ];

  @state() private customers: CustomerTenant[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private search = "";

  private tenancy = TenancyService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  private async load() {
    this.loading = true;
    this.error = "";
    const res = await this.tenancy.listCustomers();
    if (res.success) {
      this.customers = res.data ?? [];
    } else {
      this.error = res.error || msg("Failed to load customers");
    }
    this.loading = false;
  }

  private get filtered(): CustomerTenant[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.customers;
    return this.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.externalRef ?? "").toLowerCase().includes(q),
    );
  }

  private openCustomer(c: CustomerTenant) {
    window.location.hash = `/customers/${c.id}`;
  }

  private openCreateModal() {
    const modal = document.createElement("create-customer-modal-element") as any;
    modal.show = true;
    modal.addEventListener("modal-closed", () => {
      if (modal.parentNode) document.body.removeChild(modal);
    });
    modal.addEventListener("customer-created", async (e: Event) => {
      const created = (e as CustomerCreatedEvent).detail?.customer;
      await this.load();
      if (created?.id) window.location.hash = `/customers/${created.id}`;
    });
    document.body.appendChild(modal);
  }

  private renderRow(c: CustomerTenant) {
    return html`
      <tr class="clickable-row" @click=${() => this.openCustomer(c)}>
        <td class="name-cell">
          ${c.name}
          ${c.externalRef ? html`<div class="ext-ref">${c.externalRef}</div>` : nothing}
        </td>
        <td>
          <span class="status ${c.status === "active" ? "status-connected" : "status-blocked"}">
            ${c.status === "active" ? msg("Active") : msg("Suspended")}
          </span>
        </td>
        <td class="count">${c.vehicleCount}</td>
        <td class="count">${c.userCount}</td>
        <td class="muted">
          ${c.lastActivityAt ? dayjs(c.lastActivityAt).fromNow() : msg("Never")}
        </td>
        <td>
          <button class="btn btn-sm" @click=${(e: Event) => {
            e.stopPropagation();
            this.openCustomer(c);
          }}>
            ${msg("MANAGE")}
          </button>
        </td>
      </tr>
    `;
  }

  render() {
    const operator = OracleTenantService.getInstance().getSelectedTenant();

    return html`
      <div class="page active" id="page-customers">
        <div
          class="section-header"
          style="display: flex; justify-content: space-between; align-items: center;"
        >
          <span>
            ${msg("Customers")}
            ${operator ? html`<span class="muted"> — ${operator.name}</span>` : nothing}
          </span>
          <button class="btn btn-success" @click=${this.openCreateModal}>
            ${msg("+ NEW CUSTOMER")}
          </button>
        </div>

        <stub-data-banner></stub-data-banner>

        ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}

        <div class="toolbar">
          <input
            type="text"
            class="search-box"
            .placeholder=${msg("Search customers...")}
            .value=${this.search}
            @input=${(e: InputEvent) => (this.search = (e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="panel">
          <div class="panel-body">
            ${this.loading
              ? html`<div>${msg("Loading customers...")}</div>`
              : this.filtered.length === 0
                ? html`
                    <div class="empty">
                      ${this.customers.length === 0
                        ? msg(
                            "No customers yet. Create one to give an end customer their own fleet-lite tenant.",
                          )
                        : msg("No customers match that search.")}
                    </div>
                  `
                : html`
                    <div class="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>${msg("Name")}</th>
                            <th>${msg("Status")}</th>
                            <th>${msg("Vehicles")}</th>
                            <th>${msg("Users")}</th>
                            <th>${msg("Last activity")}</th>
                            <th>${msg("Actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${this.filtered.map((c) => this.renderRow(c))}
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

type CustomerCreatedEvent = CustomEvent<{ customer: CustomerTenant }>;

declare global {
  interface HTMLElementTagNameMap {
    "customers-view": CustomersView;
  }
}
