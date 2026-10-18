import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { startSession } from '../../shared/api/session';
import { PaymentActionForm, type ActionContext } from './ActionForm';
import { paymentsApi } from './api';
import { managerPaymentsApi } from './manager-api';
import { reportAction } from './customer-actions';
import { testOverview, proofKey } from './testing';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  paymentsApi: { report: vi.fn(), proof: vi.fn(), uploadProof: vi.fn() },
}));
vi.mock('./manager-api', async (original) => ({
  ...(await original<typeof import('./manager-api')>()),
  managerPaymentsApi: { reconcile: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' });
});
function mount() {
  const data = testOverview();
  const refresh = vi.fn().mockResolvedValue(testOverview({ recordVersion: '00000000000000a2' }));
  const onDone = vi.fn();
  const context: ActionContext = {
    orderId: 11,
    overview: data,
    readError: null,
    backTo: '/customer/requests',
    refresh,
    evidence: [{ fileKey: proofKey, label: 'TEST evidence' }],
    onUploaded: vi.fn(),
    onDone,
    onCancel: vi.fn(),
  };
  const spec = reportAction(11, data);
  const result = render(
    <MemoryRouter>
      <PaymentActionForm spec={spec} context={context} />
    </MemoryRouter>,
  );
  return { ...result, spec, context, refresh, onDone, user: userEvent.setup({ delay: null }) };
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Payment obligation'), '101');
  await user.type(screen.getByLabelText('Amount transferred (USD)'), '50.00');
  await user.type(screen.getByLabelText('Transferred at'), '2020-01-01T00:00:00Z');
  await user.type(screen.getByLabelText('Bank transfer reference'), 'TEST-REF');
  await user.selectOptions(screen.getByLabelText('Use existing evidence'), proofKey);
}
it('reports a transfer without reconciling or changing financial status locally', async () => {
  vi.mocked(paymentsApi.report).mockResolvedValue({
    entityId: 202,
    recordVersion: '00000000000000a2',
  });
  const { user, onDone, refresh } = mount();
  await fill(user);
  expect(screen.queryByLabelText('Internal notes (optional)')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(paymentsApi.report).toHaveBeenCalledWith(
    11,
    { recordVersion: '00000000000000a1', operationId: expect.any(String) },
    {
      paymentRequestId: 101,
      reportedAmount: '50.00',
      reportedCurrency: 'USD',
      transferredAt: '2020-01-01T00:00:00Z',
      bankReference: 'TEST-REF',
      proofFileKey: proofKey,
    },
  );
  expect(managerPaymentsApi.reconcile).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('PAID')).toBeNull();
});
it.each([0, 503, 409])(
  'retries a failed transfer report with the identical UUID/input after %s',
  async (status) => {
    vi.mocked(paymentsApi.report)
      .mockRejectedValueOnce(
        new ApiError(status, 'Failed.', status === 409 ? 'PAYMENT_LEDGER_BUSY' : undefined),
      )
      .mockResolvedValueOnce({ entityId: 202, recordVersion: '00000000000000a2' });
    const { user, onDone } = mount();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
    const retry = await screen.findByRole('button', { name: 'Retry the same payment action' });
    expect(screen.getByLabelText('Amount transferred (USD)')).toBeDisabled();
    await user.click(retry);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const calls = vi.mocked(paymentsApi.report).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
  },
);
it.each([0, 500, 503])(
  'retries only GET after a successful report and repeated ledger read failures (%s)',
  async (status) => {
    vi.mocked(paymentsApi.report).mockResolvedValue({
      entityId: 202,
      recordVersion: '00000000000000a2',
    });
    const { user, refresh, onDone } = mount();
    refresh
      .mockRejectedValueOnce(new ApiError(status, 'Read failed.'))
      .mockRejectedValueOnce(new ApiError(status, 'Read failed.'));
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
    const retry = await screen.findByRole('button', { name: 'Retry loading current ledger' });
    expect(screen.getByText(/Action recorded, reference 202/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report a bank transfer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(retry);
    await screen.findByRole('button', { name: 'Retry loading current ledger' });
    expect(onDone).not.toHaveBeenCalled();
    expect(paymentsApi.report).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry loading current ledger' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(paymentsApi.report).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(3);
  },
);
it('pins the reviewed version until an explicit 409 reload, preserving form inputs', async () => {
  vi.mocked(paymentsApi.report).mockRejectedValue(
    new ApiError(409, 'Changed.', 'ORDER_VERSION_CONFLICT'),
  );
  const { user, rerender, context, spec } = mount();
  await fill(user);
  rerender(
    <MemoryRouter>
      <PaymentActionForm
        spec={spec}
        context={{ ...context, overview: testOverview({ recordVersion: '00000000000000a9' }) }}
      />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
  await screen.findByRole('button', { name: 'Reload ledger and review' });
  expect(vi.mocked(paymentsApi.report).mock.calls[0][1].recordVersion).toBe('00000000000000a1');
  expect(screen.getByRole('button', { name: 'Report a bank transfer' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Reload ledger and review' }));
  await screen.findByText(/Current ledger loaded/);
  expect(screen.getByLabelText('Amount transferred (USD)')).toHaveValue('50.00');
  await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
  await waitFor(() => expect(paymentsApi.report).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(paymentsApi.report).mock.calls;
  expect(second[1].recordVersion).toBe('00000000000000a2');
  expect(second[1].operationId).not.toBe(first[1].operationId);
});
it('shows a field-level error without reflecting sensitive backend validation text', async () => {
  vi.mocked(paymentsApi.report).mockRejectedValue(
    new ApiError(400, 'Private information', undefined, { reportedAmount: 'Private information' }),
  );
  const { user } = mount();
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
  expect(
    await screen.findByText('Review this value against the field requirements.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Private information')).toBeNull();
  expect(screen.getByLabelText('Amount transferred (USD)')).toHaveValue('50.00');
});
it('hides financial controls on 403 and offers the safe request list', async () => {
  vi.mocked(paymentsApi.report).mockRejectedValue(new ApiError(403, 'Forbidden.'));
  const { user } = mount();
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Report a bank transfer' }));
  expect(await screen.findByRole('link', { name: 'Back to requests' })).toHaveAttribute(
    'href',
    '/customer/requests',
  );
  expect(screen.queryByLabelText('Amount transferred (USD)')).toBeNull();
});
