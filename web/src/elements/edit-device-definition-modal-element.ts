import { html, nothing, LitElement, css } from 'lit';
import { msg } from '@lit/localize';
import { customElement, property, state } from 'lit/decorators.js';
import { globalStyles } from '../global-styles.ts';
import {
  DeviceDefinitionAttribute,
  DeviceDefinitionDetail,
  IdentityService,
  LatestDeviceDefinitionCloudEvent,
  ManufacturerOption,
} from '@services/identity-service.ts';
import { ApiService } from '@services/api-service.ts';

interface AttributeFieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number';
  required?: boolean;
  placeholder?: string;
  allowDecimal?: boolean;
}

const ATTRIBUTE_FIELDS: AttributeFieldConfig[] = [
  { key: 'powertrain_type', label: 'Powertrain Type', required: true, placeholder: 'Select powertrain type' },
  { key: 'fuel_type', label: 'Fuel Type', required: true, placeholder: 'Enter fuel type' },
  { key: 'driven_wheels', label: 'Driven Wheels', placeholder: 'Select driven wheels' },
  { key: 'fuel_tank_capacity_gal', label: 'Fuel Tank Capacity (gal)', type: 'number', required: true, placeholder: 'Enter fuel tank capacity', allowDecimal: true },
  { key: 'mpg', label: 'MPG', type: 'number', placeholder: 'Enter MPG', allowDecimal: true },
  { key: 'mpg_city', label: 'MPG City', type: 'number', placeholder: 'Enter city MPG', allowDecimal: true },
  { key: 'mpg_highway', label: 'MPG Highway', type: 'number', placeholder: 'Enter highway MPG', allowDecimal: true },
  { key: 'number_of_doors', label: 'Number of Doors', type: 'number', placeholder: 'Enter number of doors' },
  { key: 'generation', label: 'Generation', type: 'number', placeholder: 'Enter generation' },
  { key: 'battery_capacity_kwh', label: 'Battery Capacity (KWh)', type: 'number', placeholder: 'Enter battery capacity', allowDecimal: true },
  { key: 'base_msrp', label: 'Base MSRP', type: 'number', placeholder: 'Enter base MSRP', allowDecimal: true },
  { key: 'manufacturer_code', label: 'Manufacturer Code', placeholder: 'Enter manufacturer code' },
  { key: 'wheelbase', label: 'Wheelbase', placeholder: 'Enter wheelbase' },
];

const ATTRIBUTE_ALIASES: Record<string, string[]> = {
  powertrain_type: ['powertrainType'],
  fuel_type: ['fuelType'],
  driven_wheels: ['drivenWheels'],
  fuel_tank_capacity_gal: ['fuelTankCapacityGal'],
  mpg: [],
  mpg_city: ['mpgCity'],
  mpg_highway: ['mpgHighway'],
  number_of_doors: ['numberOfDoors'],
  generation: [],
  battery_capacity_kwh: ['batteryCapacityKwh'],
  base_msrp: ['baseMsrp'],
  manufacturer_code: ['manufacturerCode'],
  wheelbase: [],
};

@customElement('edit-device-definition-modal-element')
export class EditDeviceDefinitionModalElement extends LitElement {
  private static cachedManufacturers: ManufacturerOption[] | null = null;
  private static readonly DRIVEN_WHEEL_OPTIONS = ['FWD', 'RWD', 'AWD', '4WD'];

  static styles = [globalStyles, css`
    .modal-content {
      max-width: 880px;
      display: flex;
      flex-direction: column;
      max-height: 90vh;
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .section-title {
      font-weight: bold;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #ccc;
    }

    .field-hint {
      margin-top: 4px;
      font-size: 12px;
      color: #666;
    }

    .required {
      color: #c00;
    }

    .readonly-value {
      padding: 8px 10px;
      border: 1px solid #ccc;
      background: #f8f8f8;
      min-height: 42px;
      display: flex;
      align-items: center;
    }

    .full-width {
      grid-column: 1 / -1;
    }

    .json-preview {
      width: 100%;
      min-height: 220px;
      resize: vertical;
      font-family: monospace;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre;
    }

    .disabled-field {
      background: #f0f0f0;
      color: #777;
      border-color: #ccc;
      cursor: not-allowed;
    }

    @media (max-width: 900px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  `];

  @property({ attribute: true, type: Boolean })
  public show = false;

  @property({ attribute: false, type: String })
  public deviceDefinitionId = '';

  @property({ attribute: false, type: String })
  public tokenDID = '';

  @state() private loading = false;
  @state() private saving = false;
  @state() private errorMessage = '';
  @state() private successMessage = '';
  @state() private manufacturers: ManufacturerOption[] = [];
  @state() private manufacturer = '';
  @state() private model = '';
  @state() private year = '';
  @state() private currentDefinition?: DeviceDefinitionDetail;
  @state() private attributeValues: Record<string, string> = {};
  @state() private extraAttributes: DeviceDefinitionAttribute[] = [];
  @state() private validationErrors: Record<string, string> = {};

  protected updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
    const showChanged = changedProperties.has('show');
    const definitionChanged = changedProperties.has('deviceDefinitionId');

    if (showChanged && !this.show) {
      return;
    }

    if ((showChanged || definitionChanged) && this.show) {
      this.loadFormData();
    }
  }

  render() {
    if (!this.show) {
      return nothing;
    }

    return html`
      <div class="modal-overlay" @click=${this.handleCancel}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>${msg('Update Device Definition')}</h3>
            <button type="button" class="modal-close" @click=${this.handleCancel}>×</button>
          </div>
          <div class="modal-body">
            ${this.errorMessage ? html`<div class="alert alert-error">${this.errorMessage}</div>` : nothing}
            ${this.successMessage ? html`<div class="alert alert-success">${this.successMessage}</div>` : nothing}
            ${this.loading
              ? html`<div>${msg('Loading device definition...')}</div>`
              : html`
                  <div class="section-title">${msg('Vehicle Identity')}</div>
                  <div class="form-grid mb-24">
                    ${this.renderTextField('manufacturer', msg('Manufacturer'), this.manufacturer, (value) => (this.manufacturer = value), {
                      type: 'select',
                      required: true,
                      options: this.manufacturerOptions,
                      placeholder: 'Select manufacturer',
                    })}
                    ${this.renderTextField('model', msg('Model'), this.model, (value) => (this.model = value), {
                      required: true,
                      placeholder: 'Enter model',
                    })}
                    ${this.renderTextField('year', msg('Year'), this.year, (value) => (this.year = this.sanitizeNumericInput(value, false, 4)), {
                      type: 'number',
                      required: true,
                      placeholder: 'Enter year',
                    })}
                    <div class="form-group">
                      <label class="form-label">${msg('Definition ID')}</label>
                      <div class="readonly-value">${this.buildDeviceDefinitionId()}</div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">${msg('Device Type')}</label>
                      <div class="readonly-value">${this.currentDefinition?.deviceType || '-'}</div>
                    </div>
                  </div>

                  <div class="section-title">${msg('Vehicle Attributes')}</div>
                  <div class="form-grid">
                    ${ATTRIBUTE_FIELDS.map((field) => {
                      const isBatteryRequired = field.key === 'battery_capacity_kwh' && this.isBatteryRequired;
                      return this.renderTextField(
                        field.key,
                        msg(field.label),
                        this.attributeValues[field.key] ?? '',
                        (value) => this.handleAttributeChange(field.key, value),
                        {
                          type: field.key === 'powertrain_type' || field.key === 'driven_wheels'
                            ? 'select'
                            : (field.type ?? 'text'),
                          required: this.isFieldRequired(field.key) || isBatteryRequired,
                          hint: this.getFieldHint(field.key, isBatteryRequired),
                          placeholder: field.placeholder,
                          options: field.key === 'powertrain_type'
                            ? this.powertrainOptions
                            : field.key === 'driven_wheels'
                              ? this.drivenWheelOptions
                              : undefined,
                          disabled: this.isFieldDisabled(field.key),
                          allowDecimal: field.allowDecimal,
                        }
                      );
                    })}
                    ${this.extraAttributes.length > 0 ? html`
                      <div class="form-group full-width">
                        <label class="form-label">${msg('Additional Attributes')}</label>
                        <div class="readonly-value" style="display:block;">
                          ${this.extraAttributes.map((attribute) => html`
                            <div><strong>${attribute.name || '-'}</strong>: ${attribute.value || '-'}</div>
                          `)}
                        </div>
                      </div>
                    ` : nothing}
                  </div>
                `}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" @click=${this.handleCancel} ?disabled=${this.saving}>
              ${msg('Cancel')}
            </button>
            <button
              type="button"
              class="btn btn-primary ${this.saving ? 'processing' : ''}"
              @click=${this.handleSubmit}
              ?disabled=${this.loading || this.saving}
            >
              ${msg('Submit')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private get isBatteryRequired(): boolean {
    return (this.attributeValues.powertrain_type || '').trim().toUpperCase() === 'BEV';
  }

  private get isBev(): boolean {
    return (this.attributeValues.powertrain_type || '').trim().toUpperCase() === 'BEV';
  }

  private get manufacturerOptions(): string[] {
    return this.getSelectOptions(this.manufacturers.map((item) => item.name), this.manufacturer);
  }

  private get powertrainOptions(): string[] {
    return this.getSelectOptions(['ICE', 'BEV', 'HEV'], this.attributeValues.powertrain_type || '');
  }

  private get drivenWheelOptions(): string[] {
    return this.getSelectOptions(
      EditDeviceDefinitionModalElement.DRIVEN_WHEEL_OPTIONS,
      this.attributeValues.driven_wheels || ''
    );
  }

  private async loadFormData() {
    if (!this.deviceDefinitionId) {
      this.errorMessage = msg('Device definition ID is missing.');
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.validationErrors = {};

    try {
      const [definition, latestCloudEvent, manufacturers] = await Promise.all([
        IdentityService.getInstance().getDeviceDefinitionById(this.deviceDefinitionId),
        this.tokenDID
          ? IdentityService.getInstance().getLatestDeviceDefinitionCloudEvent(this.tokenDID)
          : Promise.resolve(null),
        EditDeviceDefinitionModalElement.cachedManufacturers
          ? Promise.resolve(EditDeviceDefinitionModalElement.cachedManufacturers)
          : IdentityService.getInstance().getManufacturers(),
      ]);

      if (!definition && !latestCloudEvent?.data) {
        this.errorMessage = msg('Failed to load device definition.');
        this.loading = false;
        return;
      }

      EditDeviceDefinitionModalElement.cachedManufacturers = manufacturers;
      this.manufacturers = manufacturers.sort((a, b) => a.name.localeCompare(b.name));

      const resolvedDefinition = this.mergeDefinitionData(definition, latestCloudEvent);
      this.currentDefinition = resolvedDefinition;
      this.manufacturer = this.normalizeSelectValue(
        resolvedDefinition.manufacturer?.name || '',
        this.manufacturers.map((item) => item.name)
      );
      this.model = resolvedDefinition.model || '';
      this.year = resolvedDefinition.year != null ? String(resolvedDefinition.year) : '';

      const normalizedAttributes = this.normalizeAttributes(resolvedDefinition.attributes ?? []);
      this.attributeValues = normalizedAttributes.values;
      this.extraAttributes = normalizedAttributes.extra;
    } catch (error) {
      this.errorMessage = msg('Failed to load device definition.');
    } finally {
      this.loading = false;
    }
  }

  private normalizeAttributes(attributes: DeviceDefinitionAttribute[]) {
    const values: Record<string, string> = {};
    const extra: DeviceDefinitionAttribute[] = [];

    ATTRIBUTE_FIELDS.forEach((field) => {
      values[field.key] = '';
    });

    attributes.forEach((attribute) => {
      const key = this.getCanonicalAttributeKey(attribute.name || '');
      if (key) {
        values[key] = key === 'powertrain_type'
          ? this.normalizeSelectValue(attribute.value ?? '', ['ICE', 'BEV', 'HEV'])
          : key === 'driven_wheels'
            ? this.normalizeSelectValue(attribute.value ?? '', EditDeviceDefinitionModalElement.DRIVEN_WHEEL_OPTIONS)
            : attribute.value ?? '';
      } else {
        extra.push(attribute);
      }
    });

    return { values, extra };
  }

  private mergeDefinitionData(
    identityDefinition: DeviceDefinitionDetail | null,
    latestCloudEvent: LatestDeviceDefinitionCloudEvent | null
  ): DeviceDefinitionDetail {
    const latestDefinition = latestCloudEvent?.data;
    const mergedIdentityDefinition = identityDefinition ?? {};

    return {
      model: latestDefinition?.model ?? mergedIdentityDefinition.model,
      year: latestDefinition?.year ?? mergedIdentityDefinition.year,
      manufacturer: {
        name: latestDefinition?.manufacturer?.name ?? mergedIdentityDefinition.manufacturer?.name,
      },
      deviceDefinitionId: latestDefinition?.deviceDefinitionId ?? mergedIdentityDefinition.deviceDefinitionId,
      deviceType: latestDefinition?.deviceType ?? mergedIdentityDefinition.deviceType,
      attributes: this.mergeAttributes(
        mergedIdentityDefinition.attributes ?? [],
        latestDefinition?.attributes ?? []
      ),
    };
  }

  private mergeAttributes(
    fallbackAttributes: DeviceDefinitionAttribute[],
    latestAttributes: DeviceDefinitionAttribute[]
  ): DeviceDefinitionAttribute[] {
    const merged = new Map<string, DeviceDefinitionAttribute>();

    fallbackAttributes.forEach((attribute) => {
      const key = (attribute.name || '').trim();
      if (key) {
        merged.set(key, { ...attribute });
      }
    });

    latestAttributes.forEach((attribute) => {
      const key = (attribute.name || '').trim();
      if (key) {
        merged.set(key, { ...attribute });
      }
    });

    return Array.from(merged.values());
  }

  private getCanonicalAttributeKey(name: string): string | undefined {
    const normalized = name.replace(/[_-\s]/g, '').toLowerCase();
    return ATTRIBUTE_FIELDS.find((field) => {
      const candidates = [field.key, ...(ATTRIBUTE_ALIASES[field.key] || [])];
      return candidates.some((candidate) => candidate.replace(/[_-\s]/g, '').toLowerCase() === normalized);
    })?.key;
  }

  private renderTextField(
    fieldKey: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: {
      type?: 'text' | 'number' | 'select';
      required?: boolean;
      hint?: string;
      options?: string[];
      placeholder?: string;
      disabled?: boolean;
      allowDecimal?: boolean;
    } = {}
  ) {
    const normalizedSelectValue = options.type === 'select'
      ? this.normalizeSelectValue(value, options.options ?? [])
      : value;

    return html`
      <div class="form-group">
        <label class="form-label">
          ${label}${options.required ? html` <span class="required">*</span>` : nothing}
        </label>
        ${options.type === 'select'
          ? html`
              <select
                class=${options.disabled ? 'disabled-field' : ''}
                .value=${normalizedSelectValue}
                ?disabled=${options.disabled}
                @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}
              >
                <option value="" ?selected=${!normalizedSelectValue}>${msg(options.placeholder || 'Select')}</option>
                ${(options.options ?? []).map((option) => html`
                  <option value=${option} ?selected=${option === normalizedSelectValue}>${option}</option>
                `)}
              </select>
            `
          : html`
              <input
                type="text"
                class=${options.disabled ? 'disabled-field' : ''}
                inputmode=${options.type === 'number' ? (options.allowDecimal ? 'decimal' : 'numeric') : 'text'}
                .placeholder=${msg(options.placeholder || '')}
                .value=${value}
                ?disabled=${options.disabled}
                @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
              />
            `}
        ${this.validationErrors[fieldKey] ? html`<div class="field-hint" style="color:#c00;">${this.validationErrors[fieldKey]}</div>` : nothing}
        ${options.hint && !this.validationErrors[fieldKey] ? html`<div class="field-hint">${options.hint}</div>` : nothing}
      </div>
    `;
  }

  private handleAttributeChange(key: string, value: string) {
    const nextValue = this.sanitizeAttributeValue(key, value);
    this.attributeValues = {
      ...this.attributeValues,
      [key]: nextValue,
    };

    if (this.validationErrors[key]) {
      const nextErrors = { ...this.validationErrors };
      delete nextErrors[key];
      this.validationErrors = nextErrors;
    }

    if (key === 'powertrain_type') {
      const nextErrors = { ...this.validationErrors };
      delete nextErrors.battery_capacity_kwh;
      delete nextErrors.fuel_tank_capacity_gal;
      delete nextErrors.fuel_type;
      this.validationErrors = nextErrors;
    }
  }

  private sanitizeAttributeValue(key: string, value: string): string {
    if (key === 'powertrain_type') {
      return value.trim().toUpperCase();
    }

    if (key === 'driven_wheels') {
      return this.normalizeSelectValue(value, EditDeviceDefinitionModalElement.DRIVEN_WHEEL_OPTIONS);
    }

    if (key === 'fuel_type') {
      return value;
    }

    const field = ATTRIBUTE_FIELDS.find((item) => item.key === key);
    if (field?.type === 'number') {
      return this.sanitizeNumericInput(value, Boolean(field.allowDecimal));
    }

    return value;
  }

  private sanitizeNumericInput(value: string, allowDecimal: boolean, maxLength?: number): string {
    let nextValue = value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
    if (allowDecimal) {
      const firstDecimalIndex = nextValue.indexOf('.');
      if (firstDecimalIndex !== -1) {
        nextValue =
          nextValue.slice(0, firstDecimalIndex + 1) +
          nextValue.slice(firstDecimalIndex + 1).replace(/\./g, '');
      }
    }
    if (maxLength) {
      nextValue = nextValue.slice(0, maxLength);
    }
    return nextValue;
  }

  private isFieldDisabled(fieldKey: string): boolean {
    if (fieldKey === 'battery_capacity_kwh') {
      return !this.isBev;
    }
    if (fieldKey === 'fuel_tank_capacity_gal') {
      return this.isBev;
    }
    return false;
  }

  private isFieldRequired(fieldKey: string): boolean {
    if (fieldKey === 'powertrain_type') {
      return true;
    }
    if (this.isBev) {
      return fieldKey === 'battery_capacity_kwh';
    }
    return fieldKey === 'fuel_type' || fieldKey === 'fuel_tank_capacity_gal';
  }

  private getFieldHint(fieldKey: string, isBatteryRequired: boolean): string {
    if (fieldKey === 'battery_capacity_kwh' && !this.isBev) {
      return msg('Only applicable for BEV vehicles.');
    }
    if (fieldKey === 'fuel_tank_capacity_gal' && this.isBev) {
      return msg('Not applicable for BEV vehicles.');
    }
    if (fieldKey === 'battery_capacity_kwh' && isBatteryRequired) {
      return msg('Required for BEV vehicles.');
    }
    return '';
  }

  private normalizeSelectValue(value: string, options: string[]): string {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return '';
    }

    const matchedOption = options.find((option) => option.toLowerCase() === trimmedValue.toLowerCase());
    return matchedOption ?? trimmedValue;
  }

  private getSelectOptions(options: string[], currentValue: string): string[] {
    const normalizedCurrentValue = this.normalizeSelectValue(currentValue, options);
    return normalizedCurrentValue && !options.some((option) => option === normalizedCurrentValue)
      ? [...options, normalizedCurrentValue]
      : options;
  }

  private validateForm(): boolean {
    const errors: Record<string, string> = {};
    const numericFields = new Set(['year', 'fuel_tank_capacity_gal', 'mpg', 'mpg_city', 'mpg_highway', 'number_of_doors', 'battery_capacity_kwh']);

    if (!this.manufacturer.trim()) {
      errors.manufacturer = msg('Manufacturer is required.');
    }
    if (!this.model.trim()) {
      errors.model = msg('Model is required.');
    }
    if (!this.year.trim()) {
      errors.year = msg('Year is required.');
    } else if (!/^\d{4}$/.test(this.year.trim())) {
      errors.year = msg('Year must be a 4-digit number.');
    }

    ATTRIBUTE_FIELDS.forEach((field) => {
      if (this.isFieldDisabled(field.key)) {
        return;
      }

      const value = (this.attributeValues[field.key] || '').trim();
      const required = this.isFieldRequired(field.key);

      if (required && !value) {
        errors[field.key] = msg(`${field.label} is required.`);
        return;
      }

      if (value && (field.type === 'number' || numericFields.has(field.key)) && Number.isNaN(Number(value))) {
        errors[field.key] = msg(`${field.label} must be numeric.`);
      }

      if (field.key === 'fuel_type' && value && /^\d+(\.\d+)?$/.test(value)) {
        errors[field.key] = msg('Fuel Type must include letters.');
      }

      if (
        field.key === 'driven_wheels' &&
        value &&
        !EditDeviceDefinitionModalElement.DRIVEN_WHEEL_OPTIONS.includes(value)
      ) {
        errors[field.key] = msg('Driven Wheels must be one of FWD, RWD, AWD, or 4WD.');
      }
    });

    this.validationErrors = errors;
    return Object.values(errors).filter(Boolean).length === 0;
  }

  private handleCancel() {
    this.show = false;
    this.errorMessage = '';
    this.successMessage = '';
    this.validationErrors = {};
    this.dispatchEvent(new CustomEvent('modal-closed', {
      bubbles: true,
      composed: true,
    }));
  }

  private async handleSubmit() {
    if (!this.validateForm()) {
      this.errorMessage = msg('Please fix the highlighted fields.');
      this.successMessage = '';
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      if (!this.tokenDID.trim()) {
        this.errorMessage = msg('Vehicle tokenDID is missing.');
        return;
      }

      const definitionDocument = this.buildDefinitionDocument();
      const payload = {
        tokenDID: this.tokenDID,
        document: definitionDocument,
      };
      const response = await ApiService.getInstance().callApi(
        'POST',
        '/device-definitions/attest',
        payload,
        true,
        true,
        true
      );

      if (!response.success) {
        this.errorMessage = response.error || msg('Failed to submit device definition update.');
        return;
      }

      const latestCloudEvent = this.tokenDID
        ? await IdentityService.getInstance().getLatestDeviceDefinitionCloudEvent(this.tokenDID)
        : null;

      if (latestCloudEvent?.data) {
        const refreshedDefinition = this.mergeDefinitionData(this.currentDefinition ?? null, latestCloudEvent);
        this.currentDefinition = refreshedDefinition;
        this.manufacturer = this.normalizeSelectValue(
          refreshedDefinition.manufacturer?.name || '',
          this.manufacturers.map((item) => item.name)
        );
        this.model = refreshedDefinition.model || '';
        this.year = refreshedDefinition.year != null ? String(refreshedDefinition.year) : '';

        const normalizedAttributes = this.normalizeAttributes(refreshedDefinition.attributes ?? []);
        this.attributeValues = normalizedAttributes.values;
        this.extraAttributes = normalizedAttributes.extra;
      }

      this.successMessage = msg('Device definition update submitted.');
      this.dispatchEvent(new CustomEvent('device-definition-update-requested', {
        detail: {
          request: payload,
          response: latestCloudEvent ?? response.data,
        },
        bubbles: true,
        composed: true,
      }));
    } finally {
      this.saving = false;
    }
  }

  private buildDefinitionDocument() {
    return {
      model: this.model.trim(),
      year: Number(this.year),
      manufacturer: {
        name: this.manufacturer.trim(),
      },
      deviceDefinitionId: this.buildDeviceDefinitionId(),
      deviceType: 'vehicle',
      attributes: this.buildAttributePayload(),
    };
  }

  private buildDeviceDefinitionId(): string {
    const manufacturerSlug = this.slugifyDefinitionPart(this.manufacturer);
    const modelSlug = this.slugifyDefinitionPart(this.model);
    const yearPart = this.year.trim();

    if (manufacturerSlug && modelSlug && yearPart) {
      return `${manufacturerSlug}_${modelSlug}_${yearPart}`;
    }

    return this.currentDefinition?.deviceDefinitionId || this.deviceDefinitionId;
  }

  private slugifyDefinitionPart(value: string): string {
    return value
      .trim()
      .toLocaleLowerCase('en')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/ /g, '-')
      .replace(/_/g, '-')
      .replace(/\//g, '-')
      .replace(/\./g, '-')
      .replace(/'/g, '-');
  }

  private buildAttributePayload(): DeviceDefinitionAttribute[] {
    const existingAttributeKeys = new Set(
      (this.currentDefinition?.attributes ?? [])
        .map((attribute) => this.getCanonicalAttributeKey(attribute.name || ''))
        .filter((key): key is string => Boolean(key))
    );

    const editableAttributes = ATTRIBUTE_FIELDS
      .map((field) => ({
        name: field.key,
        value: field.key === 'driven_wheels'
          ? this.normalizeSelectValue(
              (this.attributeValues[field.key] ?? '').trim(),
              EditDeviceDefinitionModalElement.DRIVEN_WHEEL_OPTIONS
            )
          : (this.attributeValues[field.key] ?? '').trim(),
      }))
      .filter((attribute) => attribute.value !== '' || existingAttributeKeys.has(attribute.name));

    return [...editableAttributes, ...this.extraAttributes];
  }
}
