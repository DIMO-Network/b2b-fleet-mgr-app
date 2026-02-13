import {css, html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {LitElement} from 'lit';
import { IdentityService, VehicleIdentityData } from '../services/identity-service';
import {globalStyles} from "../global-styles.ts";

@customElement('identity-vehicle-info-modal-element')
export class IdentityVehicleInfoModalElement extends LitElement {
    static styles = [ globalStyles,
        css``
    ]

    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: true})
    public tokenId = ""

    @state()
    private identityData: VehicleIdentityData | null = null

    @state()
    private loading = false

    @state()
    private error = ""

    private identityService: IdentityService;

    constructor() {
        super();
        this.identityService = IdentityService.getInstance();
    }

    connectedCallback() {
        super.connectedCallback();
    }

    render() {
        if (!this.show) {
            return nothing;
        }

        return html`
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="max-width: 800px;">
                    <div class="modal-header">
                        <h3>Vehicle Identity Information - Token ID: ${this.tokenId}</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>
                    <div class="modal-body">
                        ${this.loading ? html`
                            <div class="loading-message">Loading vehicle identity data...</div>
                        ` : html`
                            ${this.error ? html`
                                <div class="alert alert-error">${this.error}</div>
                            ` : html`
                                ${this.identityData ? html`
                                    <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow: auto; max-height: 60vh;">${this.formatJsonForDisplay(this.identityData)}</pre>
                                ` : html`
                                    <div class="no-data">No identity data available for this vehicle.</div>
                                `}
                            `}
                        `}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="action-btn secondary" @click=${this.closeModal}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    private closeModal() {
        this.show = false;
        this.identityData = null;
        this.error = "";
        this.loading = false;
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    // Method to load identity data (to be called from parent)
    public async loadIdentityData() {
        if (!this.tokenId) {
            this.error = "No Token ID provided";
            return;
        }

        this.loading = true;
        this.error = "";

        try {
            const data = await this.identityService.getVehicleIdentity(this.tokenId);
            if (data) {
                this.identityData = data;
            } else {
                this.error = "Failed to load vehicle identity data";
            }
        } catch (err) {
            this.error = "Failed to load vehicle identity data";
            console.error("Error loading vehicle identity data:", err);
        } finally {
            this.loading = false;
        }
    }

    private formatJsonForDisplay(data: unknown): string {
        try {
            const toFormat = typeof data === 'string' ? JSON.parse(data) : data;
            return JSON.stringify(toFormat, null, 2);
        } catch {
            // If not JSON string, display as-is or as JSON
            return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        }
    }
}

