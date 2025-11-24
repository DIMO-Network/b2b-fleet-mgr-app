import {html, LitElement} from 'lit'
import {repeat} from 'lit/directives/repeat.js';
import {customElement, property, state} from "lit/decorators.js";
import {Vehicle} from "@datatypes//vehicle.ts";
import {ApiService} from "@services/api-service.ts";

interface VehiclesResponse {
    vehicles: Vehicle[];
    totalCount: number;
}

@customElement('vehicle-list-element')
export class VehicleListElement extends LitElement {
    static properties = {
        items: {type: Array},
        alertText: {type: String},
        loading: {type: Boolean},
        currentPage: {type: Number},
        pageSize: {type: Number},
        totalItems: {type: Number},
    }

    @property({attribute: true})
    private items: Vehicle[];

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


    constructor() {
        super();
        this.items = [];
        this.alertText = "";
        this.loading = false;
        this.currentPage = 1;
        this.pageSize = 100;
        this.totalItems = 0;
        this.apiService = ApiService.getInstance();
        this.shouldShowPagination = false;
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.loadVehicles();
    }

    public async loadVehicles() {
        this.loading = true;
        this.alertText = "";
        
        const skip = (this.currentPage - 1) * this.pageSize;
        const take = this.pageSize;
        
        const url = `/vehicles?skip=${skip}&take=${take}`;
        
        const response = await this.apiService.callApi<VehiclesResponse>(
            'GET',
            url,
            null,
            true, // auth required
            true  // oracle endpoint
        );

        this.loading = false;

        if (response.success && response.data) {
            this.items = response.data.vehicles.sort((a, b) => a.tokenId - b.tokenId);
            this.totalItems = response.data.totalCount;
            this.shouldShowPagination = this.totalItems > this.pageSize;
        } else {
            this.alertText = response.error || "Failed to load vehicles";
            this.items = [];
            this.totalItems = 0;
        }
    }

    private async goToPage(page: number) {
        if (page < 1) return;
        this.currentPage = page;
        await this.loadVehicles();
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

    private get filteredItems(): Vehicle[] {
        const term = this.searchTerm?.trim().toLowerCase();
        if (!term) return this.items;
        return this.items.filter((item) => {
            const vin = item.vin?.toLowerCase() || "";
            const imei = item.imei?.toLowerCase() || "";
            return vin.includes(term) || imei.includes(term);
        });
    }

    private onSearchInput = (e: InputEvent) => {
        this.searchTerm = (e.target as HTMLInputElement).value;
        if (this.searchDebounce) {
            clearTimeout(this.searchDebounce);
        }
        this.searchDebounce = window.setTimeout(() => {
            this.requestUpdate();
        }, 600);
    }

    render() {
        return html`
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem;">
                <h2 style="margin: 0;">Onboarded Vehicles</h2>
                <input type="text"
                       placeholder="Search by IMEI or VIN"
                       style="width: 40%; min-width: 200px;"
                       .value=${this.searchTerm}
                       @input=${this.onSearchInput}>
            </div>
            <div class="alert alert-error" role="alert" ?hidden=${this.alertText === ""}>
                ${this.alertText}
            </div>
            ${this.loading ? html`<div>Loading...</div>` : html`
                <table style="font-size: 80%">
                    <tr>
                        <th>VIN</th>
                        <th>Make Model Year</th>
                        <th>IMEI</th>
                        <th>Token ID</th>
                        <th>Vendor <br />Connection</th>
                        <th></th>
                    </tr>
                    ${repeat(this.filteredItems, (item) => item.id, (item) => html`
              <vehicle-list-item-element .item="${item}">`)}
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
                            Showing ${this.filteredItems.length} of ${this.totalItems} items
                        </div>
                    </div>
                </div>
            `}
        `
    }
}
