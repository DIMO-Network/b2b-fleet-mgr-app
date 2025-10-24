import {html, LitElement, PropertyValues} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('session-timer')
export class SessionTimer extends LitElement {
    // The target time (session expiration time in milliseconds).
    @property({ type: Number }) expirationTime: number = 0; // 30 minutes from now

    // State to store remaining time as a human-readable string.
    @state() remainingTime: string = '';

    private timerInterval: number | undefined;

    connectedCallback() {
        super.connectedCallback();
        this.calculateRemainingTime();
        this.startTimer();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.stopTimer();
    }

    protected update(_changedProperties: PropertyValues) {
        super.update(_changedProperties);

        this.calculateRemainingTime();
        this.startTimer();
    }

    /**
     * Calculates the remaining time and formats it into a human-readable string.
     */
    private calculateRemainingTime() {
        const currentTime = Date.now();
        const timeLeft = this.expirationTime - currentTime;

        if (timeLeft <= 0) {
            this.remainingTime = 'No Active Passkey Session';
        } else {
            const minutes = Math.floor(timeLeft / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
            this.remainingTime = `Passkey expires in: ${minutes} min and ${seconds} secs`;
        }
    }

    /**
     * Starts the interval to update the remaining time every second.
     */
    private startTimer() {
        this.timerInterval = window.setInterval(() => {
            this.calculateRemainingTime();
        }, 20000); // Call every 10 seconds
    }

    /**
     * Stops the interval when no longer needed (e.g., component is disconnected or time has expired).
     */
    private stopTimer() {
        if (this.timerInterval !== undefined) {
            clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }
    }

    render() {
        return html`
      <div>
        <p>${this.remainingTime}</p>
      </div>
    `;
    }
}