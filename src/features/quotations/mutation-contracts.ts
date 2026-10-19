import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';
import { validOffsetDate, type FieldErrors } from '../../shared/lib/validation';

// Dev2 mutation contracts for F06 (BE 5b8b369). Read DTOs stay in contracts.ts.

/** BE QuoteChargeCode: the only codes that take commercial evidence or offers. */
export const quoteChargeCodes = [
  'AIRFARE',
  'AIRPORT_HANDLING',
  'TERMINAL_HANDLING',
  'CUSTOMS_DECLARATION',
  'GOVERNMENT_DUTY',
  'INSURANCE',
  'ESCORT',
] as const;
export type QuoteChargeCode = (typeof quoteChargeCodes)[number];

export const chargeLabels: Record<QuoteChargeCode, string> = {
  AIRFARE: 'Airfare',
  AIRPORT_HANDLING: 'Airport handling',
  TERMINAL_HANDLING: 'Terminal handling',
  CUSTOMS_DECLARATION: 'Customs declaration',
  GOVERNMENT_DUTY: 'Government duties',
  INSURANCE: 'Insurance',
  ESCORT: 'Escort',
};

/** Unit of the matching quote line; an offer with another unit stays PENDING. */
export const chargeUnits: Record<QuoteChargeCode, string> = {
  AIRFARE: 'SHIPMENT',
  AIRPORT_HANDLING: 'HORSE_AIRPORT',
  TERMINAL_HANDLING: 'HORSE_AIRPORT',
  CUSTOMS_DECLARATION: 'DECLARATION',
  GOVERNMENT_DUTY: 'ASSESSMENT',
  INSURANCE: 'POLICY',
  ESCORT: 'PERSON_LEG',
};

/** Only an airfare offer may bundle these charges (and the stall). */
export const airfareInclusions = [
  'AIRPORT_HANDLING',
  'TERMINAL_HANDLING',
  'CUSTOMS_DECLARATION',
] as const satisfies readonly QuoteChargeCode[];

/** BE QuoteCommand, nested in every F06 mutation. */
export type QuoteCommand = { recordVersion: string; operationId: string };

export const bundleCoverages = ['ENTIRE_ROUTE', 'PARTIAL_ROUTE', 'UNKNOWN'] as const;
export type BundleCoverage = (typeof bundleCoverages)[number];
export const bundleCoverageLabels: Record<BundleCoverage, string> = {
  ENTIRE_ROUTE: 'Entire route',
  PARTIAL_ROUTE: 'Partial route',
  UNKNOWN: 'Unknown — needs review',
};

export type SupplierOfferInput = {
  revisionId: number;
  serviceCode: QuoteChargeCode;
  providerName: string;
  offerReference: string;
  unitCode: string;
  quantity: string;
  purchaseUnitPrice: string;
  retailUnitPrice: string;
  validUntil: string;
  evidenceFileKey: string;
  includesStall: boolean;
  includedCharges: QuoteChargeCode[];
  // Legacy callers may omit this. Missing coverage never means entire route.
  bundleCoverage?: BundleCoverage;
};

export const supplierOfferReceiptSchema = z.object({
  offerId: idSchema,
  recordVersion: versionSchema,
});
export type SupplierOfferReceipt = z.infer<typeof supplierOfferReceiptSchema>;

/** BE QuoteEvidence. PRICED needs quantity + exactly one source id. */
export type QuoteEvidence = {
  code: QuoteChargeCode;
  status: 'PRICED' | 'NOT_REQUIRED';
  quantity: string | null;
  tariffId: number | null;
  offerId: number | null;
  sourceReference: string;
  validUntil: string;
  reason: string;
};

// Exact decimal text. Quantity keeps 3 decimals, money 2; SQL DECIMAL(18,4)
// leaves 14 integer digits. Never parsed to float.
export const quantityPattern = /^\d{1,14}(\.\d{1,3})?$/;
export const moneyPattern = /^\d{1,14}(\.\d{1,2})?$/;
export const positive = (value: string) => /[1-9]/.test(value);

/** Exact sum of 2-decimal money strings using integer cents. */
export function sumMoney(values: string[]) {
  let cents = 0n;
  for (const v of values) {
    const [whole, frac = ''] = v.split('.');
    cents += BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
  }
  const text = cents.toString().padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

function futureDate(value: string, label: string, now: number) {
  if (!validOffsetDate(value)) return `${label}: choose a date and time.`;
  if (Date.parse(value) <= now) return `${label} must be in the future.`;
  return undefined;
}

export function validateOffer(input: SupplierOfferInput, now = Date.now()): FieldErrors {
  const e: FieldErrors = {};
  if (input.bundleCoverage !== undefined && !bundleCoverages.includes(input.bundleCoverage))
    e.bundleCoverage = 'Choose entire route, partial route or unknown.';
  if (!input.providerName.trim() || input.providerName.trim().length > 200)
    e.providerName = 'Enter the provider (1–200 characters).';
  if (!input.offerReference.trim() || input.offerReference.trim().length > 100)
    e.offerReference = 'Enter the offer reference (1–100 characters).';
  if (!quantityPattern.test(input.quantity) || !positive(input.quantity))
    e.quantity = 'Use a positive quantity with up to 3 decimals.';
  if (!moneyPattern.test(input.purchaseUnitPrice))
    e.purchaseUnitPrice = 'Use an amount with up to 2 decimals.';
  if (!moneyPattern.test(input.retailUnitPrice))
    e.retailUnitPrice = 'Use an amount with up to 2 decimals.';
  const until = futureDate(input.validUntil, 'Valid until', now);
  if (until) e.validUntil = until;
  if (!input.evidenceFileKey.trim() || input.evidenceFileKey.trim().length > 1024)
    e.evidenceFileKey = 'Enter the existing evidence reference (1–1024 characters).';
  if (input.serviceCode !== 'AIRFARE' && (input.includesStall || input.includedCharges.length))
    e.includedCharges = 'Only an airfare offer can include the stall or handling charges.';
  return e;
}

/** Evidence row rules; quoteValidUntil adds the "covers the quote" check. */
export function validateEvidence(
  row: QuoteEvidence,
  quoteValidUntil: string | null,
  now = Date.now(),
): FieldErrors {
  const e: FieldErrors = {};
  if (row.status === 'PRICED') {
    if (row.quantity === null || !quantityPattern.test(row.quantity) || !positive(row.quantity))
      e.quantity = 'Priced evidence needs a positive quantity (up to 3 decimals).';
    if ((row.tariffId === null) === (row.offerId === null))
      e.source = 'Choose exactly one source: a tariff ID or an offer ID.';
  } else if (row.quantity !== null || row.tariffId !== null || row.offerId !== null) {
    e.source = 'Not-required evidence has no quantity or price source.';
  }
  if (!row.sourceReference.trim() || row.sourceReference.length > 1000)
    e.sourceReference = 'Enter the evidence reference (1–1000 characters).';
  if (!row.reason.trim() || row.reason.length > 1000)
    e.reason = 'Enter the reason (1–1000 characters).';
  const until = futureDate(row.validUntil, 'Evidence valid until', now);
  if (until) e.validUntil = until;
  else if (quoteValidUntil && Date.parse(row.validUntil) < Date.parse(quoteValidUntil))
    e.validUntil = 'Evidence must stay valid at least until the quotation expires.';
  return e;
}

export type ScheduleRow = { paymentStage: string; amountDue: string; dueAt: string };
export type QuoteTermsInput = {
  validUntil: string;
  termsVersion: string;
  terms: string;
  cancellationTerms: string;
  schedule: ScheduleRow[];
};

/** Quote-level rules from QuotePrepareRequest; the BE stays authoritative. */
export function validateQuoteTerms(input: QuoteTermsInput, now = Date.now()): FieldErrors {
  const e: FieldErrors = {};
  const until = futureDate(input.validUntil, 'Valid until', now);
  if (until) e.validUntil = until;
  if (!input.termsVersion.trim() || input.termsVersion.trim().length > 50)
    e.termsVersion = 'Enter the terms version (1–50 characters).';
  if (!input.terms.trim() || input.terms.length > 10000)
    e.terms = 'Enter the terms (1–10000 characters).';
  if (!input.cancellationTerms.trim() || input.cancellationTerms.length > 10000)
    e.cancellationTerms = 'Enter the cancellation terms (1–10000 characters).';
  if (input.schedule.length < 1 || input.schedule.length > 12)
    e.schedule = 'Add between 1 and 12 payment stages.';
  input.schedule.forEach((row, i) => {
    const n = i + 1;
    if (!row.paymentStage.trim() || row.paymentStage.trim().length > 50)
      e[`stage${n}`] = `Stage ${n}: enter a name (1–50 characters).`;
    if (!moneyPattern.test(row.amountDue) || !positive(row.amountDue))
      e[`amount${n}`] = `Stage ${n}: use a positive amount with up to 2 decimals.`;
    const due = futureDate(row.dueAt, `Stage ${n} due date`, now);
    if (due) e[`due${n}`] = due;
  });
  return e;
}
