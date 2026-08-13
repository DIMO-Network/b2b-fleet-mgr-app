import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { globalStyles } from "../global-styles.ts";
import {
  CAPABILITY_LABELS,
  Capability,
  CustomerTenant,
  Member,
  TenancyService,
} from "@services/tenancy-service.ts";
import "./provision-user-modal-element.ts";
import "./confirm-modal-element.ts";

dayjs.extend(relativeTime);

// The customer's users, managed on their behalf by the operator.
//
// Two things this screen is careful about:
//
// PERMISSIONS, NOT ROLE. The badges show permissions because permissions are
// what every authorization check reads. Role is displayed as a label and used
// as a preset when adding someone — it is never itself the gate.
//
// SCOPE IS THREE-VALUED. "All groups" (null), a list, and "No groups" (empty)
// are different answers and the empty case is the restrictive one. Rendering
// empty and null the same way is the mistake that once handed 131 memberships
// an entire fleet, so they are rendered distinctly here.
@customElement("customer-users-panel")
export class CustomerUsersPanel extends LitElement {
  static styles = [
    globalStyles,
    css`
      .wallet {
        font-family: monospace;
        font-size: 13px;
        color: #444;
      }
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
      .provisioned {
        font-size: 12px;
        color: #666;
      }
      .actions {
        white-space: nowrap;
      }
    `,
  ];

  @property({ type: Object }) customer!: CustomerTenant;

  @state() private members: Member[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private notice = "";
  @state() private confirmRemove: Member | null = null;

  private tenancy = TenancyService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  private async load() {
    this.loading = true;
    this.error = "";
    const res = await this.tenancy.listMembers(this.customer.id);
    if (res.success) {
      this.members = res.data ?? [];
    } else {
      this.error = res.error || msg("Failed to load users");
    }
    this.loading = false;
  }

  private notifyChanged() {
    this.dispatchEvent(new CustomEvent("customer-changed", { bubbles: true, composed: true }));
  }

  private openProvisionModal(existing?: Member) {
    const modal = document.createElement("provision-user-modal-element") as any;
    modal.show = true;
    modal.customerId = this.customer.id;
    modal.customerName = this.customer.name;
    modal.existing = existing ?? null;
    modal.addEventListener("modal-closed", () => {
      if (modal.parentNode) document.body.removeChild(modal);
    });
    modal.addEventListener("member-saved", async (e: Event) => {
      const detail = (e as CustomEvent<{ member: Member; created: boolean }>).detail;
      this.notice = detail?.created
        ? msg(str`${detail.member.email} can now sign into fleet-lite as ${this.customer.name}.`)
        : msg("Access updated.");
      await this.load();
      this.notifyChanged();
    });
    document.body.appendChild(modal);
  }

  private async removeMember() {
    const m = this.confirmRemove;
    this.confirmRemove = null;
    if (!m) return;
    const res = await this.tenancy.removeMember(this.customer.id, m.wallet);
    if (res.success) {
      this.notice = msg(str`${m.email ?? m.wallet} no longer has access.`);
      await this.load();
      this.notifyChanged();
    } else {
      this.error = res.error || msg("Failed to remove user");
    }
  }

  private renderScope(m: Member) {
    if (m.scopeGroupIds === null) {
      return html`<span class="scope-all">${msg("All groups")}</span>`;
    }
    if (m.scopeGroupIds.length === 0) {
      return html`<span class="scope-none">${msg("No groups")}</span>`;
    }
    return html`${m.scopeGroupIds.map((g) => html`<span class="badge">${g}</span>`)}`;
  }

  private renderRow(m: Member) {
    return html`
      <tr>
        <td>
          ${m.email ?? html`<span class="muted">${msg("no email")}</span>`}
          ${m.grantedByTenantId
            ? html`<div class="provisioned">${msg("provisioned by you")}</div>`
            : nothing}
        </td>
        <td class="wallet">${m.wallet}</td>
        <td>${m.role}</td>
        <td>
          ${m.permissions.length === 0
            ? html`<span class="muted">${msg("none")}</span>`
            : m.permissions.map(
                (p) =>
                  html`<span class="badge"
                    >${CAPABILITY_LABELS[p as Capability] ?? p}</span
                  >`,
              )}
        </td>
        <td>${this.renderScope(m)}</td>
        <td class="muted">
          ${m.lastLoginAt ? dayjs(m.lastLoginAt).fromNow() : msg("Never")}
        </td>
        <td class="actions">
          <button class="btn btn-sm" @click=${() => this.openProvisionModal(m)}>
            ${msg("EDIT ACCESS")}
          </button>
          <button class="btn btn-sm btn-danger" @click=${() => (this.confirmRemove = m)}>
            ${msg("REMOVE")}
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
        <span>${msg("Users")}</span>
        <button class="btn btn-success" @click=${() => this.openProvisionModal()}>
          ${msg("+ PROVISION USER")}
        </button>
      </div>

      ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
      ${this.notice ? html`<div class="alert alert-success">${this.notice}</div>` : nothing}

      <div class="panel">
        <div class="panel-body">
          ${this.loading
            ? html`<div>${msg("Loading users...")}</div>`
            : this.members.length === 0
              ? html`
                  <div class="empty">
                    ${msg(
                      "No users yet. Provision one by email and they can sign straight into fleet-lite — no invitation to accept.",
                    )}
                  </div>
                `
              : html`
                  <div class="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>${msg("Email")}</th>
                          <th>${msg("Wallet")}</th>
                          <th>${msg("Role")}</th>
                          <th>${msg("Permissions")}</th>
                          <th>${msg("Group scope")}</th>
                          <th>${msg("Last login")}</th>
                          <th>${msg("Actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.members.map((m) => this.renderRow(m))}
                      </tbody>
                    </table>
                  </div>
                `}
        </div>
      </div>

      <confirm-modal-element
        .show=${this.confirmRemove !== null}
        .title=${msg("Remove user")}
        .message=${msg(
          "Remove this user's access to this customer? They keep their DIMO account and can be provisioned again later.",
        )}
        .confirmText=${msg("Remove")}
        .confirmButtonClass=${"btn-danger"}
        @modal-confirm=${this.removeMember}
        @modal-cancel=${() => (this.confirmRemove = null)}
      ></confirm-modal-element>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "customer-users-panel": CustomerUsersPanel;
  }
}
