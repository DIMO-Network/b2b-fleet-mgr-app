import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";
import { FleetService, FleetReport, FleetGroup } from '@services/fleet-service.ts';
import { IdentityService } from '@services/identity-service.ts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

@customElement('reports-view')
export class ReportsView extends LitElement {
  static styles = [ globalStyles,
    css`
      .polling-effect {
        background-color: #f0f9ff;
        transition: background-color 0.5s ease;
      }
      .spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: 8px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    ` ]

  @state()
  private reports: FleetReport[] = [];

  @state()
  private templates: string[] = [];

  @state()
  private fleetGroups: FleetGroup[] = [];

  @state()
  private selectedTemplate: string | null = null;

  @state()
  private startDate: string = '';

  @state()
  private endDate: string = '';

  @state()
  private dateRange: string = 'Last 7 Days';

  @state()
  private loading: boolean = false;

  @state()
  private downloadingReportId: string | null = null;

  @state()
  private selectedFleetGroupIds: string[] = [];

  @state()
  private pollingReportIds: Set<string> = new Set();

  @state()
  private statusUpdateEffectIds: Set<string> = new Set();

  private pollingIntervals: Map<string, number> = new Map();

  @state()
  private submitting: boolean = false;

  @state()
  private hasAccess: boolean = true;

  async connectedCallback() {
    super.connectedCallback();
    this.setDefaultDates();
    await this.checkAccess();
    if (!this.hasAccess) return;
    await Promise.all([
      this.fetchReports(),
      this.fetchTemplates(),
      this.fetchFleetGroups()
    ]);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.pollingIntervals.forEach(interval => window.clearInterval(interval));
    this.pollingIntervals.clear();
  }

  private setDefaultDates() {
    this.endDate = dayjs().format('YYYY-MM-DD');
    this.startDate = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  }

  private handleDateRangeChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.dateRange = select.value;
    const now = dayjs();

    switch (this.dateRange) {
      case 'Last 7 Days':
        this.endDate = now.format('YYYY-MM-DD');
        this.startDate = now.subtract(7, 'day').format('YYYY-MM-DD');
        break;
      case 'Last 30 Days':
        this.endDate = now.format('YYYY-MM-DD');
        this.startDate = now.subtract(30, 'day').format('YYYY-MM-DD');
        break;
      case 'This Month':
        this.endDate = now.format('YYYY-MM-DD');
        this.startDate = now.startOf('month').format('YYYY-MM-DD');
        break;
      case 'Last Month':
        const lastMonth = now.subtract(1, 'month');
        this.startDate = lastMonth.startOf('month').format('YYYY-MM-DD');
        this.endDate = lastMonth.endOf('month').format('YYYY-MM-DD');
        break;
    }
  }

  private handleStartDateChange(e: Event) {
    this.startDate = (e.target as HTMLInputElement).value;
    this.dateRange = 'Custom';
  }

  private handleEndDateChange(e: Event) {
    this.endDate = (e.target as HTMLInputElement).value;
    this.dateRange = 'Custom';
  }

  private async fetchReports() {
    this.loading = true;
    try {
      this.reports = await FleetService.getInstance().getReports();
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      this.loading = false;
    }
  }

  private async fetchTemplates() {
    try {
      this.templates = await FleetService.getInstance().getReportTemplates();
      if (this.templates.length > 0 && !this.selectedTemplate) {
        this.selectedTemplate = this.templates[0];
      }
    } catch (error) {
      console.error('Failed to fetch report templates:', error);
    }
  }

  private async fetchFleetGroups() {
    try {
      this.fleetGroups = await FleetService.getInstance().getFleetGroups();
    } catch (error) {
      console.error('Failed to fetch fleet groups:', error);
    }
  }

  private async checkAccess() {
    try {
      const permissions = await IdentityService.getInstance().getUserPermissions();
      this.hasAccess = permissions.includes('reports');
    } catch (e) {
      console.error('Failed to check reports access:', e);
      this.hasAccess = false;
    }
  }

  private handleTemplateSelect(template: string) {
    this.selectedTemplate = template;
  }

  private handleFleetGroupChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.selectedFleetGroupIds = Array.from(select.selectedOptions).map(opt => opt.value);
  }

  private async handleRunReport() {
    if (!this.selectedTemplate || this.submitting) return;

    this.submitting = true;
    try {
      // POST data format based on issue description
      // startDate and endDate should be ISO strings representing start/end of day
      const data = {
        startDate: dayjs(this.startDate).startOf('day').toISOString(),
        endDate: dayjs(this.endDate).endOf('day').toISOString(),
        fleetGroupIds: this.selectedFleetGroupIds,
        reportName: this.selectedTemplate
      };

      const result = await FleetService.getInstance().runReport(data);

      if (result && result.reportId) {
        // Add new row to the table (pending state)
        const newReport: FleetReport = {
          id: result.reportId,
          reportName: this.selectedTemplate,
          status: result.status || 'pending',
          params: {
            startDate: data.startDate,
            endDate: data.endDate,
            fleetGroupIds: data.fleetGroupIds,
            reportName: data.reportName
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        this.reports = [newReport, ...this.reports];
        
        // Start polling for this report
        this.startPolling(result.reportId);
      }
    } catch (error) {
      console.error('Failed to run report:', error);
    } finally {
      this.submitting = false;
    }
  }

  private startPolling(reportId: string) {
    if (this.pollingIntervals.has(reportId)) return;

    this.pollingReportIds.add(reportId);
    this.pollingReportIds = new Set(this.pollingReportIds);

    const interval = window.setInterval(async () => {
      // Show status update effect
      this.statusUpdateEffectIds.add(reportId);
      this.statusUpdateEffectIds = new Set(this.statusUpdateEffectIds);
      
      // Remove effect after 1 second
      setTimeout(() => {
        this.statusUpdateEffectIds.delete(reportId);
        this.statusUpdateEffectIds = new Set(this.statusUpdateEffectIds);
      }, 1000);

      const statusUpdate = await FleetService.getInstance().getReportStatus(reportId);
      
      if (statusUpdate) {
        // Update the report in the list
        this.reports = this.reports.map(r => r.id === reportId ? statusUpdate : r);

        if (statusUpdate.status === 'completed') {
          this.stopPolling(reportId);
        }
      }
    }, 5000);

    this.pollingIntervals.set(reportId, interval);
  }

  private stopPolling(reportId: string) {
    const interval = this.pollingIntervals.get(reportId);
    if (interval) {
      window.clearInterval(interval);
      this.pollingIntervals.delete(reportId);
    }
    this.pollingReportIds.delete(reportId);
    this.pollingReportIds = new Set(this.pollingReportIds);
  }

  private async handleDownloadCsv(reportId: string) {
    if (this.downloadingReportId) return;

    this.downloadingReportId = reportId;
    try {
      await FleetService.getInstance().downloadReport(reportId);
    } catch (error) {
      console.error('Failed to download report:', error);
    } finally {
      this.downloadingReportId = null;
    }
  }

  private formatLastRun(timestamp: string): string {
    if (!timestamp) return '—';
    const date = dayjs(timestamp);
    const now = dayjs();
    const diffInDays = now.diff(date, 'day');

    if (diffInDays < 7) {
      return date.fromNow();
    } else {
      return date.format('MMM D, YYYY h:mm A');
    }
  }

  private getFleetGroupDisplay(report: FleetReport): string {
    if (!report.params?.fleetGroupIds || report.params.fleetGroupIds.length === 0) {
      return '—';
    }

    const groupNames = report.params.fleetGroupIds.map(id => {
      const group = this.fleetGroups.find(g => g.id === id);
      return group ? group.name : id;
    });

    return groupNames.join(', ');
  }

  private getDateRangeDisplay(report: FleetReport): string {
    if (!report.params?.startDate || !report.params?.endDate) {
      return '—';
    }

    const start = dayjs(report.params.startDate);
    const end = dayjs(report.params.endDate);

    // If same year
    if (start.year() === end.year()) {
      return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
    }

    return `${start.format('MMM D, YYYY')} - ${end.format('MMM D, YYYY')}`;
  }

  render() {
    if (!this.hasAccess) {
      return html`
        <div class="page active" id="page-reports">
            <div class="access-denied-notice" style="text-align: center; padding: 48px; background: #fff; border: 1px solid #000; border-radius: 8px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🚫</div>
                <h3>Access Denied</h3>
                <p>You do not have the required permissions to access the Reports section.</p>
            </div>
        </div>
      `;
    }

    return html`
        <!-- REPORTS PAGE -->
        <div class="page active" id="page-reports">

            <!-- EXISTING REPORTS SECTION -->
            <div class="section-header">Existing Reports</div>
            <div class="table-container mb-24">
                <table>
                    <thead>
                    <tr>
                        <th>Report Name</th>
                        <th>Fleet Group(s)</th>
                        <th>Date Range</th>
                        <th>Last Run</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    ${this.loading ? html`
                        <tr>
                            <td colspan="6" style="text-align: center; padding: 2rem; color: #666;">
                                Loading reports...
                            </td>
                        </tr>
                    ` : this.reports.length === 0 ? html`
                        <tr>
                            <td colspan="6" style="text-align: center; padding: 2rem; color: #666;">
                                No reports found.
                            </td>
                        </tr>
                    ` : this.reports.map(report => html`
                        <tr class="report-row ${this.statusUpdateEffectIds.has(report.id) ? 'polling-effect' : ''}">
                            <td class="link">
                                ${report.status === 'pending' ? html`<span class="spinner"></span>` : ''}
                                ${report.reportName}
                            </td>
                            <td>${this.getFleetGroupDisplay(report)}</td>
                            <td>${this.getDateRangeDisplay(report)}</td>
                            <td title="${report.createdAt}">${this.formatLastRun(report.createdAt)}</td>
                            <td>
                                <span class="status status-${report.status.toLowerCase()}">${report.status.toUpperCase()}</span>
                            </td>
                            <td>
                                <button 
                                    class="btn btn-sm ${this.downloadingReportId === report.id ? 'processing' : ''}" 
                                    @click=${(e: Event) => { e.stopPropagation(); this.handleDownloadCsv(report.id); }}
                                    ?disabled=${!!this.downloadingReportId || report.status !== 'completed'}
                                >
                                    CSV
                                </button>
                            </td>
                        </tr>
                    `)}
                    </tbody>
                </table>
            </div>

            <!-- REPORT CREATOR SECTION -->
            <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Create New Report</span>
              <!--  <button class="btn" onclick="toggleReportSettings()" style="display: flex; align-items: center; gap: 6px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    REPORT SETTINGS
                </button> 
                -->
            </div>

            <!-- Report Settings Panel (hidden by default) -->
            <div id="report-settings-panel" class="panel mb-24" style="display: none;">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Report Settings</span>
                    <button class="btn btn-sm" onclick="toggleReportSettings()">✕ CLOSE</button>
                </div>
                <div class="panel-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                        <div>
                            <div style="font-weight: bold; margin-bottom: 12px;">Overspeed Settings</div>
                            <div class="form-group">
                                <label class="form-label">Overspeed Threshold (km/h)</label>
                                <input type="number" value="110" style="width: 120px;">
                                <div style="font-size: 12px; color: #666; margin-top: 4px;">Speed above this value triggers overspeed events</div>
                            </div>

                            <div style="font-weight: bold; margin-bottom: 12px; margin-top: 20px;">After-Hours Activity</div>
                            <div class="form-group">
                                <label class="form-label">Cutoff Time</label>
                                <input type="time" value="20:00" style="width: 120px;">
                                <div style="font-size: 12px; color: #666; margin-top: 4px;">Activity after this time is flagged in reports</div>
                            </div>
                        </div>
                        <div>
                            <div style="font-weight: bold; margin-bottom: 12px;">Fuel Consumption</div>
                            <div class="form-group">
                                <label class="form-label">Refuel Increase Threshold (%)</label>
                                <input type="number" value="10" style="width: 120px;">
                                <div style="font-size: 12px; color: #666; margin-top: 4px;">Fuel level increase above this % is a refuel event</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Minimum Data Density</label>
                                <select style="width: 220px;">
                                    <option>1 reading per hour</option>
                                    <option selected>1 reading per 30 minutes</option>
                                    <option>1 reading per 15 minutes</option>
                                </select>
                            </div>

                            <div style="font-weight: bold; margin-bottom: 12px; margin-top: 20px;">Scheduling</div>
                            <div class="form-group">
                                <label class="form-label">Weekly Report Day</label>
                                <select style="width: 150px;">
                                    <option selected>Monday</option>
                                    <option>Tuesday</option>
                                    <option>Wednesday</option>
                                    <option>Thursday</option>
                                    <option>Friday</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #ccc;">
                        <button class="btn btn-primary">SAVE SETTINGS</button>
                    </div>
                </div>
            </div>

            <div class="reports-layout">
                <!-- Report Templates -->
                <div class="report-templates">
                    <div class="panel-header">Report Templates</div>
                    ${this.templates.map(template => html`
                        <div 
                            class="report-template-item ${this.selectedTemplate === template ? 'active' : ''}" 
                            @click=${() => this.handleTemplateSelect(template)}
                        >
                            ${template}
                        </div>
                    `)}
                    ${this.templates.length === 0 ? html`<div style="padding: 12px; color: #999;">No templates found</div>` : ''}
                </div>

                <!-- Report Main Area -->
                <div class="report-main">
                    <!-- Configuration -->
                    <div class="report-config">
                        <div class="form-row" style="align-items: flex-start;">
                            <div class="form-group" style="flex:1; display: flex; flex-direction: column;">
                                <label class="form-label">Fleet Groups (ctrl+click to select multiple)</label>
                                <select multiple style="width: 100%; flex: 1; min-height: 120px;" @change="${this.handleFleetGroupChange}">
                                    ${this.fleetGroups.map(group => html`
                                        <option value="${group.id}" ?disabled=${!group.has_access}>
                                            ${group.name} - ${group.vehicle_count} ${!group.has_access ? ' (No Access)' : ''}
                                        </option>
                                    `)}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Date Range</label>
                                <select style="width: 180px;" .value="${this.dateRange}" @change="${this.handleDateRangeChange}">
                                    <option value="Last 7 Days">Last 7 Days</option>
                                    <option value="Last 30 Days">Last 30 Days</option>
                                    <option value="This Month">This Month</option>
                                    <option value="Last Month">Last Month</option>
                                    <option value="Custom" ?hidden="${this.dateRange !== 'Custom'}">Custom</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Start Date</label>
                                <input type="date" .value="${this.startDate}" @input="${this.handleStartDateChange}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">End Date</label>
                                <input type="date" .value="${this.endDate}" @input="${this.handleEndDateChange}">
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
                            <div class="form-row" style="margin:0">
<!--                                <div class="form-group" style="margin:0">-->
<!--                                    <label class="form-label">Save As Report</label>-->
<!--                                    <input type="text" placeholder="Report name..." style="width: 200px;">-->
<!--                                </div>-->
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button 
                                    class="btn btn-primary ${this.submitting ? 'processing' : ''}" 
                                    @click="${this.handleRunReport}"
                                    ?disabled="${this.submitting || !this.selectedTemplate || this.selectedFleetGroupIds.length === 0}"
                                >
                                    RUN REPORT
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Output -->
                    <div class="report-output" id="report-output-panel">
                        <div class="report-output-header">
                            <span id="report-output-title">Select a template and run report</span>
                            <span id="report-output-count" style="color: #666;"></span>
                        </div>
                        <div class="report-output-body" id="report-output-body">
                            <div class="report-empty">
                                Select a report template, choose fleet groups, and click RUN REPORT
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
  }
}