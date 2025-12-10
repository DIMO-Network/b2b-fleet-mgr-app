import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('vehicles-fleets-view')
export class VehiclesFleetsView extends LitElement {
  static styles = css``;
  render() {
    return html`
        <div class="page" id="page-vehicles">
            <div class="inner-tabs">
                <div class="inner-tab active" data-subtab="vehicles-list">Vehicles</div>
                <div class="inner-tab" data-subtab="fleet-groups">Fleet Groups</div>
            </div>

            <!-- Vehicles List Sub-tab -->
            <div id="subtab-vehicles-list">
                <div class="toolbar">
                    <input type="text" class="search-box" placeholder="Search by VIN, IMEI, or Nickname...">
                    <select>
                        <option value="">All Inventory Status</option>
                        <option value="inventory">Inventory</option>
                        <option value="customer">Customer Owned</option>
                    </select>
                    <select>
                        <option value="">All Connection Status</option>
                        <option value="connected">Connected</option>
                        <option value="offline">Offline</option>
                        <option value="never">Never Reported</option>
                    </select>
                    <select>
                        <option value="">All Groups</option>
                        <option value="fleet-a">Fleet A</option>
                        <option value="fleet-b">Fleet B</option>
                        <option value="santiago">Santiago North</option>
                    </select>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                        <tr>
                            <th>Vehicle</th>
                            <th>VIN</th>
                            <th>Status</th>
                            <th>Last Telemetry</th>
                            <th>Inventory</th>
                            <th>Groups</th>
                            <th>Fuel</th>
                            <th>Engine</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr onclick="openVehicleDetail('JEEP-001')" style="cursor:pointer">
                            <td class="link">JEEP COMPASS 2021</td>
                            <td>8AG8754520492E445</td>
                            <td><span class="status status-connected">Connected</span></td>
                            <td>2025-12-05 12:34</td>
                            <td><span class="status status-customer">Customer</span></td>
                            <td><span class="badge">Fleet A</span></td>
                            <td>Yes</td>
                            <td><span class="status status-unblocked">Unblocked</span></td>
                        </tr>
                        <tr onclick="openVehicleDetail('HYUNDAI-001')" style="cursor:pointer">
                            <td class="link">HYUNDAI I20 2025</td>
                            <td>NLHR1532552A1A370</td>
                            <td><span class="status status-connected">Connected</span></td>
                            <td>2025-12-05 12:30</td>
                            <td><span class="status status-inventory">Inventory</span></td>
                            <td><span class="badge">Fleet B</span></td>
                            <td>Yes</td>
                            <td><span class="status status-unblocked">Unblocked</span></td>
                        </tr>
                        <tr onclick="openVehicleDetail('VW-001')" style="cursor:pointer">
                            <td class="link">VOLKSWAGEN MULTIVAN 2024</td>
                            <td>8VG222576MBN86794</td>
                            <td><span class="status status-connected">Connected</span></td>
                            <td>2025-12-05 12:28</td>
                            <td><span class="status status-customer">Customer</span></td>
                            <td><span class="badge">Fleet A</span><span class="badge">Santiago</span></td>
                            <td>Yes</td>
                            <td><span class="status status-unblocked">Unblocked</span></td>
                        </tr>
                        <tr onclick="openVehicleDetail('MAXUS-001')" style="cursor:pointer">
                            <td class="link">MAXUS T60 2022</td>
                            <td>LSFWM21AXBA860028</td>
                            <td><span class="status status-offline">Offline</span></td>
                            <td>2025-12-03 18:45</td>
                            <td><span class="status status-customer">Customer</span></td>
                            <td><span class="badge">Fleet B</span></td>
                            <td>Yes</td>
                            <td><span class="status status-blocked">Blocked</span></td>
                        </tr>
                        <tr onclick="openVehicleDetail('MAXUS-002')" style="cursor:pointer">
                            <td class="link">MAXUS T60 4X2 GL MT 2025</td>
                            <td>LSFWM21A7PA8T0A16</td>
                            <td><span class="status status-connected">Connected</span></td>
                            <td>2025-12-05 12:32</td>
                            <td><span class="status status-inventory">Inventory</span></td>
                            <td><span class="badge">Santiago</span></td>
                            <td>Yes</td>
                            <td><span class="status status-unblocked">Unblocked</span></td>
                        </tr>
                        <tr onclick="openVehicleDetail('MB-001')" style="cursor:pointer">
                            <td class="link">MERCEDES-BENZ GLL 2BR 2025</td>
                            <td>8380JHPOR0DF3TP791</td>
                            <td><span class="status status-connected">Connected</span></td>
                            <td>2025-12-05 12:31</td>
                            <td><span class="status status-customer">Customer</span></td>
                            <td><span class="badge">Fleet A</span></td>
                            <td>No</td>
                            <td><span class="status status-unblocked">Unblocked</span></td>
                        </tr>
                        <tr onclick="openVehicleDetail('MB-002')" style="cursor:pointer">
                            <td class="link">MERCEDES-BENZ A 200 2023</td>
                            <td>W3A5Q8WNHAJA23038</td>
                            <td><span class="status status-connected">Connected</span></td>
                            <td>2025-12-05 12:29</td>
                            <td><span class="status status-customer">Customer</span></td>
                            <td><span class="badge">Fleet B</span></td>
                            <td>Yes</td>
                            <td><span class="status status-unblocked">Unblocked</span></td>
                        </tr>
                        <tr onclick="openVehicleDetail('MAXUS-003')" style="cursor:pointer">
                            <td class="link">MAXUS T60 4X2 GL AT 2025</td>
                            <td>LSFWM31A7TA859373</td>
                            <td><span class="status status-never">Never</span></td>
                            <td>—</td>
                            <td><span class="status status-inventory">Inventory</span></td>
                            <td>—</td>
                            <td>—</td>
                            <td><span class="status status-unblocked">Unblocked</span></td>
                        </tr>
                        </tbody>
                    </table>
                </div>

                <div class="pagination mt-16">
                    <button class="pagination-btn active">1</button>
                    <button class="pagination-btn">2</button>
                    <button class="pagination-btn">3</button>
                    <span>...</span>
                    <button class="pagination-btn">25</button>
                    <span style="margin-left: 16px; color: #666;">Showing 1-8 of 247 vehicles</span>
                </div>
            </div>

            <!-- Fleet Groups Sub-tab -->
            <div id="subtab-fleet-groups" style="display:none">
                <div class="toolbar">
                    <button class="btn btn-primary" onclick="showModal('create-group')">+ CREATE GROUP</button>
                </div>

                <div class="group-list">
                    <div class="group-item">
                        <div class="group-info">
                            <span class="group-name">Fleet A</span>
                            <span class="group-stats">85 vehicles • 79 online • 6 offline</span>
                        </div>
                        <div>
                            <button class="btn btn-sm">EDIT</button>
                            <button class="btn btn-sm">MANAGE VEHICLES</button>
                            <button class="btn btn-sm btn-danger">DELETE</button>
                        </div>
                    </div>
                    <div class="group-item">
                        <div class="group-info">
                            <span class="group-name">Fleet B</span>
                            <span class="group-stats">62 vehicles • 58 online • 4 offline</span>
                        </div>
                        <div>
                            <button class="btn btn-sm">EDIT</button>
                            <button class="btn btn-sm">MANAGE VEHICLES</button>
                            <button class="btn btn-sm btn-danger">DELETE</button>
                        </div>
                    </div>
                    <div class="group-item">
                        <div class="group-info">
                            <span class="group-name">Santiago North</span>
                            <span class="group-stats">45 vehicles • 43 online • 2 offline</span>
                        </div>
                        <div>
                            <button class="btn btn-sm">EDIT</button>
                            <button class="btn btn-sm">MANAGE VEHICLES</button>
                            <button class="btn btn-sm btn-danger">DELETE</button>
                        </div>
                    </div>
                    <div class="group-item">
                        <div class="group-info">
                            <span class="group-name">Santiago South</span>
                            <span class="group-stats">55 vehicles • 51 online • 4 offline</span>
                        </div>
                        <div>
                            <button class="btn btn-sm">EDIT</button>
                            <button class="btn btn-sm">MANAGE VEHICLES</button>
                            <button class="btn btn-sm btn-danger">DELETE</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
  }
}