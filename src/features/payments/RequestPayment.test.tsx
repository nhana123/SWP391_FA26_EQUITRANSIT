import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { startSession } from '../../shared/api/session';
import { quotationsApi } from '../quotations/api';
import { quotation, pageOf } from '../quotations/testing';
import { managerPaymentsApi } from './manager-api';
import { testOverview } from './testing';
import { RequestPayment } from './RequestPayment';
import { quoteResponseSchema } from '../quotations/contracts';

vi.mock('../quotations/api', () => ({ quotationsApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('./manager-api', () => ({ managerPaymentsApi: { request: vi.fn() } }));
const accepted = {
  ...quotation,
  quote: { ...quotation.quote, status: 'ACCEPTED' as const },
  paymentSchedule: [{ ...quotation.paymentSchedule[0], scheduleId: 941 }],
};
beforeEach(() => {
  vi.resetAllMocks();
  startSession({ accessToken: 'test', tokenType: 'Bearer', role: 'MANAGER', expiresIn: 600 });
  vi.mocked(quotationsApi.list).mockResolvedValue(pageOf([accepted.quote]));
  vi.mocked(quotationsApi.get).mockResolvedValue(accepted);
  vi.mocked(managerPaymentsApi.request).mockResolvedValue({
    entityId: 77,
    recordVersion: '00000000000000a3',
  });
});
function mount(overview = testOverview()) {
  const refresh = vi.fn().mockResolvedValue(testOverview({ recordVersion: '00000000000000a3' }));
  const done = vi.fn();
  render(
    <MemoryRouter>
      <RequestPayment
        disabled={false}
        onEditingChange={vi.fn()}
        context={{
          orderId: 11,
          overview,
          readError: null,
          backTo: '/manager/requests',
          refresh,
          evidence: [],
          onUploaded: vi.fn(),
          onDone: done,
          onCancel: vi.fn(),
        }}
      />
    </MemoryRouter>,
  );
  return { user: userEvent.setup({ delay: null }), refresh, done };
}
it('keeps persisted schedule IDs through the safe quotation parser', () => {
  const parsed = quoteResponseSchema.parse({ ...accepted, supplierCost: 'secret' });
  expect(parsed.paymentSchedule[0].scheduleId).toBe(941);
  expect(parsed).not.toHaveProperty('supplierCost');
});
it('does not substitute a sequence number when an older server omits IDs', async () => {
  vi.mocked(quotationsApi.get).mockResolvedValue({
    ...accepted,
    paymentSchedule: quotation.paymentSchedule,
  });
  const { user } = mount();
  await user.click(screen.getByRole('button', { name: 'Load quotation installments' }));
  await screen.findByText(/Installment identifiers are unavailable/);
  expect(screen.getByRole('button', { name: 'Create payment request' })).toBeDisabled();
  expect(managerPaymentsApi.request).not.toHaveBeenCalled();
});
it('omits installments already requested in the loaded ledger', async () => {
  const overview = testOverview();
  const { user } = mount({
    ...overview,
    obligations: [{ ...overview.obligations[0], scheduleId: 941, quoteId: 31 }],
  });
  await user.click(screen.getByRole('button', { name: 'Load quotation installments' }));
  await screen.findByText(/already have payment requests/);
  expect(screen.getByRole('button', { name: 'Create payment request' })).toBeDisabled();
  expect(managerPaymentsApi.request).not.toHaveBeenCalled();
});
it('creates only the explicitly selected persisted installment and refreshes the ledger', async () => {
  const { user, refresh, done } = mount();
  await user.click(screen.getByRole('button', { name: 'Load quotation installments' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create payment request' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await user.selectOptions(screen.getByLabelText('Quotation installment'), '941');
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(managerPaymentsApi.request).toHaveBeenCalledWith(
    11,
    {
      recordVersion: accepted.recordVersion,
      operationId: expect.any(String),
    },
    { quoteId: 31, scheduleId: 941 },
  );
  expect(vi.mocked(managerPaymentsApi.request).mock.calls[0][1].operationId).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  expect(refresh).toHaveBeenCalledOnce();
});
it('requires a ledger reload after stale-version rejection before a new command', async () => {
  vi.mocked(managerPaymentsApi.request).mockRejectedValueOnce(
    new ApiError(409, 'Request changed.', 'ORDER_VERSION_CONFLICT'),
  );
  const { user, refresh } = mount();
  await user.click(screen.getByRole('button', { name: 'Load quotation installments' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create payment request' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await user.selectOptions(screen.getByLabelText('Quotation installment'), '941');
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await screen.findByRole('button', { name: 'Reload ledger and review' });
  expect(screen.getByRole('button', { name: 'Create payment request' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Reload ledger and review' }));
  await screen.findByText(/Current ledger loaded/);
  expect(refresh).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await waitFor(() => expect(managerPaymentsApi.request).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(managerPaymentsApi.request).mock.calls;
  expect(calls[1][1].recordVersion).toBe('00000000000000a3');
  expect(calls[1][1].operationId).not.toBe(calls[0][1].operationId);
});

it('reloads the quotation version before requesting a second installment', async () => {
  const installments = [
    accepted.paymentSchedule[0],
    { ...accepted.paymentSchedule[0], scheduleId: 942, sequenceNo: 2, paymentStage: 'BALANCE' },
  ];
  vi.mocked(quotationsApi.get)
    .mockResolvedValueOnce({ ...accepted, paymentSchedule: installments })
    .mockResolvedValueOnce({
      ...accepted,
      recordVersion: '00000000000000a3',
      paymentSchedule: installments,
    });
  const { user, done } = mount();
  await user.click(screen.getByRole('button', { name: 'Load quotation installments' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create payment request' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await user.selectOptions(screen.getByLabelText('Quotation installment'), '941');
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Create payment request' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Load quotation installments' }));
  await waitFor(() => expect(quotationsApi.get).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await user.selectOptions(screen.getByLabelText('Quotation installment'), '942');
  await user.click(screen.getByRole('button', { name: 'Create payment request' }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(2));

  const calls = vi.mocked(managerPaymentsApi.request).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][1].recordVersion).toBe(accepted.recordVersion);
  expect(calls[1][1].recordVersion).toBe('00000000000000a3');
  expect(calls[1][2]).toEqual({ quoteId: accepted.quote.quoteId, scheduleId: 942 });
  expect(calls[1][1].operationId).not.toBe(calls[0][1].operationId);
});
