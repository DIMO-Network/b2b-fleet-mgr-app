import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { msg } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import { AAWalletService, AAWalletStatus } from "@services/aa-wallet-service.ts";

/**
 * The AA fleet wallet card (fleet-tenancy-api plan 08): a smart account the
 * tenant itself controls. Vehicles it owns are shared — and later transferred,
 * disconnected, deleted — by the backend signing directly, with no passkey
 * prompt and no per-owner authorization.
 *
 * Two ways in: paste an existing wallet + root key, or generate a fresh one in
 * the browser (new key, Kernel account, sponsored deployment). Either way the
 * key is submitted once, stored encrypted by the tenancy service, and never
 * shown again — this card deliberately has no "reveal" and keeps the key out
 * of every error message.
 */
@customElement("aa-wallet-panel")
export class AAWalletPanel extends LitElement {
  static styles = [
    globalStyles,
    css`
      .wallet-address {
        font-family: monospace;
        font-size: 13px;
        word-break: break-all;
      }
      .helper-text {
        font-size: 13px;
        color: #666;
        margin-top: 8px;
        max-width: 70ch;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .field {
        margin-top: 10px;
      }
      .field label {
        display: block;
        font-size: 13px;
        margin-bottom: 4px;
      }
      .field input {
        width: 100%;
        max-width: 46ch;
        font-family: monospace;
      }
      .progress {
        font-size: 14px;
        color: #444;
        margin-top: 8px;
      }
      .danger-note {
        background: #fff3cd;
        border: 1px solid #856404;
        color: #856404;
        padding: 10px 14px;
        margin-top: 12px;
        font-size: 14px;
        max-width: 70ch;
      }
      .state {
        font-weight: bold;
      }
    `,
  ];

  @state() private status?: AAWalletStatus;
  @state() private loading = false;
  @state() private saving = false;
  @state() private error = "";
  @state() private success = "";
  @state() private progressStep = "";
  @state() private showPaste = false;
  @state() private confirmingClear = false;
  @state() private walletInput = "";
  @state() private keyInput = "";

  private service = AAWalletService.getInstance();

  async connectedCallback() {
    super.connectedCallback();
    this.loading = true;
    const res = await this.service.fetchStatus();
    if (res.success) this.status = res.data;
    else this.error = res.error || msg("Failed to load the fleet wallet status");
    this.loading = false;
  }

  private async submit(walletAddress: string, privateKey: string, successText: string) {
    this.saving = true;
    this.error = "";
    this.success = "";
    const res = await this.service.set(walletAddress, privateKey);
    if (res.success) {
      this.status = res.data;
      this.success = successText;
      this.showPaste = false;
      this.walletInput = "";
      this.keyInput = "";
    } else {
      // The tenancy service's refusal names what is wrong (undeployed wallet,
      // key that doesn't control it, wrong chain) — surface it verbatim. The
      // key itself never appears in these messages.
      this.error = res.error || msg("The wallet could not be saved");
    }
    this.saving = false;
  }

  private async savePasted() {
    if (!this.walletInput || !this.keyInput) {
      this.error = msg("Both the wallet address and its private key are required");
      return;
    }
    await this.submit(this.walletInput.trim(), this.keyInput.trim(), msg("Fleet wallet configured"));
  }

  private async generate() {
    this.saving = true;
    this.error = "";
    this.success = "";
    try {
      const generated = await this.service.generate((step) => {
        this.progressStep = step;
      });
      this.progressStep = msg("Registering with the tenancy service");
      await this.submit(
        generated.walletAddress,
        generated.privateKey,
        msg("Fleet wallet generated and configured"),
      );
    } catch (e) {
      // The error may be a bundler/paymaster failure; it never contains the key.
      this.error = e instanceof Error ? e.message : msg("Generating the wallet failed");
      this.saving = false;
    }
    this.progressStep = "";
  }

  private async clear() {
    if (!this.confirmingClear) {
      this.confirmingClear = true;
      return;
    }
    this.confirmingClear = false;
    this.saving = true;
    this.error = "";
    this.success = "";
    const res = await this.service.clear();
    if (res.success) {
      this.status = { configured: false };
      this.success = msg("Fleet wallet removed");
    } else {
      this.error = res.error || msg("Failed to remove the fleet wallet");
    }
    this.saving = false;
  }

  render() {
    if (this.loading) {
      return html`
        <div class="panel">
          <div class="panel-header">${msg("Fleet wallet")}</div>
          <div class="panel-body">${msg("Loading…")}</div>
        </div>
      `;
    }

    return html`
      <div class="panel">
        <div class="panel-header">${msg("Fleet wallet")}</div>
        <div class="panel-body">
          ${this.error ? html`<div class="alert alert-error">${this.error}</div>` : nothing}
          ${this.success ? html`<div class="alert alert-success">${this.success}</div>` : nothing}

          ${this.status?.configured ? this.renderConfigured() : this.renderUnconfigured()}

          <p class="helper-text">
            ${msg(
              "The fleet wallet is a smart account your tenant controls. Vehicles it owns can be shared with customers server-side — no passkey prompt, no per-vehicle authorization. The private key is validated on chain, stored encrypted by the tenancy service, and never shown again.",
            )}
          </p>
        </div>
      </div>
    `;
  }

  private renderConfigured() {
    return html`
      <div>
        ${msg("Configured:")}
        <span class="wallet-address">${this.status?.walletAddress}</span>
      </div>
      <div class="row">
        <button class="btn" @click=${this.clear} ?disabled=${this.saving}>
          ${this.confirmingClear ? msg("CLICK AGAIN TO CONFIRM REMOVAL") : msg("REMOVE FLEET WALLET")}
        </button>
      </div>
      ${this.confirmingClear
        ? html`<div class="danger-note">
            ${msg(
              "Removing the wallet stops server-side sharing for vehicles it owns. The vehicles themselves are untouched — but until a wallet is configured again, they cannot be shared from fleet-lite.",
            )}
          </div>`
        : nothing}
    `;
  }

  private renderUnconfigured() {
    if (this.progressStep) {
      return html`<div class="progress">${this.progressStep}…</div>`;
    }
    return html`
      <div>${msg("No fleet wallet is configured.")}</div>
      <div class="row">
        <button class="btn ${this.saving ? "processing" : ""}" @click=${this.generate} ?disabled=${this.saving}>
          ${msg("GENERATE FLEET WALLET")}
        </button>
        <button
          class="btn"
          @click=${() => {
            this.showPaste = !this.showPaste;
            this.error = "";
          }}
          ?disabled=${this.saving}
        >
          ${this.showPaste ? msg("CANCEL") : msg("USE AN EXISTING WALLET")}
        </button>
      </div>

      ${this.showPaste
        ? html`
            <div class="field">
              <label>${msg("Smart account address")}</label>
              <input
                type="text"
                placeholder="0x…"
                .value=${this.walletInput}
                @input=${(e: InputEvent) => (this.walletInput = (e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="field">
              <label>${msg("Root private key (write-only — validated, encrypted, never shown again)")}</label>
              <input
                type="password"
                autocomplete="off"
                placeholder="0x…"
                .value=${this.keyInput}
                @input=${(e: InputEvent) => (this.keyInput = (e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="row">
              <button class="btn ${this.saving ? "processing" : ""}" @click=${this.savePasted} ?disabled=${this.saving}>
                ${msg("SAVE FLEET WALLET")}
              </button>
            </div>
            <div class="helper-text">
              ${msg(
                "The wallet must be a deployed Kernel v3.1 smart account whose sudo key is the one you paste — the tenancy service verifies both on chain before storing anything.",
              )}
            </div>
          `
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "aa-wallet-panel": AAWalletPanel;
  }
}
