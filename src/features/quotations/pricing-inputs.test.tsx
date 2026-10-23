import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PricingInputs, inputFor, pricingBlockers } from './pricing-inputs';
import { quotation } from './testing';
import type { QuoteResponse } from './contracts';
import { FundingStatus, refreshFunding } from '../payments/FundingStatus';
import { assessmentApi } from '../assessment/api';
import { departureApi } from '../departure/api';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';

vi.mock('../assessment/api', () => ({ assessmentApi: { getCase: vi.fn() } }));
vi.mock('../departure/api', () => ({ departureApi: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
});

const line = (code: string, patch: Partial<QuoteResponse['items'][number]> = {}) => ({
  ...quotation.items[0],
  code,
  amount: null,
  pricingStatus: 'PENDING' as const,
  blockers: [],
  ...patch,
});

describe('pricing inputs for the Manager', () => {
  it('attributes each open item to the role that completes it', () => {
    expect(inputFor('QUARANTINE_PENDING')).toBe('assessment');
    expect(inputFor('ITINERARY_PENDING')).toBe('itinerary');
    expect(inputFor('AIRFARE_PENDING')).toBe('itinerary');
    expect(inputFor('RATE_PENDING')).toBe('tariffs');
    expect(inputFor('SOMETHING_NEW')).toBe('tariffs');
  });

  it('shows who the draft is waiting for and the airfare taken from the route', () => {
    const q: QuoteResponse = {
      ...quotation,
      blockers: ['QUARANTINE_PENDING'],
      items: [line('AIRFARE', { amount: '1500.00', pricingStatus: 'PRICED' }), line('GROOMING')],
    };
    expect(pricingBlockers(q)).toEqual(['QUARANTINE_PENDING', 'GROOMING_PENDING']);
    render(<PricingInputs quotation={q} />);
    const assessment = screen.getByRole('listitem', { name: 'Quarantine & veterinary assessment' });
    expect(assessment).toHaveTextContent('Waiting for Specialist');
    expect(assessment).toHaveTextContent('Quarantine pending');
    const itinerary = screen.getByRole('listitem', { name: 'Itinerary & airfare' });
    expect(itinerary).toHaveTextContent('Ready');
    expect(itinerary).toHaveTextContent('Airfare from the route: USD 1500.00');
    expect(screen.getByRole('listitem', { name: 'Tariffs & supplier prices' })).toHaveTextContent(
      'Waiting for Manager',
    );
  });
});

describe('funding status on the Manager payments page', () => {
  it('re-reads the request status and financial gate after a payment write', async () => {
    vi.mocked(assessmentApi.getCase)
      .mockResolvedValueOnce({ orderStatus: 'APPROVED' } as never)
      .mockResolvedValueOnce({ orderStatus: 'IN_PREPARATION' } as never);
    vi.mocked(departureApi.get).mockRejectedValue(new ApiError(409, 'No plan yet.'));
    render(
      <QueryClientProvider client={queryClient}>
        <FundingStatus orderId={11} />
      </QueryClientProvider>,
    );
    const status = await screen.findByRole('region', { name: 'Request funding status' });
    expect(await within(status).findByText('Approved for preparation')).toBeInTheDocument();
    expect(
      await within(status).findByText('Shown once a journey plan exists.'),
    ).toBeInTheDocument();
    await refreshFunding(getSession()!.generation, 11);
    await waitFor(() => expect(within(status).getByText('In preparation')).toBeInTheDocument());
    expect(assessmentApi.getCase).toHaveBeenCalledTimes(2);
  });
});
