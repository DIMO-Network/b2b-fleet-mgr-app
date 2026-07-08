import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str } from '@lit/localize';
import { globalStyles } from "../global-styles.ts";
import { consume } from '@lit/context';
import { apiServiceContext } from '../context';
import { ApiService } from '@services/api-service.ts';
import { getLocale } from '../localization.ts';

interface MonthlyMintCount {
  month: string; // YYYY-MM
  count: number;
}

interface DashboardStats {
  total_vehicles: number;
  connected: number;
  pending_onboard: number;
  billable_vehicles: number;
  minted_by_month: MonthlyMintCount[];
}

@customElement('home-view')
export class HomeView extends LitElement {
  static styles = [ globalStyles,
    css`
      .mint-chart {
        display: flex;
        align-items: flex-end;
        gap: 16px;
        height: 180px;
        padding: 24px 8px 0;
      }
      .mint-col {
        position: relative;
        flex: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        cursor: default;
      }
      .mint-bar-area {
        position: relative;
        width: 100%;
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: flex-end;
        border-bottom: 1px solid #000;
      }
      .mint-bar {
        position: relative;
        width: 60%;
        max-width: 40px;
        background: #0066cc;
        border-radius: 4px 4px 0 0;
      }
      .mint-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #666;
        margin-top: 6px;
      }
      .mint-value {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: 100%;
        margin-bottom: 4px;
        font-size: 12px;
        font-weight: bold;
        color: #1a1a1a;
        white-space: nowrap;
        visibility: hidden;
      }
      .mint-value.zero {
        bottom: 0;
      }
      .mint-col:hover .mint-value,
      .mint-col.peak .mint-value {
        visibility: visible;
      }
      .mint-col:hover .mint-bar {
        background: #004a94;
      }
      .mint-footnote {
        font-size: 12px;
        color: #666;
        margin-top: 12px;
      }
    ` ];

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
                <div class="tile">
                    <div class="tile-label">${msg('Billable Vehicles')}</div>
                    <div class="tile-value">${this.loading ? '—' : this.stats?.billable_vehicles ?? 0}</div>
                    <div class="tile-subtitle">${msg('Connected minus Dealer Inventory / Standby')}</div>
                </div>
            </div>

            ${this.renderMintedChart()}
        </div>
    `;
  }

  private monthLabel(month: string): string {
    const [year, monthNum] = month.split('-').map(Number);
    return new Date(year, monthNum - 1, 1).toLocaleDateString(getLocale(), { month: 'short' });
  }

  private renderMintedChart() {
    const buckets = this.stats?.minted_by_month;
    if (!buckets || buckets.length === 0) {
      return nothing;
    }

    const max = Math.max(...buckets.map(b => b.count));
    const peakMonth = max > 0 ? buckets.find(b => b.count === max)?.month : undefined;

    return html`
        <div class="panel">
            <div class="panel-header">
                ${msg('Vehicles Minted')}
                <span style="color: #666; font-weight: normal;"> — ${msg('last 6 months')}</span>
            </div>
            <div class="panel-body">
                <div class="mint-chart" role="img" aria-label=${msg('Vehicles minted per month, last 6 months')}>
                    ${buckets.map(bucket => html`
                        <div class="mint-col ${bucket.month === peakMonth ? 'peak' : ''}"
                             aria-label=${msg(str`${this.monthLabel(bucket.month)}: ${bucket.count} vehicles minted`)}>
                            <div class="mint-bar-area">
                                ${bucket.count > 0 && max > 0 ? html`
                                    <div class="mint-bar" style="height: ${Math.max((bucket.count / max) * 100, 3)}%">
                                        <span class="mint-value">${bucket.count}</span>
                                    </div>
                                ` : html`
                                    <span class="mint-value zero">0</span>
                                `}
                            </div>
                            <div class="mint-label">${this.monthLabel(bucket.month)}</div>
                        </div>
                    `)}
                </div>
                <div class="mint-footnote">${msg('Excludes R1 and other externally connected devices.')}</div>
            </div>
        </div>
    `;
  }
}
