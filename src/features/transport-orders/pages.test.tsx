import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrderEditor } from './pages';
import { ordersApi } from './api';
import { draftInput, draftForm } from './form';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';
import type { Horse, Order } from '../../shared/api/contracts';
import { horsesApi } from '../horses/api';
vi.mock('./api', () => ({
  ordersApi: { get: vi.fn(), update: vi.fn(), submit: vi.fn(), create: vi.fn() },
}));
vi.mock('../horses/api', () => ({
  horsesApi: {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    get: vi.fn(),
  },
}));
const horse: Horse = {
  horseId: 1,
  name: 'Thunder Bay',
  microchipId: '985141000123456',
  passportNumber: 'FEI-10459921',
  breed: null,
  dateOfBirth: '2019-04-15',
  sexCode: 'GELDING',
  weightKg: 520,
  heightCm: 165,
  bodyWidthCm: null,
  measuredAt: null,
  specialCareNotes: null,
  handlingNotes: null,
  feedWaterRequirements: null,
  stallPreferences: null,
  veterinaryInstructions: null,
  veterinaryInstructionSource: null,
  recordVersion: '0000000000000001',
  measurementsComplete: true,
};
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
  receiverName: 'Alex Receiver',
  receiverPhone: '+6590123456',
  influenzaVaccinated: 'true',
  lastInfluenzaVaccinationDate: '2026-08-20',
  declaredAccurate: 'true',
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
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
  vi.mocked(horsesApi.get).mockResolvedValue(horse);
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
  it('shows backend validation at import type, airport item and horse while keeping edits', async () => {
    vi.mocked(ordersApi.update).mockRejectedValue(
      new ApiError(400, 'Check input', undefined, {
        importType: 'Choose a supported import type.',
        'transitAirports[0]': 'This airport is unavailable.',
        horseId: 'Choose an available horse.',
      }),
    );
    mount();
    const user = userEvent.setup({ delay: null });
    await user.clear(screen.getByLabelText('Pickup address'));
    await user.type(screen.getByLabelText('Pickup address'), 'Keep my stable');
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Choose a supported import type.')).toBeInTheDocument();
    expect(screen.getByLabelText('Import type')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Transit airports (comma separated)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('This airport is unavailable.')).toBeInTheDocument();
    expect(screen.getByLabelText('Pickup address')).toHaveValue('Keep my stable');
    await user.click(screen.getByRole('button', { name: 'Review Horse' }));
    expect(await screen.findByText('Choose an available horse.')).toBeInTheDocument();
    expect(ordersApi.update).toHaveBeenCalledTimes(1);
  });

  it('retains edits on 409 and never silently retries with another version', async () => {
    vi.mocked(ordersApi.update).mockRejectedValue(
      new ApiError(409, 'Version changed', 'ORDER_VERSION_CONFLICT'),
    );
    mount();
    const user = userEvent.setup({ delay: null });
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
  it('blocks submission for a horse without identity or measurements', async () => {
    vi.mocked(horsesApi.get).mockResolvedValue({
      ...horse,
      microchipId: null,
      weightKg: null,
    });
    mount();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: '4. Review & Submit' }));
    expect(await screen.findByText(/Missing: microchip number, weight/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit for Review' }));
    expect(
      await screen.findByText(
        'Complete the horse profile before submitting: microchip number, weight.',
      ),
    ).toBeInTheDocument();
    expect(ordersApi.submit).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Complete the profile' })).toHaveAttribute(
      'href',
      '/customer/horses/1',
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
    const user = userEvent.setup({ delay: null });
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
  it('retries only GET when submit succeeded but refreshing current data failed', async () => {
    vi.mocked(ordersApi.submit).mockResolvedValue({ revisionId: 3 });
    vi.mocked(ordersApi.get)
      .mockRejectedValueOnce(new ApiError(403, 'Read temporarily unavailable'))
      .mockResolvedValueOnce({
        ...order,
        orderStatus: 'SUBMITTED',
        currentRevisionId: 3,
        recordVersion: '0000000000000002',
      });
    mount();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: '4. Review & Submit' }));
    await user.click(screen.getByRole('button', { name: 'Submit for Review' }));
    expect(await screen.findByText(/Submission was accepted/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh submitted request' }));
    expect(await screen.findByText(/Request submitted for assessment/)).toBeInTheDocument();
    expect(ordersApi.submit).toHaveBeenCalledTimes(1);
    expect(ordersApi.get).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(queryKeys.order(getSession()!.generation, 1))).toMatchObject({
      orderStatus: 'SUBMITTED',
      recordVersion: '0000000000000002',
      currentRevisionId: 3,
    });
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
  });

  it('keeps an unresolved submission UUID even when a current read still reports DRAFT', async () => {
    vi.mocked(ordersApi.submit).mockRejectedValue(new ApiError(0, 'Unknown outcome'));
    vi.mocked(ordersApi.get).mockResolvedValue(order);
    mount();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: '4. Review & Submit' }));
    await user.click(screen.getByRole('button', { name: 'Submit for Review' }));
    await screen.findByText('Unknown outcome');
    await user.click(screen.getByRole('button', { name: 'Check current request' }));
    expect(
      await screen.findByRole('button', { name: 'Reload form with server data' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry the same submission' }));
    await waitFor(() => expect(ordersApi.submit).toHaveBeenCalledTimes(2));
    expect(vi.mocked(ordersApi.submit).mock.calls[0]).toEqual(
      vi.mocked(ordersApi.submit).mock.calls[1],
    );
  });

  it.each(['AIR_STALL_UNSUITABLE', 'AIR_STALL_ASSESSMENT_REQUIRED', 'HORSE_SNAPSHOT_STALE'])(
    'offers horse and service review for %s without changing selections',
    async (code) => {
      vi.mocked(ordersApi.submit).mockRejectedValue(new ApiError(409, 'Review fit', code));
      mount();
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: '4. Review & Submit' }));
      await user.click(screen.getByRole('button', { name: 'Submit for Review' }));
      expect(await screen.findByRole('link', { name: 'Review horse profile' })).toHaveAttribute(
        'href',
        '/customer/horses/1',
      );
      await user.click(screen.getByRole('button', { name: 'Review saved service preferences' }));
      expect(screen.getByText('test-ref')).toBeInTheDocument();
      expect(ordersApi.update).not.toHaveBeenCalled();
      expect(ordersApi.submit).toHaveBeenCalledTimes(1);
    },
  );
});
