import {html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";

interface PendingVehicle {
    vin: string;
    imei: string;
    firstSeen: string;
}

@customElement('pending-vehicles-element')
export class PendingVehiclesElement extends LitElement {
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
    private showTelemetryModal: boolean = false;
    private vehicleVin: string = "";

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

    private async loadPendingVehicles() {
        this.loading = true;
        this.alertText = "";
        
        const skip = (this.currentPage - 1) * this.pageSize;
        const take = this.pageSize;
        
        const url = `/pending-vehicles?skip=${skip}&take=${take}`;
        
        const response = await this.apiService.callApi<PendingVehicle[]>(
            'GET',
            url,
            null,
            true, // auth required
            true  // oracle endpoint
        );

        this.loading = false;

        if (response.success && response.data) {
            this.items = response.data;
            // Note: You may need to update this based on your API response structure
            // If the API returns total count, use it: this.totalItems = response.totalCount;
            // For now, we'll estimate based on current page and items
            if (response.data.length < this.pageSize) {
                this.totalItems = skip + response.data.length;
            } else {
                // If we got a full page, there might be more items
                this.totalItems = skip + response.data.length + 1; // +1 to indicate there might be more
            }
            this.shouldShowPagination = this.totalItems > this.pageSize;
        } else {
            this.alertText = response.error || "Failed to load pending vehicles";
            this.items = [];
            this.totalItems = 0;
        }
    }

    private async onboardVehicle(vin: string, imei: string) {
        console.log(`Onboarding vehicle with VIN: ${vin}, IMEI: ${imei}`);
        
        // Dispatch event to copy VIN to add-vin-element
        this.dispatchEvent(new CustomEvent('onboard-vehicle', {
            detail: { vin: vin, imei: imei },
            bubbles: true,
            composed: true
        }));
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
            <h2>Pending to Onboard Vehicles</h2>
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            ${this.loading ? html`<div>Loading...</div>` : html`
                <table style="font-size: 80%">
                    <thead>
                    <tr>
                        <th>
                            <input type="checkbox" 
                                   .checked=${this.items.length > 0 && this.items.every(vehicle => this.selectedPendingVehicles.has(vehicle.vin))}
                                   @change=${this.toggleAllPendingVehicles}>
                            Select
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
                                       @change=${() => this.togglePendingVehicle(item.vin)}>
                            </td>
                            <td>${item.vin}</td>
                            <td>${item.imei}</td>
                            <td>${item.firstSeen}</td>
                            <td>
                                <button @click=${() => this.onboardVehicle(item.vin, item.imei)}>
                                    Onboard
                                </button>
                                <button @click=${() => this.openTelemetryModal(item.imei)} style="margin-left: 0.5rem;">
                                    Telemetry
                                </button>
                            </td>
                        </tr>
                    `)}
                    </tbody>
                </table>

                <!-- Pagination Controls -->
                <div ?hidden=${!this.shouldShowPagination}>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.5rem;">
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button 
                            @click=${this.previousPage} 
                            ?disabled=${!this.hasPreviousPage}
                            style="padding: 0.25rem 0.5rem; font-size: 0.875rem;"
                        >
                            Previous
                        </button>
                        <span style="font-size: 0.875rem;">
                            Page ${this.currentPage} of ${this.totalPages}
                        </span>
                        <button 
                            @click=${this.nextPage} 
                            ?disabled=${!this.hasNextPage}
                            style="padding: 0.25rem 0.5rem; font-size: 0.875rem;"
                        >
                            Next
                        </button>
                    </div>
                    <div style="font-size: 0.875rem; color: #666;">
                        Showing ${this.items.length} of ${this.totalItems} items
                    </div>
                    </div>
                </div>
            `}
            
            <!-- Telemetry Modal -->
            <telemetry-modal-element 
                .show=${this.showTelemetryModal}
                .vehicleVin=${this.vehicleVin || ""}
                @modal-closed=${this.closeTelemetryModal}>
            </telemetry-modal-element>
        `
    }

    private openTelemetryModal(vin: string) {
        console.log("Opening telemetry modal for vehicle:", vin);
        this.vehicleVin = vin;
        this.showTelemetryModal = true;
        
        // Load telemetry data
        const modal = document.querySelector('telemetry-modal-element') as any;
        if (modal) {
            modal.loadTelemetryData();
        }
    }

    private closeTelemetryModal() {
        this.showTelemetryModal = false;
        this.vehicleVin = "";
        console.log("Closing telemetry modal");
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
        const allSelected = this.items.every(vehicle => this.selectedPendingVehicles.has(vehicle.vin));
        
        if (allSelected) {
            // If all are selected, deselect all
            this.selectedPendingVehicles.clear();
        } else {
            // If not all are selected, select all
            this.items.forEach(vehicle => {
                this.selectedPendingVehicles.add(vehicle.vin);
            });
        }
        this.requestUpdate();
        this.dispatchSelectionChanged();
    }

    private dispatchSelectionChanged() {
        this.dispatchEvent(new CustomEvent('selection-changed', {
            detail: { selectedVehicles: Array.from(this.selectedPendingVehicles) },
            bubbles: true,
            composed: true
        }));
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

