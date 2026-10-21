import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import { ratesApi } from './rates-api';
import { rateText } from './rates';
import { testDisclosure, testOrder } from './testing';
import type { ServiceRate } from '../service-pricing/contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  bookingApi: { get: vi.fn(), confirm: vi.fn(), preview: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('./rates-api', () => ({ ratesApi: { get: vi.fn() } }));

const rate = (patch: Partial<ServiceRate>): ServiceRate => ({
  product: 'ROAD_TRANSPORT',
  uiSection: 'TRANSPORTATION',
  unit: 'KM',
  unitRate: '2.00',
  currency: 'USD',
  pricingMode: 'RATE',
  tariffId: 31,
  tariffVersion: 1,
  ...patch,
});
const catalog: ServiceRate[] = [
  rate({}),
  rate({ product: 'AIRFARE', unit: 'SHIPMENT', unitRate: null, pricingMode: 'EVIDENCE' }),
  rate({ product: 'GROOMING', uiSection: 'HORSE_CARE', unit: 'PERSON_DAY', unitRate: '45.50' }),
  rate({
    product: 'QUARANTINE_STANDARD',
    uiSection: 'QUARANTINE',
    unit: 'HORSE_DAY',
    unitRate: null,
  }),
  rate({
    product: 'INSURANCE_MORTALITY',
    uiSection: 'INSURANCE',
    unit: 'POLICY',
    unitRate: '300.00',
    pricingMode: 'EVIDENCE',
  }),
  rate({
    product: 'DOCUMENT_REVIEW',
    uiSection: 'ADDITIONAL_CHARGES',
    unit: 'INCLUDED',
    unitRate: null,
    pricingMode: 'INCLUDED',
  }),
  rate({
    product: 'WAITING',
    uiSection: 'ADDITIONAL_CHARGES',
    unit: 'HOUR',
    unitRate: '20.00',
    pricingMode: 'EVENT',
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
  vi.mocked(bookingApi.get).mockResolvedValue(testDisclosure());
  vi.mocked(ratesApi.get).mockResolvedValue(catalog);
});
async function open(section: string) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={testOrder()} preferences={null} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: section }));
  return user;
}

describe('unit prices inside service options (FE-26)', () => {
  it('shows the exact server rate next to the EquiTransit option, own provider uncharged', async () => {
    const user = await open('Transportation');
    expect(screen.queryByText('2.00 USD per km')).toBeNull();
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    const equi = screen.getByLabelText('Arranged by EquiTransit').closest('.choice-row')!;
    expect(await within(equi as HTMLElement).findByText('2.00 USD per km')).toBeInTheDocument();
    const airfare = within(screen.getByRole('dialog')).getByRole('listitem', { name: 'Airfare' });
    expect(within(airfare).getByText('Awaiting pricing/assessment')).toBeInTheDocument();
    expect(ratesApi.get).toHaveBeenCalledWith(11, expect.any(AbortSignal));
    await user.click(screen.getByLabelText('I will arrange my own provider'));
    const own = screen.getByLabelText('I will arrange my own provider').closest('.choice-row')!;
    expect(within(own as HTMLElement).getByText(/not charged by EquiTransit/)).toBeInTheDocument();
    expect(screen.queryByText('2.00 USD per km')).toBeNull();
  });

  it('never shows a missing rate as zero or free', async () => {
    const user = await open('Quarantine Packages');
    expect(screen.queryByText('Awaiting pricing')).toBeNull();
    await user.click(screen.getByLabelText('Standard package'));
    const standard = screen.getByLabelText('Standard package').closest('.choice-row')!;
    expect(within(standard as HTMLElement).getByText('Awaiting pricing')).toBeInTheDocument();
    // Not in the catalog at all: still awaiting, never 0.
    const enhanced = screen.getByLabelText('Enhanced package').closest('.choice-row')!;
    expect(within(enhanced as HTMLElement).queryByText('Awaiting pricing')).toBeNull();
    await user.click(screen.getByLabelText('Enhanced package'));
    expect(within(enhanced as HTMLElement).getByText('Awaiting pricing')).toBeInTheDocument();
    expect(screen.queryByText(/\b0(\.00)? USD/)).toBeNull();
  });

  it('marks evidence and event rates as not final, and included as included', async () => {
    await open('Additional Charges');
    const dialog = within(screen.getByRole('dialog'));
    const review = within(dialog.getByRole('listitem', { name: 'Document review' }));
    expect(review.getByText('Included')).toBeInTheDocument();
    expect(review.getByText('Never charged separately')).toBeInTheDocument();
    const waiting = within(dialog.getByRole('listitem', { name: 'Waiting time' }));
    expect(waiting.getByText('20.00')).toBeInTheDocument();
    expect(waiting.getByText('USD per hour')).toBeInTheDocument();
    expect(waiting.getByText('Charged only if it happens')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: "Current unit rates (today's catalog, not your quote)" }),
    ).toBeInTheDocument();
  });

  it('insurance: no premium for none or existing cover', async () => {
    const user = await open('Insurance');
    expect(screen.queryByText(/300.00 USD/)).toBeNull();
    await user.click(screen.getByLabelText('No insurance through EquiTransit'));
    expect(screen.getByText('No premium')).toBeInTheDocument();
    expect(screen.queryByLabelText('I already have a policy that covers this journey')).toBeNull();
    await user.click(screen.getByLabelText('Request new mortality cover'));
    expect(
      within(screen.getByRole('dialog')).getByText(
        /300.00 USD per policy · final amount needs assessment/,
      ),
    ).toBeInTheDocument();
  });

  it('keeps choices usable when rates fail to load', async () => {
    vi.mocked(ratesApi.get).mockRejectedValue(new ApiError(502, 'Rates could not be loaded.'));
    const user = await open('Horse Care');
    expect(screen.queryByText('Price unavailable right now')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Grooming days' }));
    await user.click(screen.getByRole('radio', { name: '2 days' }));
    expect(screen.getByRole('radio', { name: '2 days' })).toBeChecked();
    expect(await screen.findAllByText('Price unavailable right now')).not.toHaveLength(0);
  });

  it('keeps section cards concise and hides other prices when an optional service is selected or cleared', async () => {
    const user = await open('Horse Care');
    const cards = document.querySelectorAll('.service-card');
    expect(cards).toHaveLength(7);
    for (const card of cards)
      expect(card).not.toHaveTextContent(/USD|per km|per policy|Loading price/);
    expect(screen.queryByText('45.50 USD per person-day')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Grooming days' }));
    await user.click(screen.getByRole('radio', { name: '2 days' }));
    expect(await screen.findByText('45.50 USD per person-day')).toBeInTheDocument();
    expect(screen.queryByText('2.00 USD per km')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Grooming days' }));
    expect(screen.queryByText('45.50 USD per person-day')).toBeNull();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
});

describe('rate text', () => {
  it('describes each pricing mode without inventing amounts', () => {
    expect(rateText(rate({ unitRate: null }), 'ready')).toBe('Awaiting pricing');
    expect(rateText(undefined, 'ready')).toBe('Awaiting pricing');
    expect(rateText(rate({ pricingMode: 'INCLUDED', unitRate: null }), 'ready')).toBe('Included');
    expect(rateText(rate({ unitRate: '0.00' }), 'ready')).toBe('0.00 USD per km');
  });
});
