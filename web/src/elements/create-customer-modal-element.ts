import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import { TenancyService } from "@services/tenancy-service.ts";

// Create a customer tenant under the current operator.
//
// Deliberately short. A customer needs a name; everything else — users,
// vehicles, settings — is configured on the detail screen afterwards, and
// nothing about the tenant is on chain, so there is no signing step and no
// irreversible decision being taken here.
//
// No DIMO credential field: a managed customer holds none by default and reads
// data under the operator's developer license. A customer that genuinely needs
// its own license is the exception, and belongs on the settings tab rather than
// in the everyday create path.
@customElement("create-customer-modal-element")
export class CreateCustomerModalElement extends LitElement {
  static styles = [
    globalStyles,
    css`
      .helper-text {
        font-size: 13px;
        color: #666;
        margin-top: 0.5rem;
      }
    `,
  ];

  @property({ type: Boolean }) public show = false;

  @state() private name = "";
  @state() private externalRef = "";
  @state() private processing = false;
  @state() private error = "";

  private tenancy = TenancyService.getInstance();

  render() {
    if (!this.show) return nothing;

    return html`
      <div class="modal-overlay" @click=${this.close}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${msg("New Customer")}</h3>
            <button type="button" class="modal-close" @click=${this.close}>×</button>
          </div>
          <div class="modal-body">
            ${this.error
              ? html`<div class="alert alert-error" style="margin-bottom: 1rem;">${this.error}</div>`
              : nothing}

            <div class="form-group">
              <label class="form-label">${msg("Name")}</label>
              <input
                type="text"
                .placeholder=${msg("Customer business name")}
                .value=${this.name}
                @input=${(e: InputEvent) => (this.name = (e.target as HTMLInputElement).value)}
                @keydown=${this.onKeydown}
                ?disabled=${this.processing}
                style="width: 100%;"
              />
              <p class="helper-text">
                ${msg("This is what the customer sees when they log into fleet-lite.")}
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Your reference")} (${msg("optional")})</label>
              <input
                type="text"
                .placeholder=${msg("e.g. your own account number")}
                .value=${this.externalRef}
                @input=${(e: InputEvent) =>
                  (this.externalRef = (e.target as HTMLInputElement).value)}
                @keydown=${this.onKeydown}
                ?disabled=${this.processing}
                style="width: 100%;"
              />
              <p class="helper-text">
                ${msg("Only shown to you — useful for matching this customer to your own records.")}
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click=${this.close}
              ?disabled=${this.processing}
            >
              ${msg("Cancel")}
            </button>
            <button
              type="button"
              class="btn btn-primary ${this.processing ? "processing" : ""}"
              @click=${this.submit}
              ?disabled=${this.processing || !this.name.trim()}
            >
              ${this.processing ? msg("Creating...") : msg("Create")}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && this.name.trim() && !this.processing) {
      this.submit();
    }
  }

  private close() {
    if (this.processing) return;
    this.show = false;
    this.error = "";
    this.name = "";
    this.externalRef = "";
    this.dispatchEvent(new CustomEvent("modal-closed", { bubbles: true, composed: true }));
  }

  private async submit() {
    const name = this.name.trim();
    if (!name) return;

    this.processing = true;
    this.error = "";
    try {
      const res = await this.tenancy.createCustomer({
        name,
        externalRef: this.externalRef.trim() || undefined,
      });
      if (res.success) {
        this.show = false;
        this.dispatchEvent(
          new CustomEvent("customer-created", {
            detail: { customer: res.data },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.error = res.error || msg("Failed to create customer");
      }
    } catch (e: any) {
      this.error = e?.message || msg("An unexpected error occurred");
    } finally {
      this.processing = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "create-customer-modal-element": CreateCustomerModalElement;
  }
}
