import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";
import type {Tenant, Oracle} from "@services/oracle-tenant-service.ts";
import {OracleTenantService} from "@services/oracle-tenant-service.ts";

@customElement('tenant-selector-view')
export class TenantSelectorView extends LitElement {
  static styles = [ globalStyles,
    css`
      .warning {
        background: #fffbe6;
        border: 1px solid #f0d58c;
        padding: 16px;
        color: #7a5c00;
      }
      .tenant-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
      }
      .tenant-card {
        background: #fff;
        border: 1px solid #000;
        padding: 16px;
        cursor: pointer;
        transition: background 0.1s, box-shadow 0.1s, border-color 0.1s;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .tenant-card:hover { background: #f5f5f5; }
      .tenant-name { font-weight: bold; }
      .tenant-selected {
        border-color: #1a73e8;
        box-shadow: 0 0 0 2px rgba(26,115,232,0.15);
      }
      .badge-selected {
        font-size: 12px;
        padding: 2px 6px;
        background: #1a73e8;
        color: #fff;
        border-radius: 3px;
      }
    ` ]

    @state()
    private oracleId: string | undefined;
    @state()
    private tenants: Tenant[] = [];
    @state()
    private selectedTenantId: string | null = null;

    private oracleTenantService = OracleTenantService.getInstance();

  constructor() {
    super();
      this.oracleId = this.oracleTenantService.getOracle()?.oracleId;
  }

    async connectedCallback() {
        super.connectedCallback();
        let selectedOracle: Oracle | undefined = this.oracleTenantService.getOracle();
        if (!selectedOracle) {
            const allOracles = await this.oracleTenantService.fetchOracles();
            if (allOracles && allOracles.length > 0) {
                selectedOracle = allOracles[0];
                this.oracleTenantService.setOracle(selectedOracle);
            }
        }
        this.oracleId = selectedOracle?.oracleId;

        const selected = this.oracleTenantService.getSelectedTenant();
        this.selectedTenantId = selected?.id ?? null;

        const list = await this.oracleTenantService.fetchTenants();
        this.tenants = Array.isArray(list) ? list : (this.oracleTenantService.loadTenants() ?? []);
    }

    private async handleOracleChange(e: CustomEvent) {
        // Access the selected value from the event detail
        const selectedValue = e.detail.value;
        this.oracleId = selectedValue;
        console.log('Oracle changed to:', selectedValue);

        this.oracleTenantService.setOracleById(selectedValue);
        const access = await this.oracleTenantService.verifyOracleAccess();

        if (access) {
            // reload tenants
            const list = await this.oracleTenantService.fetchTenants();
            this.tenants = Array.isArray(list) ? list : (this.oracleTenantService.loadTenants() ?? []);
        } else {
            this.tenants = [];
        }
    }

    render() {
    return html`
        <div class="page active" id="page-tenant-selector">
            <div class="section-header">Pick your Oracle</div>
            <oracle-selector .selectedOption=${this.oracleId} @option-changed=${this.handleOracleChange}></oracle-selector>

            <div class="section-header" style="margin-top: 2em">Tenant Selector</div>
            ${this.tenants.length === 0 ? html`
              <div class="panel">
                <div class="panel-body warning">
                  Your account has no tenants configured. Reach out to your organization administrator to add your account 0x address.
                </div>
              </div>
            ` : html`
              <div class="tenant-grid">
                ${this.tenants.map(t => html`
                  <div class="tenant-card ${this.selectedTenantId === t.id ? 'tenant-selected' : ''}"
                       @click=${() => this.onSelectTenant(t)}
                       title="Select ${t.name}">
                    <span class="tenant-name">${t.name}</span>
                    ${this.selectedTenantId === t.id ? html`<span class="badge-selected">Selected</span>` : html`<span></span>`}
                  </div>
                `)}
              </div>
            `}
        </div>
    `;
    }

    private onSelectTenant(tenant: Tenant) {
      this.oracleTenantService.setSelectedTenant(tenant);
      this.selectedTenantId = tenant.id;
      // Optionally, notify parent/app that selection changed
      this.dispatchEvent(new CustomEvent('tenant-changed', { detail: { tenant }, bubbles: true, composed: true }));
        // sleep for 500ms
        setTimeout(() => {
            window.location.href = '/#/onboarding';
        }, 500)
    }



}
