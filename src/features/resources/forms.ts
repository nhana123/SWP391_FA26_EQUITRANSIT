import { validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import {
  assetStates,
  policyStates,
  type CatalogData,
  type CatalogWrite,
  type CatalogKey,
  type PolicyData,
  type ResourceWindow,
  type StallData,
  type SupplierData,
  type VehicleData,
} from './contracts';

/** Form state is text only; booleans are 'true'/'false'. Converted on submit. */
export type FormValues = Record<string, string>;
export type FieldSpec = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'checkbox' | 'phone' | 'datetime';
  options?: readonly string[];
  hint?: string;
  maxLength?: number;
  decimal?: boolean;
};

const dateHint = 'Leave empty if not applicable.';
const windowFields: FieldSpec[] = [
  { name: 'maintenanceFrom', label: 'Maintenance from', hint: dateHint, type: 'datetime' },
  {
    name: 'maintenanceTo',
    label: 'Maintenance to',
    hint: 'Empty while maintenance is ongoing. Needs a start.',
    type: 'datetime',
  },
  {
    name: 'documentExpiresAt',
    label: 'Document expires at',
    hint: 'Unknown expiry keeps availability pending.',
    type: 'datetime',
  },
  {
    name: 'bufferMinutes',
    label: 'Buffer between uses (minutes)',
    hint: '0–525600. Minimum gap applied once between assignments.',
    maxLength: 6,
  },
  { name: 'notes', label: 'Window notes (internal)', type: 'textarea', maxLength: 2000 },
];
const ownerField: FieldSpec = {
  name: 'ownerSupplierId',
  label: 'Owner supplier ID (optional)',
  hint: 'Must be an existing active supplier.',
  maxLength: 19,
};

export const fieldSpecs: Record<CatalogKey, FieldSpec[]> = {
  vehicles: [
    { name: 'vehicleCode', label: 'Vehicle code', maxLength: 50 },
    { name: 'plateNumber', label: 'Plate number', maxLength: 50 },
    { name: 'horseCapacity', label: 'Horse capacity', maxLength: 9 },
    { name: 'climateSystemType', label: 'Climate system', maxLength: 50 },
    { name: 'status', label: 'Status', type: 'select', options: assetStates },
    ownerField,
    ...windowFields,
  ],
  stalls: [
    { name: 'stallCode', label: 'Stall code', maxLength: 50 },
    {
      name: 'capacitySlots',
      label: 'Capacity (slots)',
      hint: 'At least 0.1, one decimal.',
      maxLength: 6,
      decimal: true,
    },
    { name: 'internalHeightCm', label: 'Internal height (cm)', maxLength: 9, decimal: true },
    { name: 'internalWidthCm', label: 'Internal width (cm)', maxLength: 9, decimal: true },
    {
      name: 'weightLimitKg',
      label: 'Weight limit (kg, optional)',
      hint: 'Unknown limit keeps fit pending.',
      maxLength: 9,
      decimal: true,
    },
    { name: 'status', label: 'Status', type: 'select', options: assetStates },
    ownerField,
    ...windowFields,
  ],
  suppliers: [
    { name: 'name', label: 'Supplier name', maxLength: 200 },
    { name: 'contactName', label: 'Contact name (optional)', maxLength: 150 },
    { name: 'email', label: 'Email (optional)', maxLength: 255 },
    {
      name: 'phone',
      label: 'Phone (optional)',
      type: 'phone',
      maxLength: 16,
    },
    {
      name: 'services',
      label: 'Services offered',
      type: 'textarea',
      hint: 'One per line, up to 30 distinct entries of 50 characters.',
    },
    { name: 'active', label: 'Active supplier', type: 'checkbox' },
  ],
  'fit-policies': [
    { name: 'policyCode', label: 'Policy code', hint: 'Same code = new version.', maxLength: 50 },
    { name: 'stallId', label: 'Stall ID (optional)', maxLength: 19 },
    { name: 'carrierSupplierId', label: 'Carrier supplier ID (optional)', maxLength: 19 },
    { name: 'slotQuantity', label: 'Slots used', type: 'select', options: ['1', '1.5', '3'] },
    { name: 'maxWeightKg', label: 'Max horse weight (kg)', maxLength: 9, decimal: true },
    { name: 'maxHeightCm', label: 'Max horse height (cm)', maxLength: 9, decimal: true },
    { name: 'maxWidthCm', label: 'Max horse width (cm)', maxLength: 9, decimal: true },
    { name: 'effectiveFrom', label: 'Effective from', type: 'datetime' },
    { name: 'effectiveTo', label: 'Effective to (optional)', type: 'datetime' },
    {
      name: 'sourceUrl',
      label: 'Source URL',
      hint: 'HTTP(S) link to the carrier document, without credentials.',
      maxLength: 2048,
    },
    {
      name: 'sourceFileKey',
      label: 'Source file key',
      hint: 'Existing stored file key. Either this or a URL is required to approve.',
      maxLength: 1024,
    },
    { name: 'status', label: 'Status', type: 'select', options: policyStates },
  ],
};

const text = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '' : String(v);
const windowValues = (w: ResourceWindow): FormValues => ({
  maintenanceFrom: text(w.maintenanceFrom),
  maintenanceTo: text(w.maintenanceTo),
  documentExpiresAt: text(w.documentExpiresAt),
  bufferMinutes: text(w.bufferMinutes),
  notes: text(w.notes),
});

/** Initial form values: empty for a new record, otherwise the reviewed server data. */
export function toValues<K extends CatalogKey>(key: K, data: CatalogData[K] | null): FormValues {
  if (key === 'vehicles') {
    const d = data as VehicleData | null;
    return {
      vehicleCode: text(d?.vehicleCode),
      plateNumber: text(d?.plateNumber),
      horseCapacity: text(d?.horseCapacity),
      climateSystemType: text(d?.climateSystemType),
      status: d?.status ?? 'ACTIVE',
      ownerSupplierId: text(d?.ownerSupplierId),
      ...windowValues(d?.window ?? emptyWindow),
    };
  }
  if (key === 'stalls') {
    const d = data as StallData | null;
    return {
      stallCode: text(d?.stallCode),
      capacitySlots: text(d?.capacitySlots),
      internalHeightCm: text(d?.internalHeightCm),
      internalWidthCm: text(d?.internalWidthCm),
      weightLimitKg: text(d?.weightLimitKg),
      status: d?.status ?? 'ACTIVE',
      ownerSupplierId: text(d?.ownerSupplierId),
      ...windowValues(d?.window ?? emptyWindow),
    };
  }
  if (key === 'suppliers') {
    const d = data as SupplierData | null;
    return {
      name: text(d?.name),
      contactName: text(d?.contactName),
      email: text(d?.email),
      phone: text(d?.phone),
      services: (d?.services ?? []).join('\n'),
      active: String(d?.active ?? true),
    };
  }
  const d = data as PolicyData | null;
  return {
    policyCode: text(d?.policyCode),
    stallId: text(d?.stallId),
    carrierSupplierId: text(d?.carrierSupplierId),
    slotQuantity: d ? normalizeSlot(d.slotQuantity) : '1',
    maxWeightKg: text(d?.maxWeightKg),
    maxHeightCm: text(d?.maxHeightCm),
    maxWidthCm: text(d?.maxWidthCm),
    effectiveFrom: text(d?.effectiveFrom),
    effectiveTo: text(d?.effectiveTo),
    sourceUrl: text(d?.sourceUrl),
    sourceFileKey: text(d?.sourceFileKey),
    status: d?.status ?? 'DRAFT',
  };
}
const emptyWindow: ResourceWindow = {
  maintenanceFrom: null,
  maintenanceTo: null,
  documentExpiresAt: null,
  bufferMinutes: null,
  notes: null,
};
/** 1.0 / 1.50 from the server select the matching 1 / 1.5 option. */
export function normalizeSlot(value: string) {
  const n = Number(value);
  return n === 1 || n === 1.5 || n === 3 ? String(n) : value;
}

const MIN_TIME = Date.parse('1900-01-01T00:00:00Z');
const MAX_TIME = Date.parse('9998-01-01T00:00:00Z');
/** Exact decimal text with the DTO's digit limits; null when not a valid positive value. */
export function validDecimal(value: string, integer: number, fraction: number, min: number) {
  return new RegExp(`^\\d{1,${integer}}(\\.\\d{1,${fraction}})?$`).test(value) &&
    Number(value) >= min
    ? value
    : null;
}
/** Validated decimal text to the JSON number the resource DTOs expect. */
const num = (value: string | null) => (value === null ? null : Number(value));
export function validSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

class Reader {
  errors: FieldErrors = {};
  constructor(private values: FormValues) {}
  raw(name: string) {
    return (this.values[name] ?? '').trim();
  }
  text(name: string, max: number, required = true) {
    const v = this.raw(name);
    if (!v) {
      if (required) this.errors[name] = 'This field is required.';
      return null;
    }
    if (v.length > max) this.errors[name] = `Use at most ${max} characters.`;
    return v;
  }
  date(name: string, required = false) {
    const v = this.raw(name);
    if (!v) {
      if (required) this.errors[name] = 'Enter a date.';
      return null;
    }
    const t = Date.parse(v);
    if (!validOffsetDate(v)) this.errors[name] = 'Choose a date and time.';
    else if (t < MIN_TIME || t >= MAX_TIME) this.errors[name] = 'Use a year between 1900 and 9997.';
    return v;
  }
  int(name: string, min: number, max: number, required = true) {
    const v = this.raw(name);
    if (!v) {
      if (required) this.errors[name] = 'This field is required.';
      return null;
    }
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < min || n > max)
      this.errors[name] = `Use a whole number from ${min} to ${max}.`;
    return n;
  }
  id(name: string) {
    return this.int(name, 1, Number.MAX_SAFE_INTEGER, false);
  }
  decimal(name: string, integer: number, fraction: number, min: number, required = true) {
    const v = this.raw(name);
    if (!v) {
      if (required) this.errors[name] = 'This field is required.';
      return null;
    }
    if (!validDecimal(v, integer, fraction, min))
      this.errors[name] =
        `Use a value of at least ${min} with up to ${integer} digits and ${fraction} decimal${fraction > 1 ? 's' : ''}.`;
    return v;
  }
  window(): ResourceWindow {
    const maintenanceFrom = this.date('maintenanceFrom');
    const maintenanceTo = this.date('maintenanceTo');
    if (maintenanceTo && !maintenanceFrom)
      this.errors.maintenanceTo = 'A maintenance end needs a start.';
    else if (
      maintenanceFrom &&
      maintenanceTo &&
      !this.errors.maintenanceFrom &&
      !this.errors.maintenanceTo &&
      Date.parse(maintenanceTo) <= Date.parse(maintenanceFrom)
    )
      this.errors.maintenanceTo = 'Maintenance end must follow its start.';
    return {
      maintenanceFrom,
      maintenanceTo,
      documentExpiresAt: this.date('documentExpiresAt'),
      bufferMinutes: this.int('bufferMinutes', 0, 525600),
      notes: this.text('notes', 2000, false),
    };
  }
}

/** Data the BE accepts (decimals as exact text), or field errors. */
export function fromValues<K extends CatalogKey>(
  key: K,
  values: FormValues,
): { data: CatalogWrite[K] | null; errors: FieldErrors } {
  const r = new Reader(values);
  let data: unknown;
  if (key === 'vehicles')
    data = {
      vehicleCode: r.text('vehicleCode', 50),
      plateNumber: r.text('plateNumber', 50),
      horseCapacity: r.int('horseCapacity', 1, 2_147_483_647),
      climateSystemType: r.text('climateSystemType', 50),
      status: r.raw('status'),
      ownerSupplierId: r.id('ownerSupplierId'),
      window: r.window(),
    };
  else if (key === 'stalls')
    data = {
      stallCode: r.text('stallCode', 50),
      capacitySlots: num(r.decimal('capacitySlots', 4, 1, 0.1)),
      internalHeightCm: num(r.decimal('internalHeightCm', 6, 2, 0.01)),
      internalWidthCm: num(r.decimal('internalWidthCm', 6, 2, 0.01)),
      weightLimitKg: num(r.decimal('weightLimitKg', 6, 2, 0.01, false)),
      status: r.raw('status'),
      ownerSupplierId: r.id('ownerSupplierId'),
      window: r.window(),
    };
  else if (key === 'suppliers') {
    const services = r
      .raw('services')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (services.length > 30) r.errors.services = 'Use at most 30 services.';
    else if (services.some((s) => s.length > 50))
      r.errors.services = 'Each service uses at most 50 characters.';
    else if (new Set(services).size !== services.length)
      r.errors.services = 'Services must be distinct.';
    const email = r.text('email', 255, false);
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) r.errors.email = 'Enter a valid email address.';
    const phone = r.text('phone', 16, false);
    if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone))
      r.errors.phone = 'Use 8–15 digits, optionally starting with +.';
    data = {
      name: r.text('name', 200),
      contactName: r.text('contactName', 150, false),
      email,
      phone,
      services,
      active: r.raw('active') === 'true',
    };
  } else {
    const policy = {
      policyCode: r.text('policyCode', 50),
      stallId: r.id('stallId'),
      carrierSupplierId: r.id('carrierSupplierId'),
      slotQuantity: r.raw('slotQuantity'),
      maxWeightKg: r.decimal('maxWeightKg', 6, 2, 0.01, false),
      maxHeightCm: r.decimal('maxHeightCm', 6, 2, 0.01, false),
      maxWidthCm: r.decimal('maxWidthCm', 6, 2, 0.01, false),
      effectiveFrom: r.date('effectiveFrom', true),
      effectiveTo: r.date('effectiveTo'),
      sourceUrl: r.text('sourceUrl', 2048, false),
      sourceFileKey: r.text('sourceFileKey', 1024, false),
      status: r.raw('status') as PolicyData['status'],
    };
    if (!['1', '1.5', '3'].includes(policy.slotQuantity))
      r.errors.slotQuantity = 'Allowed slot quantities: 1, 1.5 or 3.';
    if (
      policy.effectiveFrom &&
      policy.effectiveTo &&
      !r.errors.effectiveFrom &&
      !r.errors.effectiveTo &&
      Date.parse(policy.effectiveTo) <= Date.parse(policy.effectiveFrom)
    )
      r.errors.effectiveTo = 'Policy expiry must follow its start.';
    if (policy.sourceUrl && !validSafeUrl(policy.sourceUrl))
      r.errors.sourceUrl = 'Use an HTTP(S) link without credentials.';
    // Approval needs real evidence: all three limits and a source. Nothing is inferred.
    if (policy.status === 'APPROVED') {
      for (const name of ['maxWeightKg', 'maxHeightCm', 'maxWidthCm'] as const)
        if (!policy[name]) r.errors[name] ??= 'Required to approve: enter the documented limit.';
      if (!policy.sourceUrl && !policy.sourceFileKey)
        r.errors.sourceUrl ??= 'Required to approve: add the source URL or file key.';
    }
    data = {
      ...policy,
      slotQuantity: Number(policy.slotQuantity),
      maxWeightKg: num(policy.maxWeightKg),
      maxHeightCm: num(policy.maxHeightCm),
      maxWidthCm: num(policy.maxWidthCm),
    };
  }
  return Object.keys(r.errors).length
    ? { data: null, errors: r.errors }
    : { data: data as CatalogWrite[K], errors: {} };
}
