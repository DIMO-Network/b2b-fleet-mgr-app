import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { globalStyles } from "../global-styles.ts";
import { consume } from '@lit/context';
import { apiServiceContext } from '../context';
import { ApiService } from '@services/api-service.ts';

interface DashboardStats {
  total_vehicles: number;
  connected: number;
  pending_onboard: number;
}

@customElement('home-view')
export class HomeView extends LitElement {
  static styles = [ globalStyles,
    css`` ];

  @consume({ context: apiServiceContext, subscribe: true })
  @state()
  apiService?: ApiService;

  @state()
  private stats: DashboardStats | null = null;

  @state()
  private loading: boolean = true;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadStats();
  }

  private async loadStats() {
    if (!this.apiService) return;
    this.loading = true;

    const response = await this.apiService.callApi<DashboardStats>(
      'GET',
      '/dashboard/stats',
      null,
      true,
      true
    );

    if (response.success && response.data) {
      this.stats = response.data;
    }
    this.loading = false;
  }

  render() {
    return html`
        <div class="page active" id="page-home">
            <div class="section-header">${msg('Fleet Overview')}</div>
            <div class="tiles-grid">
                <div class="tile">
                    <div class="tile-label">${msg('Total Vehicles')}</div>
                    <div class="tile-value">${this.loading ? '—' : this.stats?.total_vehicles ?? 0}</div>
                    <div class="tile-subtitle">${msg('Across all groups')}</div>
                </div>
                <div class="tile">
                    <div class="tile-label">${msg('Connected')}</div>
                    <div class="tile-value">${this.loading ? '—' : this.stats?.connected ?? 0}</div>
                    <div class="tile-subtitle">${msg('Onboarded and minted')}</div>
                </div>
                <div class="tile">
                    <div class="tile-label">${msg('Pending Onboard')}</div>
                    <div class="tile-value">${this.loading ? '—' : this.stats?.pending_onboard ?? 0}</div>
                    <div class="tile-subtitle">${msg('Devices existing but not minted')}</div>
                </div>
            </div>
        </div>
    `;
  }
}
