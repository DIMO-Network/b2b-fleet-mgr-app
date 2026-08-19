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

// A device definition id is make_model_year, where make and model are lower-case slugs that may
// contain internal hyphens: ford_escape-lx_2025, mercedes-benz_c-class_2020. This mirrors
// service.ValidateDefinitionID in kaufmann-oracle — keep the two in step. The oracle additionally
// checks the definition actually exists, which we can't do here, so a well-formed id can still be
// rejected on submit.
const DEFINITION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*_(?:19|20)\d{2}$/;

// How long to wait after the last keystroke before decoding VINs. Long enough that typing or
// pasting a block doesn't fire a request per intermediate state.
const DECODE_DEBOUNCE_MS = 700;

// Country code sent to the VIN decoder, matching what the onboarding flow uses.
const DECODE_COUNTRY_CODE = 'USA';

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
    definition: FieldCheck;
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
    device_definition_id: string;
    warnings: string[];
}

interface DecodeVinResponse {
    deviceDefinitionId: string;
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

            .spinner {
                display: inline-block;
                width: 11px;
                height: 11px;
                border: 2px solid #ccc;
                border-top-color: #333;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin-right: 4px;
                vertical-align: -1px;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            @media (prefers-reduced-motion: reduce) {
                .spinner { animation: none; }
            }

            .decoding-note {
                color: #666;
                font-style: italic;
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

    // VINs with a decode request in flight — drives the per-row spinner.
    @state()
    private decodingVins: Set<string> = new Set();

    // VIN -> decoded definition id. Doubles as the cache that stops us decoding the same VIN
    // twice across edits.
    @state()
    private decodedVins: Map<string, string> = new Map();

    // VINs the decoder could not resolve, with the reason. Kept so a failure is reported once
    // and not retried on every keystroke.
    @state()
    private failedVins: Map<string, string> = new Map();

    // VINs whose decoded definition has already been written into the textarea. Auto-fill happens
    // once per VIN: if the operator then clears or edits that field, we leave their edit alone
    // rather than restoring what we decoded.
    private appliedVins: Set<string> = new Set();

    private decodeTimer?: ReturnType<typeof setTimeout>;

    private apiService: ApiService;

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearTimeout(this.decodeTimer);
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

    private checkDefinition(raw: string): FieldCheck {
        const value = raw.trim().toLowerCase();
        if (value === "") {
            return {value, status: 'empty', message: ""};
        }
        if (!DEFINITION_PATTERN.test(value)) {
            return {
                value,
                status: 'error',
                message: msg("Device definition must be make_model_year, e.g. ford_escape-lx_2025"),
            };
        }
        return {value, status: 'ok', message: ""};
    }

    private get parsedRows(): ParsedRow[] {
        return this.imeisText.split('\n')
            .map((line, index) => ({line, lineNumber: index + 1}))
            .filter(({line}) => line.trim().length > 0)
            .map(({line, lineNumber}) => {
                const [imei = "", vin = "", plate = "", definition = "", ...rest] = line.split(',');
                const row: ParsedRow = {
                    lineNumber,
                    imei: this.checkImei(imei),
                    vin: this.checkVin(vin),
                    plate: this.checkPlate(plate),
                    definition: this.checkDefinition(definition),
                };
                // Anything past the fourth field is unexpected — flag it rather than dropping it
                // silently, since it usually means a misaligned CSV column.
                if (rest.some(part => part.trim() !== "")) {
                    row.definition = {
                        value: row.definition.value,
                        status: 'error',
                        message: msg("Too many values on this line — expected IMEI, VIN, license plate, device definition"),
                    };
                }
                return row;
            });
    }

    private static rowHasError(row: ParsedRow): boolean {
        return [row.imei, row.vin, row.plate, row.definition].some(field => field.status === 'error');
    }

    // ---- VIN decoding ---------------------------------------------------------------------

    // Called on every edit. Restarting the timer means a burst of typing or a paste produces one
    // decode pass, not one per keystroke.
    private scheduleDecode() {
        clearTimeout(this.decodeTimer);
        this.decodeTimer = setTimeout(() => this.decodePendingVins(), DECODE_DEBOUNCE_MS);
    }

    // Decodes every row that has a usable VIN and no definition of its own. Results land in
    // decodedVins and are written into the textarea by applyDecodedDefinitions.
    private async decodePendingVins() {
        const pending = new Set(
            this.parsedRows
                .filter(row => row.definition.value === "")
                .filter(row => row.vin.status === 'ok' || row.vin.status === 'warn')
                .map(row => row.vin.value)
                .filter(vin => !this.decodedVins.has(vin)
                    && !this.failedVins.has(vin)
                    && !this.decodingVins.has(vin))
        );

        if (pending.size === 0) {
            // Rows may still be waiting on a result fetched for an earlier edit.
            this.applyDecodedDefinitions();
            return;
        }

        for (const vin of pending) {
            this.decodingVins.add(vin);
        }
        this.requestUpdate();

        await Promise.all([...pending].map(async (vin) => {
            try {
                const response = await this.apiService.callApi<DecodeVinResponse>(
                    'POST',
                    '/definitions/decodevin',
                    {vin, countryCode: DECODE_COUNTRY_CODE},
                    true,  // auth
                    false, // this endpoint is not oracle-prefixed
                );
                const decoded = response.data?.deviceDefinitionId;
                if (response.success && decoded) {
                    this.decodedVins.set(vin, decoded.toLowerCase());
                } else {
                    this.failedVins.set(vin, response.error || msg("could not be decoded"));
                }
            } catch (e) {
                this.failedVins.set(vin, `${e}`);
            } finally {
                this.decodingVins.delete(vin);
            }
        }));

        this.applyDecodedDefinitions();
        this.requestUpdate();
    }

    // Writes decoded definitions into the textarea as the fourth field. Always works from the
    // current text rather than a snapshot, so a decode landing while the operator is still typing
    // appends to what they have now instead of overwriting it. Each VIN is filled at most once
    // (appliedVins), so clearing an auto-filled value sticks.
    private applyDecodedDefinitions() {
        // A claim in flight rewrites imeisText itself when it finishes (dropping the rows that
        // succeeded), so writing into it here would race that.
        if (this.processing) return;

        let changed = false;
        // Collected during the pass rather than marked as we go: two devices can carry the same
        // VIN, and marking the first would leave the second permanently unfilled.
        const justApplied = new Set<string>();

        const lines = this.imeisText.split('\n').map(line => {
            if (line.trim() === "") return line;

            const parts = line.split(',');
            const vin = (parts[1] ?? "").trim().toUpperCase();
            const existing = (parts[3] ?? "").trim();
            if (vin === "" || existing !== "") return line;

            const decoded = this.decodedVins.get(vin);
            if (!decoded || this.appliedVins.has(vin)) return line;

            // Pad so the definition lands in the fourth slot even when the plate was omitted;
            // a spaced placeholder keeps the line readable rather than collapsing to ",,".
            while (parts.length < 3) parts.push(" ");
            parts[3] = ` ${decoded}`;
            justApplied.add(vin);
            changed = true;
            return parts.join(',');
        });

        if (changed) {
            justApplied.forEach(vin => this.appliedVins.add(vin));
            this.imeisText = lines.join('\n');
        }
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
                            IMEI, VIN, ${msg('LICENSE PLATE')}, ${msg('DEVICE DEFINITION')}<br>
                            <span style="color:#666;">${msg('Everything after the IMEI is optional. 123456789012345, 1HGCM82633A004352, ABC1234, ford_escape-lx_2025')}</span><br>
                            <span style="color:#666;">${msg('Leave the device definition blank and it is decoded from the VIN.')}</span>
                        </p>
                        <textarea
                            .placeholder=${msg('123456789012345, 1HGCM82633A004352, ABC1234, ford_escape-lx_2025')}
                            .value=${this.imeisText}
                            @input=${this.handleTextInput}
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

    private handleTextInput(e: InputEvent) {
        this.imeisText = (e.target as HTMLTextAreaElement).value;
        this.scheduleDecode();
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
                || [row.imei, row.vin, row.plate, row.definition].some(f => f.status === 'warn'));
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
                            <th>${msg('Device Definition')}</th>
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
                                <td>${this.renderDefinitionField(row)}</td>
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

    // The definition cell has three states the other columns don't: decoding in progress, decoded
    // from the VIN, and a VIN the decoder couldn't resolve. An operator-typed value renders like
    // any other field.
    private renderDefinitionField(row: ParsedRow) {
        if (row.definition.status !== 'empty') {
            return this.renderField(row.definition);
        }

        const vin = row.vin.value;
        if (vin === "" || row.vin.status === 'error') {
            return html`<span class="cell-value muted">${msg('not set')}</span>`;
        }
        if (this.decodingVins.has(vin)) {
            return html`
                <span class="spinner" aria-hidden="true"></span>
                <span class="decoding-note">${msg('decoding…')}</span>
            `;
        }
        const failure = this.failedVins.get(vin);
        if (failure) {
            // Not an error on the row: the claim still lands, and the onboarding verify step
            // decodes the VIN again later. Only the head start is lost.
            const title = msg(str`This VIN could not be decoded (${failure}). The vehicle can still be claimed — the definition is worked out during onboarding.`);
            return html`
                <span class="status-icon" title=${title} aria-label=${title}>⚠️</span>
                <span class="decoding-note">${msg('not decoded')}</span>
            `;
        }
        return html`<span class="cell-value muted">${msg('not set')}</span>`;
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
        const definitionIndex = findColumn([
            'device_definition_id', 'device definition id', 'device_definition', 'device definition',
            'definition_id', 'definition', 'definicion',
        ]);

        let extracted: string[] = [];

        if (imeiIndex !== -1) {
            // Header found: pull each recognized column, skipping the header row itself.
            for (let i = 1; i < rows.length; i++) {
                const imei = rows[i][imeiIndex];
                if (!imei) continue;
                const vin = vinIndex !== -1 ? (rows[i][vinIndex] || "") : "";
                const plate = plateIndex !== -1 ? (rows[i][plateIndex] || "") : "";
                const definition = definitionIndex !== -1 ? (rows[i][definitionIndex] || "") : "";
                extracted.push(ClaimImeiModalElement.toLine(imei, vin, plate, definition));
            }
        } else if (rows[0].length === 1) {
            // No header, single column - assume all rows are IMEIs
            extracted = rows.map(row => row[0]).filter(Boolean);
        } else if (rows[0].length <= 4) {
            // No header, but the shape matches what we accept in the textarea.
            extracted = rows
                .filter(row => row[0])
                .map(row => ClaimImeiModalElement.toLine(row[0], row[1] || "", row[2] || "", row[3] || ""));
        } else {
            this.error = msg("Could not find an 'imei' column in the CSV and it has more columns than IMEI, VIN, license plate, device definition.");
            return;
        }

        if (extracted.length === 0) {
            this.error = msg("No IMEIs found in the CSV file");
            return;
        }

        this.imeisText = extracted.join('\n');
        // An uploaded file is an edit like any other: rows without a definition still get one
        // decoded from their VIN.
        this.scheduleDecode();
    }

    // toLine renders one textarea line, dropping trailing separators when the optional
    // fields are absent so the box stays readable.
    private static toLine(imei: string, vin: string, plate: string, definition: string = ""): string {
        const parts = [imei.trim(), vin.trim(), plate.trim(), definition.trim()];
        while (parts.length > 1 && parts[parts.length - 1] === "") {
            parts.pop();
        }
        return parts.join(', ');
    }

    // ---- submit ---------------------------------------------------------------------------

    private closeModal() {
        if (this.processing) return;
        clearTimeout(this.decodeTimer);
        this.show = false;
        this.imeisText = "";
        this.error = "";
        this.results = [];
        this.decodingVins = new Set();
        this.decodedVins = new Map();
        this.failedVins = new Map();
        this.appliedVins = new Set();
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
            // Only ever the value in the row. A definition decoded but not yet written back is
            // deliberately not sent — what the operator sees in the textarea is what is claimed.
            if (row.definition.value) body.device_definition_id = row.definition.value;

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
