import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { ApiService } from "../services/api-service.ts";

interface UserProfile {
  wallet: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  business_name: string;
  government_id_type: string;
  government_id_number: string;
  created_at: string;
  updated_at: string;
}

@customElement("user-detail-view")
export class UserDetailView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .detail-panel {
        max-width: 700px;
      }
      .field-row {
        display: flex;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid #eee;
        gap: 16px;
      }
      .field-row:last-child {
        border-bottom: none;
      }
      .field-label {
        width: 200px;
        flex-shrink: 0;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #666;
      }
      .field-value {
        flex: 1;
        font-size: 16px;
      }
      .field-value input {
        width: 100%;
      }
      .field-value.readonly {
        color: #333;
      }
      .field-value.monospace {
        font-family: monospace;
        font-size: 14px;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }
    `,
  ];

  @property({ type: String }) wallet = "";

  @state() private profile?: UserProfile;
  @state() private loading = true;
  @state() private editing = false;
  @state() private saving = false;
  @state() private errorMessage = "";
  @state() private successMessage = "";

  // editable field state
  @state() private firstName = "";
  @state() private lastName = "";
  @state() private phone = "";
  @state() private businessName = "";
  @state() private govIdType = "";
  @state() private govIdNumber = "";

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchProfile();
  }

  private async fetchProfile() {
    this.loading = true;
    this.errorMessage = "";
    try {
      const result = await ApiService.getInstance().callApi<UserProfile>(
        "GET",
        `/user-profiles/${this.wallet}`,
        null,
        true,
        true
      );
      if (result.success && result.data) {
        this.profile = result.data;
        this.syncEditFields(result.data);
      } else {
        this.errorMessage = result.error || "Failed to load user profile.";
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to fetch user profile:", error);
      this.errorMessage = "An unexpected error occurred.";
    } finally {
      this.loading = false;
    }
  }

  private syncEditFields(p: UserProfile) {
    this.firstName = p.first_name || "";
    this.lastName = p.last_name || "";
    this.phone = p.phone || "";
    this.businessName = p.business_name || "";
    this.govIdType = p.government_id_type || "";
    this.govIdNumber = p.government_id_number || "";
  }

  private handleEdit() {
    if (this.profile) this.syncEditFields(this.profile);
    this.editing = true;
    this.successMessage = "";
    this.errorMessage = "";
  }

  private handleCancel() {
    if (this.profile) this.syncEditFields(this.profile);
    this.editing = false;
    this.errorMessage = "";
  }

  private async handleSave() {
    this.saving = true;
    this.errorMessage = "";
    this.successMessage = "";
    try {
      const result = await ApiService.getInstance().callApi(
        "PATCH",
        `/user-profiles/${this.wallet}`,
        {
          first_name: this.firstName,
          last_name: this.lastName,
          phone: this.phone,
          business_name: this.businessName,
          government_id_type: this.govIdType,
          government_id_number: this.govIdNumber,
        },
        true,
        true
      );
      if (result.success) {
        this.successMessage = "Profile updated successfully.";
        this.editing = false;
        await this.fetchProfile();
      } else {
        this.errorMessage = result.error || "Failed to update profile.";
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update user profile:", error);
      this.errorMessage = "An unexpected error occurred.";
    } finally {
      this.saving = false;
    }
  }

  private formatDate(iso: string): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleString();
  }

  private renderField(
    label: string,
    value: string,
    editValue: string,
    onInput: (v: string) => void,
    editable = true,
    monospace = false
  ) {
    return html`
      <div class="field-row">
        <div class="field-label">${label}</div>
        <div class="field-value ${monospace ? "monospace" : ""} ${!editable || !this.editing ? "readonly" : ""}">
          ${editable && this.editing
            ? html`<input
                type="text"
                .value=${editValue}
                @input=${(e: Event) => onInput((e.target as HTMLInputElement).value)}
                ?disabled=${this.saving}
              />`
            : html`${value || "-"}`}
        </div>
      </div>
    `;
  }

  render() {
    if (this.loading) {
      return html`
        <div class="page active">
          <div class="panel detail-panel">
            <div class="panel-body">Loading user profile...</div>
          </div>
        </div>
      `;
    }

    const p = this.profile;

    return html`
      <div class="page active">
        <div
          class="section-header"
          style="display: flex; justify-content: space-between; align-items: center;"
        >
          <span>User Profile</span>
          <button class="btn" @click=${() => (window.location.hash = "/users")}>
            BACK TO USERS
          </button>
        </div>

        <div class="panel detail-panel">
          <div class="panel-body">
            ${this.errorMessage
              ? html`<div class="alert alert-error">${this.errorMessage}</div>`
              : ""}
            ${this.successMessage
              ? html`<div class="alert alert-success">${this.successMessage}</div>`
              : ""}

            ${this.renderField(
              "Wallet",
              p?.wallet ?? "-",
              "",
              () => {},
              false,
              true
            )}
            ${this.renderField(
              "Email",
              p?.email ?? "-",
              "",
              () => {},
              false
            )}
            ${this.renderField(
              "First Name",
              p?.first_name ?? "-",
              this.firstName,
              (v) => (this.firstName = v)
            )}
            ${this.renderField(
              "Last Name",
              p?.last_name ?? "-",
              this.lastName,
              (v) => (this.lastName = v)
            )}
            ${this.renderField(
              "Phone",
              p?.phone ?? "-",
              this.phone,
              (v) => (this.phone = v)
            )}
            ${this.renderField(
              "Business Name",
              p?.business_name ?? "-",
              this.businessName,
              (v) => (this.businessName = v)
            )}
            ${this.renderField(
              "Gov ID Type",
              p?.government_id_type ?? "-",
              this.govIdType,
              (v) => (this.govIdType = v)
            )}
            ${this.renderField(
              "Gov ID Number",
              p?.government_id_number ?? "-",
              this.govIdNumber,
              (v) => (this.govIdNumber = v)
            )}
            ${this.renderField(
              "Created At",
              this.formatDate(p?.created_at ?? ""),
              "",
              () => {},
              false
            )}
            ${this.renderField(
              "Updated At",
              this.formatDate(p?.updated_at ?? ""),
              "",
              () => {},
              false
            )}

            <div class="actions">
              ${this.editing
                ? html`
                    <button
                      class="btn btn-primary ${this.saving ? "processing" : ""}"
                      ?disabled=${this.saving}
                      @click=${this.handleSave}
                    >
                      SAVE
                    </button>
                    <button
                      class="btn"
                      ?disabled=${this.saving}
                      @click=${this.handleCancel}
                    >
                      CANCEL
                    </button>
                  `
                : html`
                    <button class="btn btn-primary" @click=${this.handleEdit}>
                      EDIT
                    </button>
                  `}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "user-detail-view": UserDetailView;
  }
}
