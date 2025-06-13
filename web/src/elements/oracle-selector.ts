import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import {Oracle, SettingsService} from "@services/settings-service.ts";
import {repeat} from "lit/directives/repeat.js";

@customElement('oracle-selector')
export class OracleSelector extends LitElement {
    @property({attribute: true})
    selectedOption: string;

    @property()
    options: Oracle[] = []

    private settings: SettingsService;

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    constructor() {
        super();
        this.selectedOption = "";
        this.settings = SettingsService.getInstance()
    }

    async connectedCallback() {
        super.connectedCallback();

        this.settings.fetchPublicSettings().then(settings => {
            this.options = settings?.oracles || []
        })
    }

    private handleChange(e: Event) {
        const select = e.target as HTMLSelectElement;

        // Dispatch a custom event so parent components can listen to changes
        this.dispatchEvent(new CustomEvent('option-changed', {
            detail: { value: select.value },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div>
            <label for="oracle-select">Select Connection Oracle:</label>
                <select id="oracle-select" @change=${this.handleChange}>
                    ${repeat(this.options, (option) => option.oracleId, (option) => html`
                        <option value=${option.oracleId} ?selected=${option.oracleId === this.selectedOption}>
                            ${option.name}
                        </option>
                    `)}
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