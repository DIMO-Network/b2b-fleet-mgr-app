import { html, nothing, LitElement, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ApiService } from '@services/api-service.ts';
import { FleetService, FleetGroup } from '@services/fleet-service.ts';
import { globalStyles } from '../global-styles.ts';

@customElement('create-fleet-group-modal-element')
export class CreateFleetGroupModalElement extends LitElement {
  static styles = [globalStyles, css``];

  @property({ attribute: true, type: Boolean })
  public show = false;

  @property({ attribute: false, type: Object })
  public editGroup: FleetGroup | null = null;

  @state()
  private groupName: string = '';

  @state()
  private groupColor: string = '#FF5733';

  @state()
  private isSubmitting: boolean = false;

  @state()
  private errorMessage: string = '';

  @state()
  private nameError: string = '';

  private apiService: ApiService;

  constructor() {
    super();
    this.apiService = ApiService.getInstance();
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);

    // When editGroup is set, populate the form
    if (changedProperties.has('editGroup') && this.editGroup) {
      this.groupName = this.editGroup.name;
      this.groupColor = this.editGroup.color;
    }

    // When show becomes true and editGroup is null, reset form
    if (changedProperties.has('show') && this.show && !this.editGroup) {
      this.resetForm();
    }
  }

  render() {
    if (!this.show) {
      return nothing;
    }

    const isEditMode = !!this.editGroup;

    return html`
      <div class="modal-overlay" @click=${this.closeModal}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${isEditMode ? 'Edit Fleet Group' : 'Create Fleet Group'}</h3>
            <button type="button" class="modal-close" @click=${this.closeModal}>×</button>
          </div>
          <div class="modal-body">
            ${this.errorMessage ? html`
              <div style="padding: 1rem; background-color: #fee; border: 1px solid #fcc; border-radius: 4px; margin-bottom: 1rem; color: #c00;">
                ${this.errorMessage}
              </div>
            ` : nothing}

            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
                Group Name <span style="color: #dc2626;">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter group name"
                .value=${this.groupName}
                @input=${this.handleNameInput}
                ?disabled=${this.isSubmitting}
                class=${this.nameError ? 'invalid' : ''}
                required
                style="width: 100%;"
              />
              ${this.nameError ? html`
                <div style="color: #dc2626; font-size: 0.875rem; margin-top: 0.25rem;">
                  ${this.nameError}
                </div>
              ` : nothing}
            </div>

            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
                Group Color
              </label>
              <div style="display: flex; align-items: center; gap: 1rem;">
                <input
                  type="color"
                  .value=${this.groupColor}
                  @input=${this.handleColorInput}
                  ?disabled=${this.isSubmitting}
                  style="width: 60px; height: 40px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;"
                />
                <input
                  type="text"
                  .value=${this.groupColor}
                  @input=${this.handleColorTextInput}
                  ?disabled=${this.isSubmitting}
                  placeholder="#FF5733"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  style="flex: 1; font-family: monospace;"
                />
              </div>
              <div style="margin-top: 0.5rem; font-size: 0.875rem; color: #666;">
                Preview: <span style="display: inline-block; width: 20px; height: 20px; background-color: ${this.groupColor}; border: 1px solid #ddd; border-radius: 3px; vertical-align: middle;"></span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click=${this.closeModal}
              ?disabled=${this.isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click=${this.handleSubmit}
              ?disabled=${this.isSubmitting}
            >
              ${this.isSubmitting
                ? (isEditMode ? 'Updating...' : 'Creating...')
                : (isEditMode ? 'Update Group' : 'Create Group')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.groupName = input.value;

    // Clear error when user types
    if (this.groupName.trim()) {
      this.nameError = '';
    }
  }

  private handleColorInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.groupColor = input.value.toUpperCase();
  }

  private handleColorTextInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;

    // Validate hex color format
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      this.groupColor = value.toUpperCase();
    }
  }

  private closeModal() {
    if (this.isSubmitting) return;

    this.show = false;
    this.resetForm();

    this.dispatchEvent(new CustomEvent('modal-closed', {
      bubbles: true,
      composed: true
    }));
  }

  private resetForm() {
    this.groupName = '';
    this.groupColor = '#FF5733';
    this.errorMessage = '';
    this.nameError = '';
    this.isSubmitting = false;
  }

  private async handleSubmit() {
    // Validate
    if (!this.groupName.trim()) {
      this.nameError = 'Group name is required';
      return;
    }

    // Validate color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(this.groupColor)) {
      this.errorMessage = 'Invalid color format. Please use hex format (e.g., #FF5733)';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const isEditMode = !!this.editGroup;

    try {
      const payload = {
        name: this.groupName.trim(),
        color: this.groupColor
      };

      const response = isEditMode 
        ? await FleetService.getInstance().updateFleetGroup(this.editGroup!.id, payload)
        : await FleetService.getInstance().createFleetGroup(payload);

      if (response.success) {
        // Success - dispatch event and close
        const eventName = isEditMode ? 'group-updated' : 'group-created';
        this.dispatchEvent(new CustomEvent(eventName, {
          detail: { group: response.data },
          bubbles: true,
          composed: true
        }));

        this.show = false;
        this.resetForm();
      } else {
        this.errorMessage = response.error || `Failed to ${isEditMode ? 'update' : 'create'} group`;
      }
    } catch (error: any) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} fleet group:`, error);
      this.errorMessage = error.message || 'An unexpected error occurred';
    } finally {
      this.isSubmitting = false;
    }
  }
}
