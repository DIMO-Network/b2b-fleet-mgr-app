import { html, nothing, LitElement, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { globalStyles } from '../global-styles.ts';

@customElement('confirm-modal-element')
export class ConfirmModalElement extends LitElement {
  static styles = [globalStyles, css``];

  @property({ attribute: true, type: Boolean })
  public show = false;

  @property({ attribute: false, type: String })
  public title: string = 'Confirm Action';

  @property({ attribute: false, type: String })
  public message: string = 'Are you sure you want to proceed?';

  @property({ attribute: false, type: String })
  public confirmText: string = 'Confirm';

  @property({ attribute: false, type: String })
  public cancelText: string = 'Cancel';

  @property({ attribute: false, type: String })
  public confirmButtonClass: string = 'btn-primary';

  render() {
    if (!this.show) {
      return nothing;
    }

    return html`
      <div class="modal-overlay" @click=${this.handleCancel}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${this.title}</h3>
            <button type="button" class="modal-close" @click=${this.handleCancel}>×</button>
          </div>
          <div class="modal-body">
            <p>${this.message}</p>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click=${this.handleCancel}
            >
              ${this.cancelText}
            </button>
            <button
              type="button"
              class="btn ${this.confirmButtonClass}"
              @click=${this.handleConfirm}
            >
              ${this.confirmText}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private handleCancel() {
    this.show = false;
    this.dispatchEvent(new CustomEvent('modal-cancel', {
      bubbles: true,
      composed: true
    }));
  }

  private handleConfirm() {
    this.show = false;
    this.dispatchEvent(new CustomEvent('modal-confirm', {
      bubbles: true,
      composed: true
    }));
  }
}
