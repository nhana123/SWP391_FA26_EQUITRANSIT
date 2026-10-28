import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TeamManager, AssignmentHistory } from './assignments';
import { useManagerCase, assessmentKeys } from './hooks';
import { useSession } from '../../shared/api/session';
import { useState } from 'react';
import { assessmentApi } from './api';
import type { AssessmentReceipt, CaseAssignment, ManagerCase } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  QUEUE_PAGE_SIZE: 20,
  STAFF_PAGE_SIZE: 20,
  HISTORY_PAGE_SIZE: 20,
  assessmentApi: {
    queue: vi.fn(),
    staff: vi.fn(),
    getCase: vi.fn(),
    decide: vi.fn(),
    decisions: vi.fn(),
    assign: vi.fn(),
    endAssignment: vi.fn(),
    assignments: vi.fn(),
  },
}));

const assignment = (patch: Partial<CaseAssignment>): CaseAssignment => ({
  assignmentId: 1,
  staffId: 31,
  role: 'SPECIALIST',
  assignedAt: '2030-01-02T00:00:00Z',
  endedAt: null,
  assignedBy: 3,
  dueAt: '2099-01-01T00:00:00Z',
  assignmentNote: 'Check export rules',
  ...patch,
});
const approved: ManagerCase = {
  orderId: 7,
  orderNumber: 'ET-TEST-7',
  orderStatus: 'APPROVED',
  recordVersion: '00000000000000b1',
  currentRevisionId: 70,
  revision: {
    revisionId: 70,
    orderId: 7,
    revisionNo: 1,
    changeReason: null,
    submittedAt: '2030-01-01T00:00:00Z',
    snapshot: { schemaVersion: 1, request: {}, horse: null, services: [] },
  },
  decision: {
    decisionId: 1,
    revisionId: 70,
    managerId: 3,
    decision: 'APPROVED',
    reason: null,
    decidedAt: '2030-01-02T00:00:00Z',
  },
  assignments: [
    assignment({}),
    assignment({
      assignmentId: 2,
      staffId: 41,
      role: 'COORDINATOR',
      dueAt: null,
      assignmentNote: null,
    }),
  ],
};
const receipt: AssessmentReceipt = {
  orderId: 7,
  orderStatus: 'APPROVED',
  recordVersion: '00000000000000b2',
  decision: approved.decision,
  assignments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
  vi.mocked(assessmentApi.getCase).mockResolvedValue(approved);
  vi.mocked(assessmentApi.decisions).mockResolvedValue([]);
  vi.mocked(assessmentApi.assignments).mockResolvedValue([
    assignment({ assignmentId: 9, staffId: 30, endedAt: '2030-01-03T00:00:00Z' }),
  ]);
  vi.mocked(assessmentApi.staff).mockResolvedValue({
    items: [
      {
        staffId: 32,
        fullName: 'Test Specialist 32',
        role: 'SPECIALIST',
        activeCases: 0,
        availabilityStatus: 'NOT_CONFIGURED',
      },
    ],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
});
function TeamHarness() {
  const query = useManagerCase(7);
  const session = useSession()!;
  const [changed, setChanged] = useState(false);
  if (!query.data) return null;
  return (
    <>
      {changed && <p>Case team updated</p>}
      <TeamManager
        current={query.data}
        onChanged={async () => {
          setChanged(true);
          await queryClient.invalidateQueries({ queryKey: assessmentKeys.all(session.generation) });
        }}
        onReload={() => {
          void query.refetch();
        }}
      />
      <AssignmentHistory id={7} />
    </>
  );
}
function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/manager/requests/7']}>
        <Routes>
          <Route path="/manager/requests/:id" element={<TeamHarness />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('case team', () => {
  it('replaces a role keeping current deadline/note unless edited', async () => {
    vi.mocked(assessmentApi.assign).mockResolvedValue(receipt);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Replace Specialist' }));
    const form = screen.getByRole('form', { name: 'Replace Specialist' });
    // The saved deadline shows in the picker with its own zone (UTC here).
    expect(within(form).getByLabelText(/Preparation deadline/)).toHaveValue('2099-01-01T00:00');
    expect(within(form).getByLabelText('Time zone')).toHaveValue('Z');
    expect(within(form).getByLabelText(/Note for assigned staff/)).toHaveValue(
      'Check export rules',
    );
    await user.click(
      await within(form).findByRole('button', { name: /Select Test Specialist 32/ }),
    );
    await user.type(within(form).getByLabelText('Reason for this change'), 'Workload balance');
    await user.click(within(form).getByRole('button', { name: 'Save Specialist assignment' }));
    await waitFor(() => expect(assessmentApi.assign).toHaveBeenCalledTimes(1));
    expect(assessmentApi.assign).toHaveBeenCalledWith(7, 'SPECIALIST', {
      recordVersion: '00000000000000b1',
      operationId: expect.any(String),
      staffId: 32,
      reason: 'Workload balance',
      dueAt: '2099-01-01T00:00:00Z',
      assignmentNote: 'Check export rules',
    });
    expect(await screen.findByText(/Case team updated/)).toBeInTheDocument();
    await waitFor(() => expect(assessmentApi.getCase).toHaveBeenCalledTimes(2));
  });

  it('clearing deadline and note sends null (full replacement)', async () => {
    vi.mocked(assessmentApi.assign).mockResolvedValue(receipt);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Replace Specialist' }));
    const form = screen.getByRole('form', { name: 'Replace Specialist' });
    await user.clear(within(form).getByLabelText(/Preparation deadline/));
    await user.clear(within(form).getByLabelText(/Note for assigned staff/));
    await user.type(within(form).getByLabelText('Reason for this change'), 'Clear metadata');
    await user.click(within(form).getByRole('button', { name: 'Save Specialist assignment' }));
    await waitFor(() =>
      expect(assessmentApi.assign).toHaveBeenCalledWith(
        7,
        'SPECIALIST',
        expect.objectContaining({ staffId: 31, dueAt: null, assignmentNote: null }),
      ),
    );
  });

  it('requires reason and confirmation before ending an assignment', async () => {
    vi.mocked(assessmentApi.endAssignment).mockResolvedValue(receipt);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'End Coordinator assignment' }));
    const form = screen.getByRole('form', { name: 'End Coordinator assignment' });
    await user.click(within(form).getByRole('button', { name: 'End Coordinator assignment' }));
    expect(await within(form).findByText(/reason is required/)).toBeInTheDocument();
    expect(within(form).getByText(/access ends immediately/)).toBeInTheDocument();
    expect(assessmentApi.endAssignment).not.toHaveBeenCalled();
    await user.type(within(form).getByLabelText('Reason for ending'), 'Left the team');
    await user.click(within(form).getByRole('checkbox'));
    await user.click(within(form).getByRole('button', { name: 'End Coordinator assignment' }));
    await waitFor(() =>
      expect(assessmentApi.endAssignment).toHaveBeenCalledWith(7, 'COORDINATOR', {
        recordVersion: '00000000000000b1',
        operationId: expect.any(String),
        reason: 'Left the team',
      }),
    );
  });

  it('keeps input on a protected-state 409 and does not resend', async () => {
    vi.mocked(assessmentApi.endAssignment).mockRejectedValue(
      new ApiError(
        409,
        'Protected commitments require controlled handling.',
        'ORDER_CHANGE_REQUEST_REQUIRED',
      ),
    );
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'End Coordinator assignment' }));
    const form = screen.getByRole('form', { name: 'End Coordinator assignment' });
    await user.type(within(form).getByLabelText('Reason for ending'), 'Left the team');
    await user.click(within(form).getByRole('checkbox'));
    await user.click(within(form).getByRole('button', { name: 'End Coordinator assignment' }));
    expect(await within(form).findByText(/Protected commitments/)).toBeInTheDocument();
    expect(within(form).getByLabelText('Reason for ending')).toHaveValue('Left the team');
    expect(within(form).getByRole('button', { name: 'Reload case' })).toBeInTheDocument();
    expect(assessmentApi.endAssignment).toHaveBeenCalledTimes(1);
  });

  it('retries an uncertain replacement with the identical command', async () => {
    vi.mocked(assessmentApi.assign)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(receipt);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Replace Specialist' }));
    const form = screen.getByRole('form', { name: 'Replace Specialist' });
    await user.type(within(form).getByLabelText('Reason for this change'), 'Retry me');
    await user.click(within(form).getByRole('button', { name: 'Save Specialist assignment' }));
    await within(form).findByText('Interrupted');
    expect(within(form).getByLabelText('Reason for this change')).toBeDisabled();
    await user.click(within(form).getByRole('button', { name: 'Retry the same change' }));
    await waitFor(() => expect(assessmentApi.assign).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(assessmentApi.assign).mock.calls;
    expect(second).toEqual(first);
  });

  it('shows ended assignments as read-only history', async () => {
    mount();
    const history = (await screen.findByRole('table', { name: 'Assignment history' }))!;
    expect(within(history).getByText('30')).toBeInTheDocument();
    expect(within(history).queryByRole('button')).not.toBeInTheDocument();
  });
});
