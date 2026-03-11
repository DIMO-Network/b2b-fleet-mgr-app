import {LitElement, css, html, nothing} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {msg} from '@lit/localize';
import {globalStyles} from '../global-styles.ts';
import {ApiService} from '@services/api-service.ts';
import {TenantSettings, SettingsService} from '@services/settings-service.ts';

@customElement('tenant-settings-view')
export class TenantSettingsView extends LitElement {
  static styles = [ globalStyles, css`
    .field-hint {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }
    .settings-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 24px;
      align-items: start;
    }
    .helper-panel {
      background: #f0f7ff;
      border: 1px solid #b8d4f0;
      border-radius: 4px;
      padding: 20px;
    }
    .helper-panel h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #1a3a5c;
    }
    .helper-panel p {
      margin: 0 0 12px 0;
      font-size: 13px;
      color: #444;
      line-height: 1.5;
    }
    .helper-panel p:last-child { margin-bottom: 0; }
    .helper-panel a {
      color: #1a73e8;
      text-decoration: none;
    }
    .helper-panel a:hover { text-decoration: underline; }
  ` ];

  private api = ApiService.getInstance();
  private settingsService = SettingsService.getInstance();

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
  private data: TenantSettings | null = null;

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
    const data = await this.settingsService.fetchTenantSettings();
    this.loading = false;
    if (!data) {
      this.error = msg('Failed to load tenant settings');
      this.data = null;
      return;
    }
    this.data = data;
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
  };

  private cancelEdit = () => {
    this.editing = false;
    this.success = '';
    this.error = '';
    this.populateEditFieldsFromData();
  };

  private onInput = (e: InputEvent, setter: (v: string) => void) => {
    setter((e.target as HTMLInputElement).value);
  };

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

    const resp = await this.api.callApi<TenantSettings>('POST', '/tenant/settings', payload, true, true, true);
    this.loading = false;

    if (!resp.success || !resp.data) {
      this.error = resp.error || msg('Failed to save tenant settings');
      return;
    }

    // Update local state with response
    this.data = resp.data;
    this.settingsService.tenantSettings = resp.data;
    this.settingsService.saveTenantSettings();
    //this.populateEditFieldsFromData();
    this.editing = false;
    this.success = msg('Settings saved successfully');
  }

  private async syncKore() {
    this.syncing = true;
    this.error = '';
    this.success = '';

    const resp = await this.api.callApi('POST', '/tenant/sync-kore', {}, true, true, true);
    this.syncing = false;

    if (resp.success) {
      this.success = msg('Kore sync started successfully');
    } else {
      this.error = resp.error || msg('Failed to sync Kore');
    }
  }

  render() {
    return html`
      <div class="page active" id="page-tenant-settings">
        <div class="section-header">
          ${msg('Tenant Settings')}
          ${this.data ? html`<span style="font-weight: normal; color: #666; margin-left: 8px;">— ${this.data.name}</span>` : nothing}
        </div>

        <div class="settings-layout">
          <div class="panel">
            <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <span>${msg('Configuration')}</span>
              ${this.editing ? html`` : html`
                <button class="action-btn secondary" title=${msg('Edit')} @click=${this.enableEdit}>
                  ✎ ${msg('Edit')}
                </button>
              `}
            </div>
            <div class="panel-body">
              ${this.loading ? html`<div class="loading-message">${msg('Loading…')}</div>` : nothing}
              ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
              ${this.success ? html`<div class="alert alert-success">${this.success}</div>` : nothing}

              ${this.data ? html`
                <form class="grid" style="gap: 12px;">
                  <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                    <fieldset>
                      <label class="form-label">${msg('Tenant ID')}</label>
                      <!-- Tenant ID is not editable; render as plain text -->
                      <span class="detail-value" style="display:block; padding: 8px 0;">${this.tenantId}</span>
                    </fieldset>
                    <fieldset>
                      <label class="form-label">${msg('Tenant Name')}</label>
                      <input type="text" .value=${this.name}
                        ?disabled=${!this.editing}
                        @input=${(e: InputEvent) => this.onInput(e, v => this.name = v)}>
                    </fieldset>
                  </div>

                  <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                    <fieldset>
                      <label class="form-label">${msg('Kore Client ID')}</label>
                      <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" style="width: 450px" .value=${this.kore_client_id}
                          ?disabled=${!this.editing}
                          @input=${(e: InputEvent) => this.onInput(e, v => this.kore_client_id = v)}>
                        <button type="button" class="btn btn-sm btn-success ${this.syncing ? 'processing' : ''}"
                          @click=${this.syncKore}
                          ?disabled=${this.syncing || !this.kore_client_id}>
                          ${this.syncing ? msg('Syncing...') : msg('Sync SIMs and Fleet')}
                        </button>
                      </div>
                      <div class="field-hint">${msg('Provided from the Kore website. Not required, only needed to automatically sync IMEIs.')}</div>
                    </fieldset>
                    <fieldset>
                      <label class="form-label">${msg('Kore Secret')}</label>
                      ${this.editing ? html`
                        <input type="text" style="width: 450px" placeholder="${this.data.has_kore_secret ? '****' : ''}"
                          .value=${this.kore_secret_input}
                          @input=${(e: InputEvent) => this.onInput(e, v => this.kore_secret_input = v)}>
                      ` : html`
                        <input type="text" .value=${this.data.has_kore_secret ? '****' : ''} disabled>
                      `}
                      <div class="field-hint">${msg('Also from the Kore website, and also not required.')}</div>
                    </fieldset>
                  </div>

                  <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                    <fieldset>
                      <label class="form-label">${msg('Command Password')}</label>
                      <input type="text" .value=${this.command_password}
                        ?disabled=${!this.editing}
                        @input=${(e: InputEvent) => this.onInput(e, v => this.command_password = v)}>
                      <div class="field-hint">${msg('Used to authenticate device commands. Optional, needed for immobilization and other SMS commands.')}</div>
                    </fieldset>
                    <fieldset>
                      <label class="form-label">${msg('DIMO Client ID')}</label>
                      <input type="text" style="width: 450px" .value=${this.dimo_client_id}
                        ?disabled=${!this.editing}
                        @input=${(e: InputEvent) => this.onInput(e, v => this.dimo_client_id = v)}>
                      <div class="field-hint">${msg('Found in your DIMO developer console.')}</div>
                    </fieldset>
                  </div>

                  <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                    <fieldset>
                      <label class="form-label">${msg('DIMO Secret')}</label>
                      ${this.editing ? html`
                        <input type="text" style="width: 450px" placeholder="${this.data.has_dimo_secret ? '****' : ''}"
                          .value=${this.dimo_secret_input}
                          @input=${(e: InputEvent) => this.onInput(e, v => this.dimo_secret_input = v)}>
                      ` : html`
                        <input type="text" .value=${this.data.has_dimo_secret ? '****' : ''} disabled>
                      `}
                      <div class="field-hint">${msg('From your DIMO license credentials, also from the developer console.')}</div>
                    </fieldset>
                  </div>
                </form>
              ` : nothing}
            </div>
            <div class="panel-footer" style="display:flex; gap:8px; justify-content:flex-end;">
              ${this.editing ? html`
                <button class="action-btn secondary" @click=${this.cancelEdit} ?disabled=${this.loading}>${msg('Cancel')}</button>
                <button class="btn btn-primary ${this.loading ? 'processing' : ''}" @click=${this.save} ?disabled=${this.loading}>${this.loading ? msg('Saving…') : msg('Save')}</button>
              ` : nothing}
            </div>
          </div>

          <div class="helper-panel">
            <h4>${msg('Getting Started')}</h4>
            <p>${msg(html`To connect your fleet you will need a DIMO developer account. If you don't have one yet, create one at <a href="https://console.dimo.org" target="_blank">console.dimo.org</a>.`)}</p>
            <p>${msg(html`Your <strong>DIMO Client ID</strong> and <strong>DIMO Secret</strong> can be found in your developer console under your license credentials.`)}</p>
            <p>${msg(html`The <strong>Kore</strong> credentials are provided by your hardware / connectivity provider and are used to sync SIM and device information.`)}</p>
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
