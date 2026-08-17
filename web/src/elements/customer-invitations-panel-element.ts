import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { globalStyles } from "../global-styles.ts";
import { CustomerTenant, Invitation, TenancyService } from "@services/tenancy-service.ts";
import "./invite-user-modal-element.ts";
import "./confirm-modal-element.ts";

dayjs.extend(relativeTime);

// Email invitations to a customer tenant — the other way a person gets in.
//
// Provisioning (the panel above this one) creates a DIMO account and wallet on
// someone's behalf; an invitation lets them bring their own. Both exist on
// purpose, and the difference is what the empty state explains, because an
// operator looking at two "add user" buttons deserves to know which to press.
//
// Three things this screen is careful about:
//
// THE EMAIL IS COURTESY, THE RECORD IS AUTHORITATIVE. A create that could not
// dispatch still succeeded — the invitation exists and can be resent — so it
// is shown as a warning with the resend to hand, never as a failure.
//
// A RESEND KILLS THE PREVIOUS LINK. It mints a fresh token, so anyone holding
// the old email can no longer accept. The confirmation says so outright rather
// than describing it as "send again".
//
// SCOPE IS THREE-VALUED, and it becomes the member's scope verbatim on accept.
// "All groups" (null) and "No groups" (empty) are opposites and are rendered
// distinctly, the same way the users panel does.
@customElement("customer-invitations-panel")
export class CustomerInvitationsPanel extends LitElement {
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
      .scope-all {
        color: #155724;
      }
      .scope-none {
        color: #721c24;
      }
      .actions {
        white-space: nowrap;
      }
      .status-pending {
        color: #856404;
      }
      .status-accepted {
        color: #155724;
      }
      .status-revoked,
      .status-expired {
        color: #666;
      }
      .delivery-bounced {
        color: #721c24;
      }
      .delivery-none {
        color: #856404;
      }
      .sub {
        font-size: 12px;
        color: #666;
      }
    `,
  ];

  @property({ type: Object }) customer!: CustomerTenant;

  @state() private invitations: Invitation[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private notice = "";
  @state() private warning = "";
  @state() private confirmRevoke: Invitation | null = null;
  @state() private confirmResend: Invitation | null = null;

  private tenancy = TenancyService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  private async load() {
    this.loading = true;
    this.error = "";
    const res = await this.tenancy.listInvitations(this.customer.id);
    if (res.success) {
      this.invitations = res.data ?? [];
    } else {
      this.error = res.error || msg("Failed to load invitations");
    }
    this.loading = false;
  }

  private openInviteModal() {
    const modal = document.createElement("invite-user-modal-element") as any;
    modal.show = true;
    modal.customerId = this.customer.id;
    modal.customerName = this.customer.name;
    modal.addEventListener("modal-closed", () => {
      if (modal.parentNode) document.body.removeChild(modal);
    });
    modal.addEventListener("invitation-sent", async (e: Event) => {
      const detail = (e as CustomEvent<{ invitation: Invitation }>).detail;
      const inv = detail?.invitation;
      this.notice = "";
      this.warning = "";
      // emailSent === false is a partial success: the invitation is real and
      // resendable. Reporting it as an error would have the operator send a
      // second one.
      if (inv && inv.emailSent === false) {
        this.warning = msg(
          str`${inv.email} was invited, but the email could not be sent. Use RESEND once mail delivery is working.`,
        );
      } else if (inv) {
        this.notice = msg(str`Invitation sent to ${inv.email}.`);
      }
      await this.load();
    });
    document.body.appendChild(modal);
  }

  private async revoke() {
    const inv = this.confirmRevoke;
    this.confirmRevoke = null;
    if (!inv) return;
    const res = await this.tenancy.revokeInvitation(this.customer.id, inv.id);
    if (res.success) {
      this.notice = msg(str`The invitation for ${inv.email} no longer works.`);
      await this.load();
    } else {
      this.error = res.error || msg("Failed to revoke invitation");
    }
  }

  private async resend() {
    const inv = this.confirmResend;
    this.confirmResend = null;
    if (!inv) return;
    const res = await this.tenancy.resendInvitation(this.customer.id, inv.id);
    if (res.success) {
      this.notice = "";
      this.warning = "";
      if (res.data && res.data.emailSent === false) {
        this.warning = msg(
          str`A new link was created for ${inv.email}, but the email could not be sent.`,
        );
      } else {
        this.notice = msg(str`A new invitation was sent to ${inv.email}. The previous link no longer works.`);
      }
      await this.load();
    } else {
      this.error = res.error || msg("Failed to resend invitation");
    }
  }

  // Expiry is only meaningful while an invitation is still pending — an
  // accepted one that has "expired" is just an old accepted invitation.
  private isExpired(inv: Invitation): boolean {
    return inv.status === "pending" && dayjs(inv.expiresAt).isBefore(dayjs());
  }

  private renderStatus(inv: Invitation) {
    if (this.isExpired(inv)) {
      return html`<span class="status-expired"
        >${msg("Expired")} <span class="sub">${dayjs(inv.expiresAt).fromNow()}</span></span
      >`;
    }
    switch (inv.status) {
      case "accepted":
        return html`<span class="status-accepted"
          >${msg("Accepted")}
          ${inv.acceptedAt
            ? html`<span class="sub">${dayjs(inv.acceptedAt).fromNow()}</span>`
            : nothing}</span
        >`;
      case "revoked":
        return html`<span class="status-revoked">${msg("Revoked")}</span>`;
      default:
        return html`<span class="status-pending"
          >${msg("Pending")}
          <span class="sub">${msg("expires")} ${dayjs(inv.expiresAt).fromNow()}</span></span
        >`;
    }
  }

  // Delivery is advisory and separate from status: an invitation can be
  // perfectly valid while its email bounced, and that is exactly the case the
  // operator needs to see — the person is never going to accept.
  private renderDelivery(inv: Invitation) {
    if (!inv.emailStatus) {
      return html`<span class="delivery-none">${msg("Not sent")}</span>`;
    }
    const labels: Record<string, string> = {
      sent: msg("Sent"),
      delivered: msg("Delivered"),
      opened: msg("Opened"),
      bounced: msg("Bounced"),
    };
    const label = labels[inv.emailStatus] ?? inv.emailStatus;
    if (inv.emailStatus === "bounced") {
      return html`<span class="delivery-bounced" title=${inv.emailStatusDetail ?? ""}
        >${label}</span
      >`;
    }
    return html`<span class="muted">${label}</span>`;
  }

  private renderScope(inv: Invitation) {
    if (inv.scopeGroupIds === null) {
      return html`<span class="scope-all">${msg("All groups")}</span>`;
    }
    if (inv.scopeGroupIds.length === 0) {
      return html`<span class="scope-none">${msg("No groups")}</span>`;
    }
    return html`${inv.scopeGroupIds.map((g) => html`<span class="badge">${g}</span>`)}`;
  }

  private renderRow(inv: Invitation) {
    // Only a live invitation can be revoked or resent. An accepted one is
    // history, and a revoked or expired one is already dead.
    const actionable = inv.status === "pending" && !this.isExpired(inv);
    return html`
      <tr>
        <td>
          ${inv.email}
          ${inv.createdByTenantId
            ? html`<div class="sub">${msg("sent by you")}</div>`
            : html`<div class="sub">${msg("sent by the customer")}</div>`}
        </td>
        <td>${inv.role}</td>
        <td>${this.renderScope(inv)}</td>
        <td>${this.renderStatus(inv)}</td>
        <td>${this.renderDelivery(inv)}</td>
        <td class="muted">${dayjs(inv.createdAt).fromNow()}</td>
        <td class="actions">
          ${actionable
            ? html`
                <button class="btn btn-sm" @click=${() => (this.confirmResend = inv)}>
                  ${msg("RESEND")}
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  @click=${() => (this.confirmRevoke = inv)}
                >
                  ${msg("REVOKE")}
                </button>
              `
            : html`<span class="muted">—</span>`}
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
        <span>${msg("Invitations")}</span>
        <button class="btn" @click=${() => this.openInviteModal()}>
          ${msg("+ INVITE BY EMAIL")}
        </button>
      </div>

      ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
      ${this.warning ? html`<div class="alert alert-error">${this.warning}</div>` : nothing}
      ${this.notice ? html`<div class="alert alert-success">${this.notice}</div>` : nothing}

      <div class="panel">
        <div class="panel-body">
          ${this.loading
            ? html`<div>${msg("Loading invitations...")}</div>`
            : this.invitations.length === 0
              ? html`
                  <div class="empty">
                    ${msg(
                      "No invitations. Inviting sends an email and lets the person sign in with their own DIMO account — use it when you don't want to create one on their behalf.",
                    )}
                  </div>
                `
              : html`
                  <div class="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>${msg("Email")}</th>
                          <th>${msg("Role")}</th>
                          <th>${msg("Group scope")}</th>
                          <th>${msg("Status")}</th>
                          <th>${msg("Delivery")}</th>
                          <th>${msg("Sent")}</th>
                          <th>${msg("Actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.invitations.map((i) => this.renderRow(i))}
                      </tbody>
                    </table>
                  </div>
                `}
        </div>
      </div>

      <confirm-modal-element
        .show=${this.confirmRevoke !== null}
        .title=${msg("Revoke invitation")}
        .message=${msg(
          "Revoke this invitation? The link in the email stops working immediately. You can invite the same address again afterwards.",
        )}
        .confirmText=${msg("Revoke")}
        .confirmButtonClass=${"btn-danger"}
        @modal-confirm=${this.revoke}
        @modal-cancel=${() => (this.confirmRevoke = null)}
      ></confirm-modal-element>

      <confirm-modal-element
        .show=${this.confirmResend !== null}
        .title=${msg("Resend invitation")}
        .message=${msg(
          "Send a new invitation email? This creates a new link and the one already sent stops working.",
        )}
        .confirmText=${msg("Resend")}
        @modal-confirm=${this.resend}
        @modal-cancel=${() => (this.confirmResend = null)}
      ></confirm-modal-element>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "customer-invitations-panel": CustomerInvitationsPanel;
  }
}
