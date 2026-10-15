import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AssignedCasePage, AssignedCasesPage } from './pages';
import { assignedCasesApi } from './api';
import { assignedKeys } from './hooks';
import type { CasePage, ManagerCase } from '../assessment/contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  ASSIGNED_PAGE_SIZE: 20,
  assignedCasesApi: { list: vi.fn(), get: vi.fn() },
}));

const assigned: ManagerCase = {
  orderId: 7,
  orderNumber: 'ET-TEST-7',
  orderStatus: 'APPROVED',
  recordVersion: '00000000000000c1',
  currentRevisionId: 70,
  revision: {
    revisionId: 70,
    orderId: 7,
    revisionNo: 2,
    changeReason: 'Date changed',
    submittedAt: '2030-01-01T00:00:00Z',
    snapshot: {
      schemaVersion: 1,
      request: { originCountryCode: 'VN', destinationCountryCode: 'SG' },
      horse: { name: 'Captured Horse' },
      services: [],
    },
  },
  decision: null,
  assignments: [
    {
      assignmentId: 1,
      staffId: 31,
      role: 'SPECIALIST',
      assignedAt: '2030-01-02T00:00:00Z',
      endedAt: null,
      assignedBy: 3,
      dueAt: null,
      assignmentNote: 'Check export rules',
    },
  ],
};
const listOf = (items: CasePage['items']): CasePage => ({
  items,
  page: 0,
  size: 20,
  totalElements: items.length,
  totalPages: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresIn: 60,
    role: 'SPECIALIST',
  });
});
function mount(entry: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/staff/cases" element={<AssignedCasesPage />} />
          <Route path="/staff/cases/:id" element={<AssignedCasePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('assigned cases', () => {
  it('lists only what the staff endpoint returns, linking to staff routes', async () => {
    vi.mocked(assignedCasesApi.list).mockResolvedValue(
      listOf([
        {
          orderId: 7,
          orderNumber: 'ET-TEST-7',
          orderStatus: 'APPROVED',
          recordVersion: '00000000000000c1',
          currentRevisionId: 70,
          originCountryCode: 'VN',
          destinationCountryCode: 'SG',
          deliveryDeadline: null,
        },
      ]),
    );
    mount('/staff/cases');
    expect(await screen.findByRole('link', { name: 'ET-TEST-7' })).toHaveAttribute(
      'href',
      '/staff/cases/7',
    );
    expect(assignedCasesApi.list).toHaveBeenCalledWith(0, expect.any(AbortSignal));
    expect(assignedCasesApi.get).not.toHaveBeenCalled();
  });

  it('shows own assignment instructions and the captured snapshot read-only', async () => {
    vi.mocked(assignedCasesApi.get).mockResolvedValue(assigned);
    mount('/staff/cases/7');
    expect(await screen.findByText('Check export rules')).toBeInTheDocument();
    expect(screen.getByText('Captured Horse')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record|approve|assign|save/i })).toBeNull();
  });

  it('hides cached data and reports lost access on 404', async () => {
    vi.mocked(assignedCasesApi.get)
      .mockResolvedValueOnce(assigned)
      .mockRejectedValue(new ApiError(404, 'This record is unavailable.'));
    mount('/staff/cases/7');
    expect(await screen.findByText('Captured Horse')).toBeInTheDocument();
    await act(() =>
      queryClient.refetchQueries({ queryKey: assignedKeys.detail(getSession()!.generation, 7) }),
    );
    expect(await screen.findByText(/no longer have access/)).toBeInTheDocument();
    expect(screen.queryByText('Captured Horse')).not.toBeInTheDocument();
    await waitFor(() => expect(assignedCasesApi.get).toHaveBeenCalledTimes(2));
  });
});
