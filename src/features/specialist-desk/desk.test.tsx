import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DossierDesk } from './DossierDesk';
import { mergeDossiers } from './data';
import { AssignedCasePage } from '../assigned-cases/pages';
import { assignedCasesApi } from '../assigned-cases/api';
import { operationsApi } from '../activity-operations/api';
import { complianceApi } from '../compliance/api';
import type { CaseSummary, ManagerCase } from '../assessment/contracts';
import type { Overview } from '../compliance/contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('../assigned-cases/api', () => ({
  ASSIGNED_PAGE_SIZE: 20,
  assignedCasesApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('../activity-operations/api', () => ({
  OPERATIONS_PAGE_SIZE: 20,
  operationsApi: {
    tasks: vi.fn(),
    timeline: vi.fn(() => new Promise(() => {})),
    dashboard: vi.fn(),
  },
}));
vi.mock('../compliance/api', () => ({
  COMPLIANCE_PAGE_SIZE: 20,
  complianceApi: {
    overview: vi.fn(),
    documents: vi.fn(),
    rules: vi.fn(),
    procedures: vi.fn(),
    assessment: vi.fn(),
    checklist: vi.fn(),
    review: vi.fn(),
  },
}));

const summary = (patch: Partial<CaseSummary> = {}): CaseSummary => ({
  orderId: 7,
  orderNumber: 'DEMO-ORD-04',
  orderStatus: 'APPROVED',
  recordVersion: '00000000000000c1',
  currentRevisionId: 70,
  originCountryCode: 'VN',
  destinationCountryCode: 'SG',
  deliveryDeadline: '2026-11-15T10:00:00Z',
  ...patch,
});
const page = <T,>(items: T[]) => ({
  items,
  page: 0,
  size: 20,
  totalElements: items.length,
  totalPages: 1,
});
const task = (orderId: number, dueAt: string | null = null) => ({
  assignmentId: orderId * 10,
  orderId,
  legId: null,
  role: 'SPECIALIST',
  dueAt,
});
const caseView: ManagerCase = {
  orderId: 7,
  orderNumber: 'DEMO-ORD-04',
  orderStatus: 'IN_PREPARATION',
  recordVersion: '00000000000000c1',
  currentRevisionId: 70,
  revision: {
    revisionId: 70,
    orderId: 7,
    revisionNo: 1,
    changeReason: null,
    submittedAt: '2030-01-01T00:00:00Z',
    snapshot: {
      schemaVersion: 1,
      request: {
        originCountryCode: 'VN',
        destinationCountryCode: 'US',
        deliveryDeadline: '2026-11-20T08:00:00Z',
        receiverName: 'Alex Receiver',
        receiverPhone: '+12025550123',
        healthDeclaration: {
          influenzaVaccinated: true,
          lastInfluenzaVaccinationDate: '2026-08-20',
          vaccinationRecordReference: 'FEI passport p.12',
          healthNotes: 'No illness in the last 30 days.',
          declaredAccurate: true,
        },
      },
      horse: {
        name: 'Thunder Bay',
        microchipId: '985141000123456',
        passportNumber: 'FEI-10459921',
        sexCode: 'GELDING',
        dateOfBirth: '2019-04-15',
        weightKg: 520,
      },
      services: [],
    },
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
const overview = (blockers: string[], patch: Partial<Overview> = {}): Overview => ({
  revisionId: 70,
  recordVersion: '00000000000000a1',
  readiness: {
    revisionId: 70,
    phase: 'PRE_EXPORT',
    asOf: '2026-10-20T00:00:00Z',
    expiresAt: null,
    status: 'PENDING',
    blockers,
  },
  requirements: [
    {
      requirementId: 41,
      ruleId: 101,
      documentType: 'HEALTH_CERTIFICATE',
      phase: 'PRE_EXPORT',
      status: 'PENDING',
      submissionId: 102,
      documentVersionId: 103,
      decision: null,
      instructions: 'Upload the full certificate.',
      feedback: null,
      attachment: null,
    },
  ],
  page: 0,
  size: 20,
  totalElements: 1,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresIn: 600,
    role: 'SPECIALIST',
  });
  vi.mocked(complianceApi.documents).mockResolvedValue([]);
  vi.mocked(complianceApi.rules).mockResolvedValue([]);
  vi.mocked(complianceApi.procedures).mockResolvedValue([]);
  vi.mocked(complianceApi.assessment).mockResolvedValue({
    applicability: 'REQUIRED',
    requiredDays: 14,
    visitCount: null,
    testCount: null,
    doseCount: null,
    certificateCount: null,
    validUntil: null,
  });
});
function mount(entry: string) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/staff/tasks" element={<DossierDesk />} />
          <Route path="/staff/cases/:id" element={<AssignedCasePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}

describe('dossier data', () => {
  it('enriches each task with its case and orders by the nearest date', () => {
    const merged = mergeDossiers(
      [
        summary({ orderId: 1, orderNumber: 'A', deliveryDeadline: '2026-12-01T00:00:00Z' }),
        summary({ orderId: 2, orderNumber: 'B', deliveryDeadline: '2026-11-01T00:00:00Z' }),
      ],
      [task(1, '2026-10-25T00:00:00Z'), task(9)],
    );
    expect(merged.map((d) => [d.orderNumber, d.taskDueAt])).toEqual([
      ['A', '2026-10-25T00:00:00Z'],
      ['B', null],
      [null, null],
    ]);
    // A task whose case is not in the list still opens by ID.
    expect(merged[2]).toMatchObject({ orderId: 9, hasTask: true, origin: null });
  });
});

describe('specialist dossier desk', () => {
  it('shows each case as a folder with code, route, deadline and status', async () => {
    vi.mocked(assignedCasesApi.list).mockResolvedValue(
      page([
        summary(),
        summary({
          orderId: 8,
          orderNumber: 'DEMO-ORD-05',
          orderStatus: 'IN_TRANSIT',
          destinationCountryCode: 'US',
        }),
      ]),
    );
    vi.mocked(operationsApi.tasks).mockResolvedValue({
      ...page([task(7, '2026-10-30T09:00:00Z')]),
    });
    const user = mount('/staff/tasks');
    const grid = await screen.findByRole('list', { name: 'Case dossiers' });
    const first = within(grid).getAllByRole('listitem')[0];
    expect(first).toHaveTextContent('DEMO-ORD-04');
    expect(first).toHaveTextContent('Specialist review');
    expect(within(first).getByLabelText('Route')).toHaveTextContent('VNSG');
    expect(first).toHaveTextContent('Approved for preparation');
    expect(first).toHaveTextContent('Preparation due');
    expect(within(first).getByRole('link', { name: 'Open dossier DEMO-ORD-04' })).toHaveAttribute(
      'href',
      '/staff/cases/7',
    );
    await user.click(screen.getByRole('button', { name: 'Cleared / Completed' }));
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1);
    expect(grid).toHaveTextContent('DEMO-ORD-05');
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByLabelText('Search dossiers by request code'), '04');
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1);
    expect(grid).toHaveTextContent('DEMO-ORD-04');
  });

  it('names a task-only dossier from the dashboard and opens its legal file', async () => {
    vi.mocked(assignedCasesApi.list).mockResolvedValue(page([summary()]));
    vi.mocked(operationsApi.tasks).mockResolvedValue(page([task(7), task(5)]));
    vi.mocked(operationsApi.dashboard).mockResolvedValue({
      role: 'SPECIALIST',
      counts: [],
      items: [{ orderId: 5, orderNumber: 'DEMO-ORD-05', status: 'IN_TRANSIT' }],
      totalElements: 1,
      page: 0,
      size: 20,
    });
    mount('/staff/tasks');
    const link = await screen.findByRole('link', { name: 'Open dossier DEMO-ORD-05' });
    expect(link).toHaveAttribute('href', '/staff/cases/5/compliance');
    expect(screen.getByText(/moved past preparation/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open dossier DEMO-ORD-04' })).toHaveAttribute(
      'href',
      '/staff/cases/7',
    );
  });

  it('keeps the desk usable when task due times fail, and says so', async () => {
    vi.mocked(assignedCasesApi.list).mockResolvedValue(page([summary()]));
    vi.mocked(operationsApi.tasks).mockRejectedValue(new ApiError(503, 'Pending'));
    mount('/staff/tasks');
    expect(await screen.findByText(/Task due times could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open dossier DEMO-ORD-04' })).toBeInTheDocument();
  });

  it('shows a real error rather than an empty desk', async () => {
    vi.mocked(assignedCasesApi.list).mockRejectedValue(new ApiError(403, 'Forbidden'));
    vi.mocked(operationsApi.tasks).mockResolvedValue(page([]));
    mount('/staff/tasks');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/No dossiers on your desk/)).toBeNull();
  });
});

describe('open two-page dossier', () => {
  it('pins the case facts left and orders the right page checklist → documents → clearance', async () => {
    vi.mocked(assignedCasesApi.get).mockResolvedValue(caseView);
    vi.mocked(complianceApi.overview).mockResolvedValue(overview(['DOCUMENT_EVIDENCE_PENDING']));
    const user = mount('/staff/cases/7');
    const sheet = await screen.findByRole('complementary', { name: 'Dossier reference sheet' });
    await waitFor(() => expect(sheet).toHaveTextContent('Thunder Bay'));
    expect(sheet).toHaveTextContent('985141000123456');
    // What the customer declared at submission sits beside the documents.
    expect(sheet).toHaveTextContent('FEI-10459921');
    expect(sheet).toHaveTextContent('Gelding');
    expect(sheet).toHaveTextContent('Alex Receiver · +12025550123');
    expect(sheet).toHaveTextContent('Vaccinated · last dose 2026-08-20 · FEI passport p.12');
    expect(sheet).toHaveTextContent('No illness in the last 30 days.');
    expect(
      within(sheet).getByText('Approved for preparation', { selector: 'dd' }),
    ).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Required · 14 days');
    expect(
      within(sheet).getAllByRole('button', { name: /stamp: (Pending|Checking…)/ }),
    ).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Back to My Tasks' })).toHaveAttribute(
      'href',
      '/staff/tasks',
    );

    const steps = await screen.findAllByRole('region', { name: /^Step \d/ });
    expect(steps.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Step 1: Route checklist',
      'Step 2: Required documents',
      'Step 3: Clear the pre-export phase',
    ]);
    // Checklist exists → folded into a summary with a change button.
    expect(within(steps[0]).queryByRole('form', { name: 'Assess route checklist' })).toBeNull();
    expect(steps[0]).toHaveTextContent('Route checklist: VN → US');
    await user.click(within(steps[0]).getByRole('button', { name: 'Update transit' }));
    expect(
      within(steps[0]).getByRole('form', { name: 'Assess route checklist' }),
    ).toBeInTheDocument();

    // Pass is one click on the card; the reason form opens only when sending back.
    const docs = within(steps[1]).getByRole('list', { name: 'Required documents' });
    expect(
      within(docs).getByRole('form', { name: 'Approve HEALTH_CERTIFICATE' }),
    ).toBeInTheDocument();
    expect(
      within(docs).queryByRole('form', { name: 'Request changes to HEALTH_CERTIFICATE' }),
    ).toBeNull();
    await user.click(
      within(docs).getByRole('button', { name: 'Request changes to HEALTH_CERTIFICATE' }),
    );
    expect(
      within(docs).getByRole('form', { name: 'Request changes to HEALTH_CERTIFICATE' }),
    ).toBeInTheDocument();
    // Step 3 waits for the documents and says so in one line.
    expect(steps[2]).toHaveClass('waiting');
    expect(steps[2]).toHaveTextContent('Approve every required document in step 2 first.');
    expect(within(steps[2]).getByRole('form', { name: 'Clear Pre-export' })).toBeInTheDocument();
    // The phase is switched from the stamps only: no second tab bar.
    expect(screen.queryByRole('navigation', { name: 'Compliance phases' })).toBeNull();
    // The case file stays available, read-only.
    expect(screen.getByText('Check export rules')).toBeInTheDocument();
  });

  it('opens the route checklist first with suggestions when the phase has none', async () => {
    vi.mocked(assignedCasesApi.get).mockResolvedValue(caseView);
    vi.mocked(complianceApi.overview).mockResolvedValue(
      overview(['RULE_ASSESSMENT_PENDING'], { requirements: [], totalElements: 0 }),
    );
    const user = mount('/staff/cases/7');
    const form = within(await screen.findByRole('form', { name: 'Assess route checklist' }));
    // Direct is the default; the technical fields stay folded until asked for.
    expect(form.getByRole('button', { name: 'Direct' })).toHaveAttribute('aria-pressed', 'true');
    expect(form.queryByLabelText('Source reference')).toBeNull();
    expect(
      within(screen.getByRole('region', { name: /^Step 2/ })).getByText(
        /Record the route checklist in step 1 first/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No extra documents are required/)).toBeNull();
    await user.click(form.getByRole('button', { name: 'Advanced options' }));
    await waitFor(() =>
      expect(form.getByLabelText('Source reference')).toHaveValue(
        'Sourced rules for VN → US, pre-export phase, checked by the assigned specialist.',
      ),
    );
    expect(form.getByLabelText('Time zone')).toHaveValue('+07:00');
    expect(form.getByLabelText('Valid until')).not.toHaveValue('');
    await user.click(form.getByRole('button', { name: 'SG' }));
    await user.click(form.getByRole('button', { name: 'QA' }));
    expect(form.getByLabelText('Transit countries')).toHaveValue('SG, QA');
    await user.click(form.getByRole('button', { name: 'SG' }));
    expect(form.getByLabelText('Transit countries')).toHaveValue('QA');
    await user.click(form.getByRole('button', { name: 'Direct' }));
    expect(form.getByLabelText('Transit countries')).toHaveValue('');
    expect(screen.getByText(/has no route checklist yet/)).toBeInTheDocument();
  });

  it('shows a cleared stamp only when the server reports the phase ready', async () => {
    vi.mocked(assignedCasesApi.get).mockResolvedValue(caseView);
    vi.mocked(complianceApi.overview).mockImplementation((_o, phase) =>
      Promise.resolve({
        ...overview([]),
        readiness: {
          ...overview([]).readiness,
          phase,
          status: phase === 'PRE_EXPORT' ? 'READY' : 'PENDING',
        },
      }),
    );
    mount('/staff/cases/7');
    expect(
      await screen.findByRole('button', { name: '1. Pre-export stamp: Cleared' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '2. Arrival stamp: Pending' }),
    ).toBeInTheDocument();
  });
});
