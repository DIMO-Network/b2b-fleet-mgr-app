import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Oracle } from "@services/oracle-tenant-service.ts";
import { OracleTenantService } from "@services/oracle-tenant-service.ts";
import {repeat} from "lit/directives/repeat.js";

@customElement('oracle-selector')
export class OracleSelector extends LitElement {
    @property({attribute: true})
    selectedOption: string;

    @property()
    options: Oracle[] = [];

    private oracleTenantService = OracleTenantService.getInstance();

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    constructor() {
        super();
        this.selectedOption = this.oracleTenantService.getOracle()?.oracleId ?? "";
    }

    async connectedCallback() {
        super.connectedCallback();

        try {
            const list = await this.oracleTenantService.fetchOracles();
            this.options = Array.isArray(list) ? list : [];

            // Ensure selectedOption is in sync if not set
            if (!this.selectedOption && this.options.length > 0) {
                this.selectedOption = this.options[0].oracleId;
            }

            // Dispatch event when options are loaded
            this.dispatchEvent(new CustomEvent('options-loaded', {
                detail: { options: this.options },
                bubbles: true,
                composed: true
            }));
        } catch (error) {
            console.error('Failed to load oracle options:', error);
            this.options = [];
        }
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