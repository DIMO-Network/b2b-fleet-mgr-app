import { LitElement, css, html } from "lit";
import { msg } from "@lit/localize";
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import {
  DeviceDefinitionNode,
  DeviceDefinitionsPageInfo,
  IdentityService,
  ManufacturerOption,
} from "../services/identity-service.ts";

interface SearchState {
  manufacturerName: string;
  model: string;
  year: string;
}

@customElement("device-definitions-view")
export class DeviceDefinitionsView extends LitElement {
  static styles = [
    globalStyles,
    css`
      .toolbar {
        align-items: center;
      }

      .toolbar .form-group {
        margin-bottom: 0;
      }

      .manufacturer-select {
        min-width: 220px;
      }

      .model-input {
        min-width: 180px;
      }

      .year-input {
        width: 140px;
        min-width: 140px;
      }

      .results-summary {
        color: #666;
        font-size: 14px;
      }

      .empty-state {
        text-align: center;
        padding: 2rem;
        color: #666;
      }

    `,
  ];

  private readonly pageSize = 30;
  private searchDebounceTimer?: number;

  @state() private manufacturers: ManufacturerOption[] = [];
  @state() private manufacturersLoading = false;
  @state() private loading = false;
  @state() private errorMessage = "";
  @state() private selectedManufacturer = "";
  @state() private model = "";
  @state() private year = "";
  @state() private results: DeviceDefinitionNode[] = [];
  @state() private pageInfo?: DeviceDefinitionsPageInfo;
  @state() private pageIndex = 0;
  @state() private cursorHistory: string[] = [];
  @state() private activeSearch?: SearchState;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadManufacturers();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  private async loadManufacturers() {
    this.manufacturersLoading = true;
    this.errorMessage = "";

    try {
      const manufacturers = await IdentityService.getInstance().getManufacturers();
      this.manufacturers = manufacturers.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error("Failed to load manufacturers:", error);
      this.errorMessage = msg("Failed to load manufacturers.");
      this.manufacturers = [];
    } finally {
      this.manufacturersLoading = false;
    }
  }

  private sanitizeYear(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    return digits;
  }

  private getPowertrainType(attributes?: DeviceDefinitionNode["attributes"]): string {
    const match = (attributes ?? []).find((attribute) =>
      (attribute.name ?? "").toLowerCase().includes("powertrain")
    );
    return match?.value || "-";
  }

  private async runSearch(direction: "initial" | "next" | "previous" = "initial") {
    if (!this.selectedManufacturer) {
      this.results = [];
      this.pageInfo = undefined;
      this.pageIndex = 0;
      this.cursorHistory = [];
      this.activeSearch = undefined;
      return;
    }

    this.loading = true;
    this.errorMessage = "";

    const trimmedModel = this.model.trim();
    const trimmedYear = this.year.trim();
    const searchState: SearchState = {
      manufacturerName: this.selectedManufacturer,
      model: trimmedModel,
      year: trimmedYear,
    };

    try {
      const params: {
        manufacturerName: string;
        model?: string;
        year?: number;
        first?: number;
        after?: string;
      } = {
        manufacturerName: searchState.manufacturerName,
        first: this.pageSize,
      };

      if (trimmedModel) {
        params.model = trimmedModel;
      }
      if (trimmedYear) {
        params.year = Number(trimmedYear);
      }

      if (direction === "next" && this.pageInfo?.endCursor) {
        params.after = this.pageInfo.endCursor;
      } else if (direction === "previous") {
        const previousCursor = this.cursorHistory[this.cursorHistory.length - 2];
        if (previousCursor) {
          params.after = previousCursor;
        }
      }

      const result = await IdentityService.getInstance().getDeviceDefinitions(params);

      if (!result) {
        this.results = [];
        this.pageInfo = undefined;
        this.activeSearch = searchState;
        if (direction === "initial") {
          this.pageIndex = 0;
          this.cursorHistory = [];
        } else if (direction === "previous") {
          this.pageIndex = Math.max(0, this.pageIndex - 1);
          this.cursorHistory = this.cursorHistory.slice(0, -1);
        }
        return;
      }

      this.results = result.nodes;
      this.pageInfo = result.pageInfo;
      this.activeSearch = searchState;

      if (direction === "initial") {
        this.pageIndex = 0;
        this.cursorHistory = [""];
      } else if (direction === "next" && this.pageInfo?.endCursor) {
        this.pageIndex += 1;
        this.cursorHistory = [...this.cursorHistory, this.pageInfo.endCursor];
      } else if (direction === "previous") {
        this.pageIndex = Math.max(0, this.pageIndex - 1);
        this.cursorHistory = this.cursorHistory.slice(0, -1);
      }
    } catch (error) {
      console.error("Failed to load device definitions:", error);
      this.errorMessage = msg("Failed to load device definitions.");
      this.results = [];
      this.pageInfo = undefined;
    } finally {
      this.loading = false;
    }
  }

  private async handleSearch() {
    this.pageInfo = undefined;
    this.cursorHistory = [];
    this.pageIndex = 0;
    await this.runSearch("initial");
  }

  private scheduleSearch() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = window.setTimeout(() => {
      this.handleSearch();
    }, 500);
  }

  private handleManufacturerChange(e: Event) {
    this.selectedManufacturer = (e.target as HTMLSelectElement).value;
    if (!this.selectedManufacturer) {
      this.results = [];
      this.pageInfo = undefined;
      this.pageIndex = 0;
      this.cursorHistory = [];
      this.activeSearch = undefined;
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }
      return;
    }
    this.scheduleSearch();
  }

  private handleModelInput(e: Event) {
    this.model = (e.target as HTMLInputElement).value;
    if (this.selectedManufacturer) {
      this.scheduleSearch();
    }
  }

  private handleYearInput(e: Event) {
    this.year = this.sanitizeYear((e.target as HTMLInputElement).value);
    if (this.selectedManufacturer) {
      this.scheduleSearch();
    }
  }

  private async handleNextPage() {
    if (!this.pageInfo?.hasNextPage || this.loading) {
      return;
    }
    await this.runSearch("next");
  }

  private async handlePreviousPage() {
    if (this.pageIndex === 0 || this.loading || !this.activeSearch) {
      return;
    }

    this.selectedManufacturer = this.activeSearch.manufacturerName;
    this.model = this.activeSearch.model;
    this.year = this.activeSearch.year;
    await this.runSearch("previous");
  }

  render() {
    return html`
      <div class="page active" id="page-device-definitions">
        ${this.errorMessage ? html`<div class="alert alert-error">${this.errorMessage}</div>` : ""}

        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>${msg("Device Definitions")}</span>
        </div>

        <div class="toolbar">
          <select
            class="manufacturer-select"
            .value=${this.selectedManufacturer}
            @change=${this.handleManufacturerChange}
            ?disabled=${this.manufacturersLoading}
          >
            <option value="">${msg("Select manufacturer")}</option>
            ${this.manufacturers.map(
              (manufacturer) => html`
                <option value=${manufacturer.name}>${manufacturer.name}</option>
              `
            )}
          </select>
          <input
            class="model-input"
            type="text"
            .placeholder=${msg("Filter by model")}
            .value=${this.model}
            @input=${this.handleModelInput}
            ?disabled=${!this.selectedManufacturer}
          />
          <input
            class="year-input"
            type="number"
            inputmode="numeric"
            .placeholder=${msg("Year")}
            .value=${this.year}
            @input=${this.handleYearInput}
            ?disabled=${!this.selectedManufacturer}
          />
          <button class="btn" disabled>${msg("ADD")}</button>
        </div>

        ${this.selectedManufacturer
          ? html`
              <div class="results-summary mb-16">
                ${this.loading
                  ? msg("Updating results...")
                  : `${this.results.length} ${msg("results")} • ${msg("Page")} ${this.pageIndex + 1}`}
              </div>
            `
          : ""}

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>${msg("Manufacturer")}</th>
                <th>${msg("Model")}</th>
                <th>${msg("Year")}</th>
                <th>${msg("Definition ID")}</th>
                <th>${msg("PowerTrain Type")}</th>
              </tr>
            </thead>
            <tbody>
              ${!this.selectedManufacturer
                ? html`
                    <tr>
                      <td colspan="5" class="empty-state">
                        ${msg("Select a manufacturer to view device definitions.")}
                      </td>
                    </tr>
                  `
                : this.loading && this.results.length === 0
                ? html`
                    <tr>
                      <td colspan="5" class="empty-state">
                        ${msg("Loading device definitions...")}
                      </td>
                    </tr>
                  `
                : this.results.length === 0
                ? html`
                    <tr>
                      <td colspan="5" class="empty-state">
                        ${msg("No device definitions found.")}
                      </td>
                    </tr>
                  `
                : this.results.map(
                    (result) => html`
                      <tr>
                        <td>${this.activeSearch?.manufacturerName || "-"}</td>
                        <td>${result.model || "-"}</td>
                        <td>${result.year ?? "-"}</td>
                        <td style="font-family: monospace; font-size: 13px;">
                          ${result.deviceDefinitionId || "-"}
                        </td>
                        <td>${this.getPowertrainType(result.attributes)}</td>
                      </tr>
                    `
                  )}
            </tbody>
          </table>
        </div>

        <div class="pagination mt-16">
          <button
            class="pagination-btn"
            ?disabled=${this.pageIndex === 0 || this.loading || !this.selectedManufacturer}
            @click=${this.handlePreviousPage}
          >
            ${msg("PREV")}
          </button>
          <span style="margin: 0 8px; font-size: 14px;">
            ${msg("Page")} ${this.pageIndex + 1}
          </span>
          <button
            class="pagination-btn"
            ?disabled=${!this.pageInfo?.hasNextPage || this.loading}
            @click=${this.handleNextPage}
          >
            ${msg("NEXT")}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "device-definitions-view": DeviceDefinitionsView;
  }
}
