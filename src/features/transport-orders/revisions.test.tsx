import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RevisionsSection } from './revisions';
import { revisionsApi, type ChangeReceipt } from './revisions-api';
import { draftForm, draftInput } from './form';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Order } from '../../shared/api/contracts';

vi.mock('./revisions-api', () => ({
  REVISION_PAGE_SIZE: 20,
  revisionsApi: {
    list: vi.fn(),
    get: vi.fn(),
    revise: vi.fn(),
    requestChange: vi.fn(),
    change: vi.fn(),
  },
}));

const services = { airStall: 'WIDE' as const, insurance: 'NONE' as const };
const draft = draftInput(
  Object.assign(draftForm(), {
    horseId: '5',
    originCountryCode: 'VN',
    destinationCountryCode: 'SG',
    originAddress: 'Stable A',
    destinationAddress: 'Track B',
    originTimezone: 'Asia/Ho_Chi_Minh',
    destinationTimezone: 'Asia/Singapore',
    preferredDepartureAt: '2099-02-01T08:00:00+07:00',
    deliveryDeadline: '2099-02-03T18:00:00+08:00',
    importType: 'TEMPORARY',
    receiverName: 'Alex Receiver',
    receiverPhone: '+6590123456',
    influenzaVaccinated: 'false',
    declaredAccurate: 'true',
  }),
  services,
);
const order = (patch: Partial<Order> = {}): Order => ({
  orderId: 9,
  orderNumber: 'ET-TEST-9',
  orderStatus: 'CHANGES_REQUESTED',
  currency: 'USD',
  recordVersion: '00000000000000d1',
  currentRevisionId: 91,
  currentPlanId: null,
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z',
  draft,
  ...patch,
});
const revision = (revisionId: number, revisionNo: number) => ({
  revisionId,
  orderId: 9,
  revisionNo,
  changeReason: revisionNo > 1 ? 'Date moved' : null,
  submittedAt: '2030-01-02T00:00:00Z',
  snapshot: {
    schemaVersion: 1,
    request: { originCountryCode: 'VN', destinationCountryCode: 'SG' },
    horse: { name: `Horse at revision ${revisionNo}` },
    services: [],
  },
});
const pending: ChangeReceipt = {
  changeRequestId: 300,
  orderId: 9,
  baseRevisionId: 91,
  status: 'PENDING',
  createdAt: '2030-01-05T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
  vi.mocked(revisionsApi.list).mockResolvedValue([revision(91, 2), revision(90, 1)]);
});
function mount(current = order()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RevisionsSection order={current} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function fillReason(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText('Reason for this change'), text);
}

describe('revision history', () => {
  it('lists captured revisions without a fake page count and opens one snapshot', async () => {
    vi.mocked(revisionsApi.get).mockResolvedValue(revision(90, 1));
    mount();
    const table = await screen.findByRole('table', { name: /Submitted revisions/ });
    expect(within(table).getByText('Date moved')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Revision pages' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'View revision 1' }));
    expect(await screen.findByText('Horse at revision 1')).toBeInTheDocument();
    expect(revisionsApi.get).toHaveBeenCalledWith(9, 90, expect.any(AbortSignal));
  });

  it('shows nothing for a draft without a submitted revision', () => {
    mount(order({ orderStatus: 'DRAFT', currentRevisionId: null }));
    expect(revisionsApi.list).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Revise|Propose/ })).toBeNull();
  });
});

describe('revise and change proposals', () => {
  it('revises with the full request, version, UUID and reason; services unchanged', async () => {
    vi.mocked(revisionsApi.revise).mockResolvedValue(revision(92, 3));
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revise request' }));
    await user.clear(screen.getByLabelText('Pickup address'));
    await user.type(screen.getByLabelText('Pickup address'), 'Stable C');
    await fillReason(user, 'New stable');
    await user.click(screen.getByRole('button', { name: 'Submit revision' }));
    await waitFor(() => expect(revisionsApi.revise).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(revisionsApi.revise).mock.calls[0];
    expect(id).toBe(9);
    expect(body).toMatchObject({
      originAddress: 'Stable C',
      horseId: 5,
      recordVersion: '00000000000000d1',
      changeReason: 'New stable',
      services,
    });
    expect(body.operationId).toEqual(expect.any(String));
    expect(await screen.findByText(/Revision 3 submitted for assessment/)).toBeInTheDocument();
  });

  it('requires a reason before sending anything', async () => {
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revise request' }));
    await user.click(screen.getByRole('button', { name: 'Submit revision' }));
    expect(await screen.findByText('Explain what changed and why.')).toBeInTheDocument();
    expect(revisionsApi.revise).not.toHaveBeenCalled();
  });

  it('switches to a change proposal when the BE reports protected commitment', async () => {
    vi.mocked(revisionsApi.revise).mockRejectedValue(
      new ApiError(409, 'Use a change request.', 'ORDER_CHANGE_REQUEST_REQUIRED'),
    );
    vi.mocked(revisionsApi.requestChange).mockResolvedValue(pending);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revise request' }));
    await fillReason(user, 'Later date');
    await user.click(screen.getByRole('button', { name: 'Submit revision' }));
    await user.click(
      await screen.findByRole('button', { name: 'Send as a change proposal instead' }),
    );
    // Input is kept; the proposal is a new action with its own UUID.
    expect(screen.getByLabelText('Reason for this change')).toHaveValue('Later date');
    await user.click(screen.getByRole('button', { name: 'Send change proposal' }));
    await waitFor(() => expect(revisionsApi.requestChange).toHaveBeenCalledTimes(1));
    const reviseId = vi.mocked(revisionsApi.revise).mock.calls[0][1].operationId;
    const changeId = vi.mocked(revisionsApi.requestChange).mock.calls[0][1].operationId;
    expect(changeId).not.toBe(reviseId);
    expect(await screen.findByText('Pending staff review')).toBeInTheDocument();
    expect(screen.getByText(/not approved or applied yet/)).toBeInTheDocument();
  });

  it('offers only a change proposal once preparation has started', async () => {
    mount(order({ orderStatus: 'IN_PREPARATION' }));
    expect(await screen.findByRole('button', { name: 'Propose a change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revise request' })).toBeNull();
  });

  it('retries an uncertain revision with the identical command', async () => {
    vi.mocked(revisionsApi.revise)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(revision(92, 3));
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revise request' }));
    await fillReason(user, 'Retry');
    await user.click(screen.getByRole('button', { name: 'Submit revision' }));
    await screen.findByText('Interrupted');
    expect(screen.getByLabelText('Reason for this change')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry the same request' }));
    await waitFor(() => expect(revisionsApi.revise).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(revisionsApi.revise).mock.calls;
    expect(second).toEqual(first);
  });

  it('keeps input on a version conflict and offers a reload', async () => {
    vi.mocked(revisionsApi.revise).mockRejectedValue(
      new ApiError(409, 'Request changed.', 'ORDER_VERSION_CONFLICT'),
    );
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revise request' }));
    await fillReason(user, 'Keep me');
    await user.click(screen.getByRole('button', { name: 'Submit revision' }));
    expect(await screen.findByRole('button', { name: 'Reload request' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reason for this change')).toHaveValue('Keep me');
    expect(revisionsApi.revise).toHaveBeenCalledTimes(1);
  });
});
