import { html, nothing, LitElement, css } from 'lit';
import { msg } from '@lit/localize';
import { customElement, property, state } from 'lit/decorators.js';
import { globalStyles } from '../global-styles.ts';
import { ApiService } from '@services/api-service.ts';
import dayjs from 'dayjs';

interface ShareLink {
  id: string;
  vehicle_token_id: number;
  expires_at: string;
  created_at: string;
  created_by: string;
}

@customElement('share-vehicle-modal-element')
export class ShareVehicleModalElement extends LitElement {
  static styles = [globalStyles, css`
    .slider-container {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0;
    }
    .slider-container input[type="range"] {
      flex: 1;
    }
    .slider-value {
      font-size: 18px;
      font-weight: 600;
      min-width: 50px;
      text-align: center;
    }
    .share-link-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f0f7ff;
      border: 1px solid #b3d4fc;
      border-radius: 6px;
      padding: 12px;
      margin-top: 16px;
      word-break: break-all;
      font-family: monospace;
      font-size: 13px;
    }
    .share-link-box .link-text {
      flex: 1;
    }
    .copy-btn {
      cursor: pointer;
      background: none;
      border: none;
      padding: 4px;
      color: #0066cc;
    }
    .copy-btn:hover {
      color: #004499;
    }
    .existing-links {
      margin-top: 24px;
      border-top: 1px solid #eee;
      padding-top: 16px;
    }
    .link-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .link-info {
      font-size: 13px;
    }
    .link-expires {
      color: #666;
      font-size: 12px;
    }
    .copied-toast {
      color: #28a745;
      font-size: 12px;
      margin-left: 8px;
    }
  `];

  @property({ attribute: true, type: Boolean })
  public show = false;

  @property({ attribute: false, type: Number })
  public vehicleTokenID: number = 0;

  @state()
  private hours: number = 24;

  @state()
  private processing: boolean = false;

  @state()
  private createdLink: string = '';

  @state()
  private existingLinks: ShareLink[] = [];

  @state()
  private loadingLinks: boolean = false;

  @state()
  private errorMessage: string = '';

  @state()
  private copied: boolean = false;

  private api: ApiService;

  constructor() {
    super();
    this.api = ApiService.getInstance();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('show') && this.show) {
      this.createdLink = '';
      this.errorMessage = '';
      this.copied = false;
      this.loadExistingLinks();
    }
  }

  private async loadExistingLinks() {
    if (!this.vehicleTokenID) return;
    this.loadingLinks = true;
    const response = await this.api.callApi<ShareLink[]>(
      'GET',
      `/fleet/vehicles/${this.vehicleTokenID}/shares`,
      null,
      true,
      true
    );
    if (response.success && response.data) {
      this.existingLinks = response.data;
    }
    this.loadingLinks = false;
  }

  private async handleCreate() {
    this.processing = true;
    this.errorMessage = '';
    this.createdLink = '';

    const response = await this.api.callApi<ShareLink>(
      'POST',
      `/fleet/vehicles/${this.vehicleTokenID}/share`,
      { hours: this.hours },
      true,
      true
    );

    if (response.success && response.data) {
      const baseUrl = window.location.origin;
      this.createdLink = `${baseUrl}/tracking.html?id=${response.data.id}`;
      await this.loadExistingLinks();
    } else {
      this.errorMessage = response.error || msg('Failed to create share link');
    }
    this.processing = false;
  }

  private async handleRevoke(linkId: string) {
    const response = await this.api.callApi(
      'DELETE',
      `/fleet/vehicles/shares/${linkId}`,
      null,
      true,
      true
    );
    if (response.success) {
      this.existingLinks = this.existingLinks.filter(l => l.id !== linkId);
    }
  }

  private async copyLink() {
    try {
      await navigator.clipboard.writeText(this.createdLink);
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = this.createdLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 2000);
    }
  }

  private handleCancel() {
    this.show = false;
    this.dispatchEvent(new CustomEvent('modal-closed'));
  }

  private handleSliderInput(e: Event) {
    this.hours = parseInt((e.target as HTMLInputElement).value);
  }

  render() {
    if (!this.show) return nothing;

    return html`
      <div class="modal-overlay" @click=${this.handleCancel}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="max-width: 520px;">
          <div class="modal-header">
            <h3>${msg('Share Vehicle Tracking')}</h3>
            <button type="button" class="modal-close" @click=${this.handleCancel}>&times;</button>
          </div>
          <div class="modal-body">
            ${this.errorMessage ? html`
              <div style="background-color: #fee; border: 1px solid #fcc; border-radius: 4px; padding: 12px; margin-bottom: 16px; color: #c33;">
                ${this.errorMessage}
              </div>
            ` : nothing}

            <p style="margin-bottom: 8px; color: #666;">${msg('Generate a temporary link to share live vehicle tracking.')}</p>

            <label style="font-size: 13px; text-transform: uppercase; color: #666;">${msg('Link Duration')}</label>
            <div class="slider-container">
              <input type="range" min="1" max="72" .value=${String(this.hours)} @input=${this.handleSliderInput}>
              <span class="slider-value">${this.hours}h</span>
            </div>

            <button class="btn btn-primary ${this.processing ? 'processing' : ''}"
                    @click=${this.handleCreate}
                    ?disabled=${this.processing}>
              ${this.processing ? msg('Creating...') : msg('Generate Link')}
            </button>

            ${this.createdLink ? html`
              <div class="share-link-box">
                <span class="link-text">${this.createdLink}</span>
                <button class="copy-btn" @click=${this.copyLink} title="${msg('Copy to clipboard')}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                ${this.copied ? html`<span class="copied-toast">${msg('Copied!')}</span>` : nothing}
              </div>
            ` : nothing}

            ${this.existingLinks.length > 0 || this.loadingLinks ? html`
              <div class="existing-links">
                <label style="font-size: 13px; text-transform: uppercase; color: #666;">${msg('Active Links')}</label>
                ${this.loadingLinks ? html`<div style="color: #666; padding: 8px 0;">${msg('Loading...')}</div>` :
                  this.existingLinks.map(link => html`
                    <div class="link-row">
                      <div class="link-info">
                        <div style="font-family: monospace; font-size: 12px;">${link.id.substring(0, 8)}...</div>
                        <div class="link-expires">${msg('Expires')} ${dayjs(link.expires_at).format('MMM D, h:mm A')}</div>
                      </div>
                      <button class="btn btn-sm btn-danger" @click=${() => this.handleRevoke(link.id)}>${msg('Revoke')}</button>
                    </div>
                  `)
                }
              </div>
            ` : nothing}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'share-vehicle-modal-element': ShareVehicleModalElement;
  }
}
