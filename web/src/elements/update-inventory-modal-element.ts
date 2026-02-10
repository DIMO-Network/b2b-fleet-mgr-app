import { html, nothing, LitElement, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { globalStyles } from '../global-styles.ts';
import { ApiService } from '@services/api-service.ts';

@customElement('update-inventory-modal-element')
export class UpdateInventoryModalElement extends LitElement {
  static styles = [globalStyles, css``];

  @property({ attribute: true, type: Boolean })
  public show = false;

  @property({ attribute: false, type: String })
  public imei: string = '';

  @state()
  private selectedState: string = 'Inventory';

  @state()
  private note: string = '';

  @state()
  private processing: boolean = false;

  @state()
  private errorMessage: string = '';

  private api: ApiService;

  constructor() {
    super();
    this.api = ApiService.getInstance();
  }

  render() {
    if (!this.show) {
      return nothing;
    }

    return html`
      <div class="modal-overlay" @click=${this.handleCancel}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>Update Inventory Status</h3>
            <button type="button" class="modal-close" @click=${this.handleCancel}>×</button>
          </div>
          <div class="modal-body">
            ${this.errorMessage ? html`
              <div style="background-color: #fee; border: 1px solid #fcc; border-radius: 4px; padding: 12px; margin-bottom: 16px; color: #c33;">
                ${this.errorMessage}
              </div>
            ` : nothing}

            <div style="display: grid; gap: 16px;">
              <div>
                <label class="form-label" style="display: block; margin-bottom: 8px;">
                  Status
                </label>
                <select
                  class="form-control"
                  style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px;"
                  .value=${this.selectedState}
                  @change=${this.handleStateChange}
                >
                  <option value="Inventory">Inventory</option>
                  <option value="Customer">Customer</option>
                </select>
              </div>

              <div>
                <label class="form-label" style="display: block; margin-bottom: 8px;">
                  Note
                </label>
                <input
                  type="text"
                  class="form-control"
                  style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px;"
                  placeholder="Enter a note (optional)"
                  .value=${this.note}
                  @input=${this.handleNoteChange}
                />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click=${this.handleCancel}
              ?disabled=${this.processing}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary ${this.processing ? 'processing' : ''}"
              @click=${this.handleSubmit}
              ?disabled=${this.processing}
            >
              ${this.processing ? 'Updating...' : 'Update Status'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private handleStateChange(e: Event) {
    this.selectedState = (e.target as HTMLSelectElement).value;
  }

  private handleNoteChange(e: Event) {
    this.note = (e.target as HTMLInputElement).value;
  }

  private handleCancel() {
    this.show = false;
    this.errorMessage = '';
    this.dispatchEvent(new CustomEvent('modal-closed', {
      bubbles: true,
      composed: true
    }));
  }

  private async handleSubmit() {
    if (!this.imei) {
      this.errorMessage = 'IMEI is required';
      return;
    }

    this.processing = true;
    this.errorMessage = '';

    try {
      const payload = {
        state: this.selectedState,
        note: this.note || undefined
      };

      const response = await this.api.callApi<any>(
        'POST',
        `/fleet/vehicles/${this.imei}/inventory`,
        payload,
        true, // auth required
        true  // oracle endpoint
      );

      if (!response.success) {
        this.errorMessage = response.error || 'Failed to update inventory status';
        this.processing = false;
        return;
      }

      // Success - dispatch event with the new state
      this.dispatchEvent(new CustomEvent('inventory-updated', {
        detail: {
          state: this.selectedState,
          note: this.note
        },
        bubbles: true,
        composed: true
      }));

      this.show = false;
      this.selectedState = 'Inventory';
      this.note = '';
      this.errorMessage = '';
    } catch (error) {
      this.errorMessage = `Error: ${error}`;
    } finally {
      this.processing = false;
    }
  }
}
