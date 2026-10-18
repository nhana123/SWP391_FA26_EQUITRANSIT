import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Role } from '../../shared/api/contracts';
import { managerActivityApi } from './api';
import { ManagerAuditPage, ManagerFinancialPage } from './pages';
import { financialFixture, auditFixture } from './testing';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  managerActivityApi: { financial: vi.fn(), audit: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  vi.mocked(managerActivityApi.financial).mockResolvedValue(financialFixture);
  vi.mocked(managerActivityApi.audit).mockResolvedValue(auditFixture);
});
function mount(kind: 'financial' | 'audit', role: Role = 'MANAGER') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {kind === 'financial' ? <ManagerFinancialPage /> : <ManagerAuditPage />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
it('renders all seven distinct measures with exact decimal strings and no local revenue or margin calculation', async () => {
  mount('financial');
  expect(await screen.findByText('99999999999999999999.99 USD')).toBeInTheDocument();
  expect(document.querySelectorAll('dl dt')).toHaveLength(7);
  for (const label of [
    'Published quotation value',
    'Customer-reported transfers',
    'Net bank receipts',
    'Net allocated funds',
    'Actual costs',
    'Operationally completed orders',
    'Financially closed orders',
  ])
    expect(screen.getByText(label, { selector: 'dt' })).toBeInTheDocument();
  expect(screen.getByText('110.00 USD')).toBeInTheDocument();
  expect(screen.getByText('90.00 USD')).toBeInTheDocument();
  expect(screen.getByText('3', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.getByText('1', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /close|approve|delete/i })).toBeNull();
});
it.each(['CUSTOMER', 'SPECIALIST', 'COORDINATOR', 'DRIVER'] as const)(
  'never fetches Manager financial or audit data for %s',
  (role) => {
    mount('financial', role);
    expect(managerActivityApi.financial).not.toHaveBeenCalled();
    expect(managerActivityApi.audit).not.toHaveBeenCalled();
    expect(screen.queryByText('99999999999999999999.99 USD')).toBeNull();
  },
);
it.each([403, 404, 503])(
  'does not turn report %s into zero-valued financial cards',
  async (status) => {
    vi.mocked(managerActivityApi.financial).mockRejectedValue(
      new ApiError(status, 'Private detail.'),
    );
    mount('financial');
    await screen.findByRole('alert');
    expect(document.querySelector('dl')).toBeNull();
    expect(screen.queryByText('0.00 USD')).toBeNull();
  },
);
it('keeps audit history read-only and renders the server-redacted snapshot as plain text', async () => {
  vi.mocked(managerActivityApi.audit).mockResolvedValue({
    ...auditFixture,
    items: [{ ...auditFixture.items[0], redactedSnapshot: '<img src=x onerror=alert(1)>' }],
  });
  const user = mount('audit');
  await screen.findByRole('table', { name: 'Audit events' });
  await user.click(screen.getByText('View redacted snapshot'));
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.queryByRole('button', { name: /delete|edit|append/i })).toBeNull();
});
it('paginates audit history using totalElements and allows navigating back after an empty page', async () => {
  vi.mocked(managerActivityApi.audit).mockImplementation(async (page) =>
    page === 0 ? auditFixture : { ...auditFixture, items: [], page, totalElements: 0 },
  );
  const user = mount('audit');
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'Next activity page' }));
  await screen.findByText('No audit events on this page.');
  expect(screen.getByRole('button', { name: 'Previous activity page' })).toBeEnabled();
});
