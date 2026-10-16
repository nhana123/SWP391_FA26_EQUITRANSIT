import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  supplierOfferReceiptSchema,
  type QuoteCommand,
  type SupplierOfferInput,
} from './mutation-contracts';

// Dev2 mutation adapter, next to Dev1's read adapter in api.ts.
function orderPath(orderId: number) {
  if (!idSchema.safeParse(orderId).success) throw new ApiError(400, 'Invalid request ID.');
  return `/api/transport-orders/${orderId}`;
}

/** Flat command used by useCaseCommand; mapped to the BE nested shape. */
export type SupplierOfferCommand = SupplierOfferInput & QuoteCommand;

export const quoteMutationsApi = {
  // Purchase price is sent only here and never stored in a query cache.
  recordOffer: (orderId: number, { recordVersion, operationId, ...offer }: SupplierOfferCommand) =>
    request(`${orderPath(orderId)}/supplier-offers`, supplierOfferReceiptSchema, {
      method: 'POST',
      body: { command: { recordVersion, operationId }, ...offer },
    }),
};
