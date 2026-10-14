import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrderEditor } from './pages';
import { ordersApi } from './api';
import { draftInput, draftForm } from './form';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Order } from '../../shared/api/contracts';
vi.mock('./api', () => ({
  ordersApi: { get: vi.fn(), update: vi.fn(), submit: vi.fn(), create: vi.fn() },
}));
const form = draftForm();
Object.assign(form, {
  horseId: '1',
  originCountryCode: 'VN',
  destinationCountryCode: 'GB',
  originAddress: 'A',
  destinationAddress: 'B',
  originTimezone: 'Asia/Ho_Chi_Minh',
  destinationTimezone: 'Europe/London',
  preferredDepartureAt: '2030-02-01T08:00:00Z',
  deliveryDeadline: '2030-02-01T10:00:00Z',
  importType: 'NEEDS_ADVICE',
});
const order: Order = {
  orderId: 1,
  orderNumber: 'TEST-1',
  orderStatus: 'DRAFT',
  currency: 'USD',
  recordVersion: '0000000000000001',
  currentRevisionId: null,
  currentPlanId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  draft: draftInput(form, { insurance: 'EXISTING', existingPolicyReference: 'test-ref' }),
};
beforeEach(() => {
  vi.clearAllMocks();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrderEditor order={order} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('draft conflict and submit retry', () => {
  it('retains edits on 409 and never silently retries with another version', async () => {
    vi.mocked(ordersApi.update).mockRejectedValue(
      new ApiError(409, 'Version changed', 'ORDER_VERSION_CONFLICT'),
    );
    mount();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Pickup address'));
    await user.type(screen.getByLabelText('Pickup address'), 'Changed stable');
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Version changed')).toBeInTheDocument();
    expect(screen.getByLabelText('Pickup address')).toHaveValue('Changed stable');
    expect(ordersApi.update).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    expect(ordersApi.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        recordVersion: order.recordVersion,
        services: order.draft.services,
      }),
    );
  });
  it('reuses UUID/version on uncertain retry and refetches current order', async () => {
    vi.mocked(ordersApi.submit)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce({ revisionId: 3 });
    vi.mocked(ordersApi.get).mockResolvedValue({
      ...order,
      orderStatus: 'SUBMITTED',
      recordVersion: '0000000000000002',
      currentRevisionId: 3,
    });
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '4. Review & Submit' }));
    await user.click(screen.getByRole('button', { name: 'Submit for Review' }));
    await screen.findByText('Interrupted');
    await user.click(screen.getByRole('button', { name: 'Retry the same submission' }));
    await waitFor(() => expect(ordersApi.get).toHaveBeenCalledWith(1));
    expect(vi.mocked(ordersApi.submit).mock.calls[0]).toEqual(
      vi.mocked(ordersApi.submit).mock.calls[1],
    );
    expect(await screen.findByText(/Request submitted for assessment/)).toBeInTheDocument();
  });
});
