import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('home-view')
export class HomeView extends LitElement {
  static styles = css``;

  render() {
    return html`
        <div class="page active" id="page-home">
            <div class="section-header">Fleet Overview</div>
            <div class="tiles-grid">
                <div class="tile">
                    <div class="tile-label">Total Vehicles</div>
                    <div class="tile-value">247</div>
                    <div class="tile-subtitle">Across all groups</div>
                </div>
                <div class="tile">
                    <div class="tile-label">Connected</div>
                    <div class="tile-value">231</div>
                    <div class="tile-subtitle">Reporting telemetry</div>
                </div>
                <div class="tile">
                    <div class="tile-label">Customer Owned</div>
                    <div class="tile-value">158</div>
                    <div class="tile-subtitle">Active customers</div>
                </div>
                <div class="tile">
                    <div class="tile-label">Inventory</div>
                    <div class="tile-value">89</div>
                    <div class="tile-subtitle">Dealer inventory</div>
                </div>
                <div class="tile">
                    <div class="tile-label">Immobilized</div>
                    <div class="tile-value">3</div>
                    <div class="tile-subtitle">Engine blocked</div>
                </div>
                <div class="tile">
                    <div class="tile-label">Offline</div>
                    <div class="tile-value">16</div>
                    <div class="tile-subtitle">Not reporting</div>
                </div>
            </div>

            <div class="section-header">Saved Reports</div>
            <div class="tiles-grid">
                <div class="tile saved-report-tile" onclick="openReport('overspeed')">
                    <div class="saved-report-name">Overspeed — Fleet A — Last 7 Days</div>
                    <div class="saved-report-meta">Last run: 2025-12-04 08:00</div>
                </div>
                <div class="tile saved-report-tile" onclick="openReport('km')">
                    <div class="saved-report-name">Kilometers — All Vehicles — November</div>
                    <div class="saved-report-meta">Last run: 2025-12-02 09:15</div>
                </div>
                <div class="tile saved-report-tile" onclick="openReport('fuel')">
                    <div class="saved-report-name">Fuel Consumption — Santiago — Weekly</div>
                    <div class="saved-report-meta">Last run: 2025-12-02 07:00</div>
                </div>
            </div>

            <div class="section-header">Recent Reports</div>
            <div class="table-container">
                <table>
                    <thead>
                    <tr>
                        <th>Report Name</th>
                        <th>Fleet Group(s)</th>
                        <th>Date Range</th>
                        <th>Last Run</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td>Overspeed Events</td>
                        <td>Fleet A, Fleet B</td>
                        <td>Nov 27 - Dec 4, 2025</td>
                        <td>2025-12-04 08:00</td>
                        <td>
                            <button class="btn btn-sm">OPEN</button>
                            <button class="btn btn-sm">RE-RUN</button>
                        </td>
                    </tr>
                    <tr>
                        <td>Kilometers Driven</td>
                        <td>All Vehicles</td>
                        <td>November 2025</td>
                        <td>2025-12-02 09:15</td>
                        <td>
                            <button class="btn btn-sm">OPEN</button>
                            <button class="btn btn-sm">RE-RUN</button>
                        </td>
                    </tr>
                    <tr>
                        <td>Units Not Reporting</td>
                        <td>All Vehicles</td>
                        <td>Current</td>
                        <td>2025-12-01 12:00</td>
                        <td>
                            <button class="btn btn-sm">OPEN</button>
                            <button class="btn btn-sm">RE-RUN</button>
                        </td>
                    </tr>
                    <tr>
                        <td>Weekend Activity</td>
                        <td>Santiago North</td>
                        <td>Nov 30 - Dec 1, 2025</td>
                        <td>2025-12-02 07:30</td>
                        <td>
                            <button class="btn btn-sm">OPEN</button>
                            <button class="btn btn-sm">RE-RUN</button>
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
  }
}