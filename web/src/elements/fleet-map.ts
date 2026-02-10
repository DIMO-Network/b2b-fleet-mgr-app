import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as L from 'leaflet';

@customElement('fleet-map')
export class FleetMap extends LitElement {
    // Pass these in from your parent component or store
    @property({ type: Number }) lat = 51.505;
    @property({ type: Number }) lng = -0.09;
    @property({ type: Number }) zoom = 13;

    private map: L.Map | undefined;
    private marker: L.CircleMarker | undefined;

    static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    #map {
      width: 100%;
      height: 100%; /* Ensure parent has height defined */
      background: #eee;
    }
  `;

    firstUpdated() {
        this.initMap();
    }

    // Cleanup to prevent memory leaks when component is destroyed
    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.map) {
            this.map.remove();
        }
    }

    // This handles the real-time updates
    updated(changedProperties: PropertyValues) {
        if (this.map && this.marker) {
            if (changedProperties.has('lat') || changedProperties.has('lng')) {
                const newLatLng = new L.LatLng(this.lat, this.lng);

                // Move the marker
                this.marker.setLatLng(newLatLng);

                // Optional: Pan map to follow vehicle.
                // You might want to remove this if users want to pan away manually.
                this.map.panTo(newLatLng);
            }
        }
    }

    private initMap() {
        const mapEl = this.shadowRoot?.getElementById('map');
        if (!mapEl) return;

        // Initialize Map
        this.map = L.map(mapEl as HTMLElement).setView([this.lat, this.lng], this.zoom);

        // Add Tile Layer (OpenStreetMap is free)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        // Add Marker (Using CircleMarker to avoid asset path issues)
        this.marker = L.circleMarker([this.lat, this.lng], {
            color: '#3388ff',
            fillColor: '#3388ff',
            fillOpacity: 0.5,
            radius: 10
        }).addTo(this.map);

        // Fix: Force a resize calculation after render to prevent "grey tiles"
        setTimeout(() => {
            this.map?.invalidateSize();
        }, 100);
    }

    render() {
        return html`
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div id="map"></div>
    `;
    }
}