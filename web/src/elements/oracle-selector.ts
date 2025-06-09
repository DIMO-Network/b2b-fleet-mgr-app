import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('oracle-selector')
export class OracleSelector extends LitElement {
    @property()
    selectedOption = 'motorq';

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

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
            <div>
            <label for="oracle-select">Select Connection Oracle:</label>
                <select id="oracle-select" @change=${this.handleChange}>
                    <option value="motorq">MotorQ</option>
                    <option value="staex">Staex</option>
                </select>
            </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'oracle-selector': OracleSelector;
    }
}