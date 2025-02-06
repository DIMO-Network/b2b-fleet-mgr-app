import {html, LitElement, css} from 'lit'
import {AddVinElement} from "./add-vin-element.js";

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
        this.clientId = localStorage.getItem('clientId');
        if (this.clientId == null) {
            this.clientId = '';
        }

        if (this.clientId.length === 42) {
            this.setupLoginUrl();
        }
    }

    async connectedCallback() {
        super.connectedCallback();

    }

    static styles = css`
    #todo
    `

    render() {
        return html`
            <div class="grid place-items-center" ?hidden=${this.loginUrl === ""}>
                <a id="loginLink" href="${this.loginUrl}">Login with DIMO!</a>
                <div style="margin-top: 5em">
                    <p>ClientID: ${this.clientId}</p>
                    <button type="button" @click=${this._resetClientId}>Reset my Client Id</button>
                </div>
            </div>
            <div class="grid place-items-center" ?hidden=${this.loginUrl !== ""}>
                <h3>Welcome, please configure your ClientId before logging in</h3>
                <form class="grid">
                    <label>App Client ID:
                        <input type="text" placeholder="0x123" maxlength="42" style="width: 18rem"
                               value="${this.clientId}" @input="${e => this.clientId = e.target.value}"></label>
                    <button type="button" @click=${this._saveClientId}>Apply</button>
                </form>
                <p>If you don't have a Client ID please go to the <a href="https://console.dimo.org">DIMO Developer Console</a></p>
            </div>
        `;
    }

    _saveClientId(event) {
        localStorage.setItem("clientId", this.clientId);
        this.setupLoginUrl();
    }

    _resetClientId(event) {
        localStorage.removeItem("clientId");
        this.clientId = "";
    }

    setupLoginUrl() {
        let redirectUrl = "";
        // Check if the hostname is "localhost" or "127.0.0.1"
        const hostname = window.location.hostname;
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            redirectUrl = "http://localhost:3008/login.html";
        } else {
            redirectUrl = "https://fleet-onboard.dimo.org/login.html";
        }

        this.loginUrl = `https://login.dimo.org/?clientId=${this.clientId}&redirectUri=${redirectUrl}&entryState=EMAIL_INPUT`;
    }
}
window.customElements.define('login-element', LoginElement);