import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PrepareQuotationPage } from './prepare';
import { quoteMutationsApi } from './mutations';
import { validateQuoteTerms } from './mutation-contracts';
import { quotation } from './testing';
import { assessmentApi } from '../assessment/api';
import type { ManagerCase } from '../assessment/contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./mutations', () => ({ quoteMutationsApi: { recordOffer: vi.fn(), prepare: vi.fn() } }));
vi.mock('../assessment/api', () => ({ assessmentApi: { getCase: vi.fn() } }));
vi.mock('../assigned-cases/api', () => ({ assignedCasesApi: { get: vi.fn() } }));

const approved = (recordVersion = '00000000000000c1'): ManagerCase => ({
  orderId: 9,
  orderNumber: 'ET-TEST-9',
  orderStatus: 'APPROVED',
  recordVersion,
  currentRevisionId: 7,
  revision: null,
  decision: null,
  assignments: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
  vi.mocked(assessmentApi.getCase).mockResolvedValue(approved());
});
function mount() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/manager/requests/9/quotes/prepare']}>
        <Routes>
          <Route path="/manager/requests/:id/quotes/prepare" element={<PrepareQuotationPage />} />
          <Route
            path="/manager/requests/:id/quotes/:quoteId"
            element={<p>Quotation detail page</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function fillQuote(user: ReturnType<typeof userEvent.setup>) {
  const form = within(await screen.findByRole('form', { name: 'Prepare quotation version' }));
  await user.type(form.getByLabelText('Quotation valid until'), '2099-03-01T00:00:00Z');
  await user.type(form.getByLabelText('Terms version'), 'T-1');
  await user.type(form.getByLabelText('Terms'), 'Standard terms');
  await user.type(form.getByLabelText('Cancellation terms'), 'Cancel 7 days ahead');
  await user.type(form.getByLabelText('Stage 1 name'), 'DEPOSIT');
  await user.type(form.getByLabelText('Stage 1 amount (USD)'), '600.10');
  await user.type(form.getByLabelText('Stage 1 due at'), '2099-01-01T00:00:00Z');
  await user.click(form.getByRole('button', { name: 'Add payment stage' }));
  await user.type(form.getByLabelText('Stage 2 name'), 'BALANCE');
  await user.type(form.getByLabelText('Stage 2 amount (USD)'), '400.20');
  await user.type(form.getByLabelText('Stage 2 due at'), '2099-02-01T00:00:00Z');
  return form;
}

describe('prepare a DRAFT quotation version (#58)', () => {
  it('creates a version for the current revision with consecutive stages, then opens it', async () => {
    vi.mocked(quoteMutationsApi.prepare).mockResolvedValue({
      ...quotation,
      quote: { ...quotation.quote, quoteId: 44, status: 'DRAFT', total: null },
    });
    const user = mount();
    const form = await fillQuote(user);
    expect(form.getByText(/Schedule total: 1000.30 USD/)).toBeInTheDocument();
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Prepare new quotation version' }));
    await waitFor(() => expect(quoteMutationsApi.prepare).toHaveBeenCalledTimes(1));
    expect(quoteMutationsApi.prepare).toHaveBeenCalledWith(9, {
      recordVersion: '00000000000000c1',
      operationId: expect.any(String),
      revisionId: 7,
      validUntil: '2099-03-01T00:00:00Z',
      termsVersion: 'T-1',
      terms: 'Standard terms',
      cancellationTerms: 'Cancel 7 days ahead',
      paymentSchedule: [
        {
          sequenceNo: 1,
          paymentStage: 'DEPOSIT',
          amountDue: '600.10',
          dueAt: '2099-01-01T00:00:00Z',
        },
        {
          sequenceNo: 2,
          paymentStage: 'BALANCE',
          amountDue: '400.20',
          dueAt: '2099-02-01T00:00:00Z',
        },
      ],
      assessments: [],
    });
    expect(await screen.findByText('Quotation detail page')).toBeInTheDocument();
  }, 30_000);

  it('requires all terms, a valid schedule and the supersession confirmation', async () => {
    const user = mount();
    const form = within(await screen.findByRole('form', { name: 'Prepare quotation version' }));
    await user.click(form.getByRole('button', { name: 'Prepare new quotation version' }));
    expect(form.getByText(/Enter the terms version/)).toBeInTheDocument();
    expect(form.getByText(/Stage 1: use a positive amount/)).toBeInTheDocument();
    expect(form.getByText(/earlier unaccepted versions are superseded/)).toBeInTheDocument();
    expect(quoteMutationsApi.prepare).not.toHaveBeenCalled();
  });

  it('blocks submission while commercial evidence is invalid', async () => {
    const user = mount();
    await user.click(await screen.findByRole('button', { name: 'Add evidence' }));
    const form = await fillQuote(user);
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Prepare new quotation version' }));
    expect(form.getByText(/Fix the commercial evidence/)).toBeInTheDocument();
    expect(quoteMutationsApi.prepare).not.toHaveBeenCalled();
  }, 30_000);

  it('keeps input when an accepted quotation protects the order', async () => {
    vi.mocked(quoteMutationsApi.prepare).mockRejectedValue(
      new ApiError(409, 'Protected.', 'QUOTE_ORDER_PROTECTED'),
    );
    const user = mount();
    const form = await fillQuote(user);
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Prepare new quotation version' }));
    expect(await form.findByText(/accepted quotation protects this request/)).toBeInTheDocument();
    expect(form.getByLabelText('Terms version')).toHaveValue('T-1');
  }, 30_000);

  it('after a stale-version reload the next attempt uses the freshly read version', async () => {
    vi.mocked(quoteMutationsApi.prepare)
      .mockRejectedValueOnce(new ApiError(409, 'Stale.', 'ORDER_VERSION_CONFLICT'))
      .mockResolvedValueOnce({ ...quotation, quote: { ...quotation.quote, quoteId: 45 } });
    const user = mount();
    const form = await fillQuote(user);
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Prepare new quotation version' }));
    vi.mocked(assessmentApi.getCase).mockResolvedValue(approved('00000000000000c9'));
    await user.click(await form.findByRole('button', { name: 'Reload case' }));
    await waitFor(() => expect(assessmentApi.getCase).toHaveBeenCalledTimes(2));
    await user.click(form.getByRole('button', { name: 'Prepare new quotation version' }));
    await waitFor(() => expect(quoteMutationsApi.prepare).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(quoteMutationsApi.prepare).mock.calls;
    expect(first[1].recordVersion).toBe('00000000000000c1');
    expect(second[1].recordVersion).toBe('00000000000000c9');
    expect(second[1].operationId).not.toBe(first[1].operationId);
  }, 30_000);
});

describe('quotation terms rules', () => {
  const base = {
    validUntil: '2099-03-01T00:00:00Z',
    termsVersion: 'T',
    terms: 'x',
    cancellationTerms: 'y',
    schedule: [{ paymentStage: 'A', amountDue: '1.00', dueAt: '2099-01-01T00:00:00Z' }],
  };
  it('limits the schedule to 1..12 positive future stages', () => {
    expect(validateQuoteTerms(base)).toEqual({});
    expect(validateQuoteTerms({ ...base, schedule: [] }).schedule).toBeDefined();
    const many = Array.from({ length: 13 }, () => base.schedule[0]);
    expect(validateQuoteTerms({ ...base, schedule: many }).schedule).toBeDefined();
    expect(
      validateQuoteTerms({ ...base, schedule: [{ ...base.schedule[0], amountDue: '0.00' }] })
        .amount1,
    ).toBeDefined();
    expect(
      validateQuoteTerms({
        ...base,
        schedule: [{ ...base.schedule[0], dueAt: '2000-01-01T00:00:00Z' }],
      }).due1,
    ).toBeDefined();
  });
});
