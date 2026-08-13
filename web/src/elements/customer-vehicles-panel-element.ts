import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { globalStyles } from "../global-styles.ts";
import {
  AssignVehiclesResult,
  CustomerTenant,
  EntitledVehicle,
  GroupDrift,
  TenancyService,
} from "@services/tenancy-service.ts";
import "./assign-vehicles-modal-element.ts";
import "./confirm-modal-element.ts";

dayjs.extend(relativeTime);

// Which vehicles this customer can see.
//
// This is the whole isolation boundary, and it is a database row rather than
// anything on chain: the vehicle stays owned by the operator's account with its
// single SACD grant, and the customer's access is granted and revoked here. So
// revoking is instant and cheap, and there is no signing step anywhere on this
// screen.
//
// Assignment is a SNAPSHOT. Assigning a group records the vehicles in it at that
// moment plus the group as provenance; vehicles added to that group later show
// up in the drift banner and are never granted automatically. That is the point
// — auto-following would mean an edit to an internal operator group silently
// exposes a vehicle to a customer.
@customElement("customer-vehicles-panel")
export class CustomerVehiclesPanel extends LitElement {
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
      .drift {
        background: #fff3cd;
        border: 1px solid #856404;
        color: #856404;
        padding: 12px 14px;
        margin-bottom: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .rejected {
        margin-top: 8px;
      }
      .rejected li {
        font-size: 14px;
      }
    `,
  ];

  @property({ type: Object }) customer!: CustomerTenant;

  @state() private vehicles: EntitledVehicle[] = [];
  @state() private drift: GroupDrift[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private notice = "";
  @state() private rejected: AssignVehiclesResult["rejected"] = [];
  @state() private confirmRevoke: EntitledVehicle | null = null;
  @state() private reapplying = "";

  private tenancy = TenancyService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  private async load() {
    this.loading = true;
    this.error = "";
    const [vehicles, drift] = await Promise.all([
      this.tenancy.listEntitlements(this.customer.id),
      this.tenancy.getDrift(this.customer.id),
    ]);
    if (vehicles.success) {
      this.vehicles = vehicles.data ?? [];
    } else {
      this.error = vehicles.error || msg("Failed to load vehicles");
    }
    // Drift is an enhancement, not the point of the screen: if it fails, the
    // assignments still render rather than the whole tab erroring out.
    this.drift = drift.success ? (drift.data ?? []) : [];
    this.loading = false;
  }

  private notifyChanged() {
    this.dispatchEvent(new CustomEvent("customer-changed", { bubbles: true, composed: true }));
  }

  private applyResult(result: AssignVehiclesResult | undefined) {
    const assigned = result?.assigned.length ?? 0;
    this.rejected = result?.rejected ?? [];
    this.notice =
      assigned === 0
        ? msg("No new vehicles were assigned.")
        : msg(str`Assigned ${assigned} vehicle(s) to ${this.customer.name}.`);
  }

  private openAssignModal() {
    const modal = document.createElement("assign-vehicles-modal-element") as any;
    modal.show = true;
    modal.customerId = this.customer.id;
    modal.customerName = this.customer.name;
    modal.alreadyAssigned = this.vehicles.map((v) => v.vehicleTokenId);
    modal.addEventListener("modal-closed", () => {
      if (modal.parentNode) document.body.removeChild(modal);
    });
    modal.addEventListener("vehicles-assigned", async (e: Event) => {
      const detail = (e as CustomEvent<{ result: AssignVehiclesResult }>).detail;
      this.applyResult(detail?.result);
      await this.load();
      this.notifyChanged();
    });
    document.body.appendChild(modal);
  }

  private async revoke() {
    const v = this.confirmRevoke;
    this.confirmRevoke = null;
    if (!v) return;
    const res = await this.tenancy.revokeVehicle(this.customer.id, v.vehicleTokenId);
    if (res.success) {
      this.notice = msg(str`Vehicle ${v.vin ?? v.vehicleTokenId} is no longer visible to this customer.`);
      await this.load();
      this.notifyChanged();
    } else {
      this.error = res.error || msg("Failed to revoke vehicle");
    }
  }

  private async reapply(d: GroupDrift) {
    this.reapplying = d.groupId;
    this.error = "";
    const res = await this.tenancy.reapplyGroup(this.customer.id, d.groupId);
    if (res.success) {
      this.applyResult(res.data);
      await this.load();
      this.notifyChanged();
    } else {
      this.error = res.error || msg("Failed to re-apply group");
    }
    this.reapplying = "";
  }

  private renderDrift() {
    if (this.drift.length === 0) return nothing;
    return this.drift.map(
      (d) => html`
        <div class="drift">
          <span>
            ${msg(
              str`${d.addedTokenIds.length} vehicle(s) have been added to "${d.groupName}" since you assigned it ${dayjs(d.assignedAt).fromNow()}.`,
            )}
            ${msg("They are not visible to this customer.")}
          </span>
          <button
            class="btn btn-sm ${this.reapplying === d.groupId ? "processing" : ""}"
            ?disabled=${this.reapplying !== ""}
            @click=${() => this.reapply(d)}
          >
            ${msg("RE-APPLY GROUP")}
          </button>
        </div>
      `,
    );
  }

  private renderRow(v: EntitledVehicle) {
    const description = [v.year, v.make, v.model].filter(Boolean).join(" ");
    return html`
      <tr>
        <td class="vin">${v.vin ?? "-"}</td>
        <td>${description || html`<span class="muted">-</span>`}</td>
        <td>${v.licensePlate ?? html`<span class="muted">-</span>`}</td>
        <td class="token">${v.vehicleTokenId}</td>
        <td>
          ${v.sourceGroupName
            ? html`<span class="badge">${v.sourceGroupName}</span>`
            : html`<span class="muted">${msg("assigned individually")}</span>`}
        </td>
        <td class="muted">${dayjs(v.createdAt).fromNow()}</td>
        <td>
          <button class="btn btn-sm btn-danger" @click=${() => (this.confirmRevoke = v)}>
            ${msg("REVOKE")}
          </button>
        </td>
      </tr>
    `;
  }

  render() {
    return html`
      <div
        class="section-header"
        style="display: flex; justify-content: space-between; align-items: center;"
      >
        <span>${msg("Vehicles")}</span>
        <button class="btn btn-success" @click=${this.openAssignModal}>
          ${msg("+ ASSIGN VEHICLES")}
        </button>
      </div>

      ${this.renderDrift()}
      ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
      ${this.notice
        ? html`
            <div class="alert alert-success">
              ${this.notice}
              ${this.rejected.length > 0
                ? html`
                    <ul class="rejected">
                      ${this.rejected.map(
                        (r) => html`
                          <li>
                            ${msg(
                              str`Vehicle ${r.tokenId} was skipped — ${r.heldBy} already has it.`,
                            )}
                          </li>
                        `,
                      )}
                    </ul>
                  `
                : nothing}
            </div>
          `
        : nothing}

      <div class="panel">
        <div class="panel-body">
          ${this.loading
            ? html`<div>${msg("Loading vehicles...")}</div>`
            : this.vehicles.length === 0
              ? html`
                  <div class="empty">
                    ${msg(
                      "No vehicles assigned. This customer can sign in but will see an empty fleet.",
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
                          <th>${msg("Plate")}</th>
                          <th>${msg("Token ID")}</th>
                          <th>${msg("Assigned via")}</th>
                          <th>${msg("Assigned")}</th>
                          <th>${msg("Actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.vehicles.map((v) => this.renderRow(v))}
                      </tbody>
                    </table>
                  </div>
                `}
        </div>
      </div>

      <confirm-modal-element
        .show=${this.confirmRevoke !== null}
        .title=${msg("Revoke vehicle")}
        .message=${msg(
          "This customer will stop seeing this vehicle within about a minute. Nothing on chain changes and the vehicle stays in your fleet — you can assign it again, or to a different customer.",
        )}
        .confirmText=${msg("Revoke")}
        .confirmButtonClass=${"btn-danger"}
        @modal-confirm=${this.revoke}
        @modal-cancel=${() => (this.confirmRevoke = null)}
      ></confirm-modal-element>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "customer-vehicles-panel": CustomerVehiclesPanel;
  }
}
