import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { getSession, startSession } from '../../shared/api/session';
import { queryClient } from '../../shared/api/query';
import { PaymentsPage, PaymentLink } from './pages';
import { paymentsApi, paymentKeys } from './api';
import { managerPaymentsApi } from './manager-api';
import { testOverview, testBank } from './testing';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  paymentsApi: {
    overview: vi.fn(),
    report: vi.fn(),
    refund: vi.fn(),
    proof: vi.fn(),
    uploadProof: vi.fn(),
  },
}));
vi.mock('./manager-api', async (original) => ({
  ...(await original<typeof import('./manager-api')>()),
  managerPaymentsApi: {
    request: vi.fn(),
    bank: vi.fn(),
    reconcile: vi.fn(),
    allocate: vi.fn(),
    refundAction: vi.fn(),
    rejectReport: vi.fn(),
    reverse: vi.fn(),
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' });
  vi.mocked(paymentsApi.overview).mockResolvedValue(testOverview());
  vi.mocked(managerPaymentsApi.bank).mockResolvedValue(testBank());
});
function mount(
  role: 'CUSTOMER' | 'MANAGER' | 'SPECIALIST' | 'COORDINATOR' | 'DRIVER' = 'CUSTOMER',
) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`/${role === 'MANAGER' ? 'manager' : 'customer'}/requests/11/payments`]}
      >
        <Routes>
          <Route path="/:area/requests/:id/payments" element={<PaymentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
it('shows server net paid, claims and pending refunds without Manager controls or local PAID flags', async () => {
  mount();
  const obligations = await screen.findByRole('table', { name: 'Payment obligations' });
  expect(within(obligations).getByText('20.00 USD')).toBeInTheDocument();
  expect(within(obligations).getByText('80.00 USD')).toBeInTheDocument();
  expect(screen.getByText('Reported — awaiting verification')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Refunds' })).toHaveTextContent('REQUESTED');
  expect(screen.queryByRole('button', { name: 'Record a verified bank receipt' })).toBeNull();
  expect(screen.queryByText('PAID')).toBeNull();
  expect(managerPaymentsApi.bank).not.toHaveBeenCalled();
});
it.each(['SPECIALIST', 'COORDINATOR', 'DRIVER'] as const)(
  'does not fetch financial data for %s',
  async (role) => {
    mount(role);
    expect(await screen.findByText(/Only the owning Customer/)).toBeInTheDocument();
    expect(paymentsApi.overview).not.toHaveBeenCalled();
  },
);
it.each([403, 404, 503])('renders %s safely without a false empty ledger', async (status) => {
  vi.mocked(paymentsApi.overview).mockRejectedValue(new ApiError(status, 'Unavailable.'));
  mount();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText('No payment obligations on this page.')).toBeNull();
});
it('pages each collection without inventing totals and allows returning from an empty page', async () => {
  vi.mocked(paymentsApi.overview).mockImplementation(async (_order, page) =>
    page === 0
      ? testOverview({ size: 1 })
      : testOverview({ size: 1, page, obligations: [], reports: [], allocations: [], refunds: [] }),
  );
  const user = mount();
  await screen.findByRole('table', { name: 'Payment obligations' });
  await user.click(screen.getByRole('button', { name: 'Next ledger page' }));
  await screen.findByText('No payment obligations on this page.');
  expect(screen.getByText('Ledger page 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next ledger page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous ledger page' })).toBeEnabled();
  expect(paymentsApi.overview).toHaveBeenCalledWith(11, 1, expect.any(AbortSignal));
});
it('keeps a report form mounted on background 503 and recovers through explicit ledger reload', async () => {
  const user = mount();
  await screen.findByRole('table', { name: 'Payment obligations' });
  await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
  await user.type(screen.getByLabelText('Amount transferred (USD)'), '50.00');
  vi.mocked(paymentsApi.overview).mockRejectedValue(
    new ApiError(503, 'Schema pending.', 'PAYMENT_SCHEMA_PENDING'),
  );
  await act(async () => {
    await queryClient.invalidateQueries({
      queryKey: paymentKeys.all(getSession()!.generation, 'CUSTOMER', 11),
    });
  });
  await screen.findAllByText(/Deployment blocked/);
  expect(screen.getByLabelText('Amount transferred (USD)')).toHaveValue('50.00');
  expect(
    within(screen.getByRole('form')).getByRole('button', {
      name: 'Report a bank transfer',
    }),
  ).toBeDisabled();
  vi.mocked(paymentsApi.overview).mockResolvedValue(
    testOverview({ recordVersion: '00000000000000a2' }),
  );
  await user.click(screen.getByRole('button', { name: 'Reload ledger and review' }));
  await screen.findByText(/Current ledger loaded/);
  expect(paymentsApi.report).not.toHaveBeenCalled();
});
it('blocks request creation rather than substituting sequenceNo for an unavailable schedule ID', async () => {
  mount('MANAGER');
  const button = await screen.findByRole('button', { name: 'Create payment request' });
  expect(button).toBeDisabled();
  expect(managerPaymentsApi.request).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Load quotation installments' })).toBeEnabled();
});
it('looks up a real bank receipt and allocates only after an explicit Manager action', async () => {
  vi.mocked(managerPaymentsApi.allocate).mockResolvedValue({
    entityId: 502,
    recordVersion: '00000000000000a2',
  });
  const user = mount('MANAGER');
  await screen.findByRole('table', { name: 'Payment obligations' });
  await user.selectOptions(screen.getByLabelText('Known bank receipt'), '601');
  await user.click(screen.getByRole('button', { name: 'Load bank receipt' }));
  await user.click(await screen.findByRole('button', { name: 'Allocate received funds' }));
  expect(managerPaymentsApi.allocate).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText('Payment obligation'), '101');
  await user.type(screen.getByLabelText('Amount (USD)'), '30.00');
  await user.click(
    within(screen.getByRole('form')).getByRole('button', {
      name: 'Allocate received funds',
    }),
  );
  await waitFor(() =>
    expect(managerPaymentsApi.allocate).toHaveBeenCalledWith(
      11,
      { recordVersion: '00000000000000a1', operationId: expect.any(String) },
      { transactionId: 601, paymentRequestId: 101, amount: '30.00' },
    ),
  );
});
it('allows only REQUESTED refund approval and sends no premature bank completion fields', async () => {
  vi.mocked(managerPaymentsApi.refundAction).mockResolvedValue({
    entityId: 701,
    recordVersion: '00000000000000a2',
  });
  const user = mount('MANAGER');
  await user.click(await screen.findByRole('button', { name: 'Approve refund 701' }));
  expect(screen.queryByLabelText('Bank refund reference')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Approve a refund request' }));
  await waitFor(() =>
    expect(managerPaymentsApi.refundAction).toHaveBeenCalledWith(
      11,
      701,
      { recordVersion: '00000000000000a1', operationId: expect.any(String) },
      { action: 'APPROVE', bankRefundReference: null, proofFileKey: null, refundedAt: null },
    ),
  );
});
it('exposes completion only for an approved refund and requires actual evidence', async () => {
  const data = testOverview();
  vi.mocked(paymentsApi.overview).mockResolvedValue({
    ...data,
    refunds: [{ ...data.refunds[0], status: 'APPROVED' }],
  });
  const user = mount('MANAGER');
  await user.click(await screen.findByRole('button', { name: 'Record refund completion 701' }));
  await user.click(screen.getByRole('button', { name: 'Record a completed bank refund' }));
  expect(await screen.findByText('Upload or select evidence for this order.')).toBeInTheDocument();
  expect(managerPaymentsApi.refundAction).not.toHaveBeenCalled();
});
it('offers payment links to the two supported actors only', () => {
  render(
    <MemoryRouter>
      <PaymentLink orderId={11} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute(
    'href',
    '/customer/requests/11/payments',
  );
});
