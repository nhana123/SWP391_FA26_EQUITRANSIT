import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

// Mirrors BE ResourceModels (F09). Catalogue data is staff-only.
export const assetStates = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const;
export type AssetState = (typeof assetStates)[number];
export const policyStates = ['DRAFT', 'APPROVED', 'INACTIVE'] as const;
export type PolicyState = (typeof policyStates)[number];
/** Physical kinds with an availability probe. SUPPLIER/POLICY have none. */
export type ProbeKind = 'VEHICLE' | 'STALL';
export const resourceBlockers = [
  'INACTIVE',
  'SUPPLIER_INACTIVE',
  'MAINTENANCE',
  'DOCUMENT_EXPIRED',
  'DOCUMENT_PENDING',
  'BUFFER_PENDING',
  'OVERLAP',
  'SCHEDULE_PENDING',
  'CAPACITY',
  'MEASUREMENTS_PENDING',
  'PHYSICAL_FIT',
  'WEIGHT_LIMIT_PENDING',
  'FIT_POLICY_PENDING',
  'FIT_POLICY_AMBIGUOUS',
  'FIT_POLICY_UNSUITABLE',
  'SLOT_SELECTION_PENDING',
] as const;
export type ResourceBlocker = (typeof resourceBlockers)[number];

/** BigDecimal arrives as a JSON number; keep it as text for display and edits. */
const decimal = z.union([z.number(), z.string()]).transform(String);
const optionalText = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const optionalId = idSchema.nullish().transform((v) => v ?? null);
const optionalDecimal = decimal.nullish().transform((v) => v ?? null);

export const windowSchema = z.object({
  maintenanceFrom: optionalText,
  maintenanceTo: optionalText,
  documentExpiresAt: optionalText,
  // Legacy rows keep a NULL buffer until a Manager configures one (pending).
  bufferMinutes: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? null),
  notes: optionalText,
});
export type ResourceWindow = z.infer<typeof windowSchema>;

export const vehicleDataSchema = z.object({
  vehicleCode: z.string(),
  plateNumber: z.string(),
  horseCapacity: z.number().int(),
  climateSystemType: z.string(),
  status: z.enum(assetStates),
  ownerSupplierId: optionalId,
  window: windowSchema,
});
export const stallDataSchema = z.object({
  stallCode: z.string(),
  capacitySlots: decimal,
  internalHeightCm: decimal,
  internalWidthCm: decimal,
  weightLimitKg: optionalDecimal,
  status: z.enum(assetStates),
  ownerSupplierId: optionalId,
  window: windowSchema,
});
export const supplierDataSchema = z.object({
  name: z.string(),
  contactName: optionalText,
  email: optionalText,
  phone: optionalText,
  services: z.array(z.string()),
  active: z.boolean(),
});
export const policyDataSchema = z.object({
  policyCode: z.string(),
  stallId: optionalId,
  carrierSupplierId: optionalId,
  slotQuantity: decimal,
  maxWeightKg: optionalDecimal,
  maxHeightCm: optionalDecimal,
  maxWidthCm: optionalDecimal,
  effectiveFrom: z.string(),
  effectiveTo: optionalText,
  sourceUrl: optionalText,
  sourceFileKey: optionalText,
  status: z.enum(policyStates),
});
export type VehicleData = z.infer<typeof vehicleDataSchema>;
export type StallData = z.infer<typeof stallDataSchema>;
export type SupplierData = z.infer<typeof supplierDataSchema>;
export type PolicyData = z.infer<typeof policyDataSchema>;

const view = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ id: idSchema, recordVersion: versionSchema, data });
export const policyViewSchema = z.object({
  id: idSchema,
  recordVersion: versionSchema,
  version: z.number().int().positive(),
  // Server-owned review identity; the FE never sends it.
  reviewedBy: optionalId,
  reviewedAt: optionalText,
  data: policyDataSchema,
});
const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().nonnegative(),
    size: z.number().int().positive(),
    totalElements: z.number().int().nonnegative(),
  });

export const catalogs = {
  vehicles: { path: 'vehicles', view: view(vehicleDataSchema) },
  stalls: { path: 'stalls', view: view(stallDataSchema) },
  suppliers: { path: 'suppliers', view: view(supplierDataSchema) },
  'fit-policies': { path: 'fit-policies', view: policyViewSchema },
} as const;
export type CatalogKey = keyof typeof catalogs;
export const catalogKeys = Object.keys(catalogs) as CatalogKey[];
export const pageSchemas = {
  vehicles: page(catalogs.vehicles.view),
  stalls: page(catalogs.stalls.view),
  suppliers: page(catalogs.suppliers.view),
  'fit-policies': page(catalogs['fit-policies'].view),
};
export type CatalogView = {
  vehicles: z.infer<typeof catalogs.vehicles.view>;
  stalls: z.infer<typeof catalogs.stalls.view>;
  suppliers: z.infer<typeof catalogs.suppliers.view>;
  'fit-policies': z.infer<typeof policyViewSchema>;
};
export type CatalogData = {
  vehicles: VehicleData;
  stalls: StallData;
  suppliers: SupplierData;
  'fit-policies': PolicyData;
};
export type AnyView = CatalogView[CatalogKey];

/**
 * Write payloads. Size/slot BigDecimals are JSON numbers per the DTO (unlike
 * USD money, which is a decimal string elsewhere); they are read back as text.
 */
type Numbers<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: null extends T[P] ? number | null : number;
};
export type CatalogWrite = {
  vehicles: VehicleData;
  stalls: Numbers<
    StallData,
    'capacitySlots' | 'internalHeightCm' | 'internalWidthCm' | 'weightLimitKg'
  >;
  suppliers: SupplierData;
  'fit-policies': Numbers<
    PolicyData,
    'slotQuantity' | 'maxWeightKg' | 'maxHeightCm' | 'maxWidthCm'
  >;
};

/** Flat command for useCaseCommand; the adapter sends BE `{command, data}`. */
export type CatalogCommand<K extends CatalogKey = CatalogKey> = {
  operationId: string;
  // null only when creating; an update uses the version the Manager reviewed.
  recordVersion: string | null;
  data: CatalogWrite[K];
};

export const availabilitySchema = z.object({
  kind: z.enum(['VEHICLE', 'STALL', 'SUPPLIER', 'POLICY']),
  resourceId: idSchema,
  recordVersion: versionSchema,
  status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'PENDING']),
  asOf: z.string(),
  policyId: optionalId,
  carrierConfirmed: z.boolean(),
  blockers: z.array(z.enum(resourceBlockers)),
});
export type Availability = z.infer<typeof availabilitySchema>;
export type AvailabilityRequest = {
  orderId: number;
  revisionId: number;
  mode: 'ROAD' | 'AIR';
  start: string;
  end: string;
  carrierSupplierId: number | null;
  legId: number | null;
};
/** ROAD vehicles and AIR stall equipment are distinct; no other combination. */
export const probeMode: Record<ProbeKind, AvailabilityRequest['mode']> = {
  VEHICLE: 'ROAD',
  STALL: 'AIR',
};

export const catalogLabels: Record<CatalogKey, { title: string; one: string }> = {
  vehicles: { title: 'Vehicles', one: 'vehicle' },
  stalls: { title: 'Air stalls', one: 'stall' },
  suppliers: { title: 'Suppliers', one: 'supplier' },
  'fit-policies': { title: 'Stall fit policies', one: 'fit policy' },
};

export const blockerLabels: Record<ResourceBlocker, string> = {
  INACTIVE: 'Resource is inactive',
  SUPPLIER_INACTIVE: 'Owning supplier is inactive',
  MAINTENANCE: 'Maintenance overlaps the window (including buffer)',
  DOCUMENT_EXPIRED: 'Document expires before the window end plus buffer',
  DOCUMENT_PENDING: 'Document expiry is not recorded',
  BUFFER_PENDING: 'Buffer time is not configured',
  OVERLAP: 'Already assigned in an overlapping window (including buffer)',
  SCHEDULE_PENDING: 'An active schedule has an unknown window',
  CAPACITY: 'Insufficient capacity for this horse',
  MEASUREMENTS_PENDING: 'Horse or stall measurements are missing',
  PHYSICAL_FIT: 'Horse does not physically fit this stall',
  WEIGHT_LIMIT_PENDING: 'Weight limit is not recorded',
  FIT_POLICY_PENDING: 'No approved, effective fit policy for this context',
  FIT_POLICY_AMBIGUOUS: 'More than one fit policy matches this context',
  FIT_POLICY_UNSUITABLE: 'The approved fit policy rejects this horse',
  SLOT_SELECTION_PENDING: 'Stall slots have not been selected',
};
