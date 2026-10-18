import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { quoteMutationsApi } from './mutations';
import { bundleCoverages, type SupplierOfferInput } from './mutation-contracts';
import { startSession } from '../../shared/api/session';
import { quoteResponseSchema } from './contracts';
import { quotation } from './testing';

const offer: SupplierOfferInput = {
  revisionId: 7,
  serviceCode: 'AIRFARE',
  providerName: 'Test supplier',
  offerReference: 'TEST-74',
  unitCode: 'SHIPMENT',
  quantity: '1.000',
  purchaseUnitPrice: '812.20',
  retailUnitPrice: '932.40',
  validUntil: '2099-01-01T00:00:00Z',
  evidenceFileKey: 'test-only/evidence',
  includesStall: true,
  includedCharges: ['AIRPORT_HANDLING'],
};
const command = {
  recordVersion: '00000000000000c1',
  operationId: '61ad71f7-779c-482b-90eb-963d516caaf2',
};
beforeEach(() =>
  startSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresIn: 60,
    role: 'COORDINATOR',
  }),
);
afterEach(() => vi.unstubAllGlobals());

it.each(bundleCoverages)(
  'sends the exact %s enum with a nested command and preserves decimal text',
  async (bundleCoverage) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ offerId: 55, recordVersion: '00000000000000c2' })),
      );
    vi.stubGlobal('fetch', fetch);
    await quoteMutationsApi.recordOffer(9, { ...command, ...offer, bundleCoverage });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(fetch.mock.calls[0][0]).toContain('/api/transport-orders/9/supplier-offers');
    expect(body).toEqual({ command, ...offer, bundleCoverage });
    expect(body).not.toHaveProperty('autoWide');
    expect(body).not.toHaveProperty('sharingCode');
  },
);
it('allows a legacy caller to omit coverage without treating it as ENTIRE_ROUTE', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ offerId: 55, recordVersion: '00000000000000c2' })),
    );
  vi.stubGlobal('fetch', fetch);
  await quoteMutationsApi.recordOffer(9, { ...command, ...offer });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('bundleCoverage');
});
it('reads included/pending quote snapshots without calculating a zero or retaining purchase evidence', () => {
  const result = quoteResponseSchema.parse({
    ...quotation,
    quote: { ...quotation.quote, total: null },
    items: [
      {
        ...quotation.items[0],
        pricingStatus: 'INCLUDED',
        quantity: null,
        unitRate: null,
        amount: null,
        purchaseUnitPrice: 'private',
      },
      {
        ...quotation.items[0],
        pricingStatus: 'PENDING',
        quantity: null,
        unitRate: null,
        amount: null,
        blockers: ['BUNDLE_REVIEW_REQUIRED'],
      },
    ],
    blockers: ['BUNDLE_REVIEW_REQUIRED'],
    bundleCoverage: 'UNKNOWN',
    purchaseUnitPrice: 'private',
  });
  expect(result.quote.total).toBeNull();
  expect(result.items[0].amount).toBeNull();
  expect(result.items[1].blockers).toEqual(['BUNDLE_REVIEW_REQUIRED']);
  expect(JSON.stringify(result)).not.toContain('private');
});
