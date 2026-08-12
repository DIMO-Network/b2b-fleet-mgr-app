import { LitElement, css, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { msg } from "@lit/localize";
import { globalStyles } from "../global-styles.ts";
import { TenancyService } from "@services/tenancy-service.ts";

// Says, on every customer screen, that the data is not real.
//
// The console is being built ahead of its backend: fleet-tenancy-api serves only
// /v1/authz and /v1/resolve/client-id today, so the customers, members and
// entitlements on screen come from in-memory fixtures. A console that showed
// invented customers with no indication would be worse than no console — someone
// would act on it.
//
// Delete this element, and its use in the customer screens, when the stub goes.
@customElement("stub-data-banner")
export class StubDataBanner extends LitElement {
  static styles = [
    globalStyles,
    css`
      .banner {
        background: #fff3cd;
        border: 1px solid #856404;
        color: #856404;
        padding: 10px 14px;
        margin-bottom: 16px;
        font-size: 14px;
      }
      .banner strong {
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      code {
        background: rgba(0, 0, 0, 0.07);
        padding: 1px 4px;
      }
    `,
  ];

  render() {
    if (!TenancyService.getInstance().isStubbed()) return nothing;

    return html`
      <div class="banner">
        <strong>${msg("Sample data")}</strong> —
        ${msg(
          "the tenancy management API is not built yet, so these customers, users and vehicle assignments are fixtures held in memory. Changes are lost on reload and reach nothing real.",
        )}
        <code>localStorage.tenancyStub = 'false'</code>
        ${msg("switches to the live backend once it exists.")}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "stub-data-banner": StubDataBanner;
  }
}
