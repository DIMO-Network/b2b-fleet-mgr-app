import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { provide } from '@lit/context';
import { apiServiceContext } from '../context';
import {ApiService} from "@services/api-service.ts";

@customElement('app-root')
export class AppRoot extends LitElement {
    @provide({ context: apiServiceContext })
    apiService = new ApiService(); // app-level singleton

    // enable inherit css
    createRenderRoot() {
        // there is another function to do this.
        return this;
    }

    render() {
        return html`
            <div class="header">
                <h1 class="title">Fleet Onboarding App</h1>
                <button class="logout-btn">Logout</button>
            </div>
            <add-vin-element></add-vin-element>
            
            <vehicle-list-element></vehicle-list-element>
    `;
    }
}
