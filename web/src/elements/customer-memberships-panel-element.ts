import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { globalStyles } from "../global-styles.ts";
import {
  CustomerTenant,
  EntitledVehicle,
  MembershipStatus,
  TenancyService,
  VehicleMembership,
} from "@services/tenancy-service.ts";
import "./membership-modal-element.ts";
import "./confirm-modal-element.ts";
import type { MembershipModalMode } from "./membership-modal-element.ts";

dayjs.extend(relativeTime);

function termLabel(months: number): string {
  return months === 1 ? msg("1 month") : msg(str`${months} months`);
}

// What the customer has paid for, per vehicle.
//
// A membership is deliberately NOT the entitlement. The entitlement (Vehicles
// tab) decides whether this customer may see a vehicle at all; the membership
// decides whether it is paid for, and until when. Keeping them separate is what
// makes "this vehicle was discontinued, move its membership to the replacement"
// a single action that preserves the paid term, rather than a revoke-and-regrant
// that destroys the commercial record along with the access.
//
// ENFORCEMENT IS A PER-CUSTOMER SETTING, off by default, on the Settings tab.
// While it is on, Fleet Lite hides this customer's vehicles that have no active
// membership — the backend simply does not return them. While it is off, the
// memberships here are recorded but change nothing the customer sees, which is
// the safe state to assign them in.
@customElement("customer-memberships-panel")
export class CustomerMembershipsPanel extends LitElement {
  static styles = [
    globalStyles,
    css`
      .muted {
        color: #666;
      }
      .empty {
        padding: 32px;
        text-align: center;
        color: #666;
      }
      .token {
        font-variant-numeric: tabular-nums;
      }
      .vin {
        font-family: monospace;
        font-size: 13px;
      }
      .pill {
        display: inline-block;
        padding: 2px 8px;
        font-size: 12px;
        border: 1px solid transparent;
        white-space: nowrap;
      }
      .pill-active {
        background: #d4edda;
        border-color: #155724;
        color: #155724;
      }
      .pill-soon {
        background: #fff3cd;
        border-color: #856404;
        color: #856404;
      }
      .pill-expired {
        background: #f8d7da;
        border-color: #721c24;
        color: #721c24;
      }
      .notice-bar {
        padding: 12px 14px;
        margin-bottom: 16px;
        border: 1px solid #856404;
        background: #fff3cd;
        color: #856404;
      }
      .enforced-bar {
        padding: 12px 14px;
        margin-bottom: 16px;
        border: 1px solid #0c5460;
        background: #d1ecf1;
        color: #0c5460;
      }
      .orphan-note {
        font-size: 12px;
        color: #721c24;
        display: block;
      }
      .actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
    `,
  ];

  @property({ type: Object }) customer!: CustomerTenant;

  @state() private memberships: VehicleMembership[] = [];
  @state() private entitled: EntitledVehicle[] = [];
  @state() private enforced = false;
  @state() private loading = false;
  @state() private error = "";
  @state() private notice = "";
  // Set when the backend does not serve memberships yet, which is a different
  // situation from an error and reads very differently to an operator.
  @state() private unavailable = false;
  @state() private confirmCancel: VehicleMembership | null = null;

  private tenancy = TenancyService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  private async load() {
    this.loading = true;
    this.error = "";
    this.unavailable = false;

    const [list, entitled] = await Promise.all([
      this.tenancy.listMemberships(this.customer.id),
      this.tenancy.listEntitlements(this.customer.id),
    ]);

    if (list.success) {
      this.memberships = list.data?.memberships ?? [];
      this.enforced = list.data?.enforced ?? false;
    } else if (list.status === 404) {
      // The b2b proxy answers 404 for a route it has not registered, which is
      // exactly the state until the tenancy endpoints and the proxy hops ship.
      // Saying so is better than showing an error an operator might report.
      this.unavailable = true;
      this.memberships = [];
    } else {
      this.error = list.error || msg("Failed to load memberships");
    }

    // The entitlement list only feeds the picker and the orphan flag, so a
    // failure here degrades those rather than failing the tab.
    this.entitled = entitled.success ? (entitled.data ?? []) : [];
    this.loading = false;
  }

  private notifyChanged() {
    this.dispatchEvent(new CustomEvent("customer-changed", { bubbles: true, composed: true }));
  }

  // Vehicles this customer holds that are free to take a membership. Both the
  // create and move pickers use this: the vehicle a membership is being moved
  // off already has one (its own), so it excludes itself without a special case.
  private get availableVehicles(): EntitledVehicle[] {
    const taken = new Set(this.memberships.map((m) => m.vehicleTokenId));
    return this.entitled.filter((v) => !taken.has(v.vehicleTokenId));
  }

  private openModal(mode: MembershipModalMode, membership: VehicleMembership | null) {
    const modal = document.createElement("membership-modal-element") as any;
    modal.show = true;
    modal.mode = mode;
    modal.customerId = this.customer.id;
    modal.customerName = this.customer.name;
    modal.membership = membership;
    modal.available = this.availableVehicles;
    modal.addEventListener("modal-closed", () => {
      if (modal.parentNode) document.body.removeChild(modal);
    });
    modal.addEventListener("membership-saved", async (e: Event) => {
      const detail = (e as CustomEvent<{ mode: MembershipModalMode }>).detail;
      this.notice =
        detail?.mode === "move"
          ? msg("Membership moved.")
          : detail?.mode === "renew"
            ? msg("Membership renewed.")
            : msg("Membership added.");
      await this.load();
      this.notifyChanged();
    });
    document.body.appendChild(modal);
  }

  private async cancel() {
    const m = this.confirmCancel;
    this.confirmCancel = null;
    if (!m) return;
    const res = await this.tenancy.cancelMembership(this.customer.id, m.id);
    if (res.success) {
      this.notice = msg(
        str`Membership for ${m.vin ?? m.vehicleTokenId} cancelled.`,
      );
      await this.load();
      this.notifyChanged();
    } else {
      this.error = res.error || msg("Failed to cancel membership");
    }
  }

  private renderStatus(m: VehicleMembership) {
    const labels: Record<MembershipStatus, string> = {
      active: msg("Active"),
      expiring_soon: msg("Expiring soon"),
      expired: msg("Expired"),
      canceled: msg("Cancelled"),
    };
    const cls: Record<MembershipStatus, string> = {
      active: "pill-active",
      expiring_soon: "pill-soon",
      expired: "pill-expired",
      canceled: "",
    };
    return html`<span class="pill ${cls[m.status]}">${labels[m.status]}</span>`;
  }

  private renderRow(m: VehicleMembership) {
    const description = [m.year, m.make, m.model].filter(Boolean).join(" ");
    return html`
      <tr>
        <td class="vin">
          ${m.vin ?? "-"}
          ${m.entitled
            ? nothing
            : html`
                <span class="orphan-note">
                  ${msg("no longer assigned to this customer")}
                </span>
              `}
        </td>
        <td>${description || html`<span class="muted">-</span>`}</td>
        <td class="token">${m.vehicleTokenId}</td>
        <td>${termLabel(m.termMonths)}</td>
        <td>
          ${dayjs(m.expiresAt).format("D MMM YYYY")}
          <div class="muted" style="font-size: 12px;">${dayjs(m.expiresAt).fromNow()}</div>
        </td>
        <td>${this.renderStatus(m)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-sm btn-secondary" @click=${() => this.openModal("move", m)}>
              ${msg("MOVE")}
            </button>
            <button class="btn btn-sm btn-primary" @click=${() => this.openModal("renew", m)}>
              ${msg("RENEW")}
            </button>
            <button class="btn btn-sm btn-danger" @click=${() => (this.confirmCancel = m)}>
              ${msg("CANCEL")}
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  private renderBanners() {
    const orphans = this.memberships.filter((m) => !m.entitled).length;
    return html`
      ${this.enforced
        ? html`
            <div class="enforced-bar">
              ${msg(
                "Fleet Lite is only showing this customer the vehicles with an active membership. Anything unlisted here is hidden from them.",
              )}
            </div>
          `
        : nothing}
      ${orphans > 0
        ? html`
            <div class="notice-bar">
              ${msg(
                str`${orphans} membership(s) are on vehicles this customer is no longer assigned. The paid term is untouched — move each one to another vehicle, or cancel it.`,
              )}
            </div>
          `
        : nothing}
    `;
  }

  render() {
    if (this.unavailable) {
      return html`
        <div class="section-header">${msg("Memberships")}</div>
        <div class="panel">
          <div class="panel-body">
            <div class="empty">
              ${msg(
                "Memberships aren't available on this environment yet — the backend routes haven't shipped. Turn on demo mode to try the screen.",
              )}
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div
        class="section-header"
        style="display: flex; justify-content: space-between; align-items: center;"
      >
        <span>${msg("Memberships")}</span>
        <button class="btn btn-success" @click=${() => this.openModal("create", null)}>
          ${msg("+ ADD MEMBERSHIP")}
        </button>
      </div>

      ${this.renderBanners()}
      ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
      ${this.notice ? html`<div class="alert alert-success">${this.notice}</div>` : nothing}

      <div class="panel">
        <div class="panel-body">
          ${this.loading
            ? html`<div>${msg("Loading memberships...")}</div>`
            : this.memberships.length === 0
              ? html`
                  <div class="empty">
                    ${msg(
                      "No memberships yet. Add one per vehicle the customer has paid for; a membership can be moved to another vehicle later.",
                    )}
                  </div>
                `
              : html`
                  <div class="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>${msg("VIN")}</th>
                          <th>${msg("Vehicle")}</th>
                          <th>${msg("Token ID")}</th>
                          <th>${msg("Term")}</th>
                          <th>${msg("Expires")}</th>
                          <th>${msg("Status")}</th>
                          <th>${msg("Actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.memberships.map((m) => this.renderRow(m))}
                      </tbody>
                    </table>
                  </div>
                `}
        </div>
      </div>

      <confirm-modal-element
        .show=${this.confirmCancel !== null}
        .title=${msg("Cancel membership")}
        .message=${msg(
          "The vehicle stops counting as paid for. If enforcement is on, the customer stops seeing it within about a minute. Nothing on chain changes, and the vehicle stays assigned to them.",
        )}
        .confirmText=${msg("Cancel membership")}
        .confirmButtonClass=${"btn-danger"}
        @modal-confirm=${this.cancel}
        @modal-cancel=${() => (this.confirmCancel = null)}
      ></confirm-modal-element>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "customer-memberships-panel": CustomerMembershipsPanel;
  }
}
