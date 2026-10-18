import { Link } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';

// Source-backed F07 codes. Do not echo bank account/notes/proof bytes in errors.
const help: Record<string, string> = {
  PAYMENT_SCHEMA_PENDING: 'Deployment blocked: payment migration 007 is required.',
  ACCEPTED_QUOTE_REQUIRED: 'An accepted quotation for the current revision is required.',
  ORDER_VERSION_CONFLICT: 'The order changed. Reload the ledger and review your input.',
  PAYMENT_LEDGER_BUSY: 'The ledger is busy. Retry the same action.',
  PAYMENT_RETRY_CONFLICT:
    'This operation ID has different input. Reload and review before a new action.',
  PAYMENT_REQUEST_EXISTS: 'A payment request already exists for this installment.',
  BANK_REFERENCE_DUPLICATE: 'This receiving account and bank reference have already been recorded.',
  PAYMENT_CURRENCY: 'Both the obligation and bank receipt must be in USD.',
  PAYMENT_OVER_ALLOCATION: 'The bank receipt has insufficient unallocated funds.',
  PAYMENT_OVER_OBLIGATION: 'The allocation exceeds the outstanding obligation.',
  REFUND_OVER_ALLOCATION: 'The refundable balance is insufficient, including reserved refunds.',
  BANK_NOT_RECONCILED: 'This bank receipt is not available for allocation or refund.',
  REVERSAL_REFUND_CONFLICT:
    'This transaction has refunds. Resolve them through the accounting process before reversal.',
  REFUND_STATE: 'The refund changed state. Reload and review the permitted action.',
  REFUND_PROOF_REQUIRED: 'Completion requires a bank refund reference, proof and refund time.',
  REFUND_BANK_DUPLICATE: 'This bank refund reference has already been used.',
  REFUND_TIME_BEFORE_APPROVAL: 'The refund time cannot precede approval.',
  PAYMENT_FUTURE_TRANSFER: 'Transfer time cannot be in the future.',
  PAYMENT_PROOF_TYPE: 'Use a PNG or JPEG image.',
  PAYMENT_PROOF_SIZE: 'Evidence must be between 1 byte and 5 MiB.',
  PAYMENT_PROOF_CONTENT:
    'The evidence must be a valid PNG/JPEG image of at most 20 million pixels.',
  PAYMENT_PROOF_UNAVAILABLE: 'This evidence is unavailable to your account for this order.',
  PAYMENT_PROOF_INVALID: 'This evidence key is invalid.',
};
export const accessDenied = (error: unknown) =>
  error instanceof ApiError && [401, 403, 404].includes(error.status);
export function PaymentError({ error, backTo }: { error: unknown; backTo?: string }) {
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  const messages: Record<number, string> = {
    400: 'Check the highlighted payment fields.',
    401: 'Your session has expired.',
    403: 'You do not have access to this payment action.',
    404: 'This payment record is unavailable.',
    409: 'Payment conditions changed or evidence is incomplete. Reload and review.',
    422: 'The payment action is blocked. Review its evidence and current ledger state.',
    503: 'Deployment blocked: payment migration 007 is required.',
  };
  return (
    <div role="alert" className="notice error">
      <p>
        {api?.code && Object.hasOwn(help, api.code)
          ? help[api.code]
          : messages[api?.status ?? 0] ||
            'The payment service could not complete this request. Your input is kept.'}
      </p>
      {backTo && accessDenied(error) && <Link to={backTo}>Back to requests</Link>}
    </div>
  );
}
