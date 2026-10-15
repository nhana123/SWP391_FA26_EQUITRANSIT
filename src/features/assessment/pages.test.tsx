import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ManagerQueuePage } from './pages';
import { assessmentApi } from './api';
import { casePageSchema, type CasePage, type CaseSummary } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({ QUEUE_PAGE_SIZE: 20, assessmentApi: { queue: vi.fn() } }));

const row = (orderId: number, orderStatus: CaseSummary['orderStatus']): CaseSummary => ({
  orderId,
  orderNumber: `ET-TEST-${orderId}`,
  orderStatus,
  recordVersion: '0000000000000001',
  currentRevisionId: orderId + 100,
  originCountryCode: 'VN',
  destinationCountryCode: 'SG',
  deliveryDeadline: '2030-11-03T18:00:00Z',
});
const pageOf = (items: CaseSummary[], totalPages = 1, page = 0): CasePage => ({
  items,
  page,
  size: 20,
  totalElements: items.length,
  totalPages,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
});
function mount(entry = '/manager/requests') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <ManagerQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('manager queue', () => {
  it('loads SUBMITTED page 0 by default and offers only review states', async () => {
    vi.mocked(assessmentApi.queue).mockResolvedValue(pageOf([row(1, 'SUBMITTED')]));
    mount();
    expect(await screen.findByText('ET-TEST-1')).toBeInTheDocument();
    expect(assessmentApi.queue).toHaveBeenCalledWith('SUBMITTED', 0, expect.any(AbortSignal));
    const options = within(screen.getByLabelText('Assessment state'))
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(options).toEqual(['SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED']);
    expect(screen.getByRole('link', { name: 'ET-TEST-1' })).toHaveAttribute(
      'href',
      '/manager/requests/1',
    );
  });

  it('resets to page 0 and never shows the previous state rows on filter change', async () => {
    let resolveApproved: (value: CasePage) => void = () => {};
    vi.mocked(assessmentApi.queue).mockImplementation((state) =>
      state === 'SUBMITTED'
        ? Promise.resolve(pageOf([row(1, 'SUBMITTED')], 3, 2))
        : new Promise((resolve) => (resolveApproved = resolve)),
    );
    mount('/manager/requests?state=SUBMITTED&page=2');
    await screen.findByText('ET-TEST-1');
    await userEvent.setup().selectOptions(screen.getByLabelText('Assessment state'), 'APPROVED');
    expect(assessmentApi.queue).toHaveBeenLastCalledWith('APPROVED', 0, expect.any(AbortSignal));
    expect(screen.queryByText('ET-TEST-1')).not.toBeInTheDocument();
    resolveApproved(pageOf([row(2, 'APPROVED')]));
    expect(await screen.findByText('ET-TEST-2')).toBeInTheDocument();
  });

  it('falls back to SUBMITTED for an unknown state in the URL', async () => {
    vi.mocked(assessmentApi.queue).mockResolvedValue(pageOf([]));
    mount('/manager/requests?state=DRAFT&page=-4');
    expect(await screen.findByText('Nothing in this queue')).toBeInTheDocument();
    expect(assessmentApi.queue).toHaveBeenCalledWith('SUBMITTED', 0, expect.any(AbortSignal));
  });

  it('shows a safe error with retry and does not retry 403 automatically', async () => {
    vi.mocked(assessmentApi.queue).mockRejectedValue(
      new ApiError(403, 'You do not have permission for this action.'),
    );
    mount();
    expect(
      await screen.findByText('You do not have permission for this action.'),
    ).toBeInTheDocument();
    expect(assessmentApi.queue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('queue contract', () => {
  it('accepts the documented envelope and rejects unknown order states', () => {
    expect(casePageSchema.safeParse(pageOf([row(1, 'SUBMITTED')])).success).toBe(true);
    const bad = { ...pageOf([row(1, 'SUBMITTED')]) };
    bad.items = [{ ...row(1, 'SUBMITTED'), orderStatus: 'PAID' as never }];
    expect(casePageSchema.safeParse(bad).success).toBe(false);
  });
});
