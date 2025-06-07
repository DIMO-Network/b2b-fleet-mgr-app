import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('oracle-selector')
export class OracleSelector extends LitElement {
    @property()
    selectedOption = 'motorq';

    private handleChange(e: Event) {
        const select = e.target as HTMLSelectElement;
        this.selectedOption = select.value;
        // Dispatch a custom event so parent components can listen to changes
        this.dispatchEvent(new CustomEvent('option-changed', {
            detail: { value: this.selectedOption },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
      <select @change=${this.handleChange}>
        <option value="motorq">MotorQ</option>
        <option value="staex">Staex</option>
      </select>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'oracle-selector': OracleSelector;
    }
}