import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManagerQuotationDetailPage, managerActions } from './manager-actions';
import { quotationsApi } from './api';
import { quoteMutationsApi } from './mutations';
import { quotation } from './testing';
import type { QuoteResponse } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  quotationsApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('./mutations', () => ({ quoteMutationsApi: { act: vi.fn() } }));

const quote = (patch: Partial<QuoteResponse['quote']>, extra: Partial<QuoteResponse> = {}) => ({
  ...quotation,
  quote: { ...quotation.quote, validUntil: '2099-01-01T00:00:00Z', ...patch },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
});
function mount(current: QuoteResponse) {
  vi.mocked(quotationsApi.get).mockResolvedValue(current);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/manager/requests/9/quotes/31']}>
        <Routes>
          <Route
            path="/manager/requests/:id/quotes/:quoteId"
            element={<ManagerQuotationDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
const panel = async () =>
  within((await screen.findByRole('heading', { name: 'Manager actions' })).closest('section')!);

describe('Manager quotation actions (#59)', () => {
  it('approves a priced draft after a contextual confirmation, without issuing it', async () => {
    const draft = quote({ status: 'DRAFT' });
    vi.mocked(quoteMutationsApi.act).mockResolvedValue(quote({ status: 'APPROVED' }));
    const user = mount(draft);
    const p = await panel();
    expect(p.queryByRole('button', { name: 'Issue to customer' })).toBeNull();
    await user.click(p.getByRole('button', { name: 'Approve' }));
    const dialog = p.getByRole('dialog', { name: 'Confirm Approve' });
    expect(dialog).toHaveTextContent('Q-9-2, version 2, revision ID 7');
    expect(dialog).toHaveTextContent('not sent to the customer');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm approve' }));
    await waitFor(() => expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1));
    expect(quoteMutationsApi.act).toHaveBeenCalledWith(9, 31, {
      recordVersion: '00000000000000a2',
      operationId: expect.any(String),
      action: 'APPROVE',
    });
    expect(await p.findByText(/Q-9-2 approved/)).toBeInTheDocument();
    // Current state is re-read rather than trusting the receipt.
    await waitFor(() => expect(quotationsApi.get).toHaveBeenCalledTimes(2));
  });

  it('blocks approval while prices are pending', async () => {
    mount(quote({ status: 'DRAFT', total: null }, { blockers: ['AIRFARE_PENDING'] }));
    const p = await panel();
    expect(p.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(p.getByText(/pending prices or blockers/)).toBeInTheDocument();
    expect(p.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('issues an approved quotation as a separate action and sends no reason on reject', async () => {
    vi.mocked(quoteMutationsApi.act).mockResolvedValue(quote({ status: 'REJECTED' }));
    const user = mount(quote({ status: 'APPROVED' }));
    const p = await panel();
    expect(p.getByRole('button', { name: 'Issue to customer' })).toBeInTheDocument();
    await user.click(p.getByRole('button', { name: 'Reject' }));
    await user.click(p.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(quoteMutationsApi.act).toHaveBeenCalledTimes(1));
    expect(Object.keys(vi.mocked(quoteMutationsApi.act).mock.calls[0][2]).sort()).toEqual([
      'action',
      'operationId',
      'recordVersion',
    ]);
  });

  it('offers only expiry once validity has passed, and nothing for accepted quotes', async () => {
    expect(
      managerActions(quote({ status: 'ISSUED', validUntil: '2000-01-01T00:00:00Z' }), Date.now()),
    ).toEqual(['EXPIRE']);
    expect(managerActions(quote({ status: 'ISSUED' }), Date.now())).toEqual([]);
    expect(managerActions(quote({ status: 'ACCEPTED' }), Date.now())).toEqual([]);
    mount(quote({ status: 'ACCEPTED' }));
    const p = await panel();
    expect(p.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('keeps context on a pricing conflict and retries uncertain actions identically', async () => {
    vi.mocked(quoteMutationsApi.act)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockRejectedValueOnce(new ApiError(409, 'Changed.', 'QUOTE_PRICING_CHANGED'));
    const user = mount(quote({ status: 'DRAFT' }));
    const p = await panel();
    await user.click(p.getByRole('button', { name: 'Approve' }));
    await user.click(p.getByRole('button', { name: 'Confirm approve' }));
    await user.click(await p.findByRole('button', { name: 'Retry the same action' }));
    await waitFor(() => expect(quoteMutationsApi.act).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(quoteMutationsApi.act).mock.calls;
    expect(second).toEqual(first);
    expect(await p.findByText(/A pricing source changed/)).toBeInTheDocument();
    expect(p.getByRole('button', { name: 'Refresh quotation' })).toBeInTheDocument();
    expect(quoteMutationsApi.act).toHaveBeenCalledTimes(2);
  }, 20_000);
});
