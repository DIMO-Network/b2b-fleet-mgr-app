import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  Capability,
  Member,
  MemberRole,
  ROLE_PRESETS,
  TenancyService,
} from "@services/tenancy-service.ts";

const ROLES: MemberRole[] = ["owner", "admin", "member"];

// Provision a customer user, or edit an existing one's access.
//
// Provisioning is lookup-or-create against accounts-api by email, then a
// membership row. The customer signs into fleet-lite with that email and lands
// in their tenant with nothing to accept — which is why this asks for an email
// and not a wallet.
//
// ROLE IS A PRESET. Picking one ticks the capability boxes and then gets out of
// the way; the boxes are what is saved and what authorization reads. Changing
// them after picking a role is normal, not a conflict — the role label just
// stops being a description of the capabilities at that point.
//
// GROUP SCOPE IS NOT SET HERE, on purpose. scope_group_ids names groups inside
// the customer's own tenant, and those groups are created and managed by the
// customer in fleet-lite — the operator does not pre-create them (Q9), and b2b
// cannot enumerate them, since it talks to kaufmann rather than fleet-lite.
// Provisioning therefore grants the whole customer fleet, and the customer
// narrows it themselves. Existing scope is shown read-only so an operator can
// see it without being offered an edit that has nothing to populate it.
@customElement("provision-user-modal-element")
export class ProvisionUserModalElement extends LitElement {
  static styles = [
    globalStyles,
    css`
      .helper-text {
        font-size: 13px;
        color: #666;
        margin-top: 0.5rem;
      }
      .caps {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .cap {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }
      .scope-readonly {
        font-size: 14px;
      }
      .scope-all {
        color: #155724;
      }
      .scope-none {
        color: #721c24;
      }
    `,
  ];

  @property({ type: Boolean }) public show = false;
  @property({ type: String }) public customerId = "";
  @property({ type: String }) public customerName = "";
  @property({ attribute: false }) public existing: Member | null = null;

  @state() private email = "";
  @state() private selectedRole: MemberRole = "member";
  @state() private permissions: string[] = [];
  @state() private processing = false;
  @state() private error = "";
  @state() private initialised = false;

  private tenancy = TenancyService.getInstance();

  private get isEdit(): boolean {
    return this.existing !== null;
  }

  // Seed from the member being edited on first render, rather than in the
  // constructor: the properties are set by the caller after construction.
  private ensureInitialised() {
    if (this.initialised) return;
    this.initialised = true;
    if (this.existing) {
      this.email = this.existing.email ?? "";
      this.selectedRole = this.existing.role;
      this.permissions = [...this.existing.permissions];
    } else {
      this.selectedRole = "member";
      this.permissions = [...ROLE_PRESETS.member];
    }
  }

  private onRoleChange(role: MemberRole) {
    this.selectedRole = role;
    this.permissions = [...ROLE_PRESETS[role]];
  }

  private toggleCapability(cap: Capability, on: boolean) {
    this.permissions = on
      ? [...this.permissions, cap]
      : this.permissions.filter((p) => p !== cap);
  }

  private renderScope() {
    const scope = this.existing?.scopeGroupIds ?? null;
    if (scope === null) {
      return html`<span class="scope-all">${msg("All of this customer's vehicles")}</span>`;
    }
    if (scope.length === 0) {
      return html`<span class="scope-none">${msg("No groups — this user sees nothing")}</span>`;
    }
    return html`${scope.map((g) => html`<span class="badge">${g}</span>`)}`;
  }

  render() {
    if (!this.show) return nothing;
    this.ensureInitialised();

    return html`
      <div class="modal-overlay" @click=${this.close}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${this.isEdit ? msg("Edit access") : msg("Provision user")}</h3>
            <button type="button" class="modal-close" @click=${this.close}>×</button>
          </div>
          <div class="modal-body">
            ${this.error
              ? html`<div class="alert alert-error" style="margin-bottom: 1rem;">${this.error}</div>`
              : nothing}

            <div class="form-group">
              <label class="form-label">${msg("Email")}</label>
              <input
                type="email"
                .placeholder=${msg("person@customer.com")}
                .value=${this.email}
                @input=${(e: InputEvent) => (this.email = (e.target as HTMLInputElement).value)}
                ?disabled=${this.processing || this.isEdit}
                style="width: 100%;"
              />
              <p class="helper-text">
                ${this.isEdit
                  ? msg("Email cannot be changed here — remove and re-provision instead.")
                  : msg(
                      "We look this up with DIMO accounts and create an account if there isn't one. They sign into fleet-lite with it; there is no invitation to accept.",
                    )}
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Role")}</label>
              <select
                .value=${this.selectedRole}
                @change=${(e: Event) =>
                  this.onRoleChange((e.target as HTMLSelectElement).value as MemberRole)}
                ?disabled=${this.processing}
                style="width: 100%;"
              >
                ${ROLES.map(
                  (r) => html`<option value=${r} ?selected=${this.selectedRole === r}>${r}</option>`,
                )}
              </select>
              <p class="helper-text">
                ${msg(
                  "A label, and a preset for the permissions below. Permissions are what actually get checked.",
                )}
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Permissions")}</label>
              <div class="caps">
                ${CAPABILITIES.map(
                  (cap) => html`
                    <label class="cap">
                      <input
                        type="checkbox"
                        .checked=${this.permissions.includes(cap)}
                        @change=${(e: Event) =>
                          this.toggleCapability(cap, (e.target as HTMLInputElement).checked)}
                        ?disabled=${this.processing}
                      />
                      <span>${CAPABILITY_LABELS[cap]}</span>
                    </label>
                  `,
                )}
              </div>
              <p class="helper-text">
                ${msg(
                  "A user with no permissions can still sign in and see the fleet — permissions gate management actions.",
                )}
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Group scope")}</label>
              <div class="scope-readonly">${this.renderScope()}</div>
              <p class="helper-text">
                ${msg(
                  "Set by the customer in fleet-lite, using their own fleet groups. You control which vehicles the customer has; they decide who among their people sees which.",
                )}
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
              ?disabled=${this.processing || (!this.isEdit && !this.email.trim())}
            >
              ${this.processing
                ? msg("Saving...")
                : this.isEdit
                  ? msg("Save")
                  : msg("Provision")}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private close() {
    if (this.processing) return;
    this.show = false;
    this.error = "";
    this.dispatchEvent(new CustomEvent("modal-closed", { bubbles: true, composed: true }));
  }

  private async submit() {
    this.processing = true;
    this.error = "";
    try {
      const res = this.isEdit
        ? await this.tenancy.updateMember(this.customerId, this.existing!.wallet, {
            role: this.selectedRole,
            permissions: this.permissions,
          })
        : await this.tenancy.provisionMember(this.customerId, {
            email: this.email.trim(),
            role: this.selectedRole,
            permissions: this.permissions,
            // Unrestricted: the customer narrows this themselves in fleet-lite.
            scopeGroupIds: null,
          });

      if (res.success) {
        this.show = false;
        this.dispatchEvent(
          new CustomEvent("member-saved", {
            detail: { member: res.data, created: !this.isEdit },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.error = res.error || msg("Failed to save access");
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
    "provision-user-modal-element": ProvisionUserModalElement;
  }
}
