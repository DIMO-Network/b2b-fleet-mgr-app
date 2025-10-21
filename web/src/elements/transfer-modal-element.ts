import {html, nothing} from 'lit'
import {customElement, property, state} from "lit/decorators.js";
// import {ApiService} from "@services/api-service.ts";
import './session-timer';
import {BaseOnboardingElement} from "@elements/base-onboarding-element.ts";
import {delay} from "@utils/utils.ts";

@customElement('transfer-modal-element')
export class TransferModalElement extends BaseOnboardingElement {
    @property({attribute: true, type: Boolean})
    public show = false

    @property({attribute: true})
    public vehicleVin = ""

    @state()
    private walletAddress = ""

    @state()
    private email = ""

    constructor() {
        super();
    }

    connectedCallback() {
        super.connectedCallback();
    }

    // Disable shadow DOM to allow inherit css
    createRenderRoot() {
        return this;
    }

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
                            <div class="transfer-options">
                                <div class="transfer-option">
                                    <h4>Transfer by Wallet Address</h4>
                                    <form class="transfer-form">
                                        <label>
                                            Wallet 0x Address
                                            <input type="text" 
                                                   placeholder="0x..." 
                                                   maxlength="42"
                                                   .value=${this.walletAddress}
                                                   @input=${(e: InputEvent) => this.walletAddress = (e.target as HTMLInputElement).value}>
                                        </label>
                                        <button type="button" 
                                                class="btn-primary" 
                                                @click=${() => this.confirmTransfer('wallet')}
                                                ?disabled=${!this.walletAddress.trim()}>
                                            Transfer by Wallet
                                        </button>
                                    </form>
                                </div>
                                
                                <div class="transfer-divider">
                                    <span>OR</span>
                                </div>
                                
                                <div class="transfer-option">
                                    <h4>Transfer by Email</h4>
                                    <form class="transfer-form">
                                        <label>
                                            Email Address
                                            <input type="email" 
                                                   placeholder="user@example.com"
                                                   .value=${this.email}
                                                   @input=${(e: InputEvent) => this.email = (e.target as HTMLInputElement).value}>
                                        </label>
                                        <button type="button" 
                                                class="btn-primary" 
                                                @click=${() => this.confirmTransfer('email')}
                                                ?disabled=${!this.email.trim()}>
                                            Transfer by Email
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" @click=${this.closeModal}>
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
        console.log("Closing transfer modal");
        
        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('modal-closed', {
            bubbles: true,
            composed: true
        }));
    }

    async confirmTransfer(transferType: 'wallet' | 'email') {
        this.processing = true;

        console.log("Vehicle VIN:", this.vehicleVin);
        console.log("Transfer Type:", transferType);
        
        if (transferType === 'wallet') {
            console.log("Wallet Address:", this.walletAddress);
        } else {
            // todo lookup account if not exists create
            console.log("Email:", this.email);
        }

        // get data to sign
        // signing service to sign the data
        // post data with the signature, this should cause backend to update the owner in the db. Do this process with a river job.
        // we could have frontend query for status if want to give it a better experience.
        
        // TODO: Implement actual transfer logic here
        await delay(5000)
        this.processing = false

        this.closeModal();
    }
}
