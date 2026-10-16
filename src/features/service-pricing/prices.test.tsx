import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { effectLabel, ManagerPricesPage, validUnitPrice } from './ManagerPricesPage';
import { tariffApi } from './api';
import { tariffSchema, type ServiceRate, type Tariff } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  TARIFF_PAGE_SIZE: 20,
  tariffApi: { products: vi.fn(), list: vi.fn(), get: vi.fn(), create: vi.fn(), replace: vi.fn() },
}));

const rate = (patch: Partial<ServiceRate>): ServiceRate => ({
  product: 'GROOMING',
  uiSection: 'HORSE_CARE',
  unit: 'PERSON_DAY',
  unitRate: null,
  currency: 'USD',
  pricingMode: 'RATE',
  tariffId: null,
  tariffVersion: null,
  ...patch,
});
const tariff = (patch: Partial<Tariff>): Tariff => ({
  tariffId: 31,
  product: 'ROAD_TRANSPORT',
  unit: 'KM',
  unitPrice: '2.00',
  currency: 'USD',
  version: 1,
  effectiveFrom: '2026-01-01T00:00:00Z',
  effectiveTo: null,
  status: 'ACTIVE',
  sourceReference: 'Approved tariff, Jan 2026',
  sourceReviewRequired: false,
  recordVersion: '00000000000000a1',
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
  vi.mocked(tariffApi.products).mockResolvedValue([
    rate({}),
    rate({
      product: 'ROAD_TRANSPORT',
      uiSection: 'TRANSPORTATION',
      unit: 'KM',
      unitRate: '2.00',
      tariffId: 31,
      tariffVersion: 1,
    }),
    rate({ product: 'BASIC_CARE', unit: 'INCLUDED', pricingMode: 'INCLUDED' }),
  ]);
  vi.mocked(tariffApi.list).mockResolvedValue({
    items: [tariff({})],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(tariffApi.get).mockResolvedValue(tariff({}));
});
function mount() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManagerPricesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function fill(
  user: ReturnType<typeof userEvent.setup>,
  price: string,
  source = 'Board approval 12',
) {
  await user.type(screen.getByLabelText('Unit price (USD)'), price);
  await user.type(screen.getByLabelText('Source reference (internal)'), source);
}

describe('service price catalog (FE-25)', () => {
  it('lists products with current price, and included products are not chargeable', async () => {
    mount();
    const table = await screen.findByRole('table', { name: 'Service products' });
    const included = within(table).getByText('Basic care').closest('tr')!;
    expect(within(included).getByText('Included')).toBeInTheDocument();
    expect(within(included).queryByRole('button')).toBeNull();
    const grooming = within(table).getByText('Grooming').closest('tr')!;
    expect(within(grooming).getByText('No current price')).toBeInTheDocument();
  });

  it('publishes a new price family with recordVersion null', async () => {
    vi.mocked(tariffApi.create).mockResolvedValue(
      tariff({ tariffId: 40, product: 'GROOMING', unit: 'PERSON_DAY', unitPrice: '1.25' }),
    );
    const user = mount();
    const row = (await screen.findByText('Grooming')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Publish price' }));
    await fill(user, '1.25');
    await user.click(
      within(screen.getByRole('form')).getByRole('button', { name: 'Publish price' }),
    );
    await waitFor(() =>
      expect(tariffApi.create).toHaveBeenCalledWith({
        product: 'GROOMING',
        unitPrice: '1.25',
        sourceReference: 'Board approval 12',
        validUntil: null,
        recordVersion: null,
        operationId: expect.any(String),
      }),
    );
    expect(await screen.findByText(/Published Grooming version 1: 1.25 USD/)).toBeInTheDocument();
    await waitFor(() => expect(tariffApi.products).toHaveBeenCalledTimes(2));
  });

  it('replaces using the latest version rowversion and shows the new version', async () => {
    vi.mocked(tariffApi.replace).mockResolvedValue(
      tariff({ tariffId: 32, version: 2, unitPrice: '2.10' }),
    );
    const user = mount();
    const row = within(await screen.findByRole('table', { name: 'Service products' }))
      .getByText('Road transport')
      .closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Replace price' }));
    expect(await screen.findByText(/Replacing version 1/)).toBeInTheDocument();
    await fill(user, '2.10');
    await user.click(screen.getByRole('button', { name: 'Publish replacement' }));
    await waitFor(() =>
      expect(tariffApi.replace).toHaveBeenCalledWith(
        31,
        expect.objectContaining({ recordVersion: '00000000000000a1', unitPrice: '2.10' }),
      ),
    );
    expect(await screen.findByText(/version 2: 2.10 USD/)).toBeInTheDocument();
  });

  it('rejects invalid money before sending', async () => {
    const user = mount();
    const row = (await screen.findByText('Grooming')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Publish price' }));
    await fill(user, '1.255');
    await user.click(
      within(screen.getByRole('form')).getByRole('button', { name: 'Publish price' }),
    );
    expect(await screen.findByText(/up to 2 decimals/)).toBeInTheDocument();
    expect(tariffApi.create).not.toHaveBeenCalled();
    expect(validUnitPrice('123456789012345')).toBe(false);
    expect(validUnitPrice('1e3')).toBe(false);
    expect(validUnitPrice('0')).toBe(true);
  });

  it('keeps input on a version conflict and offers an explicit reload', async () => {
    vi.mocked(tariffApi.replace).mockRejectedValue(
      new ApiError(409, 'Reload and compare the latest tariff version.', 'TARIFF_VERSION_CONFLICT'),
    );
    const user = mount();
    const row = within(await screen.findByRole('table', { name: 'Service products' }))
      .getByText('Road transport')
      .closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Replace price' }));
    await screen.findByText(/Replacing version 1/);
    await fill(user, '2.20');
    await user.click(screen.getByRole('button', { name: 'Publish replacement' }));
    expect(await screen.findByRole('button', { name: 'Reload prices' })).toBeInTheDocument();
    expect(screen.getByLabelText('Unit price (USD)')).toHaveValue('2.20');
    expect(tariffApi.replace).toHaveBeenCalledTimes(1);
  });

  it('retries a busy or interrupted publication with the identical command', async () => {
    vi.mocked(tariffApi.create)
      .mockRejectedValueOnce(new ApiError(409, 'Retry the same operation later.', 'TARIFF_BUSY'))
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(tariff({ product: 'GROOMING' }));
    const user = mount();
    const row = (await screen.findByText('Grooming')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Publish price' }));
    await fill(user, '1.25');
    await user.click(
      within(screen.getByRole('form')).getByRole('button', { name: 'Publish price' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Retry the same publication' }));
    await screen.findByText('Interrupted');
    await user.click(screen.getByRole('button', { name: 'Retry the same publication' }));
    await waitFor(() => expect(tariffApi.create).toHaveBeenCalledTimes(3));
    const calls = vi.mocked(tariffApi.create).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]).toEqual(calls[0]);
  });

  it('explains a pending migration (503) instead of a generic failure', async () => {
    vi.mocked(tariffApi.products).mockRejectedValue(
      new ApiError(503, 'Service unavailable', 'TARIFF_SCHEMA_PENDING'),
    );
    mount();
    expect(
      await screen.findAllByText(/migration 006 is pending/, undefined, { timeout: 4000 }),
    ).not.toHaveLength(0);
  });

  it('shows a safe error on 403', async () => {
    vi.mocked(tariffApi.products).mockRejectedValue(
      new ApiError(403, 'You do not have permission for this action.'),
    );
    mount();
    expect(
      await screen.findByText('You do not have permission for this action.'),
    ).toBeInTheDocument();
  });

  it('renders legacy rows with null product or rate without guessing', async () => {
    vi.mocked(tariffApi.list).mockResolvedValue({
      items: [
        tariff({
          tariffId: 9,
          product: null,
          unitPrice: null,
          sourceReference: null,
          sourceReviewRequired: true,
        }),
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    mount();
    const table = await screen.findByRole('table', { name: 'Price history' });
    expect(within(table).getByText('Legacy (unrecognised product)')).toBeInTheDocument();
    expect(within(table).getByText(/Unsupported legacy rate/)).toBeInTheDocument();
    expect(within(table).getByText(/Source review required/)).toBeInTheDocument();
    expect(within(table).queryByRole('button')).toBeNull();
  });
});

describe('tariff rules', () => {
  it('reads dates, not ACTIVE alone, for whether a price is in effect', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    expect(effectLabel(tariff({}), now)).toBe('In effect');
    expect(effectLabel(tariff({ effectiveFrom: '2026-07-01T00:00:00Z' }), now)).toBe('Scheduled');
    expect(effectLabel(tariff({ effectiveTo: '2026-05-01T00:00:00Z' }), now)).toBe('Ended');
  });

  it('accepts nullable legacy fields in the contract', () => {
    const legacy = tariff({ product: null, unitPrice: null, sourceReference: null });
    expect(tariffSchema.safeParse(legacy).success).toBe(true);
    expect(tariffSchema.safeParse({ ...legacy, unitPrice: 2 }).success).toBe(false);
  });
});
