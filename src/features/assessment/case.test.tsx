import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManagerCasePage } from './case';
import { assessmentApi } from './api';
import { decisionCommand, validateDecision } from './decision';
import type { AssessmentReceipt, CaseStaff, ManagerCase } from './contracts';
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
  },
}));

const caseOf = (patch: Partial<ManagerCase> = {}): ManagerCase => ({
  orderId: 7,
  orderNumber: 'ET-TEST-7',
  orderStatus: 'SUBMITTED',
  recordVersion: '00000000000000a1',
  currentRevisionId: 70,
  revision: {
    revisionId: 70,
    orderId: 7,
    revisionNo: 1,
    changeReason: null,
    submittedAt: '2030-01-01T00:00:00Z',
    snapshot: {
      schemaVersion: 1,
      request: { originCountryCode: 'VN', destinationCountryCode: 'SG', specialNeeds: 'Calm' },
      horse: { name: 'Snapshot Horse', weightKg: 500 },
      services: [{ serviceCode: 'AIR_STALL', optionCode: 'WIDE', arrangedBy: null }],
    },
  },
  decision: null,
  assignments: [],
  ...patch,
});
const staff = (staffId: number, role: CaseStaff['role']): CaseStaff => ({
  staffId,
  fullName: `Test ${role} ${staffId}`,
  role,
  activeCases: 1,
  availabilityStatus: 'NOT_CONFIGURED',
});
const receipt: AssessmentReceipt = {
  orderId: 7,
  orderStatus: 'APPROVED',
  recordVersion: '00000000000000a2',
  decision: {
    decisionId: 1,
    revisionId: 70,
    managerId: 3,
    decision: 'APPROVED',
    reason: null,
    decidedAt: '2030-01-02T00:00:00Z',
  },
  assignments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
  vi.mocked(assessmentApi.getCase).mockResolvedValue(caseOf());
  vi.mocked(assessmentApi.decisions).mockResolvedValue([]);
  vi.mocked(assessmentApi.staff).mockImplementation((role) =>
    Promise.resolve({
      items: [staff(role === 'SPECIALIST' ? 31 : 41, role)],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    }),
  );
});
function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/manager/requests/7']}>
        <Routes>
          <Route path="/manager/requests/:id" element={<ManagerCasePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('manager case', () => {
  it('renders the captured snapshot, not live horse data', async () => {
    mount();
    expect(await screen.findByText('Snapshot Horse')).toBeInTheDocument();
    expect(screen.getByText('VN → SG')).toBeInTheDocument();
    expect(screen.getByText('AIR_STALL')).toBeInTheDocument();
  });

  it('approves with StaffIDs, exact revision/version and no reason', async () => {
    vi.mocked(assessmentApi.decide).mockResolvedValue(receipt);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Approve and assign team'));
    await user.click(await screen.findByRole('button', { name: /Select Test SPECIALIST 31/ }));
    await user.click(await screen.findByRole('button', { name: /Select Test COORDINATOR 41/ }));
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(assessmentApi.decide).toHaveBeenCalledTimes(1));
    expect(assessmentApi.decide).toHaveBeenCalledWith(7, {
      revisionId: 70,
      recordVersion: '00000000000000a1',
      operationId: expect.any(String),
      decision: 'APPROVED',
      reason: null,
      specialistId: 31,
      coordinatorId: 41,
      dueAt: null,
      assignmentNote: null,
    });
    expect(await screen.findByText(/Decision recorded/)).toBeInTheDocument();
    // Success re-reads the current case instead of trusting the receipt.
    await waitFor(() => expect(assessmentApi.getCase).toHaveBeenCalledTimes(2));
  });

  it('requires a customer reason and sends no assignment fields on rejection', async () => {
    vi.mocked(assessmentApi.decide).mockResolvedValue({ ...receipt, orderStatus: 'REJECTED' });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Reject request'));
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(await screen.findByText('A reason for the customer is required.')).toBeInTheDocument();
    expect(assessmentApi.decide).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Reason shown to the customer'), 'Route not served');
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    await waitFor(() =>
      expect(assessmentApi.decide).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          decision: 'REJECTED',
          reason: 'Route not served',
          specialistId: null,
          coordinatorId: null,
          dueAt: null,
          assignmentNote: null,
        }),
      ),
    );
  });

  it('retries an uncertain failure with the same UUID and frozen input', async () => {
    vi.mocked(assessmentApi.decide)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce({ ...receipt, orderStatus: 'CHANGES_REQUESTED' });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Request changes from customer'));
    await user.type(screen.getByLabelText('Reason shown to the customer'), 'Confirm date');
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    await screen.findByText('Interrupted');
    expect(screen.getByLabelText('Reason shown to the customer')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry the same decision' }));
    await waitFor(() => expect(assessmentApi.decide).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(assessmentApi.decide).mock.calls;
    expect(second).toEqual(first);
  });

  it('keeps the form on 409 and never resends automatically', async () => {
    vi.mocked(assessmentApi.decide).mockRejectedValue(
      new ApiError(
        409,
        'Request changed. Reload it before acting again.',
        'ORDER_VERSION_CONFLICT',
      ),
    );
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Request changes from customer'));
    await user.type(screen.getByLabelText('Reason shown to the customer'), 'Confirm date');
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(await screen.findByText(/Request changed/)).toBeInTheDocument();
    expect(screen.getByLabelText('Reason shown to the customer')).toHaveValue('Confirm date');
    expect(screen.getByRole('button', { name: 'Reload case' })).toBeInTheDocument();
    expect(assessmentApi.decide).toHaveBeenCalledTimes(1);
  });

  it('hides the decision form once the case is no longer SUBMITTED', async () => {
    vi.mocked(assessmentApi.getCase).mockResolvedValue(
      caseOf({
        orderStatus: 'APPROVED',
        decision: receipt.decision,
        assignments: [
          {
            assignmentId: 1,
            staffId: 31,
            role: 'SPECIALIST',
            assignedAt: '2030-01-02T00:00:00Z',
            endedAt: null,
            assignedBy: 3,
            dueAt: null,
            assignmentNote: null,
          },
        ],
      }),
    );
    mount();
    const team = (await screen.findByRole('heading', { name: 'Current team' })).closest('section')!;
    expect(within(team).getByText(/Staff ID 31/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record decision' })).not.toBeInTheDocument();
  });
});

describe('decision rules', () => {
  const form = {
    decision: 'APPROVED' as const,
    reason: 'ignored',
    specialist: staff(31, 'SPECIALIST'),
    coordinator: staff(41, 'COORDINATOR'),
    dueAt: '2030-01-01T00:00:00+07:00',
    assignmentNote: '  ',
  };
  it('rejects past or offset-less deadlines', () => {
    expect(validateDecision(form, Date.parse('2031-01-01T00:00:00Z')).dueAt).toMatch(/future/);
    expect(validateDecision({ ...form, dueAt: '2030-01-01T00:00' }).dueAt).toMatch(/offset/);
  });
  it('drops the reason on approval and blanks become null', () => {
    const command = decisionCommand(form, caseOf(), 70, 'op');
    expect(command.reason).toBeNull();
    expect(command.assignmentNote).toBeNull();
    expect(command.dueAt).toBe('2030-01-01T00:00:00+07:00');
  });
});
