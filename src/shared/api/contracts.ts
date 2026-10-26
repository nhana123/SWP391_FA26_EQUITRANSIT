import { z } from 'zod';

export const idSchema = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, 'ID exceeds JavaScript safe integer range');
export const versionSchema = z.string().regex(/^[\da-f]{16}$/i);
export const roleSchema = z.enum(['CUSTOMER', 'MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER']);
export type Role = z.infer<typeof roleSchema>;
export const orderStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'IN_PREPARATION',
  'CONFIRMED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'CANCELED',
  'CLOSED',
]);
export const messageSchema = z.object({ message: z.string() });
export const loginSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().positive(),
  role: roleSchema,
});
export type LoginResponse = z.infer<typeof loginSchema>;
export const customerSchema = z.object({
  customerId: idSchema,
  userId: idSchema,
  fullName: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});
export const horseSchema = z.object({
  horseId: idSchema,
  name: z.string(),
  microchipId: z.string().nullable(),
  passportNumber: z.string().nullable(),
  breed: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  sexCode: z.enum(['STALLION', 'MARE', 'GELDING']).nullable(),
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  bodyWidthCm: z.number().nullable(),
  measuredAt: z.string().nullable(),
  specialCareNotes: z.string().nullable(),
  handlingNotes: z.string().nullable(),
  feedWaterRequirements: z.string().nullable(),
  stallPreferences: z.string().nullable(),
  veterinaryInstructions: z.string().nullable(),
  veterinaryInstructionSource: z.string().nullable(),
  recordVersion: versionSchema,
  measurementsComplete: z.boolean(),
});
export type Horse = z.infer<typeof horseSchema>;
export type HorseInput = Omit<Horse, 'horseId' | 'recordVersion' | 'measurementsComplete'>;
export const preferencesSchema = z.object({
  roadArrangement: z.enum(['EQUITRANSIT', 'CUSTOMER']).nullable().optional(),
  veterinaryArrangement: z.enum(['EQUITRANSIT', 'CUSTOMER']).nullable().optional(),
  airStall: z.enum(['SHARED_ONE', 'WIDE', 'PRIVATE']).nullable().optional(),
  enhancedCare: z.boolean().nullable().optional(),
  groomingDays: z.number().int().nullable().optional(),
  boardingNights: z.number().int().nullable().optional(),
  quarantinePackage: z.enum(['STANDARD', 'ENHANCED']).nullable().optional(),
  insurance: z.enum(['NONE', 'EXISTING', 'MORTALITY', 'COMBINED']).nullable().optional(),
  declaredValue: z.string().nullable().optional(),
  existingPolicyReference: z.string().nullable().optional(),
  escortNotes: z.string().nullable().optional(),
  roadProviderName: z.string().nullable().optional(),
  roadProviderContact: z.string().nullable().optional(),
  veterinaryProviderName: z.string().nullable().optional(),
  veterinaryProviderContact: z.string().nullable().optional(),
});
export type ServicePreferences = z.infer<typeof preferencesSchema>;
const nullableText = z.string().nullable();
/** Customer statement for the Specialist; not veterinary or legal evidence. */
export const healthDeclarationSchema = z.object({
  influenzaVaccinated: z.boolean().nullable().optional(),
  lastInfluenzaVaccinationDate: z.string().nullable().optional(),
  vaccinationRecordReference: z.string().nullable().optional(),
  healthNotes: z.string().nullable().optional(),
  declaredAccurate: z.boolean().nullable().optional(),
});
export type HealthDeclaration = z.infer<typeof healthDeclarationSchema>;
export const routeTransportModeSchema = z.enum(['ROAD', 'AIR', 'MULTIMODAL']);
export type RouteTransportMode = z.infer<typeof routeTransportModeSchema>;
export const routeCountrySchema = z.object({
  countryCode: z.string(),
  countryName: z.string(),
  supportsRoad: z.boolean(),
  supportsAir: z.boolean(),
});
export type RouteCountry = z.infer<typeof routeCountrySchema>;
export const routeLocationSchema = z.object({
  locationId: z.number().int(),
  countryCode: z.string(),
  locationType: z.enum(['CITY', 'AIRPORT', 'HUB']),
  locationName: z.string(),
  locationCode: z.string().nullable(),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  isPrimaryHub: z.boolean().optional(),
  domesticRatePerKm: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type RouteLocation = z.infer<typeof routeLocationSchema>;
export const hubDistanceOptionSchema = z.object({
  locationId: z.number().int(),
  locationName: z.string(),
  locationCode: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  isPrimaryHub: z.boolean().optional(),
  distanceKm: z.number().nullable().optional(),
  domesticCost: z.number().nullable().optional(),
  isRecommendedNearest: z.boolean().optional(),
});
export type HubDistanceOption = z.infer<typeof hubDistanceOptionSchema>;
export const addressSuggestionSchema = z.object({
  displayName: z.string(),
  formattedAddress: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  countryCode: z.string(),
  city: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  road: z.string().nullable().optional(),
});
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>;
export const addressValidationResponseSchema = z.object({
  isValid: z.boolean(),
  matchedAddress: addressSuggestionSchema.nullable().optional(),
  message: z.string(),
});
export type AddressValidationResponse = z.infer<typeof addressValidationResponseSchema>;
export const routeMatchRequestSchema = z.object({
  originCountryCode: z.string(),
  originCity: z.string().nullable().optional(),
  originAirportCode: z.string().nullable().optional(),
  destinationCountryCode: z.string(),
  destinationCity: z.string().nullable().optional(),
  destinationAirportCode: z.string().nullable().optional(),
  transportMode: routeTransportModeSchema.nullable().optional(),
  airStallPreference: z.enum(['SHARED_ONE', 'WIDE', 'PRIVATE']).nullable().optional(),
  pickupAddress: z.string().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  originHubId: idSchema.nullable().optional(),
  destinationHubId: idSchema.nullable().optional(),
});
export type RouteMatchRequest = z.infer<typeof routeMatchRequestSchema>;
export const routeMatchResponseSchema = z.object({
  matched: z.boolean(),
  templateId: idSchema.nullable(),
  transportMode: routeTransportModeSchema.nullable(),
  routeSummary: z.string().nullable(),
  estimatedRoadKm: z.number().nullable(),
  estimatedAirKm: z.number().nullable(),
  estimatedHours: z.number().nullable(),
  estimatedRoadCost: z.number().nullable(),
  estimatedAirCost: z.number().nullable(),
  totalEstimatedCost: z.number().nullable(),
  requiresCustomCoordinatorPlan: z.boolean(),
  message: z.string(),
  originHubName: z.string().nullable().optional(),
  originHubAddress: z.string().nullable().optional(),
  destinationHubName: z.string().nullable().optional(),
  destinationHubAddress: z.string().nullable().optional(),
  firstMileRoadKm: z.number().nullable().optional(),
  mainLegRoadKm: z.number().nullable().optional(),
  lastMileRoadKm: z.number().nullable().optional(),
  firstMileCost: z.number().nullable().optional(),
  lastMileCost: z.number().nullable().optional(),
  originHubOptions: z.array(hubDistanceOptionSchema).optional(),
  destinationHubOptions: z.array(hubDistanceOptionSchema).optional(),
  originHubId: idSchema.nullable().optional(),
  destinationHubId: idSchema.nullable().optional(),
});
export type RouteMatchResponse = z.infer<typeof routeMatchResponseSchema>;
export const draftSchema = z.object({
  route: routeMatchRequestSchema.nullable().optional(),
  horseId: idSchema.nullable(),
  originCountryCode: nullableText,
  destinationCountryCode: nullableText,
  originAddress: nullableText,
  destinationAddress: nullableText,
  originTimezone: nullableText,
  destinationTimezone: nullableText,
  preferredDepartureAt: nullableText,
  deliveryDeadline: nullableText,
  dateFlexibilityNotes: nullableText,
  importType: z.enum(['TEMPORARY', 'PERMANENT', 'NEEDS_ADVICE']).nullable(),
  receiverName: nullableText,
  receiverPhone: nullableText,
  receiverEmail: nullableText,
  receiverAuthority: nullableText,
  eventStartAt: nullableText,
  eventName: nullableText,
  eventVenue: nullableText,
  eventTimezone: nullableText,
  transitAirports: z.array(z.string()).nullable(),
  specialNeeds: nullableText,
  services: preferencesSchema.nullable(),
  // Absent on drafts saved before the declaration existed.
  healthDeclaration: healthDeclarationSchema.nullable().optional(),
});
export type OrderDraft = z.infer<typeof draftSchema>;
export const orderSchema = z.object({
  orderId: idSchema,
  orderNumber: z.string(),
  orderStatus: orderStatusSchema,
  currency: z.string(),
  recordVersion: versionSchema,
  currentRevisionId: idSchema.nullable(),
  currentPlanId: idSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  draft: draftSchema,
});
export type Order = z.infer<typeof orderSchema>;
export const horsePageSchema = z.object({
  items: z.array(horseSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const submitReceiptSchema = z.object({ revisionId: idSchema }).passthrough();

export const bookingFlowBlockReasons = [
  'AWAITING_MANAGER_APPROVAL',
  'AWAITING_COORDINATOR_QUOTE',
  'QUOTE_ACCEPTANCE_REQUIRED',
  'DEPOSIT_SCHEDULE_REQUIRED',
  'DEPOSIT_REQUIRED',
  'REFUND_PENDING',
  'ORDER_NOT_ASSIGNABLE',
] as const;

export const bookingFlowBlockReasonSchema = z.string().nullable();
export type BookingFlowBlockReason =
  | (typeof bookingFlowBlockReasons)[number]
  | (string & {})
  | null;

export const bookingFlowStatusSchema = z.object({
  orderId: idSchema,
  transportMode: routeTransportModeSchema.nullable().optional().default(null),
  orderStatus: orderStatusSchema,
  hasAcceptedQuote: z.boolean(),
  quoteTotal: z.union([z.string(), z.number()]).transform((v) => String(v)).nullable().optional().default(null),
  depositRequired: z.boolean(),
  depositAmount: z.union([z.string(), z.number()]).transform((v) => String(v)).nullable().optional().default(null),
  depositPaid: z.union([z.string(), z.number()]).transform((v) => String(v)),
  isDepositSatisfied: z.boolean(),
  canAssignDriver: z.boolean(),
  blockReason: bookingFlowBlockReasonSchema,
});
export type BookingFlowStatus = z.infer<typeof bookingFlowStatusSchema>;

