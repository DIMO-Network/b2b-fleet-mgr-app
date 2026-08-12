import {css, html, nothing} from 'lit';
import {msg} from '@lit/localize';
import {customElement, property, state} from "lit/decorators.js";
// import {ApiService} from "@services/api-service.ts";
import './session-timer';
import {BaseOnboardingElement} from "@elements/base-onboarding-element.ts";
import {delay, Result} from "@utils/utils.ts";
import {globalStyles} from "../global-styles.ts";

export interface AccountData {
    walletAddress: string;
    subOrganizationId: string;
}

@customElement('transfer-modal-element')
export class TransferModalElement extends BaseOnboardingElement {
    static styles = [ globalStyles,
        css`
          .transfer-options {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .transfer-option {
            border: 1px solid #000;
            background: #fff;
            padding: 16px;
          }
          .transfer-option h4 {
            margin: 0 0 8px 0;
            font-size: 16px;
          }
          .transfer-form {
            display: grid;
            gap: 12px;
          }
          .transfer-form label {
            display: grid;
            gap: 6px;
          }
          .transfer-form input[type="text"],
          .transfer-form input[type="email"] {
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-family: inherit;
            font-size: 14px;
          }
          .transfer-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
          }
          .shared-account-banner {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            background-color: #eff6ff;
            border: 1px solid #bfdbfe;
            border-left: 4px solid #2563eb;
            border-radius: 4px;
            padding: 10px 12px;
            margin-bottom: 16px;
            color: #1e3a8a;
            font-size: 13px;
            line-height: 1.4;
          }
          .shared-account-badge {
            display: inline-block;
            flex: 0 0 auto;
            background-color: #2563eb;
            color: #fff;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            padding: 2px 8px;
            border-radius: 999px;
            white-space: nowrap;
          }
          .shared-account-text {
            flex: 1 1 auto;
          }
        `
    ];
    @property({attribute: true, type: Boolean})
    public show = false;

    @property({attribute: true})
    public vehicleVin = "";

    @property({attribute: true})
    public imei = "";

    @property({attribute: true, type: Number})
    public tokenId = 0;

    // When true, the connected wallet isn't the on-chain owner but the owning kernel
    // authorised this tenant's signer — so the backend signs the transfer for us via
    // POST /v1/vehicle/transfer/shared instead of asking the wallet for a passkey signature.
    @property({attribute: true, type: Boolean})
    public useSharedAccountFlow = false;

    @state()
    private walletAddress = "";

    @state()
    private email = "";

    @state()
    private errorMessage = "";

    @state()
    private statusMessage = "";

    @state()
    private isCheckingAccount = false;

    @state()
    private accountNotFound: boolean | null = null;

    @state()
    private accountFound: boolean = false;

    // Email-lookup state (mirrors the wallet lookup). Populated by the debounced
    // lookupEmailAccount so we can transfer to an existing account directly instead of always
    // creating a new one.
    @state()
    private isCheckingEmail = false;

    @state()
    private emailAccountFound = false; // existing account; resolvedEmailWallet is set

    @state()
    private emailAccountNew = false; // 404 from lookup: no account yet, will create one

    @state()
    private emailLookupError = ""; // lookup unavailable/blocked (e.g. non-allowlisted tenant)

    @state()
    private resolvedEmailWallet = "";

    private accountCheckTimeout?: number;

    private emailCheckTimeout?: number;

    constructor() {
        super();
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('status-update', this.handleStatusUpdate as EventListener);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('status-update', this.handleStatusUpdate as EventListener);
    }

    private handleStatusUpdate = (event: CustomEvent<{ status: string }>) => {
        this.statusMessage = event.detail.status;
    };

    // Use shadow DOM; shared modal styles come from globalStyles

    render() {
        if (!this.show) {
            return nothing;
        }

        return html`
            <div class="modal-overlay" @click=${this.closeModal}>
                <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
                    <div class="modal-header">
                        <h3>${msg('Transfer Vehicle')}</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>
                        <div class="modal-body">
                            ${this.useSharedAccountFlow ? html`
                                <div class="shared-account-banner" role="status" aria-label=${msg('Shared account mode')}>
                                    <span class="shared-account-badge">${msg('Shared account mode')}</span>
                                    <span class="shared-account-text">
                                        ${msg('This vehicle is owned by a kernel account that authorised your tenant signer. Your tenant will sign and submit the transfer on its behalf — no passkey signature is required.')}
                                    </span>
                                </div>
                            ` : nothing}
                            ${this.errorMessage ? html`
                                <div style="background-color: #fee; border: 1px solid #fcc; border-radius: 4px; padding: 12px; margin-bottom: 16px; color: #c33;">
                                    ${this.errorMessage}
                                </div>
                            ` : nothing}
                            ${this.statusMessage ? html`
                                <div style="background-color: #fff4e6; border: 1px solid #ffa500; border-radius: 4px; padding: 12px; margin-bottom: 16px; color: #e67700;">
                                    ${this.statusMessage}
                                </div>
                            ` : nothing}
                            
                            <div class="transfer-options">
                                <div class="transfer-option">
                                    <h4>${msg('Transfer by Wallet Address')}</h4>
                                    <form class="transfer-form">
                                        <label>
                                            ${msg('Wallet 0x Address (for existing accounts)')}
                                            <div style="display: flex; align-items: center; gap: 8px;">
                                                <input type="text"
                                                       placeholder="0x..."
                                                       maxlength="42"
                                                       style="flex: 1; min-width: 0;"
                                                       .value=${this.walletAddress}
                                                       @input=${this.handleWalletInput}>
                                                ${this.isCheckingAccount ? html`<span style="font-size: 12px; color: #666; flex: 0 0 auto;">${msg('Checking...')}</span>` : nothing}
                                                ${this.accountFound ? html`<span style="color: #22c55e; font-size: 16px; flex: 0 0 auto;">✓</span>` : nothing}
                                            </div>
                                        </label>
                                        ${this.walletAddress && this.accountNotFound ? html`
                                            <div style="font-size: 12px; color: #fc0303; margin-top: 6px;">
                                                ${msg('The wallet address does not exist.')}
                                            </div>
                                        ` : nothing}
                                        <button type="button" 
                                                class="action-btn ${this.processing ? 'processing' : ''}" 
                                                @click=${() => this.confirmTransfer('wallet')}
                                                ?disabled=${!this.walletAddress.trim() || this.processing}>
                                            ${this.processing ? msg('Processing...') : msg('Transfer by Wallet')}
                                        </button>
                                    </form>
                                </div>
                                
                                <div class="transfer-divider">
                                    <span>${msg('OR')}</span>
                                </div>
                                
                                <div class="transfer-option">
                                    <h4>${msg('Transfer by Email')}</h4>
                                    <form class="transfer-form">
                                        <label>
                                            ${msg('Email Address')}
                                            <div style="display: flex; align-items: center; gap: 8px;">
                                                <input type="email"
                                                       placeholder="user@example.com"
                                                       style="flex: 1; min-width: 0;"
                                                       .value=${this.email}
                                                       @input=${this.handleEmailInput}>
                                                ${this.isCheckingEmail ? html`<span style="font-size: 12px; color: #666; flex: 0 0 auto;">${msg('Checking...')}</span>` : nothing}
                                                ${this.emailAccountFound ? html`<span style="color: #22c55e; font-size: 16px; flex: 0 0 auto;">✓</span>` : nothing}
                                            </div>
                                        </label>
                                        ${this.emailAccountFound ? html`
                                            <div style="font-size: 12px; color: #16a34a; margin-top: 6px;">
                                                ${msg('An existing account was found. The vehicle will be transferred directly to their wallet.')}
                                            </div>
                                        ` : nothing}
                                        ${this.emailAccountNew ? html`
                                            <div style="font-size: 12px; color: #666; margin-top: 6px;">
                                                ${msg('No account exists for this email yet. The user will receive an email with an OTP code to log in and claim the vehicle.')}
                                            </div>
                                        ` : nothing}
                                        ${this.emailLookupError ? html`
                                            <div style="font-size: 12px; color: #fc0303; margin-top: 6px;">
                                                ${this.emailLookupError}
                                            </div>
                                        ` : nothing}
                                        <button type="button"
                                                class="action-btn ${this.processing ? 'processing' : ''}"
                                                @click=${() => this.confirmTransfer('email')}
                                                ?disabled=${!this.email.trim() || this.processing || this.isCheckingEmail || !!this.emailLookupError}>
                                            ${this.processing ? msg('Processing...') : msg('Transfer by Email')}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="action-btn secondary" @click=${this.closeModal}>
                                ${msg('Cancel')}
                            </button>
                        </div>
                </div>
            </div>
        `;
    }

    private closeModal() {
        this.show = false;
        this.walletAddress = "";
        this.email = "";
        this.errorMessage = "";
        this.statusMessage = "";
        this.isCheckingEmail = false;
        this.emailAccountFound = false;
        this.emailAccountNew = false;
        this.emailLookupError = "";
        this.resolvedEmailWallet = "";
        if (this.emailCheckTimeout) {
            clearTimeout(this.emailCheckTimeout);
        }
        console.log("Closing transfer modal");
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private handleEmailInput = (e: InputEvent) => {
        const value = (e.target as HTMLInputElement).value;
        this.email = value;
        this.emailAccountFound = false;
        this.emailAccountNew = false;
        this.emailLookupError = "";
        this.resolvedEmailWallet = "";

        if (this.emailCheckTimeout) {
            clearTimeout(this.emailCheckTimeout);
        }

        const trimmed = value.trim();
        if (!trimmed || !this.isLikelyEmail(trimmed)) {
            this.isCheckingEmail = false;
            return;
        }

        this.isCheckingEmail = true;
        this.emailCheckTimeout = window.setTimeout(() => {
            this.lookupEmailAccount(trimmed);
        }, 400);
    };

    private isLikelyEmail(value: string): boolean {
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
    }

    // Resolve an account by email. An existing account returns a walletAddress (the Accounts
    // service only echoes it to our allowlisted developer JWT); a 404 means no account yet, so
    // we'll create one on submit; anything else means the lookup is unavailable for this tenant.
    private async lookupEmailAccount(email: string) {
        this.isCheckingEmail = true;
        const query = `?email=${encodeURIComponent(email)}`;
        // Backend GET /account requires Tenant-Id (matches the wallet lookup + POST create path).
        const resp = await this.api.callApi<AccountData>('GET', `/account${query}`, null, true, true, true);

        if (resp.success && resp.data?.walletAddress) {
            this.emailAccountFound = true;
            this.resolvedEmailWallet = resp.data.walletAddress;
            this.emailAccountNew = false;
            this.emailLookupError = "";
        } else if (resp.status === 404) {
            this.emailAccountNew = true;
            this.emailAccountFound = false;
            this.emailLookupError = "";
        } else {
            // 401/5xx, or a 200 with no walletAddress (non-allowlisted tenant): can't resolve.
            this.emailAccountFound = false;
            this.emailAccountNew = false;
            this.emailLookupError = msg("Account lookup isn't available for this tenant. Please transfer by wallet address instead.");
        }
        this.isCheckingEmail = false;
    }

    private handleWalletInput = (e: InputEvent) => {
        const value = (e.target as HTMLInputElement).value;
        this.walletAddress = value;
        this.accountNotFound = null;
        this.accountFound = false;

        if (this.accountCheckTimeout) {
            clearTimeout(this.accountCheckTimeout);
        }

        const trimmed = value.trim();
        if (!trimmed) {
            this.isCheckingAccount = false;
            return;
        }

        this.isCheckingAccount = true;
        this.accountCheckTimeout = window.setTimeout(() => {
            this.lookupAccount(trimmed);
        }, 400);
    };

    private async lookupAccount(walletAddress: string) {
        this.isCheckingAccount = true;
        const query = `?walletAddress=${encodeURIComponent(walletAddress)}`;
        // Backend GET /account requires Tenant-Id (matches the POST /account create path).
        const resp = await this.api.callApi<any>('GET', `/account${query}`, null, true, true, true);
        // If request failed or no body, show helper text
        if (!resp.success || !resp.data) {
            this.accountNotFound = true;
            this.accountFound = false;
        } else {
            this.accountNotFound = false;
            this.accountFound = true;
        }
        this.isCheckingAccount = false;
    }

    async confirmTransfer(transferType: 'wallet' | 'email') {
        this.processing = true;
        this.errorMessage = "";
        this.statusMessage = "";

        // Everything below is wrapped so that a *thrown* error still reaches the user. The
        // signing path can reject rather than return a failed Result (a dismissed passkey
        // dialog is the common case), and this method is invoked straight from a click
        // handler, so an escaping rejection previously left `processing` stuck at true — the
        // modal spun forever showing neither an error nor any sign it had stopped.
        try {
            console.log("Vehicle VIN:", this.vehicleVin);
            console.log("Vehicle IMEI", this.imei);
            console.log("Transfer Type:", transferType);
            this.statusMessage = msg("Processing transfer for IMEI: ") + this.imei;

            if (transferType === 'email') {
                if (this.emailLookupError) {
                    this.errorMessage = this.emailLookupError;
                    return;
                }

                if (this.emailAccountFound && this.resolvedEmailWallet) {
                    // Existing account: transfer straight to the resolved wallet — no account
                    // creation, no OTP email.
                    this.walletAddress = this.resolvedEmailWallet;
                    console.log("Transferring to existing account wallet:", this.walletAddress);
                    this.statusMessage = msg("Transferring to existing account: ") + this.walletAddress;
                } else {
                    // New account: create it (user gets an OTP email) then transfer.
                    this.statusMessage = msg("Creating account for email: ") + this.email;
                    const createAccountResp = await this.createAccount(this.email);
                    if (!createAccountResp.success) {
                        this.errorMessage = createAccountResp.error;
                        return;
                    }
                    this.walletAddress = createAccountResp.data.walletAddress;
                    console.log("Created account with wallet address:", this.walletAddress);
                    this.statusMessage = msg("Account created with wallet address: ") + this.walletAddress;
                }
            }

            if (this.walletAddress == "") {
                this.errorMessage = msg("Please enter a wallet address");
                return;
            }

            console.log("Target Wallet to transfer to", this.walletAddress);
            // Shared-account vehicles can't be passkey-signed by the connected wallet (it isn't
            // the owner). The backend signs server-side via the tenant signer.
            const result = this.useSharedAccountFlow
                ? await this.transferSharedAccountVehicle(this.tokenId, this.walletAddress)
                : await this.transferVehicle(this.imei, this.walletAddress);
            if (!result.success) {
                if (result.error.toLowerCase().includes('timeout')) {
                    this.errorMessage = msg("Check Info for final transfer verification");
                } else {
                    this.errorMessage = result.error;
                    return;
                }

            }
            this.statusMessage = msg("Transfer completed successfully");

            // The backend transfer job records the Customer inventory state when the
            // transfer lands on chain, so no frontend write is needed here.

            await delay(500);

            this.closeModal();
        } catch (error: any) {
            console.error("Transfer failed:", error?.message, error?.stack);
            this.errorMessage = error?.message || msg("Transfer failed unexpectedly");
        } finally {
            this.processing = false;
        }
    }

    async createAccount(email:string): Promise<Result<AccountData, string>> {
        const payload = {
            email: email,
            deployAccount: true
        };
        const creatResp = await this.api.callApi<AccountData>('POST', '/account',
            payload, true, true, true);
        if (!creatResp.success || !creatResp.data) {
            return {
                success: false,
                error: creatResp.error || msg("Failed to create account")
            };
        }

        return {
            success: true,
            data: creatResp.data
        };
    }

}
