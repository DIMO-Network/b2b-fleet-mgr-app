import {html, LitElement, css} from 'lit'
import {isLocalhost} from "./utils.js";
import {Settings} from "./settings.js";

export class LoginElement extends LitElement {
    static properties = {
        clientId: {type: String},
        token: {type: String},
        alertText: {type: String},
        loginUrl: {type: String},
    }

    constructor() {
        super();
        this.loginUrl = '';
        this.settings = new Settings();
        this.clientId = '';
    }

    async connectedCallback() {
        super.connectedCallback();

        const settings = await this.settings.fetchPublicSettings();
        this.clientId = settings.clientId

        if (this.clientId.length === 42) {
            this.setupLoginUrl();
        }
    }

    static styles = css`
    #todo
    `

    render() {
        return html`
            <div class="grid place-items-center" ?hidden=${this.loginUrl === ""}>
                <a id="loginLink" href="${this.loginUrl}">Login with DIMO!</a>
            </div>
            <div class="grid place-items-center" ?hidden=${this.loginUrl !== ""}>
                <h3>It appears there is no ClientID configured</h3>
                <p>If you don't have a Client ID please go to the <a href="https://console.dimo.org">DIMO Developer Console</a></p>
            </div>
        `;
    }

    setupLoginUrl() {
        let redirectUrl = "";
        // Check if the hostname is "localhost" or "127.0.0.1"
        if (isLocalhost()) {
            redirectUrl = "https://localdev.dimo.org:3008/login.html";
        } else {
            redirectUrl = "https://fleet-onboard.dimo.org/login.html";
        }

        this.loginUrl = `https://login.dimo.org/?clientId=${this.clientId}&redirectUri=${redirectUrl}&entryState=EMAIL_INPUT`;
    }
}
window.customElements.define('login-element', LoginElement);