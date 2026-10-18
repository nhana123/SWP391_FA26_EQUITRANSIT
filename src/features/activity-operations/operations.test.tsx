import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrderTimeline } from './OrderTimeline';
import { TaskQueue } from './TaskQueue';
import { operationsApi } from './api';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  OPERATIONS_PAGE_SIZE: 20,
  operationsApi: { tasks: vi.fn(), timeline: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});
function mount(role: Role, ui: React.ReactNode) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
const page = <T,>(items: T[], totalElements = items.length) => ({
  items,
  totalElements,
  page: 0,
  size: 20,
});

describe('staff task queue (#82 part B)', () => {
  it('links case tasks to the staff case and driver legs to their departure', async () => {
    vi.mocked(operationsApi.tasks).mockResolvedValue(
      page([
        { assignmentId: 1, orderId: 101, legId: null, role: 'COORDINATOR', dueAt: null },
        {
          assignmentId: 2,
          orderId: 102,
          legId: 901,
          role: 'DRIVER',
          dueAt: '2027-02-01T05:00:00Z',
        },
      ]),
    );
    mount('DRIVER', <TaskQueue />);
    const table = await screen.findByRole('table', { name: 'My active tasks' });
    const links = within(table).getAllByRole('link', { name: 'Open' });
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/staff/cases/101',
      '/driver/orders/102/departure',
    ]);
    expect(within(table).getByText(/Road leg · leg 901/)).toBeInTheDocument();
    expect(operationsApi.tasks).toHaveBeenCalledWith(0, expect.anything());
  });

  it('shows an empty queue as empty', async () => {
    vi.mocked(operationsApi.tasks).mockResolvedValueOnce(page([]));
    mount('SPECIALIST', <TaskQueue />);
    expect(
      await screen.findByText('No active tasks are assigned to you right now.'),
    ).toBeInTheDocument();
  });

  it('does not show "no tasks" when activity is not deployed', async () => {
    vi.mocked(operationsApi.tasks).mockRejectedValue(
      new ApiError(503, 'Pending', 'ACTIVITY_SCHEMA_PENDING'),
    );
    mount('COORDINATOR', <TaskQueue />);
    expect(await screen.findByText(/migration 008/)).toBeInTheDocument();
    expect(screen.queryByText(/No active tasks/)).toBeNull();
  });

  it('is not loaded for customers or managers', () => {
    mount('MANAGER', <TaskQueue />);
    expect(screen.getByText(/for specialists, coordinators and drivers/)).toBeInTheDocument();
    expect(operationsApi.tasks).not.toHaveBeenCalled();
  });
});

describe('order timeline (#82 part B)', () => {
  afterEach(() => vi.useRealTimers());

  it('shows only recorded milestones in server order, unknown codes as received', async () => {
    vi.mocked(operationsApi.timeline).mockResolvedValue({
      orderId: 101,
      page: 0,
      size: 20,
      items: [
        { milestone: 'SUBMITTED', occurredAt: '2027-01-01T08:00:00Z' },
        { milestone: 'ACCEPTED', occurredAt: '2027-01-05T08:00:00Z' },
        { milestone: 'PAID', occurredAt: '2027-01-10T08:00:00Z' },
        { milestone: 'NEW_FACT', occurredAt: '2027-01-11T08:00:00Z' },
      ],
    });
    mount('CUSTOMER', <OrderTimeline orderId={101} />);
    const items = await screen.findAllByRole('listitem');
    expect(items.map((i) => i.querySelector('strong')!.textContent)).toEqual([
      'Request submitted',
      'Quotation accepted',
      'Fully paid from reconciled bank transfers',
      'NEW_FACT',
    ]);
    // Nothing beyond the recorded facts is inferred.
    expect(screen.queryByText('Departed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('pages without totalElements: a full page offers more', async () => {
    const full = Array.from({ length: 20 }, (_, i) => ({
      milestone: 'UPDATED',
      occurredAt: `2027-01-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
    }));
    vi.mocked(operationsApi.timeline)
      .mockResolvedValueOnce({ orderId: 101, page: 0, size: 20, items: full })
      .mockResolvedValueOnce({
        orderId: 101,
        page: 1,
        size: 20,
        items: [{ milestone: 'CLOSED', occurredAt: '2027-02-01T08:00:00Z' }],
      });
    const user = mount('MANAGER', <OrderTimeline orderId={101} />);
    await user.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Closed')).toBeInTheDocument();
    expect(operationsApi.timeline).toHaveBeenLastCalledWith(101, 1, expect.anything());
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('says nothing is recorded yet rather than guessing from the status', async () => {
    vi.mocked(operationsApi.timeline).mockResolvedValue({
      orderId: 101,
      page: 0,
      size: 20,
      items: [],
    });
    mount('COORDINATOR', <OrderTimeline orderId={101} />);
    expect(await screen.findByText('No milestones have been recorded yet.')).toBeInTheDocument();
  });
});
