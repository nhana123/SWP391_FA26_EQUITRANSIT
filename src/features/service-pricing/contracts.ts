import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';
import { sectionCodes } from '../booking-services/contracts';

// Mirrors BE ServiceProduct: the fixed 23-product catalog.
export const serviceProducts = [
  'ROAD_TRANSPORT',
  'AIRFARE',
  'AIR_STALL',
  'BASIC_CARE',
  'ENHANCED_CARE',
  'GROOMING',
  'BOARDING',
  'VETERINARY_EXAM',
  'VETERINARY_TEST',
  'VETERINARY_VACCINE',
  'VETERINARY_CERTIFICATE',
  'QUARANTINE_STANDARD',
  'QUARANTINE_ENHANCED',
  'INSURANCE_MORTALITY',
  'INSURANCE_COMBINED',
  'DOCUMENT_COORDINATION',
  'DOCUMENT_REVIEW',
  'AIRPORT_HANDLING',
  'TERMINAL_HANDLING',
  'CUSTOMS_DECLARATION',
  'GOVERNMENT_DUTY',
  'WAITING',
  'ESCORT',
] as const;
export const serviceProductSchema = z.enum(serviceProducts);
export type ServiceProduct = z.infer<typeof serviceProductSchema>;

// RATE: company rate; EVIDENCE: needs case evidence; INCLUDED: never charged
// separately; EVENT: only after a sourced applicable event.
export const pricingModeSchema = z.enum(['RATE', 'EVIDENCE', 'INCLUDED', 'EVENT']);
export type PricingMode = z.infer<typeof pricingModeSchema>;

const money = z.string().regex(/^\d+(\.\d{1,2})?$/);

/** BE ServiceRateResponse: public current rate, no source or purchase cost. */
export const serviceRateSchema = z.object({
  product: serviceProductSchema,
  uiSection: z.enum(sectionCodes),
  unit: z.string(),
  unitRate: money.nullable(),
  currency: z.literal('USD'),
  pricingMode: pricingModeSchema,
  tariffId: idSchema.nullable(),
  tariffVersion: z.number().int().positive().nullable(),
  allowedUnits: z.array(z.string()).optional(),
});
export type ServiceRate = z.infer<typeof serviceRateSchema>;

/** BE TariffResponse: Manager-only, includes private source reference. */
export const tariffSchema = z.object({
  tariffId: idSchema,
  // Legacy rows may have no recognised product or an unsupported rate.
  product: serviceProductSchema.nullable(),
  unit: z.string(),
  unitPrice: money.nullable(),
  currency: z.literal('USD'),
  version: z.number().int().positive(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  sourceReference: z.string().nullable(),
  sourceReviewRequired: z.boolean(),
  recordVersion: versionSchema,
});
export type Tariff = z.infer<typeof tariffSchema>;

export const tariffPageSchema = z.object({
  items: z.array(tariffSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** BE TariffWriteRequest; recordVersion is null for a new price family. */
export type TariffCommand = {
  product: ServiceProduct;
  unitPrice: string;
  sourceReference: string;
  validUntil: string | null;
  operationId: string;
  recordVersion: string | null;
};

export const productLabels: Record<ServiceProduct, string> = {
  ROAD_TRANSPORT: 'Road transport',
  AIRFARE: 'Airfare',
  AIR_STALL: 'Air stall',
  BASIC_CARE: 'Basic care',
  ENHANCED_CARE: 'Enhanced care',
  GROOMING: 'Grooming',
  BOARDING: 'Extra boarding',
  VETERINARY_EXAM: 'Veterinary exam',
  VETERINARY_TEST: 'Veterinary test',
  VETERINARY_VACCINE: 'Vaccination',
  VETERINARY_CERTIFICATE: 'Health certificate',
  QUARANTINE_STANDARD: 'Quarantine (standard)',
  QUARANTINE_ENHANCED: 'Quarantine (enhanced)',
  INSURANCE_MORTALITY: 'Mortality insurance',
  INSURANCE_COMBINED: 'Combined insurance',
  DOCUMENT_COORDINATION: 'Document coordination',
  DOCUMENT_REVIEW: 'Document review',
  AIRPORT_HANDLING: 'Airport handling',
  TERMINAL_HANDLING: 'Terminal handling',
  CUSTOMS_DECLARATION: 'Customs declaration',
  GOVERNMENT_DUTY: 'Government duties',
  WAITING: 'Waiting time',
  ESCORT: 'Escort',
};

export const modeLabels: Record<PricingMode, string> = {
  RATE: 'Company rate',
  EVIDENCE: 'Rate needs case evidence',
  INCLUDED: 'Included, never charged separately',
  EVENT: 'Charged only if the event happens',
};

export const unitLabels: Record<string, string> = {
  KM: 'per km',
  SLOT_KM: 'per slot-km',
  SHIPMENT: 'per shipment',
  INCLUDED: 'included',
  HORSE_KM: 'per horse-km',
  PERSON_DAY: 'per person-day',
  HORSE_NIGHT: 'per horse-night',
  HORSE_VISIT: 'per visit',
  TEST_SAMPLE: 'per test sample',
  DOSE: 'per dose',
  CERTIFICATE: 'per certificate',
  HORSE_DAY: 'per horse-day',
  POLICY: 'per policy',
  ROUTE_KM: 'per route km',
  HORSE_AIRPORT: 'per horse per airport',
  DECLARATION: 'per declaration',
  ASSESSMENT: 'per assessment',
  HOUR: 'per hour',
  PERSON_LEG: 'per person per leg',
};
export const unitLabel = (unit: string) => unitLabels[unit] ?? unit;
