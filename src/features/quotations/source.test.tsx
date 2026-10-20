import { setDateTime } from '../../test/date-time';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PrepareQuotationPage } from './prepare';
import { quoteMutationsApi } from './mutations';
import {
  sumMoney,
  validateEvidence,
  validateOffer,
  type QuoteEvidence,
} from './mutation-contracts';
import { assessmentApi } from '../assessment/api';
import { assignedCasesApi } from '../assigned-cases/api';
import type { ManagerCase } from '../assessment/contracts';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';
import { assessmentKeys } from '../assessment/hooks';

vi.mock('./mutations', () => ({ quoteMutationsApi: { recordOffer: vi.fn() } }));
vi.mock('../assessment/api', () => ({ assessmentApi: { getCase: vi.fn() } }));
vi.mock('../assigned-cases/api', () => ({ assignedCasesApi: { get: vi.fn() } }));

const approvedCase = (patch: Partial<ManagerCase> = {}): ManagerCase => ({
  orderId: 9,
  orderNumber: 'ET-TEST-9',
  orderStatus: 'APPROVED',
  recordVersion: '00000000000000c1',
  currentRevisionId: 7,
  revision: null,
  decision: null,
  assignments: [],
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(assessmentApi.getCase).mockResolvedValue(approvedCase());
  vi.mocked(assignedCasesApi.get).mockResolvedValue(approvedCase());
});
function mount(role: Role = 'MANAGER') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  const base = role === 'MANAGER' ? '/manager/requests' : '/staff/cases';
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`${base}/9/quotes/prepare`]}>
        <Routes>
          <Route path={`${base}/:id/quotes/prepare`} element={<PrepareQuotationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
/**
 * Focus and paste each value: one real input event per field instead of one
 * render per keystroke. ~70 typed keys per call made these tests approach the
 * 5s timeout under full-suite load.
 */
async function fill(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
  await user.click(field);
  await user.paste(text);
}
async function fillOffer(user: ReturnType<typeof userEvent.setup>, purchase = '800.00') {
  const form = await screen.findByRole('form', { name: 'Record supplier offer' });
  const f = within(form);
  await fill(user, f.getByLabelText('Provider name'), 'Test Air Cargo');
  await fill(user, f.getByLabelText('Offer reference'), 'OFFER-1');
  await fill(user, f.getByLabelText('Quantity'), '1');
  await fill(user, f.getByLabelText(/Purchase unit price/), purchase);
  await fill(user, f.getByLabelText(/Retail unit price/), '1000.00');
  setDateTime(f.getByLabelText('Offer valid until'), '2099-01-31T12:00:00Z');
  await fill(user, f.getByLabelText('Evidence reference'), 'docs/offer-1.pdf');
  return f;
}

describe('supplier offer source (#57)', () => {
  it('retains the filled offer on a background case 503 and unlocks only after retry', async () => {
    const user = mount();
    const f = await fillOffer(user);
    vi.mocked(assessmentApi.getCase).mockRejectedValue(new ApiError(503, 'Schema pending.'));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: assessmentKeys.case(getSession()!.generation, 9),
        exact: true,
      });
    });
    expect(await screen.findByText(/Deployment blocked/)).toBeInTheDocument();
    expect(f.getByLabelText('Provider name')).toHaveValue('Test Air Cargo');
    expect(f.getByRole('button', { name: 'Record offer' })).toBeDisabled();
    vi.mocked(assessmentApi.getCase).mockResolvedValue(approvedCase());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(f.getByRole('button', { name: 'Record offer' })).toBeEnabled());
    expect(f.getByLabelText('Provider name')).toHaveValue('Test Air Cargo');
  });
  it.each(['ENTIRE_ROUTE', 'PARTIAL_ROUTE', 'UNKNOWN'] as const)(
    'records and retains %s bundle coverage without changing the inclusions',
    async (coverage) => {
      vi.mocked(quoteMutationsApi.recordOffer).mockResolvedValue({
        offerId: 55,
        recordVersion: '00000000000000c2',
      });
      const user = mount();
      const f = await fillOffer(user);
      expect(f.getByLabelText('Bundle coverage')).toHaveValue('UNKNOWN');
      await user.selectOptions(f.getByLabelText('Bundle coverage'), coverage);
      await user.click(f.getByLabelText('Air stall'));
      await user.click(f.getByLabelText('Airport handling'));
      if (coverage === 'ENTIRE_ROUTE') expect(f.queryByText(/Coverage needs review/)).toBeNull();
      else expect(f.getByText(/Coverage needs review/)).toBeInTheDocument();
      await user.click(f.getByRole('button', { name: 'Record offer' }));
      await waitFor(() => expect(quoteMutationsApi.recordOffer).toHaveBeenCalledTimes(1));
      expect(vi.mocked(quoteMutationsApi.recordOffer).mock.calls[0][1]).toMatchObject({
        bundleCoverage: coverage,
        includesStall: true,
        includedCharges: ['AIRPORT_HANDLING'],
      });
      const table = await screen.findByRole('table', { name: 'Recorded offers' });
      expect(
        within(table).getByText(
          coverage === 'ENTIRE_ROUTE'
            ? 'Entire route'
            : coverage === 'PARTIAL_ROUTE'
              ? 'Partial route'
              : 'Unknown — needs review',
        ),
      ).toBeInTheDocument();
      expect(f.getByLabelText('Bundle coverage')).toHaveValue('UNKNOWN');
      expect(within(table).queryByText(/800\.00/)).toBeNull();
    },
  );

  it('keeps the bundle and UUID identical after an uncertain failure', async () => {
    vi.mocked(quoteMutationsApi.recordOffer).mockRejectedValue(new ApiError(0, 'Interrupted.'));
    const user = mount();
    const f = await fillOffer(user);
    await user.selectOptions(f.getByLabelText('Bundle coverage'), 'PARTIAL_ROUTE');
    await user.click(f.getByLabelText('Air stall'));
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    const retry = await f.findByRole('button', { name: 'Retry the same offer' });
    expect(f.getByLabelText('Bundle coverage')).toBeDisabled();
    await user.click(retry);
    await waitFor(() => expect(quoteMutationsApi.recordOffer).toHaveBeenCalledTimes(2));
    expect(vi.mocked(quoteMutationsApi.recordOffer).mock.calls[1]).toEqual(
      vi.mocked(quoteMutationsApi.recordOffer).mock.calls[0],
    );
  });

  it.each([403, 404])(
    'locks both staff forms and offers a safe return after offer %s',
    async (status) => {
      vi.mocked(quoteMutationsApi.recordOffer).mockRejectedValue(
        new ApiError(status, 'Unavailable.'),
      );
      const user = mount();
      const f = await fillOffer(user);
      await user.click(f.getByRole('button', { name: 'Record offer' }));
      expect(await screen.findByRole('link', { name: 'Back to requests' })).toHaveAttribute(
        'href',
        '/manager/requests',
      );
      expect(screen.queryByRole('form')).toBeNull();
      expect(quoteMutationsApi.recordOffer).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves form and displays a deployment blocker after 503 with identical retry', async () => {
    vi.mocked(quoteMutationsApi.recordOffer).mockRejectedValue(
      new ApiError(503, 'Schema pending.'),
    );
    const user = mount();
    const f = await fillOffer(user);
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    expect(await f.findByText(/Deployment blocked/)).toBeInTheDocument();
    expect(f.getByLabelText('Provider name')).toHaveValue('Test Air Cargo');
    expect(f.getByLabelText('Provider name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prepare new quotation version' })).toBeDisabled();
    await user.click(f.getByRole('button', { name: 'Retry the same offer' }));
    await waitFor(() => expect(quoteMutationsApi.recordOffer).toHaveBeenCalledTimes(2));
    expect(vi.mocked(quoteMutationsApi.recordOffer).mock.calls[1]).toEqual(
      vi.mocked(quoteMutationsApi.recordOffer).mock.calls[0],
    );
  });

  it('shows server validation beside the bundle field without discarding input', async () => {
    vi.mocked(quoteMutationsApi.recordOffer).mockRejectedValue(
      new ApiError(400, 'Check coverage.', undefined, {
        bundleCoverage: 'Review coverage evidence.',
      }),
    );
    const user = mount();
    const f = await fillOffer(user);
    await user.selectOptions(f.getByLabelText('Bundle coverage'), 'ENTIRE_ROUTE');
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    expect(await f.findByText('Review coverage evidence.')).toBeInTheDocument();
    expect(f.getByLabelText('Bundle coverage')).toHaveValue('ENTIRE_ROUTE');
    expect(f.getByLabelText('Provider name')).toHaveValue('Test Air Cargo');
  });

  it('does not silently reclassify a 422 business blocker as success', async () => {
    vi.mocked(quoteMutationsApi.recordOffer).mockRejectedValue(
      new ApiError(422, 'Coverage must be reviewed.'),
    );
    const user = mount();
    const f = await fillOffer(user);
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    expect(await f.findByText('Coverage must be reviewed.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Recorded offers' })).toBeNull();
    expect(f.getByLabelText('Provider name')).toHaveValue('Test Air Cargo');
  });

  it('records an offer with separate cost/retail, nested command and fixed unit', async () => {
    vi.mocked(quoteMutationsApi.recordOffer).mockResolvedValue({
      offerId: 55,
      recordVersion: '00000000000000c2',
    });
    const user = mount();
    const f = await fillOffer(user);
    await user.click(f.getByLabelText('Air stall'));
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    await waitFor(() => expect(quoteMutationsApi.recordOffer).toHaveBeenCalledTimes(1));
    expect(quoteMutationsApi.recordOffer).toHaveBeenCalledWith(9, {
      recordVersion: '00000000000000c1',
      operationId: expect.any(String),
      revisionId: 7,
      serviceCode: 'AIRFARE',
      providerName: 'Test Air Cargo',
      offerReference: 'OFFER-1',
      unitCode: 'SHIPMENT',
      quantity: '1',
      purchaseUnitPrice: '800.00',
      retailUnitPrice: '1000.00',
      validUntil: '2099-01-31T12:00:00Z',
      evidenceFileKey: 'docs/offer-1.pdf',
      includesStall: true,
      includedCharges: [],
      bundleCoverage: 'UNKNOWN',
    });
    const recorded = await screen.findByRole('table', { name: 'Recorded offers' });
    expect(within(recorded).getByText('55')).toBeInTheDocument();
    expect(within(recorded).getByText(/1000.00 USD/)).toBeInTheDocument();
    // The internal purchase cost is not kept anywhere on screen after recording.
    expect(screen.queryByText(/800\.00/)).toBeNull();
    expect(screen.getByLabelText(/Purchase unit price/)).toHaveValue('');
  });

  it('uses the new parent version from the receipt for the next offer', async () => {
    vi.mocked(quoteMutationsApi.recordOffer)
      .mockResolvedValueOnce({ offerId: 55, recordVersion: '00000000000000c2' })
      .mockResolvedValueOnce({ offerId: 56, recordVersion: '00000000000000c3' });
    const user = mount();
    let f = await fillOffer(user);
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    await screen.findByText(/Offer 55 recorded/);
    f = await fillOffer(user);
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    await waitFor(() => expect(quoteMutationsApi.recordOffer).toHaveBeenCalledTimes(2));
    const second = vi.mocked(quoteMutationsApi.recordOffer).mock.calls[1][1];
    expect(second.recordVersion).toBe('00000000000000c2');
  });

  it('only airfare can bundle charges', async () => {
    const user = mount();
    const form = await screen.findByRole('form', { name: 'Record supplier offer' });
    await user.selectOptions(within(form).getByLabelText('Service'), 'INSURANCE');
    expect(within(form).queryByLabelText('Air stall')).toBeNull();
    expect(within(form).getByLabelText('Unit')).toHaveValue('POLICY');
  });

  it('keeps input on a version conflict and retries uncertain failures identically', async () => {
    vi.mocked(quoteMutationsApi.recordOffer)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockRejectedValueOnce(new ApiError(409, 'Stale.', 'ORDER_VERSION_CONFLICT'));
    const user = mount();
    const f = await fillOffer(user);
    await user.click(f.getByRole('button', { name: 'Record offer' }));
    await user.click(await f.findByRole('button', { name: 'Retry the same offer' }));
    await waitFor(() => expect(quoteMutationsApi.recordOffer).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(quoteMutationsApi.recordOffer).mock.calls;
    expect(second).toEqual(first);
    expect(await f.findByText(/The request changed/)).toBeInTheDocument();
    expect(f.getByLabelText('Provider name')).toHaveValue('Test Air Cargo');
    expect(f.getByRole('button', { name: 'Reload case' })).toBeInTheDocument();
  });

  it('works for an assigned Coordinator through the staff case', async () => {
    mount('COORDINATOR');
    expect(await screen.findByRole('form', { name: 'Record supplier offer' })).toBeInTheDocument();
    expect(assignedCasesApi.get).toHaveBeenCalledWith(9, expect.any(AbortSignal));
    expect(assessmentApi.getCase).not.toHaveBeenCalled();
  });

  it('is not available to a Specialist or for an unapproved request', async () => {
    mount('SPECIALIST');
    expect(
      screen.getByText('You do not have access to quotation preparation.'),
    ).toBeInTheDocument();
  });

  it('blocks preparation unless the request is approved', async () => {
    vi.mocked(assessmentApi.getCase).mockResolvedValue(approvedCase({ orderStatus: 'SUBMITTED' }));
    mount();
    expect(await screen.findByText(/only be prepared for an approved request/)).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
  });
});

describe('source and evidence rules', () => {
  const offer = {
    revisionId: 7,
    serviceCode: 'AIRFARE' as const,
    providerName: 'A',
    offerReference: 'B',
    unitCode: 'SHIPMENT',
    quantity: '1',
    purchaseUnitPrice: '1.00',
    retailUnitPrice: '2.00',
    validUntil: '2099-01-01T00:00:00Z',
    evidenceFileKey: 'k',
    includesStall: false,
    includedCharges: [],
  };
  it('rejects zero/negative/over-precise numbers and past validity', () => {
    expect(validateOffer({ ...offer, quantity: '0' }).quantity).toBeDefined();
    expect(validateOffer({ ...offer, quantity: '-1' }).quantity).toBeDefined();
    expect(validateOffer({ ...offer, retailUnitPrice: '1.234' }).retailUnitPrice).toBeDefined();
    expect(
      validateOffer({ ...offer, purchaseUnitPrice: 'Infinity' }).purchaseUnitPrice,
    ).toBeDefined();
    expect(
      validateOffer({ ...offer, validUntil: '2000-01-01T00:00:00Z' }).validUntil,
    ).toBeDefined();
    expect(
      validateOffer({ ...offer, serviceCode: 'ESCORT', includesStall: true }).includedCharges,
    ).toBeDefined();
    expect(validateOffer(offer)).toEqual({});
  });

  it('priced evidence needs exactly one source; not-required has none', () => {
    const base: QuoteEvidence = {
      code: 'AIRFARE',
      status: 'PRICED',
      quantity: '1',
      tariffId: null,
      offerId: 55,
      sourceReference: 'ref',
      validUntil: '2099-06-01T00:00:00Z',
      reason: 'Carrier offer',
    };
    expect(validateEvidence(base, '2099-05-01T00:00:00Z')).toEqual({});
    expect(validateEvidence({ ...base, tariffId: 3 }, null).source).toBeDefined();
    expect(validateEvidence({ ...base, offerId: null }, null).source).toBeDefined();
    expect(
      validateEvidence({ ...base, status: 'NOT_REQUIRED', quantity: '1' }, null).source,
    ).toBeDefined();
    expect(validateEvidence(base, '2099-07-01T00:00:00Z').validUntil).toMatch(
      /until the quotation/,
    );
  });

  it('sums money exactly without floating point', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(sumMoney(['99999999999999.99', '0.01'])).toBe('100000000000000.00');
    expect(sumMoney(['5'])).toBe('5.00');
  });
});
