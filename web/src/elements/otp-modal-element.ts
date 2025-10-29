import { LitElement, html, nothing } from 'lit';
import {customElement, property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import { generateP256KeyPair } from "@turnkey/crypto";
import {SigningService} from "@services/signing-service.ts";

@customElement('otp-modal-element')
export class OtpModalElement extends LitElement {

    @property({ attribute: true, type: Boolean })
    public open: boolean = false;

    @property({ attribute: true, type: String })
    public email: string = '';

    @property({ attribute: true, type: String })
    public orgId: string = '';

    @property({ attribute: true, type: String })
    public subOrgId: string = '';

    private otpId: string;

    private apiService: ApiService;
    private signService: SigningService;

    @state() private otpValues: string[] = Array(6).fill('');

    constructor() {
        super();
        this.apiService = ApiService.getInstance();
        this.signService = SigningService.getInstance();
        this.otpId = '';
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
    }

    public async requestOtp()  {
        const response = await this.apiService.callApi<{otpId: string;}>("POST", "/auth/otp", {
            email: this.email,
        }, true);

        if (!response.success) {
            throw new Error("Can not connect to otp");
        }

        const { otpId: newOtpId } = response.data!;

        this.otpId = newOtpId;
    }

    private handleInput(e: InputEvent, index: number) {
        const input = e.target as HTMLInputElement;
        const value = input.value.replace(/\D/, '');

        this.otpValues = [
            ...this.otpValues.slice(0, index),
            value,
            ...this.otpValues.slice(index + 1),
        ];

        if (value && index < this.otpValues.length - 1) {
            this.updateComplete.then(() => {
                const next = this.querySelectorAll<HTMLInputElement>('input')[index + 1];
                next?.focus();
            });
        }
    }


    private handleKeyDown(e: KeyboardEvent, index: number) {
        if (e.key === 'Backspace' && !this.otpValues[index] && index > 0) {
            const prev = this.querySelectorAll<HTMLInputElement>('input')[index - 1];
            prev?.focus();
        }
    }

    private handlePaste(e: ClipboardEvent) {
        e.preventDefault();

        const pasted = e.clipboardData?.getData('text') ?? '';
        const digits = pasted.replace(/\D/g, '').slice(0, this.otpValues.length);

        // Fill values
        digits.split('').forEach((d, i) => {
            this.otpValues[i] = d;
        });

        this.requestUpdate();

        // Focus next empty or last input
        const inputs = this.shadowRoot?.querySelectorAll<HTMLInputElement>('input');
        const nextIndex = Math.min(digits.length, this.otpValues.length - 1);
        inputs?.[nextIndex]?.focus();
    }

    private async confirmOtp() {
        const otp = this.otpValues.join('');

        const key = generateP256KeyPair();
        const targetPublicKey = key.publicKeyUncompressed;

        const credentialBundle = await this.validateOtp({
            key: targetPublicKey,
            otpCode: otp
        });

        this.signService.saveSession({
            privateKey: key.privateKey,
            credentialBundle,
        });

        this.dispatchEvent(new CustomEvent('otp-completed', {  }));
        this.otpValues = Array(6).fill('');
        if (this.open) this.open = false;
    }

    render() {
        if (!this.open){
            return nothing;
        }
        return html`
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Enter OTP</h3>
                        <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
                    </div>                    
                    <div class="modal-body">
                        <div class="message">
                            Please enter the 6 digit code sent to your email.
                        </div>
                        <div class="otp-inputs">
                            ${this.otpValues.map(
                                    (v, i) => html`
                                <input
                                  .value=${v}
                                  maxlength="1"
                                  inputmode="numeric"
                                  @input=${(e: InputEvent) => this.handleInput(e, i)}
                                  @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, i)}
                                  @paste=${(e: ClipboardEvent) => this.handlePaste(e)}                                  
                                />
                              `
                            )}
                        </div>                        
                    </div>
                    <div class="modal-footer">
                        <button @click=${this.requestOtp}>Resend</button>
                        <button @click=${this.confirmOtp}>Confirm</button>
                    </div>
                </div>
            </div>
        `;
    }

    private closeModal() {
        this.open = false;
        this.otpId = '';
        this.email = '';
        this.otpValues = Array(6).fill('');

        // Dispatch event to parent
        this.dispatchEvent(new CustomEvent('otp-closed', { }));
    }



    private async validateOtp({
        key,
        otpCode,
                              }:{
        key: string;
        otpCode: string;
    }) : Promise<string> {
        const response = await this.apiService.callApi<{credentialBundle: string;}>("PUT", "/auth/otp", {
            email: this.email,
            otpId: this.otpId,
            otpCode: otpCode,
            key: key,
        }, true);

        if (!response.success) {
            throw new Error("Can not connect to otp");
        }

        const { credentialBundle } = response.data!;

        return credentialBundle;
    }

}