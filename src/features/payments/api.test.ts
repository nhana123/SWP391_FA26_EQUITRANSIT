import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { paymentsApi } from './api';
import { managerPaymentsApi } from './manager-api';
import { startSession } from '../../shared/api/session';
import { testBank, testOverview, proofKey, pngBase64 } from './testing';
import type { Command } from './contracts';

const command: Command = {
  recordVersion: '00000000000000a1',
  operationId: '54ee52b8-5df5-49ac-b681-f66122b6f767',
};
beforeEach(() =>
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' }),
);
afterEach(() => vi.unstubAllGlobals());
function respond(body: unknown) {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('uses independently bounded paging with authorization and strips private response data', async () => {
  const raw = testOverview();
  const fetch = respond({
    ...raw,
    internalNotes: 'private',
    recipientAccount: 'private',
    reports: [{ ...raw.reports[0], internalNotes: 'private' }],
  });
  const result = await paymentsApi.overview(11, 2);
  expect(fetch.mock.calls[0][0]).toContain('/api/transport-orders/11/payments?page=2&size=20');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only');
  expect(result).not.toHaveProperty('totalElements');
  expect(JSON.stringify(result)).not.toContain('private');
});
const cases: {
  name: string;
  path: string;
  input: Record<string, unknown>;
  send: (input: never) => Promise<unknown>;
}[] = [
  {
    name: 'request',
    path: '/requests',
    input: { quoteId: 301, scheduleId: 401 },
    send: (input) => managerPaymentsApi.request(11, command, input),
  },
  {
    name: 'report',
    path: '/reports',
    input: {
      paymentRequestId: 101,
      reportedAmount: '50.00',
      reportedCurrency: 'USD',
      transferredAt: '2020-01-01T00:00:00Z',
      bankReference: 'TEST-BANK',
      proofFileKey: proofKey,
    },
    send: (input) => paymentsApi.report(11, command, input),
  },
  {
    name: 'reconcile',
    path: '/transactions',
    input: {
      amountReceived: '50.00',
      currency: 'USD',
      recipientAccount: 'TEST-ACCOUNT',
      bankTransactionReference: 'TEST-BANK',
      postedAt: '2020-01-01T00:00:00Z',
      verificationSource: 'TEST statement',
      proofFileKey: proofKey,
      internalNotes: null,
    },
    send: (input) => managerPaymentsApi.reconcile(11, command, input),
  },
  {
    name: 'allocate',
    path: '/allocations',
    input: { transactionId: 601, paymentRequestId: 101, amount: '50.00' },
    send: (input) => managerPaymentsApi.allocate(11, command, input),
  },
  {
    name: 'refund',
    path: '/refunds',
    input: { allocationId: 501, amount: '5.00', reason: 'TEST reason' },
    send: (input) => paymentsApi.refund(11, command, input),
  },
  {
    name: 'refund action',
    path: '/refunds/701/actions',
    input: {
      action: 'COMPLETE',
      bankRefundReference: 'TEST-REFUND',
      proofFileKey: proofKey,
      refundedAt: '2020-01-01T00:00:00Z',
    },
    send: (input) => managerPaymentsApi.refundAction(11, 701, command, input),
  },
  {
    name: 'reverse',
    path: '/transactions/601/reversal',
    input: { reason: 'TEST reversal', proofFileKey: proofKey },
    send: (input) => managerPaymentsApi.reverse(11, 601, command, input),
  },
];
it.each(cases)(
  'sends exact nested command and decimal text for $name',
  async ({ path, input, send }) => {
    const fetch = respond({ entityId: 99, recordVersion: '00000000000000a2' });
    await send(input as never);
    expect(fetch.mock.calls[0][0]).toContain(`/payments${path}`);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ command, ...input });
  },
);
it('rejects a report with a reason only, retaining the original evidence contract', async () => {
  const fetch = respond({ entityId: 201, recordVersion: '00000000000000a2' });
  await managerPaymentsApi.rejectReport(11, 201, command, 'TEST reason');
  expect(fetch.mock.calls[0][0]).toContain('/reports/201/reject');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ command, reason: 'TEST reason' });
});
it('uploads JSON raw base64 and retrieves protected proof without persisting image data', async () => {
  const fetch = respond({ fileKey: proofKey, mediaType: 'image/png', size: 69 });
  await paymentsApi.uploadProof(11, command, { mediaType: 'image/png', contentBase64: pngBase64 });
  const request = fetch.mock.calls[0][1];
  expect(request.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(request.body)).toEqual({
    command,
    mediaType: 'image/png',
    contentBase64: pngBase64,
  });
  expect(request.body).not.toContain('data:');
  respond({ fileKey: proofKey, mediaType: 'image/png', contentBase64: pngBase64 });
  expect((await paymentsApi.proof(11, proofKey)).fileKey).toBe(proofKey);
});
it('gets Manager-only bank status without bank account or notes', async () => {
  const fetch = respond({ ...testBank(), internalNotes: 'private', recipientAccount: 'private' });
  const result = await managerPaymentsApi.bank(11, 601);
  expect(fetch.mock.calls[0][0]).toContain('/payments/transactions/601');
  expect(result).toEqual(testBank());
});
