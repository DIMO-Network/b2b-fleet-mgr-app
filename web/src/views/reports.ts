import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";

@customElement('reports-view')
export class ReportsView extends LitElement {
  static styles = [ globalStyles,
    css`` ]

  render() {
    return html`
        <!-- REPORTS PAGE -->
        <div class="page" id="page-reports">

            <!-- EXISTING REPORTS SECTION -->
            <div class="section-header">Existing Reports</div>
            <div class="table-container mb-24">
                <table>
                    <thead>
                    <tr>
                        <th>Report Name</th>
                        <th>Type</th>
                        <th>Fleet Group(s)</th>
                        <th>Date Range</th>
                        <th>Last Run</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr class="report-row" onclick="openExistingReport('overspeed-fleet-a')">
                        <td class="link">Weekly Overspeed — Fleet A</td>
                        <td><span class="badge">Overspeed Events</span></td>
                        <td>Fleet A</td>
                        <td>Nov 27 - Dec 4, 2025</td>
                        <td>2025-12-04 08:00</td>
                        <td>
                            <button class="btn btn-sm" onclick="event.stopPropagation(); openExistingReport('overspeed-fleet-a')">OPEN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">RE-RUN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">CSV</button>
                        </td>
                    </tr>
                    <tr class="report-row" onclick="openExistingReport('km-all')">
                        <td class="link">Monthly Kilometers — All Vehicles</td>
                        <td><span class="badge">Kilometers Driven</span></td>
                        <td>All Vehicles</td>
                        <td>November 2025</td>
                        <td>2025-12-02 09:15</td>
                        <td>
                            <button class="btn btn-sm" onclick="event.stopPropagation(); openExistingReport('km-all')">OPEN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">RE-RUN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">CSV</button>
                        </td>
                    </tr>
                    <tr class="report-row" onclick="openExistingReport('fuel-santiago')">
                        <td class="link">Weekly Fuel — Santiago</td>
                        <td><span class="badge">Fuel Consumption</span></td>
                        <td>Santiago North, Santiago South</td>
                        <td>Nov 27 - Dec 4, 2025</td>
                        <td>2025-12-02 07:00</td>
                        <td>
                            <button class="btn btn-sm" onclick="event.stopPropagation(); openExistingReport('fuel-santiago')">OPEN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">RE-RUN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">CSV</button>
                        </td>
                    </tr>
                    <tr class="report-row" onclick="openExistingReport('not-reporting')">
                        <td class="link">Units Not Reporting — All</td>
                        <td><span class="badge">Units Not Reporting</span></td>
                        <td>All Vehicles</td>
                        <td>Current</td>
                        <td>2025-12-01 12:00</td>
                        <td>
                            <button class="btn btn-sm" onclick="event.stopPropagation(); openExistingReport('not-reporting')">OPEN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">RE-RUN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">CSV</button>
                        </td>
                    </tr>
                    <tr class="report-row" onclick="openExistingReport('weekend-santiago')">
                        <td class="link">Weekend Activity — Santiago North</td>
                        <td><span class="badge">Weekend Activity</span></td>
                        <td>Santiago North</td>
                        <td>Nov 30 - Dec 1, 2025</td>
                        <td>2025-12-02 07:30</td>
                        <td>
                            <button class="btn btn-sm" onclick="event.stopPropagation(); openExistingReport('weekend-santiago')">OPEN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">RE-RUN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">CSV</button>
                        </td>
                    </tr>
                    <tr class="report-row" onclick="openExistingReport('after20-fleet-b')">
                        <td class="link">After Hours — Fleet B</td>
                        <td><span class="badge">Activity After 20:00</span></td>
                        <td>Fleet B</td>
                        <td>Nov 27 - Dec 4, 2025</td>
                        <td>2025-12-03 08:00</td>
                        <td>
                            <button class="btn btn-sm" onclick="event.stopPropagation(); openExistingReport('after20-fleet-b')">OPEN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">RE-RUN</button>
                            <button class="btn btn-sm" onclick="event.stopPropagation();">CSV</button>
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <!-- REPORT CREATOR SECTION -->
            <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Create New Report</span>
                <button class="btn" onclick="toggleReportSettings()" style="display: flex; align-items: center; gap: 6px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    REPORT SETTINGS
                </button>
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
                    <div class="report-template-item active" data-report="overspeed">Overspeed Events</div>
                    <div class="report-template-item" data-report="kilometers">Kilometers Driven</div>
                    <div class="report-template-item" data-report="after20">Activity After 20:00</div>
                    <div class="report-template-item" data-report="weekend">Weekend Activity</div>
                    <div class="report-template-item" data-report="notreporting">Units Not Reporting</div>
                    <div class="report-template-item" data-report="fuel">Fuel Consumption</div>
                    <div class="report-template-item" data-report="mobility" style="color: #999;">Mobility Policy</div>
                    <div class="report-template-item" data-report="custom" style="color: #999;">Custom Report</div>
                </div>

                <!-- Report Main Area -->
                <div class="report-main">
                    <!-- Configuration -->
                    <div class="report-config">
                        <div class="form-row">
                            <div class="form-group" style="flex:1">
                                <label class="form-label">Fleet Groups</label>
                                <select multiple style="width: 100%; height: 60px;">
                                    <option selected>Fleet A</option>
                                    <option selected>Fleet B</option>
                                    <option>Santiago North</option>
                                    <option>Santiago South</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Date Range</label>
                                <select style="width: 180px;">
                                    <option selected>Last 7 Days</option>
                                    <option>Last 30 Days</option>
                                    <option>This Month</option>
                                    <option>Last Month</option>
                                    <option>Custom</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Start Date</label>
                                <input type="date" value="2025-11-28">
                            </div>
                            <div class="form-group">
                                <label class="form-label">End Date</label>
                                <input type="date" value="2025-12-05">
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
                            <div class="form-row" style="margin:0">
                                <div class="form-group" style="margin:0">
                                    <label class="form-label">Save As Report</label>
                                    <input type="text" placeholder="Report name..." style="width: 200px;">
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-primary" onclick="runReport()">RUN REPORT</button>
                                <button class="btn" id="download-csv-btn" disabled>DOWNLOAD CSV</button>
                                <button class="btn">SCHEDULE</button>
                                <button class="btn">SAVE</button>
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