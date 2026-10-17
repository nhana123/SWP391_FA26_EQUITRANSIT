import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { CustomerQuotationDetailPage, canRespondToQuotation } from './customer-actions';
import { quotationsApi } from './api';
import { quoteMutationsApi } from './mutations';
import { quotation } from './testing';
import { ordersApi } from '../transport-orders/api';
import { testOrder } from '../booking-services/testing';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';
import { quotationKeys } from './hooks';
import type { Order, Role } from '../../shared/api/contracts';
import type { QuoteResponse } from './contracts';
import { displayDate } from '../../shared/lib/validation';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  quotationsApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('./mutations', () => ({ quoteMutationsApi: { act: vi.fn() } }));
vi.mock('../transport-orders/api', () => ({ ordersApi: { get: vi.fn() } }));

const issued: QuoteResponse = {
  ...quotation,
  quote: { ...quotation.quote, validUntil: '2099-01-01T00:00:00+07:00' },
};
const owned = testOrder({
  orderId: 9,
  orderStatus: 'APPROVED',
  currentRevisionId: 7,
  recordVersion: issued.recordVersion,
});
const accepted: QuoteResponse = {
  ...issued,
  quote: { ...issued.quote, status: 'ACCEPTED' },
  acceptedAt: '2026-10-17T02:00:00Z',
  recordVersion: '00000000000000a3',
};
let memory: ReturnType<typeof createMemoryRouter>;
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  startSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresIn: 3600,
    role: 'CUSTOMER',
  });
  vi.mocked(quotationsApi.get).mockResolvedValue(issued);
  vi.mocked(ordersApi.get).mockResolvedValue(owned);
});
afterEach(() => {
  memory?.dispose();
  vi.useRealTimers();
});

function mount() {
  memory = createMemoryRouter(
    [{ path: '/customer/requests/:id/quotes/:quoteId', element: <CustomerQuotationDetailPage /> }],
    {
      initialEntries: ['/customer/requests/9/quotes/31'],
    },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memory} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function confirm(
  user: ReturnType<typeof userEvent.setup>,
  action: 'accept' | 'reject' = 'accept',
) {
  await user.click(
    await screen.findByRole('button', {
      name: `${action === 'accept' ? 'Accept' : 'Reject'} quotation`,
    }),
  );
  const dialog = screen.getByRole('dialog', { name: `Confirm ${action} quotation` });
  expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
  expect(within(dialog).getByRole('button', { name: `Confirm ${action}` })).toBeDisabled();
  await user.click(within(dialog).getByRole('checkbox'));
  await user.click(within(dialog).getByRole('button', { name: `Confirm ${action}` }));
}

describe('Customer quotation response (#60)', () => {
  it('does not record viewing or opening/cancelling confirmation as a decision', async () => {
    const user = mount();
    await user.click(await screen.findByRole('button', { name: 'Accept quotation' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Confirm accept' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Payment schedule' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cancellation terms' })).toBeInTheDocument();
    expect(screen.getByText('100.125', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(quoteMutationsApi.act).not.toHaveBeenCalled();
  });

  it.each(['accept', 'reject'] as const)(
    'requires explicit %s and displays GET state rather than a historical receipt',
    async (action) => {
      const current =
        action === 'accept'
          ? accepted
          : {
              ...accepted,
              quote: { ...accepted.quote, status: 'REJECTED' as const },
              acceptedAt: null,
            };
      vi.mocked(quoteMutationsApi.act).mockImplementation(async () => {
        vi.mocked(quotationsApi.get).mockResolvedValue(current);
        vi.mocked(ordersApi.get).mockResolvedValue({
          ...owned,
          recordVersion: current.recordVersion,
        });
        return issued; // replay receipt deliberately differs from current state
      });
      const user = mount();
      await confirm(user, action);
      await waitFor(() => expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1));
      expect(quoteMutationsApi.act).toHaveBeenCalledWith(9, 31, {
        action: action.toUpperCase(),
        recordVersion: issued.recordVersion,
        operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
      await waitFor(() => expect(quotationsApi.get).toHaveBeenCalledTimes(2));
      expect(
        await screen.findByText(action === 'accept' ? 'Accepted' : 'Rejected', { exact: true }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This does not confirm payment, flight space or permission to depart/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Accept quotation' })).toBeNull();
      expect(memory.state.location.pathname).toBe('/customer/requests/9/quotes/31');
      if (action === 'accept')
        expect(screen.getByText(displayDate(accepted.acceptedAt))).toBeInTheDocument();
    },
  );

  it('prevents repeated clicks and preserves UUID/version/body/path after uncertainty and an intentional refresh', async () => {
    let fail!: (error: unknown) => void;
    vi.mocked(quoteMutationsApi.act)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      )
      .mockImplementationOnce(async () => {
        vi.mocked(quotationsApi.get).mockResolvedValue(accepted);
        return accepted;
      });
    const user = mount();
    await confirm(user);
    expect(screen.getByRole('button', { name: 'Sending response...' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Sending response...' }));
    expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1);
    await act(async () => {
      fail(new ApiError(0, 'Interrupted'));
    });
    expect(await screen.findByRole('button', { name: 'Retry the same response' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    vi.mocked(quotationsApi.get).mockResolvedValue({
      ...issued,
      recordVersion: '00000000000000ff',
    });
    vi.mocked(ordersApi.get).mockResolvedValue({ ...owned, recordVersion: '00000000000000ff' });
    await user.click(screen.getByRole('button', { name: 'Refresh and review quotation' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry the same response' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Retry the same response' }));
    await waitFor(() => expect(quoteMutationsApi.act).toHaveBeenCalledTimes(2));
    expect(vi.mocked(quoteMutationsApi.act).mock.calls[1]).toEqual(
      vi.mocked(quoteMutationsApi.act).mock.calls[0],
    );
  });

  it.each([
    'QUOTE_EXPIRED',
    'QUOTE_REVISION_CONFLICT',
    'ORDER_VERSION_CONFLICT',
    'QUOTE_STATE_CONFLICT',
    'QUOTE_RETRY_CONFLICT',
  ])('requires refresh and fresh confirmation after %s without auto retry', async (code) => {
    vi.mocked(quoteMutationsApi.act).mockRejectedValue(
      new ApiError(409, 'Unsafe internal text', code),
    );
    const user = mount();
    await confirm(user);
    await screen.findByRole('alert');
    expect(screen.queryByText('Unsafe internal text')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm accept' })).toBeDisabled();
    expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Refresh and review quotation' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await confirm(user);
    await waitFor(() => expect(quoteMutationsApi.act).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(quoteMutationsApi.act).mock.calls;
    expect(calls[1][2].operationId).not.toBe(calls[0][2].operationId);
  });

  it.each([403, 404])('hides all cached quotation content on mutation %s', async (status) => {
    vi.mocked(quoteMutationsApi.act).mockRejectedValue(new ApiError(status, 'Unavailable'));
    const user = mount();
    await confirm(user);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Captured service breakdown' })).toBeNull(),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Captured quotation terms.')).toBeNull();
  });

  it('hides stale detail if an ownership read fails', async () => {
    vi.mocked(ordersApi.get).mockRejectedValue(new ApiError(404, 'Foreign order'));
    mount();
    expect(
      await screen.findByText('This quotation or request is unavailable to your account.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Quotation summary' })).toBeNull();
    expect(quoteMutationsApi.act).not.toHaveBeenCalled();
  });

  it('does not substitute a background refreshed parent version in an open confirmation', async () => {
    const user = mount();
    await user.click(await screen.findByRole('button', { name: 'Accept quotation' }));
    await user.click(screen.getByRole('checkbox'));
    await act(async () => {
      const generation = getSession()!.generation;
      queryClient.setQueryData(queryKeys.order(generation, 9), {
        ...owned,
        recordVersion: '00000000000000ff',
      });
      queryClient.setQueryData(quotationKeys.detail(generation, 'CUSTOMER', 9, 31), {
        ...issued,
        recordVersion: '00000000000000ff',
      });
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm accept' })).toBeDisabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm accept' }));
    expect(quoteMutationsApi.act).not.toHaveBeenCalled();
  });

  it('blocks confirmation when validity expires while the dialog is open', async () => {
    const deadline = Date.now() + 60000;
    vi.mocked(quotationsApi.get).mockResolvedValue({
      ...issued,
      quote: { ...issued.quote, validUntil: new Date(deadline).toISOString() },
    });
    const user = mount();
    await user.click(await screen.findByRole('button', { name: 'Accept quotation' }));
    await user.click(screen.getByRole('checkbox'));
    vi.useFakeTimers();
    vi.setSystemTime(deadline + 1);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(screen.getByRole('button', { name: 'Confirm accept' })).toBeDisabled();
    expect(quoteMutationsApi.act).not.toHaveBeenCalled();
  });

  it.each(['MANAGER', 'COORDINATOR'] as Role[])(
    'offers no customer actions for %s',
    async (role) => {
      startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
      mount();
      expect(screen.getByText('Only the owning customer can respond.')).toBeInTheDocument();
      expect(ordersApi.get).not.toHaveBeenCalled();
      expect(quoteMutationsApi.act).not.toHaveBeenCalled();
    },
  );

  it('discards an old account completion instead of refreshing the new account', async () => {
    let finish!: (value: QuoteResponse) => void;
    vi.mocked(quoteMutationsApi.act).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = mount();
    await confirm(user);
    await act(async () => {
      startSession({
        accessToken: 'new-test-only',
        tokenType: 'Bearer',
        expiresIn: 60,
        role: 'CUSTOMER',
      });
    });
    await screen.findByRole('button', { name: 'Accept quotation' });
    const reads = vi.mocked(quotationsApi.get).mock.calls.length;
    await act(async () => {
      finish(accepted);
    });
    expect(quotationsApi.get).toHaveBeenCalledTimes(reads);
    expect(screen.queryByText(/Your response was recorded/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows deployment errors without automatic resubmission', async () => {
    vi.mocked(quoteMutationsApi.act).mockRejectedValue(
      new ApiError(503, 'Unavailable', 'QUOTE_SCHEMA_PENDING'),
    );
    const user = mount();
    await confirm(user);
    // 503 can be uncertain: only an explicit identical retry is offered.
    expect(
      await screen.findByRole('button', { name: 'Retry the same response' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/quotation service has not been deployed/)).toBeInTheDocument();
    expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404])(
    'hides cached detail and confirmation when a refreshed quotation read returns %s',
    async (status) => {
      const user = mount();
      await user.click(await screen.findByRole('button', { name: 'Accept quotation' }));
      await user.click(screen.getByRole('checkbox'));
      vi.mocked(quotationsApi.get).mockRejectedValue(new ApiError(status, 'Unavailable'));
      await user.click(screen.getByRole('button', { name: 'Refresh and review quotation' }));
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Quotation summary' })).toBeNull(),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Confirm accept' })).toBeNull();
      expect(quoteMutationsApi.act).not.toHaveBeenCalled();
    },
  );

  it('shows another session acceptance after a 409 refresh and never accepts again', async () => {
    vi.mocked(quoteMutationsApi.act).mockRejectedValue(
      new ApiError(409, 'Changed', 'QUOTE_STATE_CONFLICT'),
    );
    const user = mount();
    await confirm(user);
    await screen.findByRole('alert');
    vi.mocked(quotationsApi.get).mockResolvedValue(accepted);
    vi.mocked(ordersApi.get).mockResolvedValue({ ...owned, recordVersion: accepted.recordVersion });
    await user.click(screen.getByRole('button', { name: 'Refresh and review quotation' }));
    expect(await screen.findByText('Accepted', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(displayDate(accepted.acceptedAt))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept quotation' })).toBeNull();
    expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1);
  });

  it('retries only GET if a successful action cannot refresh current state', async () => {
    vi.mocked(quoteMutationsApi.act).mockImplementation(async () => {
      vi.mocked(quotationsApi.get).mockRejectedValue(
        new ApiError(503, 'Unavailable', 'QUOTE_SCHEMA_PENDING'),
      );
      return accepted;
    });
    const user = mount();
    await confirm(user);
    expect(await screen.findByText(/Current state could not be refreshed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry the same response' })).toBeNull();
    vi.mocked(quotationsApi.get).mockResolvedValue(accepted);
    vi.mocked(ordersApi.get).mockResolvedValue({ ...owned, recordVersion: accepted.recordVersion });
    await user.click(screen.getByRole('button', { name: 'Refresh and review quotation' }));
    expect(await screen.findByText('Accepted', { exact: true })).toBeInTheDocument();
    expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Accept quotation' })).toBeNull();
  });

  it('discards a pending completion after switching to another order', async () => {
    let finish!: (value: QuoteResponse) => void;
    vi.mocked(quoteMutationsApi.act).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = mount();
    await confirm(user);
    vi.mocked(ordersApi.get).mockResolvedValue({ ...owned, orderId: 10, orderNumber: 'TEST-10' });
    vi.mocked(quotationsApi.get).mockResolvedValue({
      ...issued,
      quote: { ...issued.quote, quoteId: 32, quoteNumber: 'Q-10-2' },
    });
    await act(async () => {
      await memory.navigate('/customer/requests/10/quotes/32');
    });
    await screen.findByRole('button', { name: 'Accept quotation' });
    const reads = vi.mocked(quotationsApi.get).mock.calls.length;
    await act(async () => {
      finish(accepted);
    });
    expect(quotationsApi.get).toHaveBeenCalledTimes(reads);
    expect(screen.queryByText(/Your response was recorded/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Q-10-2', { exact: true })).toBeInTheDocument();
  });

  it('preserves an uncertain command for replay even after local expiry', async () => {
    const deadline = Date.now() + 60000;
    vi.mocked(quotationsApi.get).mockResolvedValue({
      ...issued,
      quote: { ...issued.quote, validUntil: new Date(deadline).toISOString() },
    });
    vi.mocked(quoteMutationsApi.act)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockImplementationOnce(async () => {
        vi.mocked(quotationsApi.get).mockResolvedValue(accepted);
        return accepted;
      });
    const user = mount();
    await confirm(user);
    await screen.findByRole('button', { name: 'Retry the same response' });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(deadline + 1);
    try {
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(screen.getByRole('button', { name: 'Retry the same response' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Retry the same response' }));
      await waitFor(() => expect(quoteMutationsApi.act).toHaveBeenCalledTimes(2));
      expect(vi.mocked(quoteMutationsApi.act).mock.calls[1]).toEqual(
        vi.mocked(quoteMutationsApi.act).mock.calls[0],
      );
    } finally {
      clock.mockRestore();
    }
  });

  it('requires a new review acknowledgement when changing Accept to Reject', async () => {
    const user = mount();
    await user.click(await screen.findByRole('button', { name: 'Accept quotation' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Reject quotation' }));
    expect(screen.getByRole('dialog', { name: 'Confirm reject quotation' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Confirm reject' })).toBeDisabled();
    expect(quoteMutationsApi.act).not.toHaveBeenCalled();
  });
});

describe('eligibility guards', () => {
  it.each(['DRAFT', 'APPROVED', 'SUPERSEDED', 'EXPIRED', 'ACCEPTED', 'REJECTED'] as const)(
    'blocks %s',
    (status) => {
      expect(
        canRespondToQuotation(owned, { ...issued, quote: { ...issued.quote, status } }, Date.now()),
      ).toBe(false);
    },
  );
  it.each([
    { orderStatus: 'SUBMITTED' as const },
    { currentRevisionId: 8 },
    { currentRevisionId: null },
    { recordVersion: '00000000000000ff' },
  ] as Partial<Order>[])('blocks an unapproved, different or stale revision: %j', (patch) => {
    expect(canRespondToQuotation({ ...owned, ...patch }, issued, Date.now())).toBe(false);
  });
  it('uses offset instants and blocks exactly at expiry', () => {
    const deadline = Date.parse(issued.quote.validUntil);
    expect(canRespondToQuotation(owned, issued, deadline - 1)).toBe(true);
    expect(canRespondToQuotation(owned, issued, deadline)).toBe(false);
    expect(canRespondToQuotation(owned, { ...issued, issuedAt: null }, deadline - 1)).toBe(false);
  });
});
