import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { globalStyles } from '../global-styles.ts';
import {
    DOCUMENT_PARSED_TYPES,
    DocumentParsedType,
    ExtractDocumentResult,
    attestAttestationDocument,
    extractAttestationDocument,
    fileToBase64,
} from '@services/document-service.ts';

const UNKNOWN_TYPE: DocumentParsedType = 'dimo.document.unknown';

// Human-friendly label for each predefined parsed type. Keeps the dropdown
// scannable without leaking the dotted CE-type strings into the UI text.
function categoryLabel(t: DocumentParsedType): string {
    switch (t) {
        case 'dimo.document.vehicle.insurance':         return msg('Insurance');
        case 'dimo.document.vehicle.registration':      return msg('Registration');
        case 'dimo.document.vehicle.title':             return msg('Title');
        case 'dimo.document.vehicle.service.invoice':   return msg('Service Invoice');
        case 'dimo.document.vehicle.inspection':        return msg('Inspection');
        case 'dimo.document.vehicle.finance':           return msg('Finance');
        case 'dimo.document.vehicle.regulatory.other':  return msg('Regulatory (other)');
        case 'dimo.document.driver.license':            return msg('Driver License');
        case 'dimo.document.unknown':                   return msg('Unknown');
        default: return t;
    }
}

// findVinInExtractFields recursively scans the extract output for a VIN.
// Extract has historically nested VIN under different shapes (`vin`,
// `data.fields.vin`, `fields.data.fields.vin`); we mirror rental-fleets-app's
// tolerant search so a VIN mismatch warning fires regardless of shape.
function findVinInExtractFields(node: unknown, depth = 0): string | null {
    if (depth > 4 || node == null || typeof node !== 'object') return null;
    const obj = node as Record<string, unknown>;
    const direct = obj.vin;
    if (typeof direct === 'string' && direct.trim().length >= 11) return direct.trim();
    for (const v of Object.values(obj)) {
        const found = findVinInExtractFields(v, depth + 1);
        if (found) return found;
    }
    return null;
}

@customElement('upload-attestation-document-element')
export class UploadAttestationDocumentElement extends LitElement {
    static styles = [
        globalStyles,
        css`
            .ua-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.55);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            .ua-modal {
                background: #fff;
                border: 1px solid #ccc;
                border-radius: 8px;
                width: min(720px, 92vw);
                max-height: 92vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .ua-header {
                padding: 14px 18px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .ua-header h3 { margin: 0; font-size: 16px; }
            .ua-close {
                background: none;
                border: none;
                font-size: 22px;
                color: #666;
                cursor: pointer;
                line-height: 1;
                padding: 2px 6px;
            }
            .ua-body { padding: 18px; overflow-y: auto; }
            .ua-footer {
                padding: 12px 18px;
                border-top: 1px solid #e5e7eb;
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            .ua-dropzone {
                border: 2px dashed #ccd0d5;
                border-radius: 6px;
                padding: 32px 16px;
                text-align: center;
                color: #555;
                cursor: pointer;
                transition: border-color 0.15s, background 0.15s;
            }
            .ua-dropzone.dragging {
                border-color: #0066cc;
                background: #f0f7ff;
            }
            .ua-dropzone-hint { font-size: 12px; color: #999; margin-top: 8px; }
            .ua-file-row {
                display: flex;
                gap: 10px;
                align-items: center;
                padding: 10px 12px;
                background: #f8f9fa;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                margin-bottom: 12px;
            }
            .ua-file-name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ua-file-size { color: #888; font-size: 12px; }
            .ua-field-label {
                display: block;
                font-size: 11px;
                color: #555;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                margin-bottom: 4px;
                font-weight: 600;
            }
            .ua-category-row {
                margin-bottom: 12px;
            }
            .ua-category-row select {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 13px;
                background: #fff;
            }
            .ua-status {
                padding: 10px 12px;
                border-radius: 6px;
                font-size: 13px;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .ua-status.extracting { background: #eef4ff; color: #0b4ea2; }
            .ua-status.warning { background: #fff7ed; color: #9a3412; border: 1px solid #fdba74; }
            .ua-status.error { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
            .ua-spinner {
                width: 14px; height: 14px;
                border: 2px solid #c7d6f0;
                border-top-color: #0b4ea2;
                border-radius: 50%;
                animation: ua-spin 0.8s linear infinite;
                display: inline-block;
            }
            @keyframes ua-spin { to { transform: rotate(360deg); } }
            .ua-details {
                background: #f8f9fa;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                margin-bottom: 12px;
            }
            .ua-details summary {
                cursor: pointer;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 600;
                color: #555;
                user-select: none;
            }
            .ua-details pre {
                margin: 0;
                padding: 10px 12px;
                background: #fff;
                border-top: 1px solid #e5e7eb;
                font-family: ui-monospace, SFMono-Regular, monospace;
                font-size: 11px;
                color: #222;
                white-space: pre-wrap;
                word-break: break-word;
                max-height: 280px;
                overflow-y: auto;
            }
        `,
    ];

    // tokenID is the vehicle the attestation will be tied to. Required.
    @property({ type: Number }) tokenID: number = 0;

    // expectedVin lets the modal warn the user when extract pulls a different
    // VIN than the one on the current vehicle. Optional — if empty, no check.
    @property({ type: String }) expectedVin: string = '';

    // show is set by the parent to open/close the modal. Mirrors the convention
    // used by confirm-modal-element / transfer-modal-element.
    @property({ type: Boolean }) show: boolean = false;

    @state() private file: File | null = null;
    @state() private dragging: boolean = false;
    @state() private extracting: boolean = false;
    @state() private extractResult: ExtractDocumentResult | null = null;
    @state() private selectedCategory: DocumentParsedType = UNKNOWN_TYPE;
    @state() private submitting: boolean = false;
    @state() private errorMessage: string = '';
    @state() private vinMismatch: { extracted: string; expected: string } | null = null;
    @state() private detailsOpen: boolean = false;


    private resetState() {
        this.file = null;
        this.dragging = false;
        this.extracting = false;
        this.extractResult = null;
        this.selectedCategory = UNKNOWN_TYPE;
        this.submitting = false;
        this.errorMessage = '';
        this.vinMismatch = null;
        this.detailsOpen = false;
    }

    private close() {
        this.show = false;
        this.resetState();
        this.dispatchEvent(new CustomEvent('modal-closed', { bubbles: true, composed: true }));
    }

    private handleOverlayClick = (e: Event) => {
        if (e.target === e.currentTarget && !this.submitting && !this.extracting) {
            this.close();
        }
    };

    private async onFileSelected(file: File) {
        this.file = file;
        this.errorMessage = '';
        this.vinMismatch = null;
        this.extractResult = null;
        this.selectedCategory = UNKNOWN_TYPE;
        this.extracting = true;

        const result = await extractAttestationDocument(this.tokenID, file);
        this.extracting = false;
        if (!result) {
            this.errorMessage = msg('Extract failed — you can still submit, but the type will default to Unknown.');
            return;
        }
        this.extractResult = result;
        // Prefer the type extract detected; fall back to Unknown when blank or
        // outside the closed set.
        if (result.type && (DOCUMENT_PARSED_TYPES as readonly string[]).includes(result.type)) {
            this.selectedCategory = result.type as DocumentParsedType;
        }

        if (this.expectedVin) {
            const extractedVin = findVinInExtractFields(result.fields);
            if (extractedVin && extractedVin.toLowerCase() !== this.expectedVin.toLowerCase()) {
                this.vinMismatch = { extracted: extractedVin, expected: this.expectedVin };
            }
        }
    }

    private handleBrowse = () => {
        const input = this.renderRoot.querySelector('#ua-file-input') as HTMLInputElement | null;
        input?.click();
    };

    private handleFileInput = (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            void this.onFileSelected(input.files[0]);
            input.value = '';
        }
    };

    private handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        if (!this.extracting && !this.submitting) this.dragging = true;
    };

    private handleDragLeave = () => {
        this.dragging = false;
    };

    private handleDrop = (e: DragEvent) => {
        e.preventDefault();
        this.dragging = false;
        if (this.extracting || this.submitting) return;
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            void this.onFileSelected(files[0]);
        }
    };

    private handleCategoryChange = (e: Event) => {
        this.selectedCategory = (e.target as HTMLSelectElement).value as DocumentParsedType;
    };

    private async handleUpload() {
        if (!this.file || this.submitting) return;

        this.submitting = true;
        this.errorMessage = '';
        try {
            const fileBase64 = await fileToBase64(this.file);
            const parsedData = (this.extractResult?.fields as Record<string, unknown> | undefined) || {};
            const result = await attestAttestationDocument(this.tokenID, {
                category: this.selectedCategory,
                fileBase64,
                mimeType: this.file.type || 'application/octet-stream',
                parsedData,
            });
            if (!result) {
                this.errorMessage = msg('Attestation submission failed. Please try again.');
                this.submitting = false;
                return;
            }
            this.dispatchEvent(new CustomEvent('attestation-uploaded', {
                detail: result,
                bubbles: true,
                composed: true,
            }));
            this.close();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Attestation upload failed:', err);
            this.errorMessage = err instanceof Error ? err.message : msg('Attestation submission failed.');
            this.submitting = false;
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    render() {
        if (!this.show) return nothing;

        return html`
            <div class="ua-modal-overlay" @click=${this.handleOverlayClick}>
                <div class="ua-modal" @click=${(e: Event) => e.stopPropagation()}>
                    <div class="ua-header">
                        <h3>${msg('Upload Document Attestation')}</h3>
                        <button class="ua-close"
                                @click=${this.close}
                                ?disabled=${this.submitting || this.extracting}
                                aria-label=${msg('Close')}>×</button>
                    </div>
                    <div class="ua-body">
                        ${this.file ? this.renderFileSection() : this.renderDropzone()}
                        ${this.errorMessage ? html`<div class="ua-status error">${this.errorMessage}</div>` : nothing}
                    </div>
                    <div class="ua-footer">
                        <button class="btn"
                                @click=${this.close}
                                ?disabled=${this.submitting}>${msg('Cancel')}</button>
                        <button class="btn btn-primary"
                                @click=${this.handleUpload}
                                ?disabled=${!this.file || this.extracting || this.submitting}>
                            ${this.submitting ? msg('Uploading...') : msg('Upload')}
                        </button>
                    </div>
                </div>
            </div>
            <input id="ua-file-input"
                   type="file"
                   accept="application/pdf,image/jpeg,image/png"
                   style="display: none;"
                   @change=${this.handleFileInput}>
        `;
    }

    private renderDropzone() {
        return html`
            <div class="ua-dropzone ${this.dragging ? 'dragging' : ''}"
                 @click=${this.handleBrowse}
                 @dragover=${this.handleDragOver}
                 @dragleave=${this.handleDragLeave}
                 @drop=${this.handleDrop}>
                <div>${msg('Drag a document here, or click to browse.')}</div>
                <div class="ua-dropzone-hint">${msg('PDF, JPEG, or PNG.')}</div>
            </div>
        `;
    }

    private renderFileSection() {
        return html`
            <div class="ua-file-row">
                <div class="ua-file-name" title=${this.file?.name || ''}>${this.file?.name || ''}</div>
                <div class="ua-file-size">${this.file ? this.formatFileSize(this.file.size) : ''}</div>
            </div>

            ${this.extracting ? html`
                <div class="ua-status extracting">
                    <span class="ua-spinner"></span>
                    ${msg('Extracting document metadata...')}
                </div>
            ` : nothing}

            ${this.vinMismatch ? html`
                <div class="ua-status warning">
                    ${msg('VIN mismatch:')}
                    ${msg('extract detected')} <strong>${this.vinMismatch.extracted}</strong>,
                    ${msg('but this vehicle is')} <strong>${this.vinMismatch.expected}</strong>.
                    ${msg('You can proceed if this is intentional.')}
                </div>
            ` : nothing}

            <div class="ua-category-row">
                <label class="ua-field-label" for="ua-category">${msg('Document type')}</label>
                <select id="ua-category"
                        @change=${this.handleCategoryChange}
                        ?disabled=${this.extracting || this.submitting}>
                    ${DOCUMENT_PARSED_TYPES.map(t => html`
                        <option value=${t} ?selected=${this.selectedCategory === t}>${categoryLabel(t)}</option>
                    `)}
                </select>
            </div>

            ${this.extractResult ? html`
                <details class="ua-details" ?open=${this.detailsOpen}>
                    <summary @click=${() => { this.detailsOpen = !this.detailsOpen; }}>${msg('Show extract details')}</summary>
                    <pre>${JSON.stringify(this.extractResult.fields, null, 2)}</pre>
                </details>
            ` : nothing}
        `;
    }
}
