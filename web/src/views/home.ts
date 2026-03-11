import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import {globalStyles} from "../global-styles.ts";

@customElement('home-view')
export class HomeView extends LitElement {
  static styles = [ globalStyles,
    css`` ];

  render() {
    return html`
        <div class="page active" id="page-home">
            <div class="section-header">${msg('Fleet Overview')}</div>
            <div class="tiles-grid">
                <div class="tile">
                    <div class="tile-label">${msg('Total Vehicles')}</div>
                    <div class="tile-value">247</div>
                    <div class="tile-subtitle">${msg('Across all groups')}</div>
                </div>
                <div class="tile">
                    <div class="tile-label">${msg('Connected')}</div>
                    <div class="tile-value">231</div>
                    <div class="tile-subtitle">${msg('Reporting telemetry')}</div>
                </div>
                <div class="tile">
                    <div class="tile-label">${msg('Customer Owned')}</div>
                    <div class="tile-value">158</div>
                    <div class="tile-subtitle">${msg('Active customers')}</div>
                </div>
                <div class="tile">
                    <div class="tile-label">${msg('Inventory')}</div>
                    <div class="tile-value">89</div>
                    <div class="tile-subtitle">${msg('Dealer inventory')}</div>
                </div>
                <div class="tile">
                    <div class="tile-label">${msg('Immobilized')}</div>
                    <div class="tile-value">3</div>
                    <div class="tile-subtitle">${msg('Engine blocked')}</div>
                </div>
                <div class="tile">
                    <div class="tile-label">${msg('Offline')}</div>
                    <div class="tile-value">16</div>
                    <div class="tile-subtitle">${msg('Not reporting')}</div>
                </div>
            </div>

            <div class="section-header">${msg('Saved Reports')}</div>
            <div class="tiles-grid">
                <div class="tile saved-report-tile" onclick="openReport('overspeed')">
                    <div class="saved-report-name">${msg('Overspeed — Fleet A — Last 7 Days')}</div>
                    <div class="saved-report-meta">${msg('Last run:')} 2025-12-04 08:00</div>
                </div>
                <div class="tile saved-report-tile" onclick="openReport('km')">
                    <div class="saved-report-name">${msg('Kilometers — All Vehicles — November')}</div>
                    <div class="saved-report-meta">${msg('Last run:')} 2025-12-02 09:15</div>
                </div>
                <div class="tile saved-report-tile" onclick="openReport('fuel')">
                    <div class="saved-report-name">${msg('Fuel Consumption — Santiago — Weekly')}</div>
                    <div class="saved-report-meta">${msg('Last run:')} 2025-12-02 07:00</div>
                </div>
            </div>

            <div class="section-header">${msg('Recent Reports')}</div>
            <div class="table-container">
                <table>
                    <thead>
                    <tr>
                        <th>${msg('Report Name')}</th>
                        <th>${msg('Fleet Group(s)')}</th>
                        <th>${msg('Date Range')}</th>
                        <th>${msg('Last Run')}</th>
                        <th>${msg('Actions')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td>${msg('Overspeed Events')}</td>
                        <td>${msg('Fleet A, Fleet B')}</td>
                        <td>Nov 27 - Dec 4, 2025</td>
                        <td>2025-12-04 08:00</td>
                        <td>
                            <button class="btn btn-sm">${msg('OPEN')}</button>
                            <button class="btn btn-sm">${msg('RE-RUN')}</button>
                        </td>
                    </tr>
                    <tr>
                        <td>${msg('Kilometers Driven')}</td>
                        <td>${msg('All Vehicles')}</td>
                        <td>November 2025</td>
                        <td>2025-12-02 09:15</td>
                        <td>
                            <button class="btn btn-sm">${msg('OPEN')}</button>
                            <button class="btn btn-sm">${msg('RE-RUN')}</button>
                        </td>
                    </tr>
                    <tr>
                        <td>${msg('Units Not Reporting')}</td>
                        <td>${msg('All Vehicles')}</td>
                        <td>${msg('Current')}</td>
                        <td>2025-12-01 12:00</td>
                        <td>
                            <button class="btn btn-sm">${msg('OPEN')}</button>
                            <button class="btn btn-sm">${msg('RE-RUN')}</button>
                        </td>
                    </tr>
                    <tr>
                        <td>${msg('Weekend Activity')}</td>
                        <td>${msg('Santiago North')}</td>
                        <td>Nov 30 - Dec 1, 2025</td>
                        <td>2025-12-02 07:30</td>
                        <td>
                            <button class="btn btn-sm">${msg('OPEN')}</button>
                            <button class="btn btn-sm">${msg('RE-RUN')}</button>
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
  }
}