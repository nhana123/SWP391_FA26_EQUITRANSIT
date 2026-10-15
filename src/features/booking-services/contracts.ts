import { z } from 'zod';
import {
  idSchema,
  orderSchema,
  preferencesSchema,
  versionSchema,
  type ServicePreferences,
} from '../../shared/api/contracts';
import { revisionSchema } from '../assessment/contracts';

// Mirrors BE ServiceDisclosureResponse. Money and quantities are decimal
// strings or null and are only ever displayed, never parsed or summed.
export const sectionCodes = [
  'TRANSPORTATION',
  'AIR_STALL',
  'HORSE_CARE',
  'VETERINARY',
  'QUARANTINE',
  'INSURANCE',
  'ADDITIONAL_CHARGES',
] as const;
export type SectionCode = (typeof sectionCodes)[number];

const decimal = z.string().regex(/^\d+(\.\d{1,3})?$/);

export const sectionSchema = z.object({
  code: z.enum(sectionCodes),
  title: z.string(),
  options: z.array(z.string()),
});

export const stallFitSchema = z.object({
  option: z.enum(['SHARED_ONE', 'WIDE', 'PRIVATE']),
  // Configuration size (1 / 1.5 / 3), display only.
  slots: z.number().positive(),
  status: z.enum(['ELIGIBLE', 'UNSUITABLE', 'PENDING']),
  policyId: idSchema.nullable(),
  policyVersion: z.number().int().positive().nullable(),
  reasons: z.array(z.string()),
});
export type StallFit = z.infer<typeof stallFitSchema>;

export const quarantineSchema = z.object({
  applicability: z.enum(['REQUIRED', 'NOT_REQUIRED', 'UNKNOWN']),
  requiredDays: z.number().int().positive().nullable(),
  assessmentId: idSchema.nullable(),
});
export type QuarantineResult = z.infer<typeof quarantineSchema>;

export const chargeSchema = z.object({
  code: z.string(),
  uiSection: z.enum(sectionCodes),
  costGroup: z.string(),
  label: z.string(),
  mandatory: z.boolean(),
  selected: z.boolean(),
  unit: z.string(),
  quantity: decimal.nullable(),
  unitRate: decimal.nullable(),
  amount: decimal.nullable(),
  pricingStatus: z.string(),
  tariffId: idSchema.nullable(),
  tariffVersion: z.number().int().positive().nullable(),
  formula: z.string(),
  blockers: z.array(z.string()),
});
export type Charge = z.infer<typeof chargeSchema>;

export const disclosureSchema = z.object({
  orderId: idSchema,
  recordVersion: versionSchema,
  revisionId: idSchema.nullable(),
  horseRecordVersion: versionSchema.nullable(),
  asOf: z.string(),
  currency: z.string(),
  selected: preferencesSchema.nullable(),
  sections: z.array(sectionSchema),
  airStalls: z.array(stallFitSchema),
  quarantine: quarantineSchema,
  charges: z.array(chargeSchema),
  knownSubtotal: decimal,
  totalEstimate: decimal.nullable(),
  payable: z.boolean(),
  carrierConfirmation: z.string(),
});
export type Disclosure = z.infer<typeof disclosureSchema>;

export const confirmationSchema = z.object({
  order: orderSchema,
  revision: revisionSchema.nullable(),
});
export type Confirmation = z.infer<typeof confirmationSchema>;

/** Every preference field, always sent: the BE replaces the whole object. */
export type Preferences = {
  [K in keyof ServicePreferences]-?: NonNullable<ServicePreferences[K]> | null;
};

export const emptyPreferences: Preferences = {
  roadArrangement: null,
  veterinaryArrangement: null,
  airStall: null,
  enhancedCare: null,
  groomingDays: null,
  boardingNights: null,
  quarantinePackage: null,
  insurance: null,
  declaredValue: null,
  existingPolicyReference: null,
  escortNotes: null,
  roadProviderName: null,
  roadProviderContact: null,
  veterinaryProviderName: null,
  veterinaryProviderContact: null,
};

/** Fills omitted fields with null so the full replacement never drops one. */
export function toPreferences(selected: ServicePreferences | null | undefined): Preferences {
  const result = { ...emptyPreferences };
  if (selected)
    for (const key of Object.keys(emptyPreferences) as (keyof Preferences)[])
      (result as Record<string, unknown>)[key] = selected[key] ?? null;
  return result;
}

export type ConfirmCommand = {
  recordVersion: string;
  operationId: string;
  horseRecordVersion: string;
  services: Preferences;
  changeReason: string | null;
};
