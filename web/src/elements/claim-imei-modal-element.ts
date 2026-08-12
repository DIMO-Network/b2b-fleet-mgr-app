import {css, html, LitElement, nothing} from 'lit';
import {msg, str} from '@lit/localize';
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {globalStyles} from "../global-styles.ts";

// A device IMEI is exactly 15 digits — the oracle enforces the same shape with a CHECK
// constraint on vins.imei, so anything else is rejected server-side anyway.
const IMEI_PATTERN = /^[0-9]{15}$/;

// The oracle stores VINs in a VARCHAR(17) and accepts 11-17 characters: it deliberately does
// not require exactly 17 because some fleets run non-standard identifiers, and the VIN decoder
// is the authoritative check during verification. We block outside that band (the backend would
// reject it) and merely warn inside it.
const VIN_MIN_LENGTH = 11;
const VIN_MAX_LENGTH = 17;
const VIN_STANDARD_LENGTH = 17;
const VIN_ALLOWED_CHARS = /^[A-Z0-9]+$/;
// I, O and Q are excluded from real VINs to avoid confusion with 1 and 0.
const VIN_AMBIGUOUS_CHARS = /[IOQ]/;

// The backend normalizer (utils.CleanLicensePlate) strips dashes and periods and truncates to
// 7 characters. We mirror it so the operator sees what will actually be stored.
const PLATE_MAX_LENGTH = 7;

// Rows rendered in the preview at once. Rows with problems are never hidden by this cap.
const PREVIEW_LIMIT = 50;

type FieldStatus = 'ok' | 'warn' | 'error' | 'empty';

interface FieldCheck {
    // value is the normalized form — what will be sent and stored.
    value: string;
    status: FieldStatus;
    // message is surfaced as the icon's tooltip; empty for a plain valid value.
    message: string;
}

interface ParsedRow {
    lineNumber: number;
    imei: FieldCheck;
    vin: FieldCheck;
    plate: FieldCheck;
}

interface ClaimResult {
    imei: string;
    ok: boolean;
    message: string;
}

interface ClaimResponse {
    imei: string;
    vin: string;
    license_plate: string;
    warnings: string[];
}

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

            .helper-text {
                font-size: 13px;
                color: #666;
                margin-bottom: 0.5rem;
            }

            .instruction-text {
                font-weight: bold;
                margin: 0;
            }

            .format-hint {
                font-family: monospace;
                font-size: 12px;
                color: #444;
                background: #f5f5f5;
                border: 1px solid #e5e7eb;
                border-radius: 4px;
                padding: 6px 8px;
                margin: 0 0 0.5rem 0;
            }

            .preview {
                margin-top: 0.75rem;
                border: 1px solid #e5e7eb;
                border-radius: 4px;
                max-height: 220px;
                overflow: auto;
            }

            .preview table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }

            .preview th, .preview td {
                text-align: left;
                padding: 4px 8px;
                border-bottom: 1px solid #f0f0f0;
                white-space: nowrap;
            }

            .preview th {
                position: sticky;
                top: 0;
                background: #fafafa;
                font-weight: bold;
            }

            .preview td.line-no {
                color: #999;
                width: 2rem;
            }

            .cell-value {
                font-family: monospace;
            }

            .cell-value.muted {
                color: #999;
                font-family: inherit;
                font-style: italic;
            }

            /* The icon carries a title so hovering explains exactly what is wrong. */
            .status-icon {
                cursor: help;
                margin-right: 4px;
            }

            .preview-summary {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 13px;
                margin-top: 0.5rem;
            }

            .summary-error {
                color: #721c24;
                font-weight: bold;
            }

            .summary-ok {
                color: #155724;
            }

            .results li {
                margin-bottom: 0.25rem;
            }

            .results ul {
                margin: 0;
                padding-left: 1.25rem;
            }
        `
    ];

    @property({type: Boolean})
    public show = false;

    @state()
    private imeisText: string = "";

    @state()
    private processing: boolean = false;

    @state()
    private error: string = "";

    @state()
    private results: ClaimResult[] = [];

    private apiService: ApiService;

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
    }

    // ---- parsing & validation -------------------------------------------------------------

    private checkImei(raw: string): FieldCheck {
        const value = raw.trim();
        if (value === "") {
            return {value, status: 'error', message: msg("IMEI is required")};
        }
        if (!IMEI_PATTERN.test(value)) {
            return {
                value,
                status: 'error',
                message: msg("IMEI must be exactly 15 digits"),
            };
        }
        return {value, status: 'ok', message: ""};
    }

    private checkVin(raw: string): FieldCheck {
        const value = raw.trim().toUpperCase();
        if (value === "") {
            return {value, status: 'empty', message: ""};
        }
        if (!VIN_ALLOWED_CHARS.test(value)) {
            return {
                value,
                status: 'error',
                message: msg("VIN may only contain letters and numbers"),
            };
        }
        if (value.length < VIN_MIN_LENGTH || value.length > VIN_MAX_LENGTH) {
            return {
                value,
                status: 'error',
                message: msg(str`VIN must be between ${VIN_MIN_LENGTH} and ${VIN_MAX_LENGTH} characters (this one is ${value.length})`),
            };
        }
        if (value.length !== VIN_STANDARD_LENGTH) {
            return {
                value,
                status: 'warn',
                message: msg(str`A standard VIN is ${VIN_STANDARD_LENGTH} characters; this one is ${value.length}. It will be accepted but may fail to decode.`),
            };
        }
        if (VIN_AMBIGUOUS_CHARS.test(value)) {
            return {
                value,
                status: 'warn',
                message: msg("A standard VIN never contains I, O or Q — check for a mistyped 1 or 0."),
            };
        }
        return {value, status: 'ok', message: ""};
    }

    private checkPlate(raw: string): FieldCheck {
        // Mirrors the backend normalizer: strip dashes and periods, then truncate.
        const stripped = raw.trim().replace(/[-.]/g, '');
        if (stripped === "") {
            return {value: "", status: 'empty', message: ""};
        }
        if (stripped.length > PLATE_MAX_LENGTH) {
            return {
                value: stripped.slice(0, PLATE_MAX_LENGTH),
                status: 'warn',
                message: msg(str`License plates are stored as ${PLATE_MAX_LENGTH} characters; this one will be shortened to "${stripped.slice(0, PLATE_MAX_LENGTH)}".`),
            };
        }
        return {value: stripped, status: 'ok', message: ""};
    }

    private get parsedRows(): ParsedRow[] {
        return this.imeisText.split('\n')
            .map((line, index) => ({line, lineNumber: index + 1}))
            .filter(({line}) => line.trim().length > 0)
            .map(({line, lineNumber}) => {
                const [imei = "", vin = "", plate = "", ...rest] = line.split(',');
                const row: ParsedRow = {
                    lineNumber,
                    imei: this.checkImei(imei),
                    vin: this.checkVin(vin),
                    plate: this.checkPlate(plate),
                };
                // Anything past the third field is unexpected — flag it rather than dropping it
                // silently, since it usually means a misaligned CSV column.
                if (rest.some(part => part.trim() !== "")) {
                    row.plate = {
                        value: row.plate.value,
                        status: 'error',
                        message: msg("Too many values on this line — expected IMEI, VIN, license plate"),
                    };
                }
                return row;
            });
    }

    private static rowHasError(row: ParsedRow): boolean {
        return [row.imei, row.vin, row.plate].some(field => field.status === 'error');
    }

    private get duplicateImeis(): Set<string> {
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const row of this.parsedRows) {
            if (row.imei.value === "") continue;
            if (seen.has(row.imei.value)) {
                duplicates.add(row.imei.value);
            }
            seen.add(row.imei.value);
        }
        return duplicates;
    }

    // ---- rendering ------------------------------------------------------------------------

    render() {
        if (!this.show) {
            return nothing;
        }

        const rows = this.parsedRows;
        const errorCount = rows.filter(row => ClaimImeiModalElement.rowHasError(row)).length;
        const duplicates = this.duplicateImeis;
        const hasBlockingProblem = errorCount > 0 || duplicates.size > 0;

        return html`
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
                    <div class="modal-header">
                        <h3>${msg('Claim New IMEI')}</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>
                    <div class="modal-body">
                        ${this.error ? html`<div class="alert alert-error" style="margin-bottom: 1rem; white-space: pre-line;">${this.error}</div>` : nothing}
                        ${this.renderResults()}
                        <p class="helper-text">${msg("Please claim your IMEI's every time you purchase or add a new device to your fleet.")}</p>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <p class="instruction-text">${msg('Enter one vehicle per line:')}</p>
                            <button type="button" class="btn btn-sm" @click=${() => this.shadowRoot?.querySelector<HTMLInputElement>('#csv-upload')?.click()} ?disabled=${this.processing}>
                                ${msg('Upload CSV')}
                            </button>
                            <input type="file" id="csv-upload" style="display: none;" accept=".csv" @change=${this.handleFileUpload}>
                        </div>
                        <p class="format-hint">
                            IMEI, VIN, ${msg('LICENSE PLATE')}<br>
                            <span style="color:#666;">${msg('VIN and license plate are optional. 123456789012345, 1HGCM82633A004352, ABC1234')}</span>
                        </p>
                        <textarea
                            .placeholder=${msg('123456789012345, 1HGCM82633A004352, ABC1234')}
                            .value=${this.imeisText}
                            @input=${(e: InputEvent) => this.imeisText = (e.target as HTMLTextAreaElement).value}
                            ?disabled=${this.processing}
                        ></textarea>
                        ${this.renderPreview(rows, duplicates)}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" @click=${this.closeModal} ?disabled=${this.processing}>
                            ${msg('Cancel')}
                        </button>
                        <button type="button" class="btn btn-primary ${this.processing ? 'processing' : ''}" @click=${this.submitClaims} ?disabled=${this.processing || rows.length === 0 || hasBlockingProblem}>
                            ${this.processing ? msg('Claiming...') : msg('Submit')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    private renderPreview(rows: ParsedRow[], duplicates: Set<string>) {
        if (rows.length === 0) {
            return nothing;
        }

        const errorCount = rows.filter(row => ClaimImeiModalElement.rowHasError(row)).length;

        // Never let the display cap hide a problem: rows with errors or warnings are kept first,
        // then restored to line order so the table still reads top-to-bottom.
        let shown = rows;
        let hidden = 0;
        if (rows.length > PREVIEW_LIMIT) {
            const problems = rows.filter(row => ClaimImeiModalElement.rowHasError(row)
                || [row.imei, row.vin, row.plate].some(f => f.status === 'warn'));
            const clean = rows.filter(row => !problems.includes(row));
            shown = [...problems, ...clean].slice(0, PREVIEW_LIMIT).sort((a, b) => a.lineNumber - b.lineNumber);
            hidden = rows.length - shown.length;
        }

        return html`
            <div class="preview">
                <table>
                    <thead>
                        <tr>
                            <th></th>
                            <th>${msg('IMEI')}</th>
                            <th>${msg('VIN')}</th>
                            <th>${msg('License Plate')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shown.map(row => html`
                            <tr>
                                <td class="line-no">${row.lineNumber}</td>
                                <td>${this.renderField(row.imei, duplicates.has(row.imei.value)
                                    ? msg('This IMEI appears more than once')
                                    : "")}</td>
                                <td>${this.renderField(row.vin)}</td>
                                <td>${this.renderField(row.plate)}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
            <div class="preview-summary">
                <span>
                    ${errorCount > 0
                        ? html`<span class="summary-error">${msg(str`${errorCount} of ${rows.length} rows need fixing before you can submit`)}</span>`
                        : duplicates.size > 0
                            ? html`<span class="summary-error">${msg('Remove the duplicate IMEIs before submitting')}</span>`
                            : html`<span class="summary-ok">${msg(str`${rows.length} ready to claim`)}</span>`}
                </span>
                ${hidden > 0 ? html`<span style="color:#666;">${msg(str`+${hidden} more not shown`)}</span>` : nothing}
            </div>
        `;
    }

    // renderField shows the normalized value with a status emoji whose title explains any
    // problem on hover. extraError, when set, overrides the field's own status.
    private renderField(field: FieldCheck, extraError: string = "") {
        if (extraError) {
            return html`
                <span class="status-icon" title=${extraError} aria-label=${extraError}>❌</span>
                <span class="cell-value">${field.value}</span>
            `;
        }
        if (field.status === 'empty') {
            return html`<span class="cell-value muted">${msg('not set')}</span>`;
        }
        const icon = field.status === 'ok' ? '✅' : field.status === 'warn' ? '⚠️' : '❌';
        const title = field.message || msg('Looks good');
        return html`
            <span class="status-icon" title=${title} aria-label=${title}>${icon}</span>
            <span class="cell-value">${field.value}</span>
        `;
    }

    private renderResults() {
        if (this.results.length === 0) {
            return nothing;
        }
        const failed = this.results.filter(r => !r.ok);
        return html`
            <div class="alert ${failed.length > 0 ? 'alert-error' : 'alert-success'} results" style="margin-bottom: 1rem;">
                <div style="margin-bottom: 0.25rem; font-weight: bold;">
                    ${msg(str`${this.results.length - failed.length} of ${this.results.length} claimed`)}
                </div>
                <ul>
                    ${this.results.map(r => html`<li>${r.ok ? '✅' : '❌'} ${r.imei}${r.message ? ` — ${r.message}` : ''}</li>`)}
                </ul>
            </div>
        `;
    }

    // ---- CSV ------------------------------------------------------------------------------

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
            this.error = msg("Failed to read file");
        };

        reader.readAsText(file);
    }

    private processCsv(content: string) {
        this.error = "";
        const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length === 0) {
            this.error = msg("The CSV file is empty");
            return;
        }

        const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
        const header = rows[0].map(cell => cell.toLowerCase());

        // Column aliases we recognize in a header row. VIN and plate are optional.
        const findColumn = (names: string[]) => header.findIndex(cell => names.includes(cell));
        const imeiIndex = findColumn(['imei']);
        const vinIndex = findColumn(['vin']);
        const plateIndex = findColumn(['license_plate', 'license plate', 'licenseplate', 'plate', 'patente']);

        let extracted: string[] = [];

        if (imeiIndex !== -1) {
            // Header found: pull each recognized column, skipping the header row itself.
            for (let i = 1; i < rows.length; i++) {
                const imei = rows[i][imeiIndex];
                if (!imei) continue;
                const vin = vinIndex !== -1 ? (rows[i][vinIndex] || "") : "";
                const plate = plateIndex !== -1 ? (rows[i][plateIndex] || "") : "";
                extracted.push(ClaimImeiModalElement.toLine(imei, vin, plate));
            }
        } else if (rows[0].length === 1) {
            // No header, single column - assume all rows are IMEIs
            extracted = rows.map(row => row[0]).filter(Boolean);
        } else if (rows[0].length <= 3) {
            // No header, but the shape matches what we accept in the textarea: IMEI, VIN, plate.
            extracted = rows
                .filter(row => row[0])
                .map(row => ClaimImeiModalElement.toLine(row[0], row[1] || "", row[2] || ""));
        } else {
            this.error = msg("Could not find an 'imei' column in the CSV and it has more columns than IMEI, VIN, license plate.");
            return;
        }

        if (extracted.length === 0) {
            this.error = msg("No IMEIs found in the CSV file");
            return;
        }

        this.imeisText = extracted.join('\n');
    }

    // toLine renders one textarea line, dropping trailing separators when the optional
    // fields are absent so the box stays readable.
    private static toLine(imei: string, vin: string, plate: string): string {
        const parts = [imei.trim(), vin.trim(), plate.trim()];
        while (parts.length > 1 && parts[parts.length - 1] === "") {
            parts.pop();
        }
        return parts.join(', ');
    }

    // ---- submit ---------------------------------------------------------------------------

    private closeModal() {
        if (this.processing) return;
        this.show = false;
        this.imeisText = "";
        this.error = "";
        this.results = [];
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private async submitClaims() {
        const rows = this.parsedRows;

        if (rows.length === 0) {
            this.error = msg("Please enter at least one IMEI");
            return;
        }
        // The submit button is disabled in this state; this is the belt-and-braces check.
        if (rows.some(row => ClaimImeiModalElement.rowHasError(row)) || this.duplicateImeis.size > 0) {
            this.error = msg("Please fix the highlighted rows before submitting");
            return;
        }

        this.processing = true;
        this.error = "";
        this.results = [];

        const results: ClaimResult[] = [];

        for (const row of rows) {
            const body: Record<string, string> = {};
            if (row.vin.value) body.vin = row.vin.value;
            if (row.plate.value) body.license_plate = row.plate.value;

            try {
                const response = await this.apiService.callApi<ClaimResponse>(
                    'POST',
                    `/pending-vehicles/claim/${row.imei.value}`,
                    body,
                    true, // auth
                    true, // useOracle
                    true  // includeTenantId
                );

                if (response.success) {
                    // A claim can succeed while a detail could not be applied (e.g. a plate
                    // already used by another vehicle) — surface those warnings per row.
                    const warnings = response.data?.warnings ?? [];
                    results.push({
                        imei: row.imei.value,
                        ok: true,
                        message: warnings.join('; '),
                    });
                } else {
                    results.push({
                        imei: row.imei.value,
                        ok: false,
                        message: response.error || msg("Failed to claim"),
                    });
                }
            } catch (e) {
                results.push({imei: row.imei.value, ok: false, message: `${e}`});
            }
        }

        this.processing = false;
        this.results = results;

        const succeeded = results.filter(r => r.ok);
        if (succeeded.length > 0) {
            // Reload the pending list even on a partial failure so what did land shows up.
            this.dispatchEvent(new CustomEvent('claims-submitted', {
                bubbles: true,
                composed: true
            }));
        }

        const allClean = results.every(r => r.ok && !r.message);
        if (allClean) {
            this.closeModal();
            return;
        }
        // Keep the modal open so warnings and failures can be read. Drop the rows that
        // succeeded so a retry only re-sends what still needs claiming.
        const failedImeis = new Set(results.filter(r => !r.ok).map(r => r.imei));
        this.imeisText = this.imeisText.split('\n')
            .filter(line => {
                const imei = line.split(',')[0]?.trim();
                return imei ? failedImeis.has(imei) : false;
            })
            .join('\n');
    }
}
