import { LitElement, css, html } from "lit";
import { msg } from '@lit/localize';
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { ApiService } from "../services/api-service.ts";

interface UserProfile {
  wallet: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  business_name: string;
  government_id_type: string;
  government_id_number: string;
  created_at: string;
  updated_at: string;
}

interface UserProfilesResponse {
  items: UserProfile[];
  totalCount: number;
  skip: number;
  take: number;
}

@customElement("all-users-table")
export class AllUsersTable extends LitElement {
  static styles = [globalStyles, css``];

  @state() private users: UserProfile[] = [];
  @state() private loading = false;
  @state() private totalCount = 0;
  @state() private skip = 0;
  @state() private take = 25;
  @state() private search = "";

  private searchDebounceTimer?: number;

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchUsers();
  }

  private async fetchUsers() {
    this.loading = true;
    try {
      const params = new URLSearchParams({
        skip: String(this.skip),
        take: String(this.take),
      });
      if (this.search) {
        params.set("search", this.search);
      }

      const result = await ApiService.getInstance().callApi<UserProfilesResponse>(
        "GET",
        `/user-profiles?${params}`,
        null,
        true,
        true
      );

      if (result.success && result.data) {
        this.users = result.data.items || [];
        this.totalCount = result.data.totalCount || 0;
      } else {
        console.error("Failed to fetch user profiles:", result.error);
        this.users = [];
        this.totalCount = 0;
      }
    } catch (error) {
      console.error("Failed to fetch user profiles:", error);
      this.users = [];
      this.totalCount = 0;
    } finally {
      this.loading = false;
    }
  }

  private handleSearchInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = window.setTimeout(() => {
      this.search = value;
      this.skip = 0;
      this.fetchUsers();
    }, 500);
  }

  private handlePageChange(skip: number) {
    this.skip = skip;
    this.fetchUsers();
  }

  render() {
    return html`
      <div
        class="section-header"
        style="display: flex; justify-content: space-between; align-items: center;"
      >
        <span>${msg('All Users')}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input
            type="text"
            class="search-box"
            style="width: 250px; margin: 0; font-size: 14px; padding: 5px 10px;"
            .placeholder=${msg('Search users...')}
            .value=${this.search}
            @input=${this.handleSearchInput}
          />
        </div>
      </div>

      <div class="panel">
        <div class="panel-body">
          ${this.loading
            ? html`<div>${msg('Loading users...')}</div>`
            : this.users.length === 0
            ? html`<div>${msg('No users found.')}</div>`
            : html`
                <div class="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>${msg('Wallet')}</th>
                        <th>${msg('Email')}</th>
                        <th>${msg('First Name')}</th>
                        <th>${msg('Last Name')}</th>
                        <th>${msg('Business')}</th>
                        <th>${msg('Gov ID Number')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.users.map(
                        (user) => html`
                          <tr>
                            <td style="font-family: monospace; font-size: 13px;">
                              ${user.wallet || "-"}
                            </td>
                            <td>
                              ${user.email
                                ? html`<span
                                    class="link"
                                    @click=${() => (window.location.hash = `/users/profile/${user.wallet}`)}
                                  >${user.email}</span>`
                                : "-"}
                            </td>
                            <td>${user.first_name || "-"}</td>
                            <td>${user.last_name || "-"}</td>
                            <td>${user.business_name || "-"}</td>
                            <td>${user.government_id_number || "-"}</td>
                          </tr>
                        `
                      )}
                    </tbody>
                  </table>
                </div>

                <div class="pagination mt-16">
                  <button
                    class="pagination-btn"
                    ?disabled=${this.skip === 0}
                    @click=${() =>
                      this.handlePageChange(Math.max(0, this.skip - this.take))}
                  >
                    ${msg('PREV')}
                  </button>
                  <span style="margin: 0 8px; font-size: 14px;">
                    ${msg('Showing')} ${this.skip + 1} -
                    ${Math.min(this.skip + this.take, this.totalCount)} ${msg('of')}
                    ${this.totalCount}
                  </span>
                  <button
                    class="pagination-btn"
                    ?disabled=${this.skip + this.take >= this.totalCount}
                    @click=${() => this.handlePageChange(this.skip + this.take)}
                  >
                    ${msg('NEXT')}
                  </button>
                </div>
              `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "all-users-table": AllUsersTable;
  }
}
