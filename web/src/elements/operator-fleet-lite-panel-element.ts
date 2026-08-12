import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import { CustomerTenant, TenancyService } from "@services/tenancy-service.ts";

// Roughly where fleet-lite's map-first UI starts to struggle. A ~400-vehicle
// fleet has been tested: noticeably slower, still usable. Nobody is optimising
// for more, so the console nudges rather than blocks.
const FLEET_LITE_SOFT_LIMIT = 500;

// Whether the operator's own tenant appears as a selectable fleet in
// fleet-lite.
//
// On by default, which is right for a small operator and wrong for a large one.
// Turning it off is a UI decision only — fleet-lite still syncs the operator's
// whole privileged set either way, because every customer's slice is computed
// from it. So this makes the operator's own fleet stop being *served*, not stop
// being *held*, and is not a fix for backend load.
//
// A finer lever exists and is usually the better answer at scale: a member's
// group scope can restrict them to a few fleet groups inside fleet-lite without
// hiding the tenant from everyone.
@customElement("operator-fleet-lite-panel")
export class OperatorFleetLitePanel extends LitElement {
  static styles = [
    globalStyles,
    css`
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .helper-text {
        font-size: 13px;
        color: #666;
        margin-top: 8px;
        max-width: 60ch;
      }
      .nudge {
        background: #fff3cd;
        border: 1px solid #856404;
        color: #856404;
        padding: 10px 14px;
        margin-top: 12px;
        font-size: 14px;
      }
      .state {
        font-weight: bold;
      }
    `,
  ];

  @state() private operator?: CustomerTenant;
  @state() private loading = false;
  @state() private saving = false;
  @state() private error = "";

  private tenancy = TenancyService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    this.loading = true;
    const res = await this.tenancy.getOperator();
    if (res.success) this.operator = res.data;
    else this.error = res.error || msg("Failed to load operator settings");
    this.loading = false;
  }

  private async toggle() {
    if (!this.operator) return;
    this.saving = true;
    this.error = "";
    const res = await this.tenancy.updateOperator({
      fleetLiteEnabled: !this.operator.fleetLiteEnabled,
    });
    if (res.success) this.operator = res.data;
    else this.error = res.error || msg("Failed to save");
    this.saving = false;
  }

  render() {
    if (this.loading) {
      return html`
        <div class="panel">
          <div class="panel-header">${msg("fleet-lite visibility")}</div>
          <div class="panel-body">${msg("Loading…")}</div>
        </div>
      `;
    }
    const op = this.operator;
    if (!op) {
      return this.error
        ? html`<div class="panel"><div class="panel-body">
            <div class="alert alert-error">${this.error}</div>
          </div></div>`
        : nothing;
    }

    const overSoftLimit = op.vehicleCount > FLEET_LITE_SOFT_LIMIT;

    return html`
      <div class="panel">
        <div class="panel-header">${msg("fleet-lite visibility")}</div>
        <div class="panel-body">
          ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}

          <div class="row">
            <span>
              ${msg("Your own fleet is")}
              <span class="state">
                ${op.fleetLiteEnabled ? msg("visible in fleet-lite") : msg("hidden from fleet-lite")}
              </span>
            </span>
            <button
              class="btn ${this.saving ? "processing" : ""}"
              @click=${this.toggle}
              ?disabled=${this.saving}
            >
              ${op.fleetLiteEnabled ? msg("HIDE FROM FLEET-LITE") : msg("SHOW IN FLEET-LITE")}
            </button>
          </div>

          <p class="helper-text">
            ${msg(
              "This controls whether your operator tenant is offered as a fleet to open in fleet-lite. It does not affect your customers, who always see their own tenant there, and it does not affect this app.",
            )}
          </p>

          ${overSoftLimit && op.fleetLiteEnabled
            ? html`
                <div class="nudge">
                  ${msg(
                    str`Your fleet is ${op.vehicleCount} vehicles. fleet-lite is tuned for fewer than ${FLEET_LITE_SOFT_LIMIT} and its map view gets slow beyond that — this app is the better tool at your size. Consider hiding your fleet from fleet-lite, or scoping individual people to a few fleet groups instead.`,
                  )}
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "operator-fleet-lite-panel": OperatorFleetLitePanel;
  }
}
