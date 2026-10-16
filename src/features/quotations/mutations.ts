import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { quoteResponseSchema } from './contracts';
import {
  supplierOfferReceiptSchema,
  type QuoteCommand,
  type QuoteEvidence,
  type SupplierOfferInput,
} from './mutation-contracts';

// Dev2 mutation adapter, next to Dev1's read adapter in api.ts.
function orderPath(orderId: number) {
  if (!idSchema.safeParse(orderId).success) throw new ApiError(400, 'Invalid request ID.');
  return `/api/transport-orders/${orderId}`;
}

/** Flat command used by useCaseCommand; mapped to the BE nested shape. */
export type SupplierOfferCommand = SupplierOfferInput & QuoteCommand;

/** BE QuotePrepareRequest fields (schedule sequence numbers are 1..n). */
export type QuotePrepareInput = {
  revisionId: number;
  validUntil: string;
  termsVersion: string;
  terms: string;
  cancellationTerms: string;
  paymentSchedule: { sequenceNo: number; paymentStage: string; amountDue: string; dueAt: string }[];
  assessments: QuoteEvidence[];
};
export type QuotePrepareCommand = QuotePrepareInput & QuoteCommand;

/** BE QuoteAction. Manager: APPROVE/ISSUE/REJECT/EXPIRE; customer actions are #60. */
export type QuoteAction = 'APPROVE' | 'ISSUE' | 'ACCEPT' | 'REJECT' | 'EXPIRE';
export type QuoteActionCommand = QuoteCommand & { action: QuoteAction };

export const quoteMutationsApi = {
  // QuoteActionRequest has no reason field: nothing extra is sent.
  act: (
    orderId: number,
    quoteId: number,
    { recordVersion, operationId, action }: QuoteActionCommand,
  ) => {
    if (!idSchema.safeParse(quoteId).success) throw new ApiError(400, 'Invalid quotation ID.');
    return request(`${orderPath(orderId)}/quotes/${quoteId}/actions`, quoteResponseSchema, {
      method: 'POST',
      body: { command: { recordVersion, operationId }, action },
    });
  },
  // Every preparation is a new version; there is no in-place quote update.
  prepare: (orderId: number, { recordVersion, operationId, ...input }: QuotePrepareCommand) =>
    request(`${orderPath(orderId)}/quotes`, quoteResponseSchema, {
      method: 'POST',
      body: { command: { recordVersion, operationId }, ...input },
    }),
  // Purchase price is sent only here and never stored in a query cache.
  recordOffer: (orderId: number, { recordVersion, operationId, ...offer }: SupplierOfferCommand) =>
    request(`${orderPath(orderId)}/supplier-offers`, supplierOfferReceiptSchema, {
      method: 'POST',
      body: { command: { recordVersion, operationId }, ...offer },
    }),
};
