import { LitElement, css, html } from "lit";
import { msg } from "@lit/localize";
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "../global-styles.ts";
import { ApiService } from "../services/api-service.ts";

interface EmailMessage {
    deliveryId: string;
    recipient: string;
    subject: string;
    templateId: number;
    createdAt: number;
    sentAt?: number;
    deliveredAt?: number;
    openedAt?: number;
    bouncedAt?: number;
    status: string;
}

interface EmailsResponse {
    items: EmailMessage[];
    next: string;
}

interface EmailEventsResponse {
    deliveredAt?: number;
    openedAt?: number;
    bouncedAt?: number;
    status: string;
}

@customElement("emails-view")
export class EmailsView extends LitElement {
    static styles = [
        globalStyles,
        css`
            .status-pill {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 12px;
                font-weight: 500;
                text-transform: capitalize;
            }
            .status-delivered { background: #d4edda; color: #155724; }
            .status-opened { background: #cce5ff; color: #004085; }
            .status-clicked { background: #cce5ff; color: #004085; }
            .status-sent { background: #e2e3e5; color: #383d41; }
            .status-bounced, .status-failed { background: #f8d7da; color: #721c24; }
            .status-spammed, .status-unsubscribed { background: #fff3cd; color: #856404; }
            .status-drafted, .status-unknown { background: #e2e3e5; color: #6c757d; }
        `,
    ];

    @state() private emails: EmailMessage[] = [];
    @state() private loading = false;
    @state() private errorMessage = "";
    @state() private nextCursor = "";
    @state() private cursorStack: string[] = [];
    @state() private pageSize = 50;
    // Delivery ids currently being resolved on demand, and those already resolved
    // (so we stop offering the button even when no delivery/open event came back).
    @state() private resolving: Set<string> = new Set();
    @state() private resolved: Set<string> = new Set();

    async connectedCallback() {
        super.connectedCallback();
        await this.fetchEmails("");
    }

    private async fetchEmails(cursor: string) {
        this.loading = true;
        this.errorMessage = "";
        // Each page is a fresh set of rows; drop any per-row resolve state.
        this.resolving = new Set();
        this.resolved = new Set();
        try {
            const params = new URLSearchParams({ limit: String(this.pageSize) });
            if (cursor) params.set("next", cursor);

            const result = await ApiService.getInstance().callApi<EmailsResponse>(
                "GET",
                `/emails?${params}`,
                null,
                true,
                true
            );

            if (result.success && result.data) {
                this.emails = result.data.items || [];
                this.nextCursor = result.data.next || "";
            } else {
                this.emails = [];
                this.nextCursor = "";
                this.errorMessage = result.error || msg("Failed to load emails");
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Failed to fetch emails:", e);
            this.errorMessage = msg("Failed to load emails");
            this.emails = [];
            this.nextCursor = "";
        } finally {
            this.loading = false;
        }
    }

    private handleNext() {
        if (!this.nextCursor) return;
        this.cursorStack = [...this.cursorStack, this.nextCursor];
        this.fetchEmails(this.nextCursor);
    }

    private handlePrev() {
        if (this.cursorStack.length === 0) return;
        const stack = [...this.cursorStack];
        stack.pop();
        const prevCursor = stack.length > 0 ? stack[stack.length - 1] : "";
        this.cursorStack = stack;
        this.fetchEmails(prevCursor);
    }

    private handleRefresh() {
        this.cursorStack = [];
        this.fetchEmails("");
    }

    private formatTimestamp(unix?: number): string {
        if (!unix) return "-";
        const d = new Date(unix * 1000);
        return d.toLocaleString();
    }

    // resolveEvents fetches a single message's delivery lifecycle on demand and fills
    // delivered/opened/bounced + status into that row. The listing itself stays one cheap
    // call; the provider (Postmark) resolves per-message details only when asked.
    private async resolveEvents(m: EmailMessage) {
        if (!m.deliveryId || this.resolving.has(m.deliveryId)) return;
        this.resolving = new Set(this.resolving).add(m.deliveryId);
        try {
            const result = await ApiService.getInstance().callApi<EmailEventsResponse>(
                "GET",
                `/emails/${encodeURIComponent(m.deliveryId)}/events`,
                null,
                true,
                true
            );
            if (result.success && result.data) {
                m.deliveredAt = result.data.deliveredAt;
                m.openedAt = result.data.openedAt;
                m.bouncedAt = result.data.bouncedAt;
                if (result.data.status) m.status = result.data.status;
                this.emails = [...this.emails]; // trigger re-render with the mutated row
            }
        } catch (e) {
            // Non-fatal: leave the row as-is and let the user retry via Refresh.
            // eslint-disable-next-line no-console
            console.error("Failed to resolve email events:", e);
        } finally {
            const next = new Set(this.resolving);
            next.delete(m.deliveryId);
            this.resolving = next;
            this.resolved = new Set(this.resolved).add(m.deliveryId);
        }
    }

    render() {
        return html`
            <div
                class="section-header"
                style="display: flex; justify-content: space-between; align-items: center;"
            >
                <span>${msg("Recent Emails")}</span>
                <button class="btn btn-sm" @click=${this.handleRefresh} ?disabled=${this.loading}>
                    ${msg("Refresh")}
                </button>
            </div>

            ${this.errorMessage
                ? html`<div class="alert-error">${this.errorMessage}</div>`
                : ""}

            <div class="panel">
                <div class="panel-body">
                    ${this.loading
                        ? html`<div>${msg("Loading emails...")}</div>`
                        : this.emails.length === 0
                            ? html`<div>${msg("No emails found.")}</div>`
                            : html`
                                <div class="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>${msg("Sent")}</th>
                                                <th>${msg("Recipient")}</th>
                                                <th>${msg("Subject")}</th>
                                                <th>${msg("Status")}</th>
                                                <th>${msg("Delivered")}</th>
                                                <th>${msg("Opened")}</th>
                                                <th>${msg("Delivery ID")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${this.emails.map(
                                                (m) => html`
                                                    <tr>
                                                        <td>${this.formatTimestamp(m.sentAt || m.createdAt)}</td>
                                                        <td>${m.recipient || "-"}</td>
                                                        <td>${m.subject || "-"}</td>
                                                        <td>
                                                            <span class="status-pill status-${m.status}">
                                                                ${m.status}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            ${m.deliveredAt
                                                                ? this.formatTimestamp(m.deliveredAt)
                                                                : this.resolving.has(m.deliveryId)
                                                                    ? html`<span style="opacity:0.6;">${msg("Resolving...")}</span>`
                                                                    : this.resolved.has(m.deliveryId)
                                                                        ? "-"
                                                                        : html`<button
                                                                              class="btn btn-sm"
                                                                              @click=${() => this.resolveEvents(m)}
                                                                          >
                                                                              ${msg("Resolve")}
                                                                          </button>`}
                                                        </td>
                                                        <td>${this.formatTimestamp(m.openedAt)}</td>
                                                        <td style="font-family: monospace; font-size: 12px;">
                                                            ${m.deliveryId}
                                                        </td>
                                                    </tr>
                                                `
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div class="pagination mt-16">
                                    <button
                                        class="pagination-btn"
                                        ?disabled=${this.cursorStack.length === 0 || this.loading}
                                        @click=${this.handlePrev}
                                    >
                                        ${msg("PREV")}
                                    </button>
                                    <span style="margin: 0 8px; font-size: 14px;">
                                        ${msg("Page")} ${this.cursorStack.length + 1}
                                    </span>
                                    <button
                                        class="pagination-btn"
                                        ?disabled=${!this.nextCursor || this.loading}
                                        @click=${this.handleNext}
                                    >
                                        ${msg("NEXT")}
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
        "emails-view": EmailsView;
    }
}
