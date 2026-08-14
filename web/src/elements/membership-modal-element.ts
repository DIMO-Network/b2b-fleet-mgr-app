import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { msg, str } from "@lit/localize";
import dayjs from "dayjs";
import { globalStyles } from "../global-styles.ts";
import {
  EntitledVehicle,
  MEMBERSHIP_TERMS,
  TenancyService,
  VehicleMembership,
} from "@services/tenancy-service.ts";

export type MembershipModalMode = "create" | "move" | "renew";

// Human label for a term. Kept as a function rather than a lookup table so the
// singular case reads properly in translation.
function termLabel(months: number): string {
  return months === 1 ? msg("1 month") : msg(str`${months} months`);
}

// Describes a vehicle in one line for the picker.
function vehicleLabel(v: EntitledVehicle): string {
  const description = [v.year, v.make, v.model].filter(Boolean).join(" ");
  const plate = v.licensePlate ? ` · ${v.licensePlate}` : "";
  return `${v.vin ?? v.vehicleTokenId}${description ? ` — ${description}` : ""}${plate}`;
}

// Create, move or renew one membership.
//
// Three modes in one element rather than three files, because they are the same
// two controls in different combinations — a vehicle picker and a term select —
// and the validation that matters lives in the service, not here.
//
// WHY MOVE IS AN ACTION AND NOT AN EDIT. A membership is paid time, and the
// vehicle it points at is the thing that changes when a vehicle is discontinued.
// Making that a field on a general-purpose update form invites "absent vs
// explicitly unset" ambiguity, which this programme has been bitten by twice.
//
// The vehicle picker offers only vehicles the customer is currently entitled to
// AND that hold no live membership. Both rules are enforced by the service too —
// this is an affordance, so an operator is not offered a choice that will be
// refused, not the enforcement itself.
@customElement("membership-modal-element")
export class MembershipModalElement extends LitElement {
  static styles = [
    globalStyles,
    css`
      .helper-text {
        font-size: 13px;
        color: #666;
        margin-top: 0.5rem;
      }
      .current {
        font-size: 14px;
      }
      .current .vin {
        font-family: monospace;
      }
      .muted {
        color: #666;
      }
    `,
  ];

  @property({ type: Boolean }) public show = false;
  @property({ type: String }) public customerId = "";
  @property({ type: String }) public customerName = "";
  @property({ type: String }) public mode: MembershipModalMode = "create";
  @property({ attribute: false }) public membership: VehicleMembership | null = null;
  // Vehicles this customer holds that are free to take a membership.
  @property({ attribute: false }) public available: EntitledVehicle[] = [];

  @state() private tokenId: number | null = null;
  @state() private termMonths: number = 12;
  @state() private processing = false;
  @state() private error = "";
  @state() private initialised = false;

  private tenancy = TenancyService.getInstance();

  // Seeded on first render rather than in the constructor: the caller sets the
  // properties after construction.
  private ensureInitialised() {
    if (this.initialised) return;
    this.initialised = true;
    this.tokenId = this.available[0]?.vehicleTokenId ?? null;
    // Renewing defaults to the term already on the membership — the common case
    // is another year of the same thing.
    this.termMonths = this.membership?.termMonths ?? 12;
  }

  // Not `title`: HTMLElement already owns that property, and shadowing it as a
  // private getter makes the class stop satisfying HTMLElement.
  private get heading(): string {
    switch (this.mode) {
      case "move":
        return msg("Move membership");
      case "renew":
        return msg("Renew membership");
      default:
        return msg("Add membership");
    }
  }

  private get submitLabel(): string {
    switch (this.mode) {
      case "move":
        return msg("Move");
      case "renew":
        return msg("Renew");
      default:
        return msg("Add");
    }
  }

  private get needsVehicle(): boolean {
    return this.mode === "create" || this.mode === "move";
  }

  private get needsTerm(): boolean {
    return this.mode === "create" || this.mode === "renew";
  }

  private renderCurrent() {
    const m = this.membership;
    if (!m) return nothing;
    const description = [m.year, m.make, m.model].filter(Boolean).join(" ");
    return html`
      <div class="form-group">
        <label class="form-label">${msg("Current")}</label>
        <div class="current">
          <span class="vin">${m.vin ?? m.vehicleTokenId}</span>
          ${description ? html` — ${description}` : nothing}
          <div class="muted">
            ${termLabel(m.termMonths)} ·
            ${msg(str`expires ${dayjs(m.expiresAt).format("D MMM YYYY")}`)}
          </div>
        </div>
      </div>
    `;
  }

  private renderVehiclePicker() {
    if (!this.needsVehicle) return nothing;
    if (this.available.length === 0) {
      return html`
        <div class="form-group">
          <label class="form-label">${msg("Vehicle")}</label>
          <p class="helper-text">
            ${this.mode === "move"
              ? msg(
                  "Every other vehicle assigned to this customer already has a membership. Assign another vehicle on the Vehicles tab, or cancel one first.",
                )
              : msg(
                  "Every vehicle assigned to this customer already has a membership. Assign more vehicles on the Vehicles tab first.",
                )}
          </p>
        </div>
      `;
    }
    return html`
      <div class="form-group">
        <label class="form-label">${this.mode === "move" ? msg("Move to") : msg("Vehicle")}</label>
        <select
          .value=${String(this.tokenId ?? "")}
          @change=${(e: Event) =>
            (this.tokenId = Number((e.target as HTMLSelectElement).value))}
          ?disabled=${this.processing}
          style="width: 100%;"
        >
          ${this.available.map(
            (v) => html`
              <option value=${v.vehicleTokenId} ?selected=${this.tokenId === v.vehicleTokenId}>
                ${vehicleLabel(v)}
              </option>
            `,
          )}
        </select>
        <p class="helper-text">
          ${msg(
            "Only vehicles assigned to this customer that don't already have a membership.",
          )}
        </p>
      </div>
    `;
  }

  private renderTermPicker() {
    if (!this.needsTerm) return nothing;
    return html`
      <div class="form-group">
        <label class="form-label">${msg("Term")}</label>
        <select
          .value=${String(this.termMonths)}
          @change=${(e: Event) =>
            (this.termMonths = Number((e.target as HTMLSelectElement).value))}
          ?disabled=${this.processing}
          style="width: 100%;"
        >
          ${MEMBERSHIP_TERMS.map(
            (t) => html`
              <option value=${t} ?selected=${this.termMonths === t}>${termLabel(t)}</option>
            `,
          )}
        </select>
        <p class="helper-text">
          ${this.mode === "renew"
            ? msg(
                "Added to the end of the current term if it hasn't expired yet, otherwise it starts today.",
              )
            : msg("The vehicle is visible in Fleet Lite until this runs out.")}
        </p>
      </div>
    `;
  }

  render() {
    if (!this.show) return nothing;
    this.ensureInitialised();

    const blocked = this.needsVehicle && this.available.length === 0;

    return html`
      <div class="modal-overlay" @click=${this.close}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${this.heading}</h3>
            <button type="button" class="modal-close" @click=${this.close}>×</button>
          </div>
          <div class="modal-body">
            ${this.error
              ? html`<div class="alert alert-error" style="margin-bottom: 1rem;">${this.error}</div>`
              : nothing}
            ${this.mode === "create"
              ? nothing
              : this.renderCurrent()}
            ${this.renderVehiclePicker()} ${this.renderTermPicker()}
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click=${this.close}
              ?disabled=${this.processing}
            >
              ${msg("Cancel")}
            </button>
            <button
              type="button"
              class="btn btn-primary ${this.processing ? "processing" : ""}"
              @click=${this.submit}
              ?disabled=${this.processing || blocked || (this.needsVehicle && this.tokenId === null)}
            >
              ${this.processing ? msg("Saving...") : this.submitLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private close() {
    if (this.processing) return;
    this.show = false;
    this.error = "";
    this.dispatchEvent(new CustomEvent("modal-closed", { bubbles: true, composed: true }));
  }

  private async submit() {
    this.processing = true;
    this.error = "";
    try {
      const res =
        this.mode === "create"
          ? await this.tenancy.createMembership(this.customerId, {
              vehicleTokenId: this.tokenId as number,
              termMonths: this.termMonths,
            })
          : this.mode === "move"
            ? await this.tenancy.moveMembership(this.customerId, this.membership!.id, {
                vehicleTokenId: this.tokenId as number,
              })
            : await this.tenancy.renewMembership(this.customerId, this.membership!.id, {
                termMonths: this.termMonths,
              });

      if (res.success) {
        this.show = false;
        this.dispatchEvent(
          new CustomEvent("membership-saved", {
            detail: { membership: res.data, mode: this.mode },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.error = res.error || msg("Failed to save membership");
      }
    } catch (e: any) {
      this.error = e?.message || msg("An unexpected error occurred");
    } finally {
      this.processing = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "membership-modal-element": MembershipModalElement;
  }
}
