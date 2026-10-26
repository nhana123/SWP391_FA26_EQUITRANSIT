import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderEditor } from './pages';
import { ordersApi } from './api';
import { bookingApi } from '../booking-services/api';
import { BookingServices } from '../booking-services/BookingServices';
import { testDisclosure, testOrder } from '../booking-services/testing';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({ ordersApi: { create: vi.fn(), update: vi.fn() } }));
vi.mock('../booking-services/api', () => ({
  bookingApi: { get: vi.fn(), confirm: vi.fn(), preview: vi.fn() },
}));
vi.mock('../booking-services/rates-api', () => ({
  ratesApi: { get: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../horses/api', () => ({
  horsesApi: {
    list: vi.fn().mockResolvedValue({
      items: [{ horseId: 5, name: 'Selected horse', measurementsComplete: true }],
      page: 0,
      size: 20,
      totalPages: 1,
      totalElements: 1,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
  vi.mocked(ordersApi.create).mockResolvedValue(testOrder());
  vi.mocked(bookingApi.get).mockResolvedValue(testDisclosure());
});

it('locks future steps on the stepper, guides the user step-by-step with auto-save, and loads real service sections', async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/customer/requests/new']}>
        <Routes>
          <Route path="/customer/requests/new" element={<OrderEditor />} />
          <Route
            path="/customer/requests/:id"
            element={
              <OrderEditor
                order={testOrder()}
                servicesSlot={(props) => <BookingServices {...props} />}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Future steps are locked during booking
  expect(screen.getByRole('button', { name: '3. Service preferences' })).toBeDisabled();
  expect(ordersApi.create).not.toHaveBeenCalled();
  expect(bookingApi.get).not.toHaveBeenCalled();

  // Advance to step 1 (Horse) via explicit green CTA button
  await user.click(screen.getByRole('button', { name: 'Tiếp tục sang bước Chọn ngựa →' }));
  expect(screen.getByRole('button', { name: '2. Horse' })).toHaveAttribute('aria-current', 'step');

  // Select horse
  await user.click(await screen.findByRole('radio', { name: /Selected horse/ }));

  // Advance to step 2 (Services) via explicit green CTA button -> auto-saves draft!
  await user.click(await screen.findByRole('button', { name: /Tiếp tục sang bước Dịch vụ/ }));

  expect(await screen.findByRole('button', { name: 'Transportation' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(7);
  expect(ordersApi.create).toHaveBeenCalledOnce();
  expect(ordersApi.create).toHaveBeenCalledWith(
    expect.objectContaining({ horseId: 5, services: null }),
  );
  expect(bookingApi.get).toHaveBeenCalledWith(11, expect.any(AbortSignal));
  expect(bookingApi.confirm).not.toHaveBeenCalled();
});

it('keeps unsaved horse and route edits out of service confirmation until the draft is saved', async () => {
  const user = userEvent.setup();
  const updated = { ...testOrder(), recordVersion: '00000000000000e2' };
  vi.mocked(ordersApi.update).mockResolvedValue(updated);
  vi.mocked(bookingApi.get).mockResolvedValue(
    testDisclosure({ recordVersion: updated.recordVersion }),
  );
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrderEditor order={testOrder()} servicesSlot={(props) => <BookingServices {...props} />} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await user.type(screen.getByLabelText('Pickup address'), 'New stable');
  await user.click(screen.getByRole('button', { name: '3. Service preferences' }));
  expect(screen.queryByRole('button', { name: 'Transportation' })).toBeNull();
  expect(bookingApi.get).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save draft & load services' }));
  await screen.findByRole('button', { name: 'Transportation' });
  await waitFor(() => expect(ordersApi.update).toHaveBeenCalledOnce());
  expect(ordersApi.update).toHaveBeenCalledWith(
    11,
    expect.objectContaining({
      originAddress: 'New stable',
      recordVersion: testOrder().recordVersion,
    }),
  );
  expect(bookingApi.confirm).not.toHaveBeenCalled();
});
