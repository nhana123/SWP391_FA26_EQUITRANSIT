import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { CloseOrderCard } from './CloseOrder';
import { handoverApi } from './api';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

const closure = {
  orderId: 101,
  orderStatus: 'CLOSED',
  recordVersion: '000000000001A2B5',
  operationId: '22b675c8-f091-45ea-9034-f3934d7b8040',
  updatedAt: '2026-10-23T08:15:00Z',
};
beforeEach(() => queryClient.clear());
afterEach(() => vi.restoreAllMocks());
function mount(role: Role, orderStatus = 'DELIVERED') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  const onClosed = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <CloseOrderCard
        orderId={101}
        orderStatus={orderStatus}
        recordVersion="000000000001A2B4"
        onClosed={onClosed}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup({ delay: null }), onClosed };
}

describe('closing a delivered request (F14)', () => {
  it('closes with the reviewed version and retries an uncertain result identically', async () => {
    const close = vi
      .spyOn(handoverApi, 'closeOrder')
      .mockRejectedValueOnce(new ApiError(0, 'Network'))
      .mockResolvedValueOnce(closure);
    const { user, onClosed } = mount('MANAGER');
    await user.click(screen.getByRole('button', { name: /Settle & close the request/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm: close this request' }));
    await user.click(await screen.findByRole('button', { name: 'Retry the same closure' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(closure));
    const [first, second] = close.mock.calls;
    expect(second).toEqual(first);
    expect(first).toEqual([
      101,
      { recordVersion: '000000000001A2B4', operationId: expect.any(String) },
    ]);
    expect(await screen.findByText(/Request closed\. Status CLOSED/)).toBeInTheDocument();
  });

  it('explains a request that is not delivered yet', async () => {
    vi.spyOn(handoverApi, 'closeOrder').mockRejectedValue(
      new ApiError(409, 'Not delivered.', 'ORDER_NOT_DELIVERED'),
    );
    const { user } = mount('MANAGER');
    await user.click(screen.getByRole('button', { name: /Settle & close the request/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm: close this request' }));
    expect(
      await screen.findByText(/closed only after the horse has been delivered/),
    ).toBeInTheDocument();
  });

  it('is offered only to the Manager, and only once delivered', () => {
    mount('COORDINATOR');
    expect(screen.queryByRole('button', { name: /Settle & close/ })).toBeNull();
  });

  it('is not offered before delivery', () => {
    mount('MANAGER', 'IN_TRANSIT');
    expect(screen.queryByRole('button', { name: /Settle & close/ })).toBeNull();
  });
});
