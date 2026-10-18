import type { FieldErrors } from '../../shared/lib/validation';
import type { ActionSpec } from './ActionForm';
import type { Overview, Refund } from './contracts';
import { managerPaymentsApi, type Bank, type RefundAction } from './manager-api';
import { cents, outstanding } from './money';
import {
  moneyField,
  reasonField,
  requireId,
  requireMoney,
  requirePast,
  requireProof,
  requireText,
} from './validation';

export function reconcileAction(orderId: number): ActionSpec {
  return {
    key: 'reconcile',
    title: 'Record a verified bank receipt',
    help: 'Record funds independently verified against bank evidence. A customer transfer report is not a received bank payment.',
    proof: true,
    initial: {
      amountReceived: '',
      currency: 'USD',
      recipientAccount: '',
      bankTransactionReference: '',
      postedAt: '',
      verificationSource: '',
      internalNotes: '',
    },
    fields: [
      { ...moneyField, name: 'amountReceived', label: 'Amount received (USD)' },
      { name: 'currency', label: 'Receipt currency', readonly: true },
      { name: 'recipientAccount', label: 'Receiving bank account', maxLength: 150 },
      { name: 'bankTransactionReference', label: 'Bank transaction reference', maxLength: 150 },
      {
        name: 'postedAt',
        label: 'Bank posted at',
        hint: 'ISO time with offset; no later than now.',
        maxLength: 40,
      },
      { name: 'verificationSource', label: 'Verification source', maxLength: 500 },
      {
        name: 'internalNotes',
        label: 'Internal notes (optional)',
        multiline: true,
        maxLength: 2000,
      },
    ],
    validate: (values) => {
      const errors: FieldErrors = {};
      requireMoney(errors, values, 'amountReceived');
      requirePast(errors, values, 'postedAt');
      requireProof(errors, values);
      requireText(errors, values, 'recipientAccount', 150);
      requireText(errors, values, 'bankTransactionReference', 150);
      requireText(errors, values, 'verificationSource', 500);
      if (values.currency !== 'USD') errors.currency = 'Only USD is supported.';
      if ((values.internalNotes?.length ?? 0) > 2000)
        errors.internalNotes = 'Use at most 2000 characters.';
      return errors;
    },
    send: (command, values) =>
      managerPaymentsApi.reconcile(orderId, command, {
        amountReceived: values.amountReceived,
        currency: 'USD',
        recipientAccount: values.recipientAccount,
        bankTransactionReference: values.bankTransactionReference,
        postedAt: values.postedAt,
        verificationSource: values.verificationSource,
        proofFileKey: values.proofFileKey,
        internalNotes: values.internalNotes || null,
      }),
  };
}
export function allocateAction(orderId: number, overview: Overview, bank: Bank): ActionSpec {
  return {
    key: `allocate-${bank.transactionId}`,
    title: 'Allocate received funds',
    help: 'Apply reconciled bank funds to an obligation. The available bank balance is checked across all allocations when saved.',
    initial: { transactionId: String(bank.transactionId), paymentRequestId: '', amount: '' },
    fields: [
      { name: 'transactionId', label: 'Bank receipt ID', readonly: true },
      {
        name: 'paymentRequestId',
        label: 'Payment obligation',
        options: overview.obligations.map((o) => ({
          value: String(o.paymentRequestId),
          label: `${o.paymentStage} — due ${o.amountDue} ${o.currency}, net paid ${o.paidAmount}`,
        })),
      },
      moneyField,
    ],
    validate: (values) => {
      const errors: FieldErrors = {};
      requireMoney(errors, values, 'amount');
      requireId(errors, values, 'paymentRequestId');
      const obligation = overview.obligations.find(
        (o) => o.paymentRequestId === Number(values.paymentRequestId),
      );
      if (!obligation) errors.paymentRequestId = 'Choose an obligation on this page.';
      const amount = cents(values.amount),
        received = cents(bank.amountReceived);
      const knownAllocated = overview.allocations
        .filter((a) => a.transactionId === bank.transactionId)
        .reduce((sum, a) => sum + (cents(a.amount) ?? 0n), 0n);
      if (bank.status !== 'RECONCILED')
        errors.transactionId = 'Only reconciled receipts can be allocated.';
      if (bank.currency !== 'USD' || (obligation && obligation.currency !== 'USD'))
        errors.amount = 'Both receipt and obligation must be in USD.';
      if (amount !== null && received !== null && amount > received - knownAllocated)
        errors.amount = 'The allocation exceeds the received amount.';
      if (obligation) {
        const remaining = outstanding(obligation.amountDue, obligation.paidAmount);
        if (remaining === null || (amount !== null && amount > remaining))
          errors.amount = 'The allocation exceeds the outstanding obligation.';
      }
      return errors;
    },
    send: (command, values) =>
      managerPaymentsApi.allocate(orderId, command, {
        transactionId: Number(values.transactionId),
        paymentRequestId: Number(values.paymentRequestId),
        amount: values.amount,
      }),
  };
}
export function rejectReportAction(orderId: number, reportId: number): ActionSpec {
  return {
    key: `reject-${reportId}`,
    title: 'Reject a transfer report',
    help: 'Record the review reason. The original report and evidence remain in history; no money is reversed by rejecting a report.',
    initial: { reportId: String(reportId), reason: '' },
    fields: [{ name: 'reportId', label: 'Transfer report ID', readonly: true }, reasonField],
    validate: (values) => {
      const errors: FieldErrors = {};
      requireText(errors, values, 'reason', 2000);
      return errors;
    },
    send: (command, values) =>
      managerPaymentsApi.rejectReport(orderId, Number(values.reportId), command, values.reason),
  };
}
export function refundDecisionAction(
  orderId: number,
  target: Refund,
  action: RefundAction,
  current: Refund | undefined,
): ActionSpec {
  const complete = action === 'COMPLETE';
  return {
    key: `refund-${target.refundId}-${action}`,
    title: complete
      ? 'Record a completed bank refund'
      : action === 'APPROVE'
        ? 'Approve a refund request'
        : 'Reject a refund request',
    help: complete
      ? 'Record a refund already made through the bank. This does not send money. Evidence, reference and a refund time after approval are required.'
      : 'This reviews the refund request. Approval does not perform a bank transfer.',
    proof: complete,
    initial: { refundId: String(target.refundId), bankRefundReference: '', refundedAt: '' },
    fields: [
      { name: 'refundId', label: 'Refund request ID', readonly: true },
      ...(complete
        ? [
            { name: 'bankRefundReference', label: 'Bank refund reference', maxLength: 150 },
            {
              name: 'refundedAt',
              label: 'Refunded at',
              hint: 'Offset time after approval, no later than now.',
              maxLength: 40,
            },
          ]
        : []),
    ],
    validate: (values) => {
      const errors: FieldErrors = {};
      if (!current || current.status !== (complete ? 'APPROVED' : 'REQUESTED'))
        errors.refundId = 'The refund is no longer in the required state. Reload and review.';
      if (complete) {
        requireText(errors, values, 'bankRefundReference', 150);
        requirePast(errors, values, 'refundedAt');
        requireProof(errors, values);
      }
      return errors;
    },
    send: (command, values) =>
      managerPaymentsApi.refundAction(orderId, Number(values.refundId), command, {
        action,
        bankRefundReference: complete ? values.bankRefundReference : null,
        proofFileKey: complete ? values.proofFileKey : null,
        refundedAt: complete ? values.refundedAt : null,
      }),
  };
}
export function reverseAction(orderId: number, bank: Bank): ActionSpec {
  return {
    key: `reverse-${bank.transactionId}`,
    title: 'Record a full bank reversal',
    help: 'Record an evidence-backed full reversal. History is retained. Pending or completed refunds may block reversal; partial reversal is not supported.',
    proof: true,
    initial: { transactionId: String(bank.transactionId), reason: '' },
    fields: [{ name: 'transactionId', label: 'Bank receipt ID', readonly: true }, reasonField],
    validate: (values) => {
      const errors: FieldErrors = {};
      requireText(errors, values, 'reason', 2000);
      requireProof(errors, values);
      if (bank.status !== 'RECONCILED') errors.transactionId = 'This receipt is already reversed.';
      return errors;
    },
    send: (command, values) =>
      managerPaymentsApi.reverse(orderId, Number(values.transactionId), command, {
        reason: values.reason,
        proofFileKey: values.proofFileKey,
      }),
  };
}
