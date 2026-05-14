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

    private accountCheckTimeout?: number;

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
                                    <h4>${msg('Transfer by Email (new accounts)')}</h4>
                                    <form class="transfer-form">
                                        <label>
                                            ${msg('Email Address')}
                                            <input type="email" 
                                                   placeholder="user@example.com"
                                                   .value=${this.email}
                                                   @input=${this.handleEmailInput}>
                                        </label>
                                        <button type="button" 
                                                class="action-btn ${this.processing ? 'processing' : ''}" 
                                                @click=${() => this.confirmTransfer('email')}
                                                ?disabled=${!this.email.trim() || this.processing}>
                                            ${this.processing ? msg('Processing...') : msg('Transfer by Email')}
                                        </button>
                                        <p>
                                           ${msg('User will receive an email with an OTP code to login to the App. This will not work for existing accounts.')}
                                        </p>
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
        console.log("Closing transfer modal");
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    private handleEmailInput = (e: InputEvent) => {
        this.email = (e.target as HTMLInputElement).value;
    };

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

        console.log("Vehicle VIN:", this.vehicleVin);
        console.log("Vehicle IMEI", this.imei);
        console.log("Transfer Type:", transferType);
        this.statusMessage = msg("Processing transfer for IMEI: ") + this.imei;
        
        if (transferType === 'email') {
            this.statusMessage = msg("Creating account for email: ") + this.email;
            const createAccountResp = await this.createAccount(this.email);
            if (!createAccountResp.success) {
                this.errorMessage = createAccountResp.error;
                this.processing = false;
                return;
            }
            this.walletAddress = createAccountResp.data.walletAddress;
            console.log("Created account with wallet address:", this.walletAddress);
            this.statusMessage = msg("Account created with wallet address: ") + this.walletAddress;
        }

        if (this.walletAddress == "") {
            alert(msg("Please enter a wallet address"));
            this.processing = false;
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
                this.processing = false;
                return;
            }

        }
        this.statusMessage = msg("Transfer completed successfully");

        // Add inventory state record
        this.statusMessage = msg("Recording inventory state change...");
        const inventoryResult = await this.addInventoryState(this.imei, this.walletAddress);
        if (!inventoryResult.success) {
            console.error("Failed to add inventory state:", inventoryResult.error);
            // Don't fail the whole transfer if inventory tracking fails
        }

        await delay(500);
        this.processing = false;

        this.closeModal();
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

    async addInventoryState(imei: string, walletAddress: string): Promise<Result<any, string>> {
        const payload = {
            state: "Customer",
            note: `Transfer to customer ${walletAddress}`
        };

        const resp = await this.api.callApi<any>('POST', `/fleet/vehicles/${imei}/inventory`, payload, true, true);
        if (!resp.success) {
            return {
                success: false,
                error: resp.error || msg("Failed to add inventory state")
            };
        }

        return {
            success: true,
            data: resp.data
        };
    }
}
