import {css, html, nothing, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {globalStyles} from '../global-styles.ts';

@customElement('error-modal-element')
export class ErrorModalElement extends LitElement {
  static styles = [ globalStyles, css`` ];

  @property({type: Boolean})
  show: boolean = false;

  @property({type: String})
  title: string = 'Error';

  @property({type: String})
  message: string = '';

  // Use shadow DOM and shared modal styles from globalStyles

  render() {
    if (!this.show) return nothing;
    return html`
      <div class="modal-overlay" role="dialog" aria-modal="true" @click=${this.close}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="max-width: 640px;">
          <div class="modal-header">
            <h3>${this.title}</h3>
            <button type="button" class="modal-close" aria-label="Close" @click=${this.close}>×</button>
          </div>
          <div class="modal-body">
            <div class="alert alert-error">${this.message}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click=${this.close}>OK</button>
          </div>
        </div>
      </div>
    `;
  }

  private close = () => {
    this.show = false;
    this.dispatchEvent(new CustomEvent('modal-closed', { bubbles: true, composed: true }));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'error-modal-element': ErrorModalElement;
  }
}
