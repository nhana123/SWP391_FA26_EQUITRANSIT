import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QuotationsPage, QuotationDetailPage } from './pages';
import { quotationsApi } from './api';
import { QuotationLink } from './navigation';
import { quotation, summary, pageOf } from './testing';
import type { QuotePage } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession, getSession } from '../../shared/api/session';
import type { Role } from '../../shared/api/contracts';
import { quotationKeys } from './hooks';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  quotationsApi: { list: vi.fn(), get: vi.fn() },
}));
let memory: ReturnType<typeof createMemoryRouter>;
beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
});
afterEach(() => memory?.dispose());
function mount(path = '/quotes/9') {
  memory = createMemoryRouter(
    [
      { path: '/quotes/:id', element: <QuotationsPage /> },
      { path: '/quotes/:id/:quoteId', element: <QuotationDetailPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memory} />
    </QueryClientProvider>,
  );
  return memory;
}
function signIn(role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
}

describe('quotation list and detail', () => {
  it('paginates from totalElements and performs no detail request per row', async () => {
    vi.mocked(quotationsApi.list)
      .mockResolvedValueOnce(pageOf([summary], 0, 2, 3))
      .mockResolvedValue(
        pageOf([{ ...summary, quoteId: 30, version: 1, quoteNumber: 'Q-9-1' }], 1, 2, 3),
      );
    mount('/quotes/9?size=2');
    expect(await screen.findByRole('link', { name: 'Q-9-2' })).toHaveAttribute(
      'href',
      '/manager/requests/9/quotes/31',
    );
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(quotationsApi.get).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('link', { name: 'Q-9-1' })).toBeInTheDocument();
    expect(quotationsApi.list).toHaveBeenLastCalledWith(9, 1, 2, expect.any(AbortSignal));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Quotations per page'), '50');
    await waitFor(() =>
      expect(quotationsApi.list).toHaveBeenLastCalledWith(9, 0, 50, expect.any(AbortSignal)),
    );
  });
  it('renders a null total as pending and distinguishes zero', async () => {
    vi.mocked(quotationsApi.list).mockResolvedValue(
      pageOf([
        { ...summary, total: null },
        { ...summary, quoteId: 30, quoteNumber: 'Q-9-1', total: '0.00' },
      ]),
    );
    mount();
    expect(await screen.findByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.getByText(/Live service estimates are shown separately/)).toBeInTheDocument();
  });
  it('shows empty and invalid-page states without unbounded requests', async () => {
    vi.mocked(quotationsApi.list).mockResolvedValue(pageOf([]));
    mount('/quotes/9?page=-1');
    expect(await screen.findByText(/Invalid quotation page/)).toBeInTheDocument();
    expect(quotationsApi.list).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reset pagination' }));
    expect(
      await screen.findByRole('heading', { name: 'No quotations available' }),
    ).toBeInTheDocument();
    expect(quotationsApi.list).toHaveBeenCalledTimes(1);
  });
  it('shows captured values, terms, schedule and blockers as text without recomputing totals', async () => {
    vi.mocked(quotationsApi.get).mockResolvedValue({
      ...quotation,
      quote: { ...summary, total: null },
      terms: '<img src=x onerror=alert(1)>',
      items: [
        {
          ...quotation.items[0],
          amount: null,
          pricingStatus: 'PENDING',
          blockers: ['SOURCE_PENDING'],
        },
      ],
      blockers: ['SOURCE_PENDING'],
    });
    mount('/quotes/9/31');
    expect(await screen.findByText('Captured road transport')).toBeInTheDocument();
    expect(screen.getByText('100.125')).toBeInTheDocument();
    expect(screen.getByText('2.00')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Captured cancellation terms.')).toBeInTheDocument();
    expect(screen.getByText('DEPOSIT')).toBeInTheDocument();
    expect(screen.getByText('1234.50')).toBeInTheDocument();
    const summarySection = screen
      .getByRole('heading', { name: 'Quotation summary' })
      .closest('section')!;
    expect(within(summarySection).getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByText(/\(UTC\)/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /accept|pay|issue/i })).toBeNull();
  });
  it('shows an accepted historical version without declaring payment or expiry', async () => {
    vi.mocked(quotationsApi.get).mockResolvedValue({
      ...quotation,
      quote: { ...summary, status: 'ACCEPTED', validUntil: '2020-01-01T00:00:00Z' },
      acceptedAt: '2020-01-01T00:00:00Z',
    });
    mount('/quotes/9/31');
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByText(/Issued — expired/)).toBeNull();
    expect(
      screen.getByText(/It does not confirm payment, flight space or departure/),
    ).toBeInTheDocument();
  });
  it('does not display a customer preparation even if an unexpected response contains it', async () => {
    signIn('CUSTOMER');
    vi.mocked(quotationsApi.get).mockResolvedValue({
      ...quotation,
      quote: { ...summary, status: 'DRAFT' },
      issuedAt: null,
    });
    mount('/quotes/9/31');
    expect(
      await screen.findByText('This quotation is unavailable to your account.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(quotation.terms)).toBeNull();
  });
  it('keeps unissued and superseded headers out of the customer list', async () => {
    signIn('CUSTOMER');
    vi.mocked(quotationsApi.list).mockResolvedValue(
      pageOf([
        summary,
        ...(['DRAFT', 'APPROVED', 'SUPERSEDED'] as const).map((status, index) => ({
          ...summary,
          quoteId: 100 + index,
          quoteNumber: `HIDDEN-${status}`,
          status,
        })),
      ]),
    );
    mount();
    expect(await screen.findByRole('link', { name: summary.quoteNumber })).toBeInTheDocument();
    expect(screen.queryByText(/HIDDEN-/)).toBeNull();
  });
  it.each([403, 404, 409, 503])('shows an explicit error for status %s', async (status) => {
    vi.mocked(quotationsApi.get).mockRejectedValue(
      new ApiError(
        status,
        'Private backend text',
        status === 503 ? 'QUOTE_SCHEMA_PENDING' : undefined,
      ),
    );
    mount('/quotes/9/31');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Private backend text')).toBeNull();
    if (status === 503) {
      expect(screen.getByText(/has not been deployed/)).toBeInTheDocument();
      expect(quotationsApi.get).toHaveBeenCalledTimes(1);
    }
  });
  it('hides cached detail after a Coordinator loses access', async () => {
    signIn('COORDINATOR');
    vi.mocked(quotationsApi.get)
      .mockResolvedValueOnce(quotation)
      .mockRejectedValue(new ApiError(403, 'Revoked'));
    mount('/quotes/9/31');
    await screen.findByText('Captured road transport');
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: quotationKeys.detail(getSession()!.generation, 'COORDINATOR', 9, 31),
      });
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Captured road transport')).toBeNull();
  });
  it('cancels the previous order and does not render its late response in another order', async () => {
    let finish!: (value: QuotePage) => void;
    vi.mocked(quotationsApi.list)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue(pageOf([{ ...summary, quoteNumber: 'SECOND-ORDER' }]));
    const router = mount();
    await waitFor(() => expect(quotationsApi.list).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(quotationsApi.list).mock.calls[0][3]!;
    await act(async () => {
      await router.navigate('/quotes/10');
    });
    expect(await screen.findByRole('link', { name: 'SECOND-ORDER' })).toBeInTheDocument();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish(pageOf());
    });
    expect(screen.queryByText(summary.quoteNumber)).toBeNull();
  });
  it('isolates caches on an account switch while the first account read is pending', async () => {
    let finish!: (value: QuotePage) => void;
    vi.mocked(quotationsApi.list)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue(pageOf([{ ...summary, quoteNumber: 'NEW-ACCOUNT' }]));
    mount();
    await waitFor(() => expect(quotationsApi.list).toHaveBeenCalledTimes(1));
    await act(async () => {
      signIn('CUSTOMER');
    });
    expect(await screen.findByRole('link', { name: 'NEW-ACCOUNT' })).toBeInTheDocument();
    await act(async () => {
      finish(pageOf());
    });
    expect(screen.queryByText(summary.quoteNumber)).toBeNull();
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .every((q) => q.queryKey[1] === getSession()!.generation),
    ).toBe(true);
  });
});

describe('quotation entry point', () => {
  it.each(['CUSTOMER', 'MANAGER', 'COORDINATOR'] as const)(
    'shows an entry point for %s',
    (role) => {
      signIn(role);
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider
            router={createMemoryRouter([{ path: '/', element: <QuotationLink orderId={9} /> }])}
          />
        </QueryClientProvider>,
      );
      expect(screen.getByRole('link', { name: 'Quotations' })).toHaveAttribute(
        'href',
        expect.stringContaining('/9/quotes'),
      );
    },
  );
  it.each(['SPECIALIST', 'DRIVER'] as const)('does not show quotation entry for %s', (role) => {
    signIn(role);
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/', element: <QuotationLink orderId={9} /> }])}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Quotations' })).toBeNull();
  });
});
