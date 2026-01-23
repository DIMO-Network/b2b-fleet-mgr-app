import {LitElement, css, html, nothing} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {globalStyles} from '../global-styles.ts';
import {ApiService} from '@services/api-service.ts';

interface TenantSettingsDto {
  id: string;
  name: string;
  kore_client_id: string;
  has_kore_secret: boolean;
  command_password: string;
  dimo_client_id: string;
  has_dimo_secret: boolean;
}

@customElement('tenant-settings-view')
export class TenantSettingsView extends LitElement {
  static styles = [ globalStyles, css`` ];

  private api = ApiService.getInstance();

  @state()
  private loading = false;

  @state()
  private error: string = '';

  @state()
  private success: string = '';

  @state()
  private syncing = false;

  @state()
  private editing = false;

  @state()
  private data: TenantSettingsDto | null = null;

  // editable fields (separate to allow cancel)
  @state() private tenantId: string = '';
  @state() private name: string = '';
  @state() private kore_client_id: string = '';
  @state() private kore_secret_input: string = '';
  @state() private command_password: string = '';
  @state() private dimo_client_id: string = '';
  @state() private dimo_secret_input: string = '';

  async connectedCallback() {
    super.connectedCallback();
    await this.loadSettings();
  }

  private async loadSettings() {
    this.loading = true;
    this.error = '';
    this.success = '';
    const resp = await this.api.callApi<TenantSettingsDto>('GET', '/tenant/settings', null, true, true, true);
    this.loading = false;
    if (!resp.success || !resp.data) {
      this.error = resp.error || 'Failed to load tenant settings';
      this.data = null;
      return;
    }
    this.data = resp.data;
    this.populateEditFieldsFromData();
  }

  private populateEditFieldsFromData() {
    if (!this.data) return;
    this.tenantId = this.data.id ?? '';
    this.name = this.data.name ?? '';
    this.kore_client_id = this.data.kore_client_id ?? '';
    this.kore_secret_input = '';
    this.command_password = this.data.command_password ?? '';
    this.dimo_client_id = this.data.dimo_client_id ?? '';
    this.dimo_secret_input = '';
  }

  private enableEdit = () => {
    this.editing = true;
    this.success = '';
    this.error = '';
  }

  private cancelEdit = () => {
    this.editing = false;
    this.success = '';
    this.error = '';
    this.populateEditFieldsFromData();
  }

  private onInput = (e: InputEvent, setter: (v: string) => void) => {
    setter((e.target as HTMLInputElement).value);
  }

  private async save() {
    if (!this.data) return;
    this.loading = true;
    this.error = '';
    this.success = '';

    // Build payload: include actual secret fields (without has_) only if user provided a new value
    const payload: Record<string, any> = {
      kore_client_id: this.kore_client_id,
      command_password: this.command_password,
      dimo_client_id: this.dimo_client_id,
    };
    if (this.kore_secret_input && this.kore_secret_input.trim().length > 0) {
      payload['kore_secret'] = this.kore_secret_input.trim();
    }
    if (this.dimo_secret_input && this.dimo_secret_input.trim().length > 0) {
      payload['dimo_secret'] = this.dimo_secret_input.trim();
    }

    const resp = await this.api.callApi<TenantSettingsDto>('POST', '/tenant/settings', payload, true, true, true);
    this.loading = false;

    if (!resp.success || !resp.data) {
      this.error = resp.error || 'Failed to save tenant settings';
      return;
    }

    // Update local state with response
    this.data = resp.data;
    //this.populateEditFieldsFromData();
    this.editing = false;
    this.success = 'Settings saved successfully';
  }

  private async syncKore() {
    this.syncing = true;
    this.error = '';
    this.success = '';

    const resp = await this.api.callApi('POST', '/tenant/sync-kore', {}, true, true, true);
    this.syncing = false;

    if (resp.success) {
      this.success = 'Kore sync started successfully';
    } else {
      this.error = resp.error || 'Failed to sync Kore';
    }
  }

  render() {
    return html`
      <div class="page active" id="page-tenant-settings">
        <div class="section-header">
          Tenant Settings
          ${this.data ? html`<span style="font-weight: normal; color: #666; margin-left: 8px;">— ${this.data.name}</span>` : nothing}
        </div>

        <div class="panel">
          <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <span>Configuration</span>
            ${this.editing ? html`` : html`
              <button class="action-btn secondary" title="Edit" @click=${this.enableEdit}>
                ✎ Edit
              </button>
            `}
          </div>
          <div class="panel-body">
            ${this.loading ? html`<div class="loading-message">Loading…</div>` : nothing}
            ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
            ${this.success ? html`<div class="alert alert-success">${this.success}</div>` : nothing}

            ${this.data ? html`
              <form class="grid" style="gap: 12px;">
                <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                  <fieldset>
                    <label class="form-label">Tenant ID</label>
                    <!-- Tenant ID is not editable; render as plain text -->
                    <span class="detail-value" style="display:block; padding: 8px 0;">${this.tenantId}</span>
                  </fieldset>
                  <fieldset>
                    <label class="form-label">Tenant Name</label>
                    <input type="text" .value=${this.name}
                      ?disabled=${!this.editing}
                      @input=${(e: InputEvent) => this.onInput(e, v => this.name = v)}>
                  </fieldset>
                </div>

                <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                  <fieldset>
                    <label class="form-label">Kore Client ID</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <input type="text" style="width: 450px" .value=${this.kore_client_id}
                        ?disabled=${!this.editing}
                        @input=${(e: InputEvent) => this.onInput(e, v => this.kore_client_id = v)}>
                      <button type="button" class="btn btn-sm btn-success ${this.syncing ? 'processing' : ''}" 
                        @click=${this.syncKore} 
                        ?disabled=${this.syncing || !this.kore_client_id}>
                        ${this.syncing ? 'Syncing...' : 'Sync SIMs and Fleet'}
                      </button>
                    </div>
                  </fieldset>
                  <fieldset>
                    <label class="form-label">Kore Secret</label>
                    ${this.editing ? html`
                      <input type="text" style="width: 450px" placeholder="${this.data.has_kore_secret ? '****' : ''}"
                        .value=${this.kore_secret_input}
                        @input=${(e: InputEvent) => this.onInput(e, v => this.kore_secret_input = v)}>
                    ` : html`
                      <input type="text" .value=${this.data.has_kore_secret ? '****' : ''} disabled>
                    `}
                  </fieldset>
                </div>

                <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                  <fieldset>
                    <label class="form-label">Command Password</label>
                    <input type="text" .value=${this.command_password}
                      ?disabled=${!this.editing}
                      @input=${(e: InputEvent) => this.onInput(e, v => this.command_password = v)}>
                  </fieldset>
                  <fieldset>
                    <label class="form-label">DIMO Client ID</label>
                    <input type="text" style="width: 450px" .value=${this.dimo_client_id}
                      ?disabled=${!this.editing}
                      @input=${(e: InputEvent) => this.onInput(e, v => this.dimo_client_id = v)}>
                  </fieldset>
                </div>

                <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                  <fieldset>
                    <label class="form-label">DIMO Secret</label>
                    ${this.editing ? html`
                      <input type="text" style="width: 450px" placeholder="${this.data.has_dimo_secret ? '****' : ''}"
                        .value=${this.dimo_secret_input}
                        @input=${(e: InputEvent) => this.onInput(e, v => this.dimo_secret_input = v)}>
                    ` : html`
                      <input type="text" .value=${this.data.has_dimo_secret ? '****' : ''} disabled>
                    `}
                  </fieldset>
                </div>
              </form>
            ` : nothing}
          </div>
          <div class="panel-footer" style="display:flex; gap:8px; justify-content:flex-end;">
            ${this.editing ? html`
              <button class="action-btn secondary" @click=${this.cancelEdit} ?disabled=${this.loading}>Cancel</button>
              <button class="btn btn-primary ${this.loading ? 'processing' : ''}" @click=${this.save} ?disabled=${this.loading}>${this.loading ? 'Saving…' : 'Save'}</button>
            ` : nothing}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tenant-settings-view': TenantSettingsView;
  }
}
