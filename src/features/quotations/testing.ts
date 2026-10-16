// Isolated fixtures for tests only. Never import into application runtime.
import type { QuotePage, QuoteResponse, QuoteSummary } from './contracts';
export const summary: QuoteSummary = {
  quoteId: 31,
  revisionId: 7,
  quoteNumber: 'Q-9-2',
  version: 2,
  status: 'ISSUED',
  total: '1234.50',
  validUntil: '2030-02-01T12:00:00Z',
};
export const quotation: QuoteResponse = {
  quote: summary,
  recordVersion: '00000000000000a2',
  currency: 'USD',
  termsVersion: 'TEST-TERMS-2',
  terms: 'Captured quotation terms.\nSecond line.',
  cancellationTerms: 'Captured cancellation terms.',
  issuedAt: '2030-01-01T10:00:00Z',
  acceptedAt: null,
  items: [
    {
      code: 'ROAD_TRANSPORT',
      costGroup: 'TRANSPORTATION',
      description: 'Captured road transport',
      unit: 'KM',
      quantity: '100.125',
      unitRate: '2.00',
      amount: '200.25',
      pricingStatus: 'PRICED',
      blockers: [],
    },
  ],
  paymentSchedule: [
    { sequenceNo: 1, paymentStage: 'DEPOSIT', amountDue: '1234.50', dueAt: '2030-01-15T10:00:00Z' },
  ],
  blockers: [],
};
export const pageOf = (
  items: QuoteSummary[] = [summary],
  page = 0,
  size = 20,
  totalElements = items.length,
): QuotePage => ({ items, page, size, totalElements });
