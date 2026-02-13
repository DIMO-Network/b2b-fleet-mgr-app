import {LitElement, html, css} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";

@customElement('click-to-copy-element')
export class ClickToCopyElement extends LitElement {
    static styles = [
        globalStyles,
        css`
            :host {
                display: inline-block;
                position: relative;
                cursor: pointer;
            }
            .tooltip {
                position: absolute;
                top: -25px;
                right: 0;
                background: #333;
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                z-index: 10;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .tooltip.show {
                opacity: 1;
            }
        `
    ];

    @property({type: String})
    valueToCopy: string = "";

    @state()
    private showTooltip: boolean = false;

    private async copyToClipboard() {
        if (!this.valueToCopy) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(this.valueToCopy);
            } else {
                const ta = document.createElement('textarea');
                ta.value = this.valueToCopy;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }

            this.showTooltip = true;
            setTimeout(() => {
                this.showTooltip = false;
            }, 2000);

            this.dispatchEvent(new CustomEvent('copied', {
                detail: { value: this.valueToCopy },
                bubbles: true,
                composed: true
            }));
        } catch (e) {
            console.error('Failed to copy to clipboard', e);
        }
    }

    render() {
        return html`
            <div @click=${this.copyToClipboard} title="Click to copy">
                <slot></slot>
                <span class="tooltip ${this.showTooltip ? 'show' : ''}">Copied!</span>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'click-to-copy-element': ClickToCopyElement;
    }
}
