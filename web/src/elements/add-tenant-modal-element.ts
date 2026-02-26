import {css, html, LitElement, nothing} from 'lit';
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {globalStyles} from "../global-styles.ts";

@customElement('add-tenant-modal-element')
export class AddTenantModalElement extends LitElement {
    static styles = [ globalStyles,
        css`
            .helper-text {
                font-size: 13px;
                color: #666;
                margin-top: 0.5rem;
            }
        `
    ];

    @property({type: Boolean})
    public show = false;

    @state()
    private tenantName: string = "";

    @state()
    private dimoClientId: string = "";

    @state()
    private dimoSecret: string = "";

    @state()
    private processing: boolean = false;

    @state()
    private error: string = "";

    private apiService: ApiService;

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
    }

    render() {
        if (!this.show) {
            return nothing;
        }

        return html`
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
                    <div class="modal-header">
                        <h3>Add New Tenant</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>
                    <div class="modal-body">
                        ${this.error ? html`<div class="alert alert-error" style="margin-bottom: 1rem;">${this.error}</div>` : nothing}
                        
                        <div class="form-group">
                            <label class="form-label">Name</label>
                            <input 
                                type="text" 
                                placeholder="Enter tenant name"
                                .value=${this.tenantName}
                                @input=${(e: InputEvent) => this.tenantName = (e.target as HTMLInputElement).value}
                                ?disabled=${this.processing}
                                style="width: 100%;"
                            >
                            <p class="helper-text">give your tenant a name that makes sense to you eg. your business name</p>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Dimo Client Id</label>
                            <input 
                                type="text" 
                                placeholder="Enter DIMO Client ID"
                                .value=${this.dimoClientId}
                                @input=${(e: InputEvent) => this.dimoClientId = (e.target as HTMLInputElement).value}
                                ?disabled=${this.processing}
                                style="width: 100%;"
                            >
                        </div>

                        <div class="form-group">
                            <label class="form-label">Dimo Secret</label>
                            <input 
                                type="password" 
                                placeholder="Enter DIMO Secret"
                                .value=${this.dimoSecret}
                                @input=${(e: InputEvent) => this.dimoSecret = (e.target as HTMLInputElement).value}
                                ?disabled=${this.processing}
                                style="width: 100%;"
                            >
                            <p class="helper-text">user must have or create a new dimo developer account at the dimo console <a href="https://console.dimo.org" target="_blank" class="link">https://console.dimo.org</a></p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" @click=${this.closeModal} ?disabled=${this.processing}>
                            Cancel
                        </button>
                        <button type="button" class="btn btn-primary ${this.processing ? 'processing' : ''}" @click=${this.submitTenant} ?disabled=${this.processing || !this.tenantName.trim()}>
                            ${this.processing ? 'Adding...' : 'Submit'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    private closeModal() {
        if (this.processing) return;
        this.show = false;
        this.error = "";
        this.tenantName = "";
        this.dimoClientId = "";
        this.dimoSecret = "";
        this.dispatchEvent(new CustomEvent('modal-closed', { bubbles: true, composed: true }));
    }

    private async submitTenant() {
        const name = this.tenantName.trim();
        if (!name) return;

        this.processing = true;
        this.error = "";

        try {
            const response = await this.apiService.callApi(
                'POST',
                '/tenant',
                { 
                    name,
                    dimo_client_id: this.dimoClientId.trim(),
                    dimo_secret: this.dimoSecret.trim()
                },
                true, // auth
                true, // useOracle
                false // includeTenantId
            );

            if (response.success) {
                this.show = false;
                this.dispatchEvent(new CustomEvent('tenant-added', { 
                    detail: { tenant: response.data },
                    bubbles: true, 
                    composed: true 
                }));
            } else {
                this.error = response.error || "Failed to add tenant";
            }
        } catch (e: any) {
            this.error = e.message || "An unexpected error occurred";
        } finally {
            this.processing = false;
        }
    }
}
