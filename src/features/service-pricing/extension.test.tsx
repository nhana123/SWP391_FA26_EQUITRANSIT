import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ManagerPricesPage } from './ManagerPricesPage';
import { tariffApi } from './api';
import { pricingKeys } from './keys';
import type { ServiceRate, Tariff } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  tariffApi: { products: vi.fn(), list: vi.fn(), get: vi.fn(), create: vi.fn(), replace: vi.fn() },
}));
const price: Tariff = {
  tariffId: 31,
  product: 'ROAD_TRANSPORT',
  unit: 'SHIPMENT',
  unitPrice: '150.00',
  currency: 'USD',
  version: 1,
  effectiveFrom: '2026-01-01T00:00:00Z',
  effectiveTo: null,
  status: 'ACTIVE',
  sourceReference: 'Test approval',
  sourceReviewRequired: false,
  recordVersion: '00000000000000a1',
};
const product: ServiceRate = {
  product: 'ROAD_TRANSPORT',
  uiSection: 'TRANSPORTATION',
  unit: 'KM',
  unitRate: '150.00',
  currency: 'USD',
  pricingMode: 'RATE',
  tariffId: 31,
  tariffVersion: 1,
  allowedUnits: ['KM', 'SHIPMENT'],
};
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' });
  vi.mocked(tariffApi.products).mockResolvedValue([product]);
  vi.mocked(tariffApi.get).mockResolvedValue(price);
  vi.mocked(tariffApi.list).mockResolvedValue({
    items: [price],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
});
async function mount(replacing = true) {
  if (!replacing)
    vi.mocked(tariffApi.products).mockResolvedValue([
      { ...product, tariffId: null, tariffVersion: null },
    ]);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManagerPricesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ delay: null });
  const row = within(await screen.findByRole('table', { name: 'Service products' }))
    .getByText('Road transport')
    .closest('tr')!;
  await user.click(
    within(row).getByRole('button', { name: replacing ? 'Replace price' : 'Publish price' }),
  );
  await screen.findByLabelText('Price unit');
  await user.type(screen.getByLabelText('Unit price (USD)'), '175.25');
  await user.type(screen.getByLabelText('Source reference (internal)'), 'Reviewed source');
  return user;
}
it('publishes SHIPMENT only when allowed by the selected product', async () => {
  vi.mocked(tariffApi.create).mockResolvedValue(price);
  const user = await mount(false);
  expect(
    [...screen.getByLabelText<HTMLSelectElement>('Price unit').options].map((o) => o.value),
  ).toEqual(['KM', 'SHIPMENT']);
  await user.selectOptions(screen.getByLabelText('Price unit'), 'SHIPMENT');
  await user.click(within(screen.getByRole('form')).getByRole('button', { name: 'Publish price' }));
  await waitFor(() =>
    expect(tariffApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ unitCode: 'SHIPMENT', unitPrice: '175.25' }),
    ),
  );
});
it('starts a replacement with its existing SHIPMENT unit instead of the default KM', async () => {
  vi.mocked(tariffApi.replace).mockResolvedValue({ ...price, tariffId: 32, version: 2 });
  const user = await mount();
  expect(screen.getByLabelText('Price unit')).toHaveValue('SHIPMENT');
  await user.click(screen.getByRole('button', { name: 'Publish replacement' }));
  await waitFor(() =>
    expect(tariffApi.replace).toHaveBeenCalledWith(
      31,
      expect.objectContaining({ unitCode: 'SHIPMENT', recordVersion: price.recordVersion }),
    ),
  );
});
it('does not adopt an unseen background tariff version', async () => {
  vi.mocked(tariffApi.replace).mockRejectedValue(
    new ApiError(409, 'Changed.', 'TARIFF_VERSION_CONFLICT'),
  );
  const user = await mount();
  act(() =>
    queryClient.setQueryData(pricingKeys.tariff(getSession()!.generation, 31), {
      ...price,
      recordVersion: '00000000000000a9',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Publish replacement' }));
  await screen.findByText('Changed.');
  expect(vi.mocked(tariffApi.replace).mock.calls[0][1].recordVersion).toBe(price.recordVersion);
  expect(screen.getByRole('button', { name: 'Publish replacement' })).toBeDisabled();
});
it('reloads and reviews the actual successor ID/version after conflict without losing input', async () => {
  vi.mocked(tariffApi.replace).mockRejectedValue(
    new ApiError(409, 'Changed.', 'TARIFF_VERSION_CONFLICT'),
  );
  const user = await mount();
  await user.click(screen.getByRole('button', { name: 'Publish replacement' }));
  await screen.findByRole('button', { name: 'Reload prices' });
  vi.mocked(tariffApi.products).mockResolvedValue([{ ...product, tariffId: 32, tariffVersion: 2 }]);
  vi.mocked(tariffApi.get).mockResolvedValue({
    ...price,
    tariffId: 32,
    version: 2,
    recordVersion: '00000000000000a2',
  });
  await user.click(screen.getByRole('button', { name: 'Reload prices' }));
  await screen.findByText(/Replacing version 2/);
  expect(screen.getByLabelText('Unit price (USD)')).toHaveValue('175.25');
  await user.click(screen.getByRole('button', { name: 'Publish replacement' }));
  await waitFor(() => expect(tariffApi.replace).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(tariffApi.replace).mock.calls;
  expect(second[0]).toBe(32);
  expect(second[1].recordVersion).toBe('00000000000000a2');
  expect(second[1].operationId).not.toBe(first[1].operationId);
});
it('keeps form and unit during a background 503 and unblocks after explicit reload', async () => {
  const user = await mount();
  vi.mocked(tariffApi.products).mockRejectedValue(new ApiError(503, 'Pricing schema pending.'));
  await act(async () => {
    await queryClient.invalidateQueries({
      queryKey: pricingKeys.products(getSession()!.generation),
    });
  });
  await screen.findByText('Pricing schema pending.');
  expect(screen.getByLabelText('Unit price (USD)')).toHaveValue('175.25');
  expect(screen.getByRole('button', { name: 'Publish replacement' })).toBeDisabled();
  vi.mocked(tariffApi.products).mockResolvedValue([product]);
  await user.click(screen.getByRole('button', { name: 'Reload prices' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Publish replacement' })).toBeEnabled(),
  );
  expect(tariffApi.replace).not.toHaveBeenCalled();
});
it('keeps the chosen unit and UUID identical when retrying a schema failure', async () => {
  vi.mocked(tariffApi.replace)
    .mockRejectedValueOnce(new ApiError(503, 'Schema pending.'))
    .mockResolvedValueOnce({ ...price, tariffId: 32, version: 2 });
  const user = await mount();
  await user.selectOptions(screen.getByLabelText('Price unit'), 'KM');
  await user.click(screen.getByRole('button', { name: 'Publish replacement' }));
  await user.click(await screen.findByRole('button', { name: 'Retry the same publication' }));
  await waitFor(() => expect(tariffApi.replace).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(tariffApi.replace).mock.calls;
  expect(calls[1]).toEqual(calls[0]);
});
