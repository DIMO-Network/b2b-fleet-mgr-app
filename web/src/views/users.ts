import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import {globalStyles} from "../global-styles.ts";

@customElement('users-view')
export class UsersView extends LitElement {
  static styles = [ globalStyles,
    css`` ]

  render() {
    return html`
        <!-- USERS PAGE -->
        <div class="page active" id="page-users">
            <div class="section-header">User Lookup</div>

            <!-- Search Section -->
            <div class="panel mb-24">
                <div class="panel-body">
                    <div class="form-row">
                        <div class="form-group" style="flex: 1; margin: 0;">
                            <label class="form-label">Search by Email, Wallet Address, or Phone</label>
                            <input type="text" id="user-search-input" class="search-box" style="width: 100%;" placeholder="Enter email, 0x... wallet, or phone number...">
                        </div>
                        <button class="btn btn-primary" onclick="searchUser()" style="align-self: flex-end;">SEARCH</button>
                    </div>
                </div>
            </div>

            <!-- User Results Container -->
            <div id="user-results-container">
                <!-- No Search State -->
                <div id="user-no-search" class="panel">
                    <div class="panel-body" style="text-align: center; padding: 48px; color: #666;">
                        Enter an email, wallet address, or phone number to look up a user.
                    </div>
                </div>

                <!-- No Results State (hidden by default) -->
                <div id="user-no-results" style="display: none;">
                    <div class="panel">
                        <div class="panel-body" style="padding: 48px;">
                            No user found for "<span id="user-search-term"></span>"
                        </div>
                    </div>
                </div>

                <!-- User Found State (hidden by default) -->
                <div id="user-found" style="display: none;">
                    <!-- User Profile Header -->
                    <div class="panel mb-16">
                        <div class="panel-header">User Profile</div>
                        <div class="panel-body">
                            <div class="detail-row">
                                <span class="detail-label">Email</span>
                                <span class="detail-value" id="user-email">maria.gonzalez@kaufmann.cl</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Wallet Address</span>
                                <span class="detail-value" id="user-wallet" style="font-size: 12px;">0x7a23...4f8b</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Phone Number</span>
                                <span class="detail-value" id="user-phone">+56 9 1234 5678</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Account Created</span>
                                <span class="detail-value" id="user-created">2024-03-15</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Last Active</span>
                                <span class="detail-value" id="user-last-active">2025-12-05 11:42</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Auth Methods</span>
                                <span class="detail-value" id="user-auth-methods">
                                                <span class="badge">Email</span>
                                                <span class="badge">Passkey</span>
                                            </span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Account Status</span>
                                <span class="detail-value" id="user-status">
                                                <span class="status status-connected">Active</span>
                                            </span>
                            </div>
                        </div>
                    </div>

                    <!-- User's Vehicles -->
                    <div class="section-header">Owned Vehicles</div>
                    <div id="user-vehicles-container">
                        <div class="table-container">
                            <table id="user-vehicles-table">
                                <thead>
                                <tr>
                                    <th>Vehicle</th>
                                    <th>VIN</th>
                                    <th>Status</th>
                                    <th>Last Telemetry</th>
                                    <th>Inventory</th>
                                    <th>Engine</th>
                                    <th>Action</th>
                                </tr>
                                </thead>
                                <tbody id="user-vehicles-body">
                                <tr onclick="openVehicleDetailFromUser('JEEP-001')" style="cursor:pointer">
                                    <td class="link">JEEP COMPASS 2021</td>
                                    <td>8AG8754520492E445</td>
                                    <td><span class="status status-connected">Connected</span></td>
                                    <td>2025-12-05 12:34</td>
                                    <td><span class="status status-customer">Customer</span></td>
                                    <td><span class="status status-unblocked">Unblocked</span></td>
                                    <td><button class="btn btn-sm" onclick="event.stopPropagation(); openVehicleDetailFromUser('JEEP-001')">OPEN</button></td>
                                </tr>
                                <tr onclick="openVehicleDetailFromUser('VW-001')" style="cursor:pointer">
                                    <td class="link">VOLKSWAGEN MULTIVAN 2024</td>
                                    <td>8VG222576MBN86794</td>
                                    <td><span class="status status-connected">Connected</span></td>
                                    <td>2025-12-05 12:28</td>
                                    <td><span class="status status-customer">Customer</span></td>
                                    <td><span class="status status-unblocked">Unblocked</span></td>
                                    <td><button class="btn btn-sm" onclick="event.stopPropagation(); openVehicleDetailFromUser('VW-001')">OPEN</button></td>
                                </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- No Vehicles State (hidden by default) -->
                    <div id="user-no-vehicles" style="display: none;">
                        <div class="panel">
                            <div class="panel-body" style="padding: 24px; color: #666;">
                                No vehicles assigned to this user.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
  }
}
// doesn't seem to do much
declare global {
  interface HTMLElementTagNameMap {
    'users-view': UsersView;
  }
}