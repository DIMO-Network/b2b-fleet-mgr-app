import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { globalStyles } from '../global-styles.ts';
import dayjs from 'dayjs';
import {
    AttestationEntry,
    fetchVehicleAttestations,
    resolveDownloadUrl,
    buildDownloadFilename,
} from '@services/document-service.ts';
import './upload-attestation-document-element.ts';

// Schema-aware group used for the special service-invoice table. Anything not in
// this map falls through to the generic "Other Documents" table.
const KNOWN_DOC_TYPES: Record<string, { label: string }> = {
    'dimo.document.vehicle.service.invoice': { label: 'Service Invoices' },
};

@customElement('vehicle-documents-panel-element')
export class VehicleDocumentsPanelElement extends LitElement {
    static styles = [
        globalStyles,
        css`
            .doc-summary {
                max-width: 320px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .doc-cost { font-weight: 600; }
            .doc-expand-btn {
                background: none;
                border: none;
                cursor: pointer;
                padding: 0;
                font-size: 14px;
                color: #666;
                transition: transform 0.15s;
            }
            .doc-expand-btn.open { transform: rotate(90deg); }
            .doc-expanded-row td {
                background: #f8f9fa;
                padding: 12px 16px;
            }
            .doc-expanded-row pre {
                font-family: ui-monospace, SFMono-Regular, monospace;
                font-size: 11px;
                color: #333;
                white-space: pre-wrap;
                word-break: break-all;
                max-height: 280px;
                overflow-y: auto;
                background: #fff;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 10px;
                margin: 0;
            }
            .doc-group-header {
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #555;
                padding: 12px 0 8px;
            }
            .doc-group-header .count {
                color: #999;
                font-weight: 400;
                margin-left: 8px;
            }
            .doc-download {
                background: none;
                border: none;
                cursor: pointer;
                color: #0066cc;
                font-size: 12px;
                padding: 2px 6px;
                text-decoration: underline;
            }
            .doc-download[disabled] {
                color: #999;
                cursor: not-allowed;
                text-decoration: none;
            }
            .doc-empty {
                color: #666;
                padding: 16px;
                text-align: center;
            }
        `,
    ];

    @property({ type: String }) tokenDID: string = '';
    // Vehicle token ID — required for the upload flow (extract/attest endpoints
    // are namespaced by tokenID). Read-only flows only need tokenDID, which is
    // why this is optional.
    @property({ type: Number }) tokenID: number = 0;
    // expectedVin is forwarded to the upload modal so it can warn on a
    // VIN-mismatch between extract output and the current vehicle. Optional —
    // when empty, no check is performed.
    @property({ type: String }) expectedVin: string = '';

    @state() private entries: AttestationEntry[] = [];
    @state() private rawByFilehash: Record<string, string> = {};
    @state() private loading: boolean = false;
    @state() private loadError: string = '';
    @state() private expandedIds: Set<string> = new Set();
    @state() private uploadOpen: boolean = false;

    private lastLoadedTokenDID: string = '';

    async updated(changed: Map<string | number | symbol, unknown>) {
        if (changed.has('tokenDID') && this.tokenDID && this.tokenDID !== this.lastLoadedTokenDID) {
            this.lastLoadedTokenDID = this.tokenDID;
            await this.load();
        }
    }

    private async load() {
        this.loading = true;
        this.loadError = '';
        this.expandedIds = new Set();
        try {
            const { entries, rawByFilehash } = await fetchVehicleAttestations(this.tokenDID);
            this.entries = entries;
            this.rawByFilehash = rawByFilehash;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to load vehicle attestations:', err);
            this.loadError = err instanceof Error ? err.message : 'Failed to load documents';
            this.entries = [];
            this.rawByFilehash = {};
        } finally {
            this.loading = false;
        }
    }

    // getDataField pulls a field from an attestation's data payload. Handles
    // both the flat shape ({totalCost: ...}) and the legacy wrapped shape
    // ({data: {fields: {totalCost: ...}}}) — rental-fleets-app emits both.
    private getDataField(entry: AttestationEntry, field: string): string {
        const root = entry.data;
        if (root == null || typeof root !== 'object') return '—';
        const flat = root as Record<string, unknown>;
        if (field in flat && flat[field] != null) return String(flat[field]);
        const wrapped = (flat.data as Record<string, unknown> | undefined)?.fields as
            | Record<string, unknown>
            | undefined;
        if (wrapped && field in wrapped && wrapped[field] != null) return String(wrapped[field]);
        return '—';
    }

    private parseCategoryFromType(type?: string): string {
        if (!type) return '—';
        const parts = type.split('.');
        return parts[parts.length - 1] || type;
    }

    private formatDate(iso?: string): string {
        if (!iso) return '—';
        const d = dayjs(iso);
        return d.isValid() ? d.format('MMM D, YYYY') : iso;
    }

    private toggleRow(rowId: string) {
        const next = new Set(this.expandedIds);
        if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
        this.expandedIds = next;
    }

    // Navigates the browser to the presigned S3 URL, which serves the file with
    // its own Content-Disposition. The hidden <a download> attribute is mostly
    // a hint — S3 controls the actual filename via the upload's metadata.
    private handleDownload(entry: AttestationEntry, e: Event) {
        e.stopPropagation();
        const url = resolveDownloadUrl(entry, this.rawByFilehash);
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = buildDownloadFilename(entry);
        a.rel = 'noopener';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    private renderDownloadButton(entry: AttestationEntry) {
        const url = resolveDownloadUrl(entry, this.rawByFilehash);
        if (!url) {
            return html`<button class="doc-download" disabled title=${msg('No downloadable file')}>${msg('—')}</button>`;
        }
        return html`<button class="doc-download" @click=${(e: Event) => this.handleDownload(entry, e)}>${msg('Download')}</button>`;
    }

    private renderServiceInvoiceTable(entries: AttestationEntry[], label: string) {
        return html`
            <div class="doc-group-header">${label}<span class="count">${entries.length}</span></div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 28px;"></th>
                            <th>${msg('Provider')}</th>
                            <th>${msg('Service Date')}</th>
                            <th>${msg('Summary')}</th>
                            <th>${msg('Cost')}</th>
                            <th style="width: 100px;">${msg('File')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map(entry => {
                            const rowId = entry.id || `${entry.filehash}-${entry.time}`;
                            const isExpanded = this.expandedIds.has(rowId);
                            const cost = this.getDataField(entry, 'totalCost');
                            const summary = this.getDataField(entry, 'summary');
                            return html`
                                <tr style="cursor: pointer;" @click=${() => this.toggleRow(rowId)}>
                                    <td>
                                        <button class="doc-expand-btn ${isExpanded ? 'open' : ''}" aria-label="Expand">▸</button>
                                    </td>
                                    <td>${this.getDataField(entry, 'providerName')}</td>
                                    <td>${this.getDataField(entry, 'serviceDate')}</td>
                                    <td class="doc-summary" title="${summary}">${summary}</td>
                                    <td class="doc-cost">${cost !== '—' ? `$${cost}` : '—'}</td>
                                    <td>${this.renderDownloadButton(entry)}</td>
                                </tr>
                                ${isExpanded ? html`
                                    <tr class="doc-expanded-row">
                                        <td colspan="6">
                                            <pre>${JSON.stringify(entry, null, 2)}</pre>
                                        </td>
                                    </tr>
                                ` : nothing}
                            `;
                        })}
                    </tbody>
                </table>
            </div>
        `;
    }

    private renderGenericTable(entries: AttestationEntry[], label: string) {
        return html`
            <div class="doc-group-header">${label}<span class="count">${entries.length}</span></div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 28px;"></th>
                            <th>${msg('Type')}</th>
                            <th>${msg('Category')}</th>
                            <th>${msg('Date')}</th>
                            <th>${msg('Source')}</th>
                            <th style="width: 100px;">${msg('File')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map(entry => {
                            const rowId = entry.id || `${entry.filehash}-${entry.time}`;
                            const isExpanded = this.expandedIds.has(rowId);
                            return html`
                                <tr style="cursor: pointer;" @click=${() => this.toggleRow(rowId)}>
                                    <td>
                                        <button class="doc-expand-btn ${isExpanded ? 'open' : ''}" aria-label="Expand">▸</button>
                                    </td>
                                    <td>${entry.type || '—'}</td>
                                    <td>${this.parseCategoryFromType(entry.type)}</td>
                                    <td>${this.formatDate(entry.time)}</td>
                                    <td style="font-size: 11px; color: #666;">${entry.source || '—'}</td>
                                    <td>${this.renderDownloadButton(entry)}</td>
                                </tr>
                                ${isExpanded ? html`
                                    <tr class="doc-expanded-row">
                                        <td colspan="6">
                                            <pre>${JSON.stringify(entry, null, 2)}</pre>
                                        </td>
                                    </tr>
                                ` : nothing}
                            `;
                        })}
                    </tbody>
                </table>
            </div>
        `;
    }

    render() {
        return html`
            <div class="panel mb-16">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>${msg('Documents')}</span>
                    <button class="btn btn-sm btn-primary"
                            ?disabled=${!this.tokenID}
                            title=${this.tokenID ? msg('Upload a document attestation') : msg('Vehicle token not loaded yet')}
                            @click=${() => { this.uploadOpen = true; }}>
                        ${msg('+ Upload')}
                    </button>
                </div>
                <div class="panel-body">
                    ${this.loading ? html`<div class="doc-empty">${msg('Loading documents...')}</div>` :
                    this.loadError ? html`<div class="alert alert-error">${this.loadError}</div>` :
                    this.entries.length === 0 ? html`<div class="doc-empty">${msg('No documents attested for this vehicle.')}</div>` :
                    this.renderGroupedTables()}
                </div>
            </div>
            <upload-attestation-document-element
                .show=${this.uploadOpen}
                .tokenID=${this.tokenID}
                .expectedVin=${this.expectedVin}
                @modal-closed=${() => { this.uploadOpen = false; }}
                @attestation-uploaded=${this.handleAttestationUploaded}>
            </upload-attestation-document-element>
        `;
    }

    // handleAttestationUploaded refreshes the list after a successful upload.
    // We poll a few times because the newly-attested CE takes a moment to be
    // indexed by fetch-api; mirrors the same wait-and-retry rental-fleets-app
    // does in its upload flow. load() is called directly so the dedup guard
    // in updated() doesn't apply.
    private async handleAttestationUploaded() {
        const before = this.entries.length;
        for (let i = 0; i < 4; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            await this.load();
            if (this.entries.length > before) break;
        }
    }

    private renderGroupedTables() {
        // Group by CE type. Render known schemas with their special tables first,
        // then everything else under "Other Documents".
        const byType = new Map<string, AttestationEntry[]>();
        for (const entry of this.entries) {
            const type = entry.type || 'unknown';
            if (!byType.has(type)) byType.set(type, []);
            byType.get(type)!.push(entry);
        }

        const sections: unknown[] = [];
        for (const type of Object.keys(KNOWN_DOC_TYPES)) {
            const items = byType.get(type);
            if (!items || items.length === 0) continue;
            byType.delete(type);
            if (type === 'dimo.document.vehicle.service.invoice') {
                sections.push(this.renderServiceInvoiceTable(items, KNOWN_DOC_TYPES[type].label));
            }
        }
        const leftover: AttestationEntry[] = [];
        for (const items of byType.values()) leftover.push(...items);
        if (leftover.length > 0) {
            sections.push(this.renderGenericTable(leftover, msg('Other Documents')));
        }
        return sections;
    }
}
