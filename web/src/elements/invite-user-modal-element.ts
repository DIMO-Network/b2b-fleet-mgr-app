import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import { Invitation, MemberRole, TenancyService } from "@services/tenancy-service.ts";

// Only two, and this is not a simplification of the picker in the provision
// modal — it is what the service accepts. fleet-tenancy-api coerces any role
// other than "owner" to "member" when it mints an invitation, so offering
// "admin" here would silently hand back a plain member and look like a bug in
// the console. The permissions an accepted invitation confers are derived from
// this role, not chosen: owner gets manage_members + manage_settings, member
// gets none.
const INVITE_ROLES: MemberRole[] = ["member", "owner"];

// Invite a customer user by email.
//
// The counterpart to provisioning, and the difference is the whole point:
// provisioning creates a DIMO account and wallet on someone's behalf, while an
// invitation emails them a single-use link and lets them bring their own. Use
// it when creating an account for a person would be presumptuous — which is
// most of the time for a customer's own staff.
//
// PERMISSIONS ARE NOT PICKED HERE. An invitation carries a role, and the
// membership's capabilities are derived from it when the person accepts. That
// is a deliberate difference from provisioning, where the membership is written
// immediately and the capability boxes are the thing being written. Editing
// capabilities afterwards is done from the users table once they have accepted.
//
// GROUP SCOPE IS NOT PICKED HERE EITHER, for exactly the reason provisioning
// does not offer it: scope_group_ids names groups inside the customer's own
// tenant, which the customer creates in fleet-lite and which b2b cannot
// enumerate. So an invitation grants the whole customer fleet and the customer
// narrows it themselves. The field is still sent explicitly as null —
// fleet-tenancy-api refuses an absent scope rather than guessing, precisely so
// a forgotten field cannot silently grant everything.
@customElement("invite-user-modal-element")
export class InviteUserModalElement extends LitElement {
  static styles = [
    globalStyles,
    css`
      .helper-text {
        font-size: 13px;
        color: #666;
        margin-top: 0.5rem;
      }
      .scope-readonly {
        font-size: 14px;
      }
      .scope-all {
        color: #155724;
      }
    `,
  ];

  @property({ type: Boolean }) public show = false;
  @property({ type: String }) public customerId = "";
  @property({ type: String }) public customerName = "";

  @state() private email = "";
  @state() private selectedRole: MemberRole = "member";
  @state() private processing = false;
  @state() private error = "";

  private tenancy = TenancyService.getInstance();

  private close() {
    this.show = false;
    this.dispatchEvent(new CustomEvent("modal-closed", { bubbles: true, composed: true }));
  }

  private async submit() {
    const email = this.email.trim();
    if (!email) {
      this.error = msg("An email address is required.");
      return;
    }
    this.processing = true;
    this.error = "";

    const res = await this.tenancy.createInvitation(this.customerId, {
      email,
      role: this.selectedRole,
      // Explicitly unrestricted — see the note on this class.
      scopeGroupIds: null,
    });

    this.processing = false;
    if (!res.success) {
      this.error = res.error || msg("Failed to send the invitation.");
      return;
    }
    // A create whose email did not dispatch still succeeded; the panel decides
    // how to say so, since it is the thing showing the resend button.
    this.dispatchEvent(
      new CustomEvent<{ invitation: Invitation }>("invitation-sent", {
        detail: { invitation: res.data as Invitation },
        bubbles: true,
        composed: true,
      }),
    );
    this.close();
  }

  private roleHelp() {
    return this.selectedRole === "owner"
      ? msg(
          "An owner can manage this customer's members and settings once they accept.",
        )
      : msg(
          "A member can sign in and see the fleet, but manages nothing. You can grant more from the users table after they accept.",
        );
  }

  render() {
    if (!this.show) return nothing;
    return html`
      <div class="modal-overlay" @click=${this.close}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${msg("Invite user")}</h3>
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
                ?disabled=${this.processing}
                style="width: 100%;"
              />
              <p class="helper-text">
                ${msg(
                  "We email a single-use link. They sign in with their own DIMO account and join when they accept — no account is created for them.",
                )}
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Role")}</label>
              <select
                .value=${this.selectedRole}
                @change=${(e: Event) =>
                  (this.selectedRole = (e.target as HTMLSelectElement).value as MemberRole)}
                ?disabled=${this.processing}
                style="width: 100%;"
              >
                ${INVITE_ROLES.map(
                  (r) => html`<option value=${r} ?selected=${this.selectedRole === r}>${r}</option>`,
                )}
              </select>
              <p class="helper-text">${this.roleHelp()}</p>
            </div>

            <div class="form-group">
              <label class="form-label">${msg("Group scope")}</label>
              <div class="scope-readonly">
                <span class="scope-all">${msg("All groups")}</span>
              </div>
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
              ?disabled=${this.processing || !this.email.trim()}
            >
              ${this.processing ? msg("Sending...") : msg("Send invitation")}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "invite-user-modal-element": InviteUserModalElement;
  }
}
