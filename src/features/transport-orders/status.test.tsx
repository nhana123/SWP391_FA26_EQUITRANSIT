import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AssessmentPanel, RequestsPage } from './status';
import { orderStatusApi } from './status-api';
import { draftForm, draftInput } from './form';
import { customerAssessmentSchema, type OrderPage } from './status-contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Order } from '../../shared/api/contracts';

vi.mock('./status-api', () => ({
  ORDER_PAGE_SIZE: 20,
  orderStatusApi: { list: vi.fn(), assessment: vi.fn() },
}));

const draft = draftInput(
  Object.assign(draftForm(), {
    originCountryCode: 'VN',
    destinationCountryCode: 'SG',
    destinationTimezone: 'Asia/Singapore',
    deliveryDeadline: '2030-11-03T18:00:00Z',
  }),
  null,
);
const order = (orderId: number, patch: Partial<Order> = {}): Order => ({
  orderId,
  orderNumber: `ET-TEST-${orderId}`,
  orderStatus: 'SUBMITTED',
  currency: 'USD',
  recordVersion: '0000000000000001',
  currentRevisionId: 200 + orderId,
  currentPlanId: null,
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z',
  draft,
  ...patch,
});
const pageOf = (items: Order[]): OrderPage => ({
  items,
  page: 0,
  size: 20,
  totalElements: items.length,
  totalPages: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
function mount(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('requests list', () => {
  it('renders one paged request without fetching each detail', async () => {
    vi.mocked(orderStatusApi.list).mockResolvedValue(
      pageOf([order(1), order(2, { orderStatus: 'DRAFT', currentRevisionId: null })]),
    );
    mount(<RequestsPage />);
    const link = await screen.findByRole('link', { name: 'ET-TEST-1' });
    expect(link).toHaveAttribute('href', '/customer/requests/1');
    expect(screen.getAllByText('VN → SG')).toHaveLength(2);
    expect(screen.getByText('Awaiting assessment')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getAllByText(/Asia\/Singapore/)).toHaveLength(2);
    expect(orderStatusApi.list).toHaveBeenCalledWith(0, expect.any(AbortSignal));
    expect(orderStatusApi.assessment).not.toHaveBeenCalled();
  });

  it('hides older requests created before order 400 when order 400 is present', async () => {
    vi.mocked(orderStatusApi.list).mockResolvedValue(
      pageOf([
        order(400, { orderNumber: 'TR-278caaff1e1241dc8ee35f49' }),
        order(399),
        order(1),
      ]),
    );
    mount(<RequestsPage />);
    expect(await screen.findByRole('link', { name: 'TR-278caaff1e1241dc8ee35f49' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ET-TEST-399' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ET-TEST-1' })).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(orderStatusApi.list).mockResolvedValue(pageOf([]));
    mount(<RequestsPage />);
    expect(await screen.findByText('No transport requests yet')).toBeInTheDocument();
  });
});

describe('assessment panel', () => {
  it('does not call the assessment endpoint for an unsubmitted draft', () => {
    mount(<AssessmentPanel order={order(1, { orderStatus: 'DRAFT', currentRevisionId: null })} />);
    expect(orderStatusApi.assessment).not.toHaveBeenCalled();
    expect(screen.queryByText('Assessment')).not.toBeInTheDocument();
  });

  it('treats a null decision as pending, not approved', async () => {
    vi.mocked(orderStatusApi.assessment).mockResolvedValue({
      currentRevisionId: 201,
      decision: null,
      reason: null,
    });
    mount(<AssessmentPanel order={order(1)} />);
    expect(await screen.findByText('Awaiting assessment')).toBeInTheDocument();
    expect(screen.queryByText(/approved/i)).not.toBeInTheDocument();
  });

  it('shows approval as preparation only', async () => {
    vi.mocked(orderStatusApi.assessment).mockResolvedValue({
      currentRevisionId: 201,
      decision: 'APPROVED',
      reason: null,
    });
    mount(<AssessmentPanel order={order(1)} />);
    expect(await screen.findByText('Approved for preparation')).toBeInTheDocument();
    expect(screen.getByText(/not a quote, payment/)).toBeInTheDocument();
  });

  it('renders the public reason as plain text', async () => {
    vi.mocked(orderStatusApi.assessment).mockResolvedValue({
      currentRevisionId: 201,
      decision: 'CHANGES_REQUESTED',
      reason: '<b>Please confirm the route.</b>',
    });
    const { container } = mount(<AssessmentPanel order={order(1)} />);
    expect(await screen.findByText('<b>Please confirm the route.</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('never shows an outcome that belongs to another revision', async () => {
    vi.mocked(orderStatusApi.assessment).mockResolvedValue({
      currentRevisionId: 999,
      decision: 'REJECTED',
      reason: 'Old reason',
    });
    mount(<AssessmentPanel order={order(1)} />);
    expect(await screen.findByText(/updated while loading/)).toBeInTheDocument();
    expect(screen.queryByText('Old reason')).not.toBeInTheDocument();
  });
});

describe('assessment contract', () => {
  it('rejects unknown decisions', () => {
    const parsed = customerAssessmentSchema.safeParse({
      currentRevisionId: 1,
      decision: 'PAID',
      reason: null,
    });
    expect(parsed.success).toBe(false);
  });
});
