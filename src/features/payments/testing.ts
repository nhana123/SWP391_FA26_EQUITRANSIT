import type { Overview } from './contracts';
import type { Bank } from './manager-api';
export const proofKey = '54ee52b8-5df5-49ac-b681-f66122b6f768';
export const secondProofKey = '54ee52b8-5df5-49ac-b681-f66122b6f769';
export const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
// Test data only; not imported by production modules.
export const testOverview = (patch: Partial<Overview> = {}): Overview => ({
  recordVersion: '00000000000000a1',
  page: 0,
  size: 20,
  obligations: [
    {
      paymentRequestId: 101,
      scheduleId: 401,
      quoteId: 301,
      paymentStage: 'DEPOSIT',
      amountDue: '100.00',
      currency: 'USD',
      dueAt: '2020-01-01T00:00:00Z',
      paidAmount: '20.00',
    },
  ],
  reports: [
    {
      reportId: 201,
      paymentRequestId: 101,
      reportedAmount: '50.00',
      reportedCurrency: 'USD',
      transferredAt: '2020-01-01T00:00:00Z',
      proofFileKey: proofKey,
      status: 'SUBMITTED',
    },
  ],
  allocations: [{ allocationId: 501, transactionId: 601, paymentRequestId: 101, amount: '20.00' }],
  refunds: [
    {
      refundId: 701,
      allocationId: 501,
      amount: '5.00',
      reason: 'Test refund',
      status: 'REQUESTED',
      refundedAt: null,
    },
  ],
  ...patch,
});
export const testBank = (patch: Partial<Bank> = {}): Bank => ({
  transactionId: 601,
  amountReceived: '150.00',
  currency: 'USD',
  status: 'RECONCILED',
  postedAt: '2020-01-01T00:00:00Z',
  ...patch,
});
