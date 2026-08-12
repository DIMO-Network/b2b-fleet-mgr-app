import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import { CustomerTenant, TenancyService } from "@services/tenancy-service.ts";
import "./confirm-modal-element.ts";

// Customer tenant settings.
//
// Suspending is the blunt instrument and revoking vehicles is the precise one:
// suspend stops the customer's users signing in at all while keeping every
// assignment intact, so resuming restores the tenant exactly. Both are database
// changes — nothing here touches the chain, and the operator keeps ownership of
// every vehicle throughout.
//
// There is no DIMO credential field. A managed customer holds no license and
// reads data under the operator's, which is the whole point of the shared
// license model; a customer that needs its own is rare enough to be handled
// deliberately rather than offered as a routine setting.
@customElement("customer-settings-panel")
export class CustomerSettingsPanel extends LitElement {
  static styles = [
    globalStyles,
    css`
      .field {
        max-width: 520px;
      }
      .helper-text {
        font-size: 13px;
        color: #666;
        margin-top: 0.5rem;
      }
      .danger-zone {
        border-color: #721c24;
      }
      .danger-zone .panel-header {
        background: #f8d7da;
        color: #721c24;
        border-bottom-color: #721c24;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .muted {
        color: #666;
      }
    `,
  ];

  @property({ type: Object }) customer!: CustomerTenant;

  @state() private name = "";
  @state() private externalRef = "";
  @state() private saving = false;
  @state() private error = "";
  @state() private notice = "";
  @state() private confirmStatusChange = false;
  @state() private seeded = false;

  private tenancy = TenancyService.getInstance();

  private seed() {
    if (this.seeded || !this.customer) return;
    this.seeded = true;
    this.name = this.customer.name;
    this.externalRef = this.customer.externalRef ?? "";
  }

  private get dirty(): boolean {
    return (
      this.name.trim() !== this.customer.name ||
      this.externalRef.trim() !== (this.customer.externalRef ?? "")
    );
  }

  private notifyChanged() {
    this.dispatchEvent(new CustomEvent("customer-changed", { bubbles: true, composed: true }));
  }

  private async save() {
    this.saving = true;
    this.error = "";
    this.notice = "";
    const res = await this.tenancy.updateCustomer(this.customer.id, {
      name: this.name.trim(),
      externalRef: this.externalRef.trim() || null,
    });
    if (res.success) {
      this.notice = msg("Settings saved.");
      this.notifyChanged();
    } else {
      this.error = res.error || msg("Failed to save settings");
    }
    this.saving = false;
  }

  private async toggleStatus() {
    this.confirmStatusChange = false;
    const next = this.customer.status === "active" ? "suspended" : "active";
    this.saving = true;
    this.error = "";
    const res = await this.tenancy.updateCustomer(this.customer.id, { status: next });
    if (res.success) {
      this.notice =
        next === "suspended"
          ? msg("Customer suspended. Their users can no longer sign in.")
          : msg("Customer resumed.");
      this.notifyChanged();
    } else {
      this.error = res.error || msg("Failed to change status");
    }
    this.saving = false;
  }

  render() {
    this.seed();
    const suspended = this.customer.status === "suspended";

    return html`
      <div class="section-header">${msg("Settings")}</div>

      ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
      ${this.notice ? html`<div class="alert alert-success">${this.notice}</div>` : nothing}

      <div class="panel">
        <div class="panel-header">${msg("Details")}</div>
        <div class="panel-body">
          <div class="form-group field">
            <label class="form-label">${msg("Name")}</label>
            <input
              type="text"
              .value=${this.name}
              @input=${(e: InputEvent) => (this.name = (e.target as HTMLInputElement).value)}
              ?disabled=${this.saving}
              style="width: 100%;"
            />
            <p class="helper-text">${msg("What the customer sees in fleet-lite.")}</p>
          </div>

          <div class="form-group field">
            <label class="form-label">${msg("Your reference")}</label>
            <input
              type="text"
              .value=${this.externalRef}
              @input=${(e: InputEvent) => (this.externalRef = (e.target as HTMLInputElement).value)}
              ?disabled=${this.saving}
              style="width: 100%;"
            />
            <p class="helper-text">${msg("Only visible to you.")}</p>
          </div>

          <button
            class="btn btn-primary ${this.saving ? "processing" : ""}"
            @click=${this.save}
            ?disabled=${this.saving || !this.dirty || !this.name.trim()}
          >
            ${this.saving ? msg("Saving...") : msg("Save")}
          </button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">${msg("How this customer sees data")}</div>
        <div class="panel-body">
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">${msg("Vehicle access")}</span>
              <span class="detail-value">
                ${this.customer.entitlementMode === "explicit"
                  ? msg("Only vehicles you assign on the Vehicles tab")
                  : msg("Everything their own DIMO license is privileged on")}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">${msg("DIMO credentials")}</span>
              <span class="detail-value">
                ${this.customer.parentTenantId
                  ? msg("Uses your developer license")
                  : msg("Has its own developer license")}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">${msg("Created")}</span>
              <span class="detail-value muted">
                ${new Date(this.customer.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel danger-zone">
        <div class="panel-header">${suspended ? msg("Suspended") : msg("Suspend access")}</div>
        <div class="panel-body">
          <div class="row">
            <span>
              ${suspended
                ? msg(
                    "This customer's users cannot sign in. Their vehicle assignments and users are intact.",
                  )
                : msg(
                    "Stops this customer's users signing in, without changing anything they own. Assignments are kept, so resuming restores everything.",
                  )}
            </span>
            <button
              class="btn ${suspended ? "btn-success" : "btn-danger"}"
              @click=${() => (this.confirmStatusChange = true)}
              ?disabled=${this.saving}
            >
              ${suspended ? msg("RESUME") : msg("SUSPEND")}
            </button>
          </div>
        </div>
      </div>

      <confirm-modal-element
        .show=${this.confirmStatusChange}
        .title=${suspended ? msg("Resume customer") : msg("Suspend customer")}
        .message=${suspended
          ? msg("Their users will be able to sign in again within about a minute.")
          : msg(
              str`Suspend ${this.customer.name}? Their users will lose access within about a minute. Nothing is deleted.`,
            )}
        .confirmText=${suspended ? msg("Resume") : msg("Suspend")}
        .confirmButtonClass=${suspended ? "btn-success" : "btn-danger"}
        @modal-confirm=${this.toggleStatus}
        @modal-cancel=${() => (this.confirmStatusChange = false)}
      ></confirm-modal-element>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "customer-settings-panel": CustomerSettingsPanel;
  }
}
