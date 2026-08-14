import {css, html, LitElement} from 'lit';
import {msg} from '@lit/localize';
import {repeat} from 'lit/directives/repeat.js';
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {globalStyles} from "../global-styles.ts";
import './claim-imei-modal-element';

interface PendingVehicle {
    vin: string;
    imei: string;
    deviceType: string;
    // Recorded at claim time when the operator supplies one. DB-only until the vehicle is
    // minted — the plate attestation is published post-mint by the oracle.
    licensePlate: string;
    firstSeen: string;
}

// The device types the oracle records in vins.device_type. Kept in step with
// models.DeviceType* on the oracle side — it rejects anything else with a 400,
// so an option added here without one there filters to an error.
const DEVICE_TYPES = ['smart5', 'gv58'] as const;

// deviceTypeLabel maps the oracle's device_type to a human-friendly name. New
// device types fall back to the raw value so they are visible rather than hidden.
function deviceTypeLabel(deviceType: string): string {
    switch (deviceType) {
        case 'smart5':
            return 'Ruptela Smart5';
        case 'gv58':
            return 'Kamaleon GV58';
        default:
            return deviceType || 'Unknown';
    }
}

interface PendingVehiclesResponse {
    vehicles: PendingVehicle[];
    totalCount: number;
}

@customElement('pending-vehicles-element')
export class PendingVehiclesElement extends LitElement {
    static styles = [ globalStyles,
        css`` ];

    static properties = {
        items: {type: Array},
        alertText: {type: String},
        loading: {type: Boolean},
        currentPage: {type: Number},
        pageSize: {type: Number},
        totalItems: {type: Number},
    };

    @property({attribute: true})
    private items: PendingVehicle[];

    @property({attribute: true})
    private currentPage: number;

    @property({attribute: true})
    private pageSize: number;

    @property({attribute: true})
    private totalItems: number;

    @property({attribute: true})
    private shouldShowPagination: boolean;

    private alertText: string;
    private loading: boolean;
    private apiService: ApiService;

	@state()
	private searchTerm: string = "";

	// Empty means "all device types". Sent to the oracle rather than applied here:
	// the list is paginated server-side, so a client-side filter would only narrow
	// the current page while the count and page numbers described the full set.
	@state()
	private deviceTypeFilter: string = "";

	private searchDebounce?: number;

    @state()
    private selectedPendingVehicles: Set<string> = new Set();

    constructor() {
        super();
        this.items = [];
        this.alertText = "";
        this.loading = false;
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalItems = 0;
        this.apiService = ApiService.getInstance();
        this.shouldShowPagination = false;
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        return this;
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.loadPendingVehicles();
    }

    public async loadPendingVehicles() {
        this.loading = true;
        this.alertText = "";
        
        const skip = (this.currentPage - 1) * this.pageSize;
        const take = this.pageSize;
        
		const search = this.searchTerm?.trim();
		const url = `/pending-vehicles?skip=${skip}&take=${take}`
			+ (search ? `&search=${encodeURIComponent(search)}` : '')
			+ (this.deviceTypeFilter ? `&deviceType=${encodeURIComponent(this.deviceTypeFilter)}` : '');
        
        const response = await this.apiService.callApi<PendingVehiclesResponse>(
            'GET',
            url,
            null,
            true, // auth required
            true  // oracle endpoint
        );

        this.loading = false;

        if (response.success && response.data) {
            this.items = response.data.vehicles;
            this.totalItems = response.data.totalCount;
            this.shouldShowPagination = this.totalItems > this.pageSize;
        } else {
            this.alertText = response.error || msg("Failed to load pending vehicles");
            this.items = [];
            this.totalItems = 0;
        }
    }

    private async goToPage(page: number) {
        if (page < 1) return;
        this.currentPage = page;
        await this.loadPendingVehicles();
    }

    private async nextPage() {
        const maxPage = Math.ceil(this.totalItems / this.pageSize);
        if (this.currentPage < maxPage) {
            await this.goToPage(this.currentPage + 1);
        }
    }

    private async previousPage() {
        if (this.currentPage > 1) {
            await this.goToPage(this.currentPage - 1);
        }
    }

    private get totalPages(): number {
        return Math.ceil(this.totalItems / this.pageSize);
    }

    private get hasNextPage(): boolean {
        return this.currentPage < this.totalPages;
    }

    private get hasPreviousPage(): boolean {
        return this.currentPage > 1;
    }

		render() {
        return html`
            <div class="onboard-section">
                <div class="onboard-header">${msg('PENDING TO ONBOARD VEHICLES')}</div>
                <div class="onboard-toolbar">
                    <input type="text"
                       .placeholder=${msg('Search by IMEI, VIN or license plate')}
                       style="width: 40%; min-width: 200px;"
                       .value=${this.searchTerm}
                       @input=${this.onSearchInput}>
                    <select aria-label=${msg('Filter by device type')}
                            style="margin-left: 0.5rem; min-width: 170px;"
                            .value=${this.deviceTypeFilter}
                            @change=${this.onDeviceTypeChange}>
                        <option value="">${msg('All device types')}</option>
                        ${DEVICE_TYPES.map((dt) => html`
                            <option value=${dt} ?selected=${this.deviceTypeFilter === dt}>${deviceTypeLabel(dt)}</option>
                        `)}
                    </select>
                    <button class="btn btn-primary" @click=${this.openClaimImeiModal} style="margin-left: auto; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.2rem; font-weight: bold;" title=${msg("Please claim your IMEI's every time you purchase or add a new device to your fleet")} >+</span>
                        ${msg('Claim new IMEI')}
                    </button>
                </div>
                <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                    ${this.alertText}
                </div>
                <div class="table-container" style="border-top: none;" ?hidden="${this.loading}" >
                    <table>
                        <thead>
                        <tr>
                            <th style="width: 30px;"><input type="checkbox"
                                                            .checked=${(() => {
                                                                const validVehicles = this.items.filter(vehicle => vehicle.vin && vehicle.vin.trim() !== '');
                                                                return validVehicles.length > 0 && validVehicles.every(vehicle => this.selectedPendingVehicles.has(vehicle.vin));
                                                            })()}
                                                            @change=${this.toggleAllPendingVehicles}>
                            </th>
                            <th>${msg('VIN')}</th>
                            <th>${msg('IMEI')}</th>
                            <th>${msg('License Plate')}</th>
                            <th>${msg('Device')}</th>
                            <th>${msg('First Seen')}</th>
                            <th>${msg('Action')}</th>
                        </tr>
                        </thead>
                        <tbody>
                        ${this.items.length === 0 ? html`
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 2rem; color: #666;">
                                ${msg('No results found, make sure you have')} <a href="#" @click=${(e: Event) => { e.preventDefault(); this.openClaimImeiModal(); }} style="color: #007bff; text-decoration: underline; cursor: pointer;">${msg('claimed')}</a> ${msg('your devices')}
                            </td>
                        </tr>
                        ` : repeat(this.items, (item) => item.imei, (item) => html`
                        <tr>
                            <td>
                                <input type="checkbox"
                                       .checked=${this.selectedPendingVehicles.has(item.vin)}
                                       ?disabled=${!item.vin || item.vin.trim() === ''}
                                       @click=${(e: Event) => {
                            e.stopPropagation();
                            if (item.vin && item.vin.trim() !== '') {
                                this.togglePendingVehicle(item.vin);
                            }
                        }}>
                            </td>
                            <td>${item.vin || msg('N/A')}</td>
                            <td>${item.imei}</td>
                            <td>${item.licensePlate || msg('N/A')}</td>
                            <td>${deviceTypeLabel(item.deviceType)}</td>
                            <td>${item.firstSeen}</td>
                            <td>
                                <button class="action-btn" @click=${() => this.openTelemetryModal(item.imei, item.vin, item.deviceType)} style="margin-left: 0.5rem;">
                                    ${msg('TELEMETRY')}
                                </button>
                            </td>
                        </tr>
                    `)}
                        </tbody>
                    </table>
                </div>
                <div class="pagination" ?hidden=${!this.shouldShowPagination}>
                    <button class="pagination-btn" @click=${this.previousPage} ?disabled=${!this.hasPreviousPage}>${msg('PREVIOUS')}</button>
                    <span>${msg('Page')} ${this.currentPage} ${msg('of')} ${this.totalPages}</span>
                    <button class="pagination-btn" @click=${this.nextPage} ?disabled=${!this.hasNextPage}>${msg('NEXT')}</button>
                    <span style="margin-left: auto; color: #666;">${msg('Showing')} ${this.items.length} ${msg('of')} ${this.totalItems} ${msg('items')}</span>
                </div>
            </div>
        `;
    }

    private openTelemetryModal(imei: string, vin?: string, deviceType?: string) {
        console.log("Opening telemetry modal for IMEI:", imei, "VIN:", vin, "deviceType:", deviceType);

        // Create the telemetry modal using the separate component
        const modal = document.createElement('telemetry-modal-element') as any;
        modal.show = true;
        modal.imei = imei;
        modal.vin = vin || '';
        modal.deviceType = deviceType || '';
        
        // Add event listener for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });

        // A manually-entered VIN (Kamaleon/GV58 devices don't report one) means this row can now
        // be selected for minting — reload the list so its VIN and enabled checkbox show up.
        modal.addEventListener('vin-associated', async () => {
            await this.loadPendingVehicles();
        });

        // Add to body
        document.body.appendChild(modal);
        
        // Load telemetry data after the modal is added to the DOM
        setTimeout(() => {
            modal.loadTelemetryData();
        }, 100);
    }

    private openClaimImeiModal() {
        const modal = document.createElement('claim-imei-modal-element') as any;
        modal.show = true;

        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('claims-submitted', async () => {
            await this.loadPendingVehicles();
        });

        document.body.appendChild(modal);
    }


    private togglePendingVehicle(vin: string) {
        if (this.selectedPendingVehicles.has(vin)) {
            this.selectedPendingVehicles.delete(vin);
        } else {
            this.selectedPendingVehicles.add(vin);
        }
        this.requestUpdate();
        this.dispatchSelectionChanged();
    }

    private toggleAllPendingVehicles() {
        // Only consider vehicles with valid VINs
        const validVehicles = this.items.filter(vehicle => vehicle.vin && vehicle.vin.trim() !== '');
        const allSelected = validVehicles.every(vehicle => this.selectedPendingVehicles.has(vehicle.vin));
        
        if (allSelected) {
            // If all valid vehicles are selected, deselect all
            this.selectedPendingVehicles.clear();
        } else {
            // If not all valid vehicles are selected, select all valid ones
            validVehicles.forEach(vehicle => {
                this.selectedPendingVehicles.add(vehicle.vin);
            });
        }
        this.requestUpdate();
        this.dispatchSelectionChanged();
    }

    private dispatchSelectionChanged() {
        const selectedImeis = this.items
            .filter(vehicle => this.selectedPendingVehicles.has(vehicle.vin))
            .map(vehicle => vehicle.imei);

        this.dispatchEvent(new CustomEvent('selection-changed', {
            detail: { 
                selectedVehicles: Array.from(this.selectedPendingVehicles),
                selectedImeis: selectedImeis
            },
            bubbles: true,
            composed: true
        }));
    }

	private onSearchInput = (e: InputEvent) => {
		this.searchTerm = (e.target as HTMLInputElement).value;
		if (this.searchDebounce) {
			clearTimeout(this.searchDebounce);
		}
		this.searchDebounce = window.setTimeout(() => {
			this.currentPage = 1;
			this.loadPendingVehicles();
		}, 500);
	};

	// No debounce: a select fires once on commit, unlike typing. Resets to page 1
	// for the same reason search does — the old page number rarely exists in the
	// narrowed set, and staying on it shows an empty table.
	private onDeviceTypeChange = (e: Event) => {
		this.deviceTypeFilter = (e.target as HTMLSelectElement).value;
		this.currentPage = 1;
		void this.loadPendingVehicles();
	};

    // Public method to get selected vehicles
    public getSelectedVehicles(): string[] {
        return Array.from(this.selectedPendingVehicles);
    }

    // Public method to clear selection
    public clearSelection() {
        this.selectedPendingVehicles.clear();
        this.requestUpdate();
        this.dispatchSelectionChanged();
    }
}

