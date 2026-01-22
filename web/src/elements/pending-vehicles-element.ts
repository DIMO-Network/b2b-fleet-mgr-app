import {css, html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {globalStyles} from "../global-styles.ts";
import './claim-imei-modal-element';

interface PendingVehicle {
    vin: string;
    imei: string;
    firstSeen: string;
}

interface PendingVehiclesResponse {
    vehicles: PendingVehicle[];
    totalCount: number;
}

@customElement('pending-vehicles-element')
export class PendingVehiclesElement extends LitElement {
    static styles = [ globalStyles,
        css`` ]

    static properties = {
        items: {type: Array},
        alertText: {type: String},
        loading: {type: Boolean},
        currentPage: {type: Number},
        pageSize: {type: Number},
        totalItems: {type: Number},
    }

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
		const url = `/pending-vehicles?skip=${skip}&take=${take}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
        
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
            this.alertText = response.error || "Failed to load pending vehicles";
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
                <div class="onboard-header">PENDING TO ONBOARD VEHICLES</div>
                <div class="onboard-toolbar">
                    <input type="text"
                       placeholder="Search by IMEI or VIN"
                       style="width: 40%; min-width: 200px;"
                       .value=${this.searchTerm}
                       @input=${this.onSearchInput}>
                    <button class="btn btn-primary" @click=${this.openClaimImeiModal} style="margin-left: auto; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.2rem; font-weight: bold;">+</span>
                        Claim new IMEI
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
                            <th>VIN</th>
                            <th>IMEI</th>
                            <th>First Seen</th>
                            <th>Action</th>
                        </tr>
                        </thead>
                        <tbody>
                        ${repeat(this.items, (item) => item.vin, (item) => html`
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
                            <td>${item.vin || 'N/A'}</td>
                            <td>${item.imei}</td>
                            <td>${item.firstSeen}</td>
                            <td>
                                <button class="action-btn" @click=${() => this.openTelemetryModal(item.imei, item.vin)} style="margin-left: 0.5rem;">
                                    TELEMETRY
                                </button>
                            </td>
                        </tr>
                    `)}
                        </tbody>
                    </table>
                </div>
                <div class="pagination" ?hidden=${!this.shouldShowPagination}>
                    <button class="pagination-btn" @click=${this.previousPage} ?disabled=${!this.hasPreviousPage}>PREVIOUS</button>
                    <span>Page ${this.currentPage} of ${this.totalPages}</span>
                    <button class="pagination-btn" @click=${this.nextPage} ?disabled=${!this.hasNextPage}>NEXT</button>
                    <span style="margin-left: auto; color: #666;">Showing ${this.items.length} of ${this.totalItems} items</span>
                </div>
            </div>
        `
    }

    private openTelemetryModal(imei: string, vin?: string) {
        console.log("Opening telemetry modal for IMEI:", imei, "VIN:", vin);
        
        // Create the telemetry modal using the separate component
        const modal = document.createElement('telemetry-modal-element') as any;
        modal.show = true;
        modal.imei = imei;
        modal.vin = vin || '';
        
        // Add event listener for modal close
        modal.addEventListener('modal-closed', () => {
            document.body.removeChild(modal);
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
	}

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

