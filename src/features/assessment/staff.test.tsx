import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ManagerStaffPage, StaffDirectory } from './staff';
import { assessmentApi } from './api';
import { caseStaffPageSchema, type CaseStaff, type CaseStaffPage } from './contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  QUEUE_PAGE_SIZE: 20,
  STAFF_PAGE_SIZE: 20,
  assessmentApi: { queue: vi.fn(), staff: vi.fn() },
}));

const person = (staffId: number, role: CaseStaff['role'], activeCases: number): CaseStaff => ({
  staffId,
  fullName: `Test ${role} ${staffId}`,
  role,
  activeCases,
  availabilityStatus: 'NOT_CONFIGURED',
});
const pageOf = (items: CaseStaff[], totalPages = 1, page = 0): CaseStaffPage => ({
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
function mount(ui: React.ReactNode, entry = '/manager/staff') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('staff directory', () => {
  it('lists Specialists by default with workload and no availability claim', async () => {
    vi.mocked(assessmentApi.staff).mockResolvedValue(pageOf([person(31, 'SPECIALIST', 4)]));
    mount(<ManagerStaffPage />);
    const row = (await screen.findByText('Test SPECIALIST 31')).closest('tr')!;
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('Schedule not configured')).toBeInTheDocument();
    expect(screen.queryByText(/^available$/i)).not.toBeInTheDocument();
    expect(assessmentApi.staff).toHaveBeenCalledWith('SPECIALIST', 0, expect.any(AbortSignal));
    const options = within(screen.getByLabelText('Role'))
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(options).toEqual(['SPECIALIST', 'COORDINATOR']);
  });

  it('switches role from page 0 without showing the other role rows', async () => {
    let resolveCoordinators: (value: CaseStaffPage) => void = () => {};
    vi.mocked(assessmentApi.staff).mockImplementation((role) =>
      role === 'SPECIALIST'
        ? Promise.resolve(pageOf([person(31, 'SPECIALIST', 1)], 2, 1))
        : new Promise((resolve) => (resolveCoordinators = resolve)),
    );
    mount(<ManagerStaffPage />, '/manager/staff?role=SPECIALIST&page=1');
    await screen.findByText('Test SPECIALIST 31');
    await userEvent.setup().selectOptions(screen.getByLabelText('Role'), 'COORDINATOR');
    expect(assessmentApi.staff).toHaveBeenLastCalledWith('COORDINATOR', 0, expect.any(AbortSignal));
    expect(screen.queryByText('Test SPECIALIST 31')).not.toBeInTheDocument();
    resolveCoordinators(pageOf([person(41, 'COORDINATOR', 0)]));
    expect(await screen.findByText('Test COORDINATOR 41')).toBeInTheDocument();
  });

  it('passes the StaffID to a picker action', async () => {
    vi.mocked(assessmentApi.staff).mockResolvedValue(pageOf([person(31, 'SPECIALIST', 2)]));
    const pick = vi.fn();
    mount(
      <StaffDirectory
        role="SPECIALIST"
        page={0}
        onPageChange={() => {}}
        renderAction={(s) => (
          <button type="button" onClick={() => pick(s.staffId)}>
            Select
          </button>
        )}
      />,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Select' }));
    expect(pick).toHaveBeenCalledWith(31);
  });

  it('shows an empty state when no staff are active', async () => {
    vi.mocked(assessmentApi.staff).mockResolvedValue(pageOf([]));
    mount(<ManagerStaffPage />, '/manager/staff?role=COORDINATOR');
    expect(await screen.findByText('No active coordinators')).toBeInTheDocument();
  });
});

describe('staff contract', () => {
  it('rejects roles outside the case roles and negative workload', () => {
    expect(caseStaffPageSchema.safeParse(pageOf([person(1, 'SPECIALIST', 0)])).success).toBe(true);
    const driver = { ...person(1, 'SPECIALIST', 0), role: 'DRIVER' };
    expect(caseStaffPageSchema.safeParse({ ...pageOf([]), items: [driver] }).success).toBe(false);
    const negative = { ...person(1, 'SPECIALIST', -1) };
    expect(caseStaffPageSchema.safeParse({ ...pageOf([]), items: [negative] }).success).toBe(false);
  });
});
