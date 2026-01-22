import {css, html, LitElement, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {globalStyles} from "../global-styles.ts";

@customElement('claim-imei-modal-element')
export class ClaimImeiModalElement extends LitElement {
    static styles = [ globalStyles,
        css`
            textarea {
                width: 100%;
                min-height: 150px;
                padding: 0.5rem;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-family: monospace;
                resize: vertical;
                box-sizing: border-box;
            }
        `
    ]

    @property({type: Boolean})
    public show = false;

    @state()
    private imeisText: string = "";

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
                        <h3>Claim New IMEI</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>
                    <div class="modal-body">
                        ${this.error ? html`<div class="alert alert-error" style="margin-bottom: 1rem;">${this.error}</div>` : nothing}
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <p style="margin: 0;">Enter one or more IMEIs (one per line):</p>
                            <button type="button" class="btn btn-sm" @click=${() => this.shadowRoot?.querySelector<HTMLInputElement>('#csv-upload')?.click()} ?disabled=${this.processing}>
                                Upload CSV
                            </button>
                            <input type="file" id="csv-upload" style="display: none;" accept=".csv" @change=${this.handleFileUpload}>
                        </div>
                        <textarea 
                            placeholder="Enter IMEIs here..."
                            .value=${this.imeisText}
                            @input=${(e: InputEvent) => this.imeisText = (e.target as HTMLTextAreaElement).value}
                            ?disabled=${this.processing}
                        ></textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" @click=${this.closeModal} ?disabled=${this.processing}>
                            Cancel
                        </button>
                        <button type="button" class="btn btn-primary ${this.processing ? 'processing' : ''}" @click=${this.submitClaims} ?disabled=${this.processing || !this.imeisText.trim()}>
                            ${this.processing ? 'Claiming...' : 'Submit'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    private handleFileUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = (event) => {
            const content = event.target?.result as string;
            this.processCsv(content);
            // Reset input so the same file can be uploaded again if needed
            input.value = '';
        };

        reader.onerror = () => {
            this.error = "Failed to read file";
        };

        reader.readAsText(file);
    }

    private processCsv(content: string) {
        this.error = "";
        const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length === 0) {
            this.error = "The CSV file is empty";
            return;
        }

        const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
        const header = rows[0];
        let imeiIndex = -1;

        // Look for "imei" or "IMEI" column
        for (let i = 0; i < header.length; i++) {
            if (header[i].toLowerCase() === 'imei') {
                imeiIndex = i;
                break;
            }
        }

        let extractedImeis: string[] = [];

        if (imeiIndex !== -1) {
            // Header found, extract from that column (skipping header row)
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][imeiIndex]) {
                    extractedImeis.push(rows[i][imeiIndex]);
                }
            }
        } else if (header.length === 1) {
            // No header, but single column - assume all rows are IMEIs
            extractedImeis = rows.map(row => row[0]);
        } else {
            this.error = "Could not find 'imei' or 'IMEI' column in CSV and it has multiple columns.";
            return;
        }

        if (extractedImeis.length === 0) {
            this.error = "No IMEIs found in the CSV file";
            return;
        }

        // Add to existing text, ensuring uniqueness if desired, but here we just append/replace
        // The requirement says "Populate the text area with the IMEI's from this header"
        // I'll replace the content or append? Usually "populate" means set.
        this.imeisText = extractedImeis.join('\n');
    }

    private closeModal() {
        if (this.processing) return;
        this.show = false;
        this.imeisText = "";
        this.error = "";
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private async submitClaims() {
        const imeis = this.imeisText.split('\n')
            .map(imei => imei.trim())
            .filter(imei => imei.length > 0);

        if (imeis.length === 0) {
            this.error = "Please enter at least one IMEI";
            return;
        }

        this.processing = true;
        this.error = "";

        let successCount = 0;
        let errors: string[] = [];

        for (const imei of imeis) {
            try {
                const response = await this.apiService.callApi(
                    'POST',
                    `/pending-vehicles/claim/${imei}`,
                    {},
                    true, // auth
                    true, // useOracle
                    true  // includeTenantId
                );

                if (response.success) {
                    successCount++;
                } else {
                    errors.push(`Failed to claim ${imei}: ${response.error}`);
                }
            } catch (e) {
                errors.push(`Error claiming ${imei}: ${e}`);
            }
        }

        this.processing = false;

        if (errors.length > 0) {
            this.error = errors.join('\n');
            if (successCount > 0) {
                // If some succeeded, we still want to reload the list
                this.dispatchEvent(new CustomEvent('claims-submitted', {
                    bubbles: true,
                    composed: true
                }));
            }
        } else {
            this.dispatchEvent(new CustomEvent('claims-submitted', {
                bubbles: true,
                composed: true
            }));
            this.closeModal();
        }
    }
}
