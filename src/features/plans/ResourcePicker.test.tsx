import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { request } from '../../shared/api/client';
import { startSession } from '../../shared/api/session';
import { ResourcePicker } from './ResourcePicker';
import { planDetail } from './testing';
import { planDetailSchema } from './contracts';
vi.mock('../../shared/api/client', async (original) => ({
  ...(await original<typeof import('../../shared/api/client')>()),
  request: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  startSession({ accessToken: 'test', tokenType: 'Bearer', expiresIn: 60, role: 'COORDINATOR' });
});
it('loads case-scoped options with canonical instants and selects the matching resource version', async () => {
  vi.mocked(request).mockResolvedValue({
    items: [
      {
        id: 11,
        code: 'TRUCK-11',
        status: 'AVAILABLE',
        recordVersion: '00000000000000b1',
        blockers: [],
      },
      {
        id: 12,
        code: 'TRUCK-12',
        status: 'UNAVAILABLE',
        recordVersion: '00000000000000b2',
        blockers: ['OVERLAP'],
      },
    ],
    page: 0,
    size: 10,
    totalElements: 2,
  });
  const plan = planDetailSchema.parse(planDetail());
  const onSelect = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResourcePicker kind="VEHICLE" plan={plan} leg={plan.legs[0]} onSelect={onSelect} />
    </QueryClientProvider>,
  );
  const select = await screen.findByLabelText('Chọn xe khả dụng');
  expect(screen.getByRole('option', { name: /TRUCK-12/ })).toBeDisabled();
  await userEvent.selectOptions(select, '11');
  expect(onSelect).toHaveBeenCalledWith('11', { id: 11, recordVersion: '00000000000000b1' });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/api/resources/VEHICLE/candidates?page=0&size=10',
      expect.anything(),
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          orderId: 101,
          revisionId: 201,
          legId: 401,
          start: '2027-02-01T13:00:00+07:00',
          end: '2027-02-01T15:00:00+07:00',
        }),
      }),
    ),
  );
});
