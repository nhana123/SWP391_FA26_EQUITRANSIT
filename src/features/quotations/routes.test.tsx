import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { router } from '../../app/router';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Role } from '../../shared/api/contracts';
import type { ManagerCase } from '../assessment/contracts';
import { testOrder } from '../booking-services/testing';
import { ordersApi } from '../transport-orders/api';
import { assessmentApi } from '../assessment/api';
import { assignedCasesApi } from '../assigned-cases/api';
import { quotationsApi } from './api';
import { pageOf, quotation } from './testing';

vi.mock('../transport-orders/api', () => ({ ordersApi: { get: vi.fn() } }));
vi.mock('../transport-orders/revisions', () => ({ RevisionsSection: () => null }));
vi.mock('../assessment/api', () => ({
  HISTORY_PAGE_SIZE: 20,
  assessmentApi: {
    getCase: vi.fn(),
    decisions: vi.fn().mockResolvedValue([]),
    assignments: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../assigned-cases/api', () => ({
  ASSIGNED_PAGE_SIZE: 20,
  assignedCasesApi: { get: vi.fn() },
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  quotationsApi: { list: vi.fn(), get: vi.fn() },
}));
const current: ManagerCase = {
  orderId: 9,
  orderNumber: 'TEST-9',
  orderStatus: 'SUBMITTED',
  recordVersion: '0000000000000001',
  currentRevisionId: null,
  revision: null,
  decision: null,
  assignments: [],
};
let memory: ReturnType<typeof createMemoryRouter>;
beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  vi.mocked(ordersApi.get).mockResolvedValue(testOrder({ orderId: 9 }));
  vi.mocked(assessmentApi.getCase).mockResolvedValue(current);
  vi.mocked(assignedCasesApi.get).mockResolvedValue(current);
  vi.mocked(quotationsApi.list).mockResolvedValue(pageOf());
  vi.mocked(quotationsApi.get).mockResolvedValue(quotation);
});
afterEach(() => memory?.dispose());
function open(path: string, role?: Role) {
  if (role) startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memory} />
    </QueryClientProvider>,
  );
}

describe('reachable quotation routes', () => {
  it.each<[Role, string]>([
    ['CUSTOMER', '/customer/requests/9'],
    ['MANAGER', '/manager/requests/9'],
    ['COORDINATOR', '/staff/cases/9'],
  ])('%s can open list and detail from its existing request screen', async (role, path) => {
    open(path, role);
    await userEvent.click(await screen.findByRole('link', { name: 'Quotations' }));
    expect(memory.state.location.pathname).toBe(`${path}/quotes`);
    await userEvent.click(await screen.findByRole('link', { name: 'Q-9-2' }));
    expect(memory.state.location.pathname).toBe(`${path}/quotes/31`);
    expect(await screen.findByText('Captured road transport')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Back to quotations' }));
    expect(memory.state.location.pathname).toBe(`${path}/quotes`);
  });
  it.each(['SPECIALIST', 'DRIVER'] as const)(
    'blocks %s entering Coordinator quotations by URL',
    async (role) => {
      open('/staff/cases/9/quotes/31', role);
      expect(
        await screen.findByText(/You do not have access to this workspace/),
      ).toBeInTheDocument();
      expect(quotationsApi.get).not.toHaveBeenCalled();
    },
  );
  it('keeps the quotation link off a Specialist case page', async () => {
    open('/staff/cases/9', 'SPECIALIST');
    await screen.findByRole('heading', { name: 'Case TEST-9' });
    expect(screen.queryByRole('link', { name: 'Quotations' })).toBeNull();
  });
  it('requires authentication for a direct quotation URL', async () => {
    open('/customer/requests/9/quotes/31');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(quotationsApi.get).not.toHaveBeenCalled();
  });
});
