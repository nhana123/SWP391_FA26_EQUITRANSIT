import type { FieldErrors } from '../../shared/lib/validation';
import { paymentsApi } from './api';
import type { ActionSpec } from './ActionForm';
import type { Allocation, Overview, Refund } from './contracts';
import { cents } from './money';
import {
  moneyField,
  reasonField,
  requireId,
  requireMoney,
  requirePast,
  requireProof,
  requireText,
} from './validation';

export function reportAction(orderId: number, overview: Overview): ActionSpec {
  return {
    key: 'report',
    title: 'Report a bank transfer',
    help: 'This records your transfer report. Funds are recognized only after Manager verification and allocation.',
    proof: true,
    initial: {
      paymentRequestId: '',
      reportedCurrency: 'USD',
      reportedAmount: '',
      transferredAt: '',
      bankReference: '',
    },
    fields: [
      {
        name: 'paymentRequestId',
        label: 'Payment obligation',
        options: overview.obligations
          .filter((o) => o.currency === 'USD')
          .map((o) => ({
            value: String(o.paymentRequestId),
            label: `${o.paymentStage} — ${o.amountDue} USD`,
          })),
      },
      { name: 'reportedCurrency', label: 'Reported currency', readonly: true },
      { name: 'reportedAmount', label: 'Amount transferred (USD)', money: true, maxLength: 19 },
      {
        name: 'transferredAt',
        label: 'Transferred at',
        dateTime: true,
      },
      { name: 'bankReference', label: 'Bank transfer reference', maxLength: 150 },
    ],
    validate: (values) => {
      const errors: FieldErrors = {};
      requireId(errors, values, 'paymentRequestId');
      requireMoney(errors, values, 'reportedAmount');
      requirePast(errors, values, 'transferredAt');
      requireProof(errors, values);
      requireText(errors, values, 'bankReference', 150);
      if (values.reportedCurrency !== 'USD') errors.reportedCurrency = 'Only USD is supported.';
      if (
        !overview.obligations.some(
          (o) => o.paymentRequestId === Number(values.paymentRequestId) && o.currency === 'USD',
        )
      )
        errors.paymentRequestId = 'Choose a USD obligation on the current page.';
      return errors;
    },
    send: (command, values) =>
      paymentsApi.report(orderId, command, {
        paymentRequestId: Number(values.paymentRequestId),
        reportedAmount: values.reportedAmount,
        reportedCurrency: 'USD',
        transferredAt: values.transferredAt,
        bankReference: values.bankReference,
        proofFileKey: values.proofFileKey,
      }),
  };
}
export function refundAction(
  orderId: number,
  allocations: Allocation[],
  refunds: Refund[],
): ActionSpec {
  return {
    key: 'refund',
    title: 'Request a refund',
    help: 'This requests a refund against an allocation. Reserved and completed refunds affect the available balance, which is checked before saving.',
    initial: { allocationId: '', amount: '', reason: '' },
    fields: [
      {
        name: 'allocationId',
        label: 'Payment allocation',
        options: allocations.map((a) => ({
          value: String(a.allocationId),
          label: `Allocation ${a.allocationId} — ${a.amount} USD`,
        })),
      },
      moneyField,
      reasonField,
    ],
    validate: (values) => {
      const errors: FieldErrors = {};
      requireId(errors, values, 'allocationId');
      requireMoney(errors, values, 'amount');
      requireText(errors, values, 'reason', 2000);
      const allocation = allocations.find((a) => a.allocationId === Number(values.allocationId));
      if (!allocation) errors.allocationId = 'Choose an allocation on this page.';
      else {
        const amount = cents(values.amount);
        const gross = cents(allocation.amount);
        const reserved = refunds
          .filter((r) => r.allocationId === allocation.allocationId && r.status !== 'REJECTED')
          .reduce((sum, r) => sum + (cents(r.amount) ?? 0n), 0n);
        const maximum = gross === null ? null : gross - reserved;
        if (amount !== null && maximum !== null && amount > maximum)
          errors.amount =
            'The refund exceeds the allocation after known pending or completed refunds.';
      }
      return errors;
    },
    send: (command, values) =>
      paymentsApi.refund(orderId, command, {
        allocationId: Number(values.allocationId),
        amount: values.amount,
        reason: values.reason,
      }),
  };
}
