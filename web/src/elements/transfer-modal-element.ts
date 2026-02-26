import {css, html, nothing} from 'lit';
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
        `
    ];
    @property({attribute: true, type: Boolean})
    public show = false;

    @property({attribute: true})
    public vehicleVin = "";

    @property({attribute: true})
    public imei = "";

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
                        <h3>Transfer Vehicle</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>
                        <div class="modal-body">
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
                                    <h4>Transfer by Wallet Address</h4>
                                    <form class="transfer-form">
                                        <label>
                                            Wallet 0x Address (for existing accounts)
                                            <div style="display: flex; align-items: center; gap: 8px;">
                                                <input type="text" 
                                                       placeholder="0x..." 
                                                       maxlength="42"
                                                       .value=${this.walletAddress}
                                                       @input=${this.handleWalletInput}>
                                                ${this.isCheckingAccount ? html`<span style="font-size: 12px; color: #666;">Checking…</span>` : nothing}
                                                ${this.accountFound ? html`<span style="color: #22c55e; font-size: 16px;">✓</span>` : nothing}
                                            </div>
                                        </label>
                                        ${this.walletAddress && this.accountNotFound ? html`
                                            <div style="font-size: 12px; color: #fc0303; margin-top: 6px;">
                                                the wallet address ${this.walletAddress} does not exist.
                                            </div>
                                        ` : nothing}
                                        <button type="button" 
                                                class="action-btn ${this.processing ? 'processing' : ''}" 
                                                @click=${() => this.confirmTransfer('wallet')}
                                                ?disabled=${!this.walletAddress.trim() || this.processing}>
                                            ${this.processing ? 'Processing...' : 'Transfer by Wallet'}
                                        </button>
                                    </form>
                                </div>
                                
                                <div class="transfer-divider">
                                    <span>OR</span>
                                </div>
                                
                                <div class="transfer-option">
                                    <h4>Transfer by Email (new accounts)</h4>
                                    <form class="transfer-form">
                                        <label>
                                            Email Address
                                            <input type="email" 
                                                   placeholder="user@example.com"
                                                   .value=${this.email}
                                                   @input=${this.handleEmailInput}>
                                        </label>
                                        <button type="button" 
                                                class="action-btn ${this.processing ? 'processing' : ''}" 
                                                @click=${() => this.confirmTransfer('email')}
                                                ?disabled=${!this.email.trim() || this.processing}>
                                            ${this.processing ? 'Processing...' : 'Transfer by Email'}
                                        </button>
                                        <p>
                                           User will receive an email with an OTP code to login to the App. This will not work for existing accounts.
                                        </p>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="action-btn secondary" @click=${this.closeModal}>
                                Cancel
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
        const resp = await this.api.callApi<any>('GET', `/account${query}`, null, true, true, false);
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
        this.statusMessage = "Processing transfer for IMEI: " + this.imei;
        
        if (transferType === 'email') {
            this.statusMessage = "Creating account for email: " + this.email;
            const createAccountResp = await this.createAccount(this.email);
            if (!createAccountResp.success) {
                this.errorMessage = createAccountResp.error;
                this.processing = false;
                return;
            }
            this.walletAddress = createAccountResp.data.walletAddress;
            console.log("Created account with wallet address:", this.walletAddress);
            this.statusMessage = "Account created with wallet address: " + this.walletAddress;
        }

        if (this.walletAddress == "") {
            alert("Please enter a wallet address");
            this.processing = false;
            return;
        }

        console.log("Target Wallet to transfer to", this.walletAddress);
        // this method does a lot of steps. It also checks the status of the transfer, which should be separated out into own function.
        const result = await this.transferVehicle(this.imei, this.walletAddress);
        if (!result.success) {
            if (result.error.toLowerCase().includes('timeout')) {
                this.errorMessage = "Check Info for final transfer verification";
            } else {
                this.errorMessage = result.error;
                this.processing = false;
                return;
            }

        }
        this.statusMessage = "Transfer completed successfully";

        // Add inventory state record
        this.statusMessage = "Recording inventory state change...";
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
        const creatResp = await this.api.callApi<AccountData>('POST', '/account', payload, true, true, false);
        if (!creatResp.success || !creatResp.data) {
            return {
                success: false,
                error: creatResp.error || "Failed to create account"
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
                error: resp.error || "Failed to add inventory state"
            };
        }

        return {
            success: true,
            data: resp.data
        };
    }
}
