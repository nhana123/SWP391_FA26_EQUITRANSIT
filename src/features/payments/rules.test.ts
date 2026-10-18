import { expect, it } from 'vitest';
import { cents, moneyText, outstanding, positiveMoney } from './money';
import { refundAction, reportAction } from './customer-actions';
import { allocateAction, refundDecisionAction, reconcileAction } from './manager-actions';
import { testBank, testOverview, proofKey } from './testing';

it('uses integer cents for large amounts and fractional differences', () => {
  expect(cents('9999999999999999.99')).toBe(999999999999999999n);
  expect(outstanding('100.00', '99.99')).toBe(1n);
  expect(moneyText(outstanding('0.30', '0.10')!)).toBe('0.20');
  expect(outstanding('unavailable', '0')).toBeNull();
});
it.each(['0', '0.00', '-1', '1e2', '1.001', '10000000000000000', 'NaN'])(
  'rejects unsupported payment amount %s',
  (value) => expect(positiveMoney(value)).toBe(false),
);
it('blocks over-allocation against net obligation and known bank use', () => {
  const data = testOverview(),
    spec = allocateAction(11, data, testBank());
  expect(
    spec.validate({ transactionId: '601', paymentRequestId: '101', amount: '80.01' }),
  ).toHaveProperty('amount');
  expect(spec.validate({ transactionId: '601', paymentRequestId: '101', amount: '80.00' })).toEqual(
    {},
  );
  const used = testOverview({ allocations: [{ ...data.allocations[0], amount: '140.00' }] });
  expect(
    allocateAction(11, used, testBank()).validate({
      transactionId: '601',
      paymentRequestId: '101',
      amount: '10.01',
    }),
  ).toHaveProperty('amount');
});
it('does not allocate reversed or foreign-currency bank receipts', () => {
  const input = { transactionId: '601', paymentRequestId: '101', amount: '1.00' };
  expect(
    allocateAction(11, testOverview(), testBank({ status: 'REVERSED' })).validate(input),
  ).toHaveProperty('transactionId');
  expect(
    allocateAction(11, testOverview(), testBank({ currency: 'EUR' })).validate(input),
  ).toHaveProperty('amount');
});
it('reserves visible requested/approved/completed refunds and excludes rejected ones', () => {
  const data = testOverview();
  const input = { allocationId: '501', amount: '15.01', reason: 'TEST reason' };
  expect(refundAction(11, data.allocations, data.refunds).validate(input)).toHaveProperty('amount');
  expect(
    refundAction(11, data.allocations, [{ ...data.refunds[0], status: 'REJECTED' }]).validate(
      input,
    ),
  ).toEqual({});
});
it('requires approved state and actual completion evidence', () => {
  const target = testOverview().refunds[0];
  const spec = refundDecisionAction(11, target, 'COMPLETE', target);
  expect(
    spec.validate({ refundId: '701', bankRefundReference: '', refundedAt: '', proofFileKey: '' }),
  ).toHaveProperty('refundId');
  const approved = { ...target, status: 'APPROVED' as const };
  expect(
    refundDecisionAction(11, approved, 'COMPLETE', approved).validate({
      refundId: '701',
      bankRefundReference: 'TEST',
      refundedAt: '2020-01-01T00:00:00Z',
      proofFileKey: proofKey,
    }),
  ).toEqual({});
});
it('keeps transfer claims independent, rejects future time and requires protected proof', () => {
  const input = {
    paymentRequestId: '101',
    reportedAmount: '150.00',
    reportedCurrency: 'USD',
    transferredAt: '2020-01-01T00:00:00Z',
    bankReference: 'TEST',
    proofFileKey: proofKey,
  };
  expect(reportAction(11, testOverview()).validate(input)).toEqual({}); // a report can describe an erroneous overpayment without becoming money
  expect(
    reportAction(11, testOverview()).validate({
      ...input,
      transferredAt: '2099-01-01T00:00:00Z',
      proofFileKey: 'https://example.invalid/proof',
    }),
  ).toHaveProperty('proofFileKey');
  expect(
    reportAction(11, testOverview()).validate({ ...input, transferredAt: '2099-01-01T00:00:00Z' }),
  ).toHaveProperty('transferredAt');
});
it('requires independent bank verification fields', () => {
  expect(
    reconcileAction(11).validate({
      amountReceived: '50.00',
      currency: 'USD',
      recipientAccount: '',
      bankTransactionReference: '',
      postedAt: '2020-01-01T00:00:00Z',
      verificationSource: '',
      proofFileKey: proofKey,
    }),
  ).toHaveProperty('verificationSource');
});
