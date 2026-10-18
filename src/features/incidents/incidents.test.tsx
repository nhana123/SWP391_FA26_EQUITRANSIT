import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomerAdjustments, LegIncidents, PlanAdjustments, ReportIncidentForm } from './panels';
import { incidentsApi } from './api';
import { adjustmentSchema, incidentSchema } from './contracts';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  incidentsApi: {
    reportAsDriver: vi.fn(),
    reportAsStaff: vi.fn(),
    forLeg: vi.fn(),
    acknowledge: vi.fn(),
    resolve: vi.fn(),
    adjustments: vi.fn(),
    propose: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    customerAdjustments: vi.fn(),
    decide: vi.fn(),
  },
}));

const incident = (patch: Record<string, unknown> = {}) =>
  incidentSchema.parse({
    incidentId: 401,
    legId: 901,
    reportedBy: 41,
    reporterName: 'Test Driver',
    incidentType: 'HORSE_WELFARE_EMERGENCY',
    severityLevel: 'CRITICAL',
    incidentTime: '2026-10-18T07:00:00Z',
    description: 'Colic signs',
    status: 'REPORTED',
    ...patch,
  });
const adjustment = (patch: Record<string, unknown> = {}) =>
  adjustmentSchema.parse({
    adjustmentId: 71,
    planId: 801,
    orderId: 101,
    incidentId: 401,
    proposedBy: 32,
    proposerName: 'Test Coordinator',
    proposedChanges: '{"summary":"Reroute via A6"}',
    additionalCostEstimate: 450,
    approvalStatus: 'CUSTOMER_PENDING',
    proposedAt: '2026-10-18T08:00:00Z',
    customerDecision: 'PENDING',
    ...patch,
  });

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});
function mount(role: Role, ui: React.ReactNode) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return userEvent.setup({ delay: null });
}
const fill = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) => {
  await user.click(field);
  await user.paste(text);
};

describe('incidents (#81 F13)', () => {
  it('a driver reports on the driver endpoint with evidence keys as a JSON list', async () => {
    vi.mocked(incidentsApi.reportAsDriver).mockResolvedValue(incident());
    const onReported = vi.fn();
    const user = mount(
      'DRIVER',
      <ReportIncidentForm legId={901} asDriver onReported={onReported} />,
    );
    expect(screen.getByText(/reporting never waits for any cost approval/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Incident type'), 'HORSE_WELFARE_EMERGENCY');
    await user.selectOptions(screen.getByLabelText('Severity'), 'CRITICAL');
    await fill(user, screen.getByLabelText('What happened'), 'Colic signs');
    await fill(user, screen.getByLabelText('Evidence file keys (optional)'), 'photo-1, vet-note');
    await user.click(screen.getByRole('button', { name: 'Report incident' }));
    await waitFor(() => expect(incidentsApi.reportAsDriver).toHaveBeenCalledTimes(1));
    expect(incidentsApi.reportAsDriver).toHaveBeenCalledWith(901, {
      incidentType: 'HORSE_WELFARE_EMERGENCY',
      severityLevel: 'CRITICAL',
      incidentTime: null,
      description: 'Colic signs',
      immediateActionNotes: null,
      emergencyContact: null,
      evidenceFilesJson: '["photo-1","vet-note"]',
    });
    expect(incidentsApi.reportAsStaff).not.toHaveBeenCalled();
    expect(onReported).toHaveBeenCalled();
  });

  it('never auto-retries a report with an unknown outcome; it requires a reload first', async () => {
    vi.mocked(incidentsApi.reportAsStaff).mockRejectedValue(new ApiError(0, 'Interrupted'));
    const user = mount(
      'COORDINATOR',
      <ReportIncidentForm legId={901} asDriver={false} onReported={vi.fn()} />,
    );
    await user.selectOptions(screen.getByLabelText('Incident type'), 'VEHICLE_BREAKDOWN');
    await user.selectOptions(screen.getByLabelText('Severity'), 'HIGH');
    await fill(user, screen.getByLabelText('What happened'), 'Axle failure');
    await user.click(screen.getByRole('button', { name: 'Report incident' }));
    expect(await screen.findByText(/cannot be safely repeated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report incident' })).toBeDisabled();
    expect(incidentsApi.reportAsStaff).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Reload and check' })).toBeInTheDocument();
  });

  it('staff acknowledge, and resolve only with notes', async () => {
    vi.mocked(incidentsApi.forLeg).mockResolvedValue([incident()]);
    vi.mocked(incidentsApi.resolve).mockResolvedValue(incident({ status: 'RESOLVED' }));
    const user = mount('COORDINATOR', <LegIncidents legId={901} />);
    const list = await screen.findByRole('region', { name: 'Incidents for leg 901' });
    expect(await within(list).findByText('Colic signs')).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Resolve' }));
    expect(within(list).getByText('Resolution notes are required to resolve.')).toBeInTheDocument();
    expect(incidentsApi.resolve).not.toHaveBeenCalled();
    await fill(user, within(list).getByLabelText('Notes for incident 401'), 'Vet treated; stable');
    await user.click(within(list).getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(incidentsApi.resolve).toHaveBeenCalledWith(401, 'Vet treated; stable'),
    );
  });

  it('says when incident management is not deployed on the server', async () => {
    vi.mocked(incidentsApi.forLeg).mockRejectedValue(new ApiError(404, 'Not found'));
    mount('MANAGER', <LegIncidents legId={901} />);
    expect(await screen.findByText(/not available on this server yet/)).toBeInTheDocument();
  });
});

describe('operational adjustments (#81 F13)', () => {
  it('managers cannot approve a cost before the customer accepts it', async () => {
    vi.mocked(incidentsApi.adjustments).mockResolvedValue([adjustment()]);
    mount('MANAGER', <PlanAdjustments planId={801} manager />);
    const section = await screen.findByRole('region', { name: 'Operational adjustments' });
    expect(await within(section).findByText(/Reroute via A6/)).toBeInTheDocument();
    expect(within(section).getByText(/additional cost 450.00/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(within(section).getByText(/waits for the customer/)).toBeInTheDocument();
  });

  it('approves an accepted adjustment and reports the new plan version', async () => {
    vi.mocked(incidentsApi.adjustments).mockResolvedValue([
      adjustment({ customerDecision: 'ACCEPTED' }),
    ]);
    vi.mocked(incidentsApi.approve).mockResolvedValue({
      adjustmentId: 71,
      orderId: 101,
      previousPlanId: 801,
      newPlanId: 802,
      newVersionNo: 2,
      evolvedLegCount: 3,
      approvalStatus: 'APPLIED',
      decidedAt: null,
      message: null,
    });
    const user = mount('MANAGER', <PlanAdjustments planId={801} manager />);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/plan version 2 \(plan 802\) now applies/)).toBeInTheDocument();
  });

  it('coordinators propose with structured JSON changes and an exact cost, without deciding', async () => {
    vi.mocked(incidentsApi.adjustments).mockResolvedValue([]);
    vi.mocked(incidentsApi.propose).mockResolvedValue(adjustment());
    const user = mount('COORDINATOR', <PlanAdjustments planId={801} manager={false} />);
    const form = within(await screen.findByRole('form', { name: 'Propose adjustment' }));
    await fill(user, form.getByLabelText('Related incident ID (optional)'), '401');
    await fill(user, form.getByLabelText('Summary'), 'Replacement vehicle');
    await fill(user, form.getByLabelText('Additional cost estimate'), '-5');
    await user.click(form.getByRole('button', { name: 'Propose adjustment' }));
    expect(form.getByText(/0 or a positive amount/)).toBeInTheDocument();
    await user.clear(form.getByLabelText('Additional cost estimate'));
    await fill(user, form.getByLabelText('Additional cost estimate'), '0');
    await user.click(form.getByRole('button', { name: 'Propose adjustment' }));
    await waitFor(() => expect(incidentsApi.propose).toHaveBeenCalledTimes(1));
    expect(incidentsApi.propose).toHaveBeenCalledWith(801, {
      incidentId: 401,
      changeRequestId: null,
      proposedChanges: '{"summary":"Replacement vehicle"}',
      additionalCostEstimate: '0',
      customerDescription: null,
    });
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('customers decide explicitly on a pending cost, seeing no staff identity', async () => {
    vi.mocked(incidentsApi.customerAdjustments).mockResolvedValue([
      {
        adjustmentId: 71,
        orderId: 101,
        additionalCost: '450.00',
        customerDecision: 'PENDING',
        approvalStatus: 'CUSTOMER_PENDING',
        summary: 'Reroute via A6',
        proposedAt: null,
        customerResponseNotes: null,
        respondedAt: null,
      },
    ]);
    vi.mocked(incidentsApi.decide).mockResolvedValue({
      adjustmentId: 71,
      orderId: 101,
      additionalCost: '450.00',
      customerDecision: 'ACCEPTED',
      approvalStatus: 'CUSTOMER_PENDING',
      summary: 'Reroute via A6',
      proposedAt: null,
      customerResponseNotes: null,
      respondedAt: null,
    });
    const user = mount('CUSTOMER', <CustomerAdjustments orderId={101} />);
    const form = within(await screen.findByRole('form', { name: 'Decide on adjustment 71' }));
    expect(screen.queryByText(/Coordinator/)).toBeNull();
    await user.selectOptions(form.getByLabelText('Your decision'), 'ACCEPTED');
    await user.click(form.getByRole('button', { name: 'Send decision' }));
    expect(form.getByText('Confirm your decision.')).toBeInTheDocument();
    expect(incidentsApi.decide).not.toHaveBeenCalled();
    expect(form.getByText(/does not make a payment/)).toBeInTheDocument();
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Send decision' }));
    await waitFor(() =>
      expect(incidentsApi.decide).toHaveBeenCalledWith(101, 71, {
        decision: 'ACCEPTED',
        responseNotes: null,
      }),
    );
  });
});
