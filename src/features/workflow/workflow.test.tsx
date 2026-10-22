import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { currentStep, OrderWorkflowBanner, workflowSteps } from './OrderWorkflowBanner';
import { GatesSummary } from './GatesSummary';
import { departureApi } from '../departure/api';
import { readinessSchema } from '../departure/contracts';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('../departure/api', () => ({ departureApi: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

describe('order workflow banner', () => {
  it('maps every status to one step and leaves stopped statuses out', () => {
    expect(workflowSteps[currentStep('DRAFT')].key).toBe('REQUEST');
    expect(workflowSteps[currentStep('SUBMITTED')].key).toBe('REVIEW');
    expect(workflowSteps[currentStep('IN_PREPARATION')].key).toBe('PREPARE');
    expect(workflowSteps[currentStep('CONFIRMED')].key).toBe('AUTHORIZE');
    expect(workflowSteps[currentStep('IN_TRANSIT')].key).toBe('TRANSIT');
    expect(workflowSteps[currentStep('DELIVERED')].key).toBe('DELIVERY');
    expect(workflowSteps[currentStep('COMPLETED')].key).toBe('DONE');
    expect(currentStep('REJECTED')).toBe(-1);
  });

  it('tells the Manager it is their turn on a submitted request', () => {
    render(<OrderWorkflowBanner status="SUBMITTED" role="MANAGER" />);
    const banner = screen.getByRole('region', { name: 'Order workflow' });
    expect(banner).toHaveTextContent('Waiting for Manager.');
    expect(banner).toHaveTextContent('Your turn: Decide on the request');
    const steps = within(banner).getByRole('list', { name: 'Workflow steps' });
    expect(within(steps).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step');
  });

  it.each<Role>(['SPECIALIST', 'COORDINATOR', 'CUSTOMER'])(
    'tells the %s nothing waits on them while the Manager reviews',
    (role) => {
      render(<OrderWorkflowBanner status="SUBMITTED" role={role} />);
      expect(screen.getByText('Nothing is waiting on you in this step.')).toBeInTheDocument();
      expect(screen.queryByText(/Your turn/)).toBeNull();
    },
  );

  it('shows a stopped request without a current step', () => {
    render(<OrderWorkflowBanner status="REJECTED" role="CUSTOMER" />);
    expect(screen.getByText('Stopped — rejected')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { current: 'step' })).toBeNull();
  });
});

function mountGates(role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GatesSummary orderId={101} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const gate = (status: string, blockers: string[] = []) => ({ status, blockers });

describe('read-only gates summary', () => {
  it('shows the three gates with their owners and links to departure', async () => {
    vi.mocked(departureApi.get).mockResolvedValue(
      readinessSchema.parse({
        orderId: 101,
        recordVersion: '000000000001A2B3',
        orderStatus: 'CONFIRMED',
        currentRevisionId: 501,
        planId: 801,
        planVersionNo: 1,
        planStatus: 'CONFIRMED',
        acceptedQuoteId: 301,
        firstLegId: 901,
        firstLegStatus: 'PLANNED',
        firstLegActualDeparture: null,
        asOf: '2027-02-01T05:00:00Z',
        gatesCheckedAt: null,
        financialGate: gate('PASS'),
        legalGate: gate('BLOCKED', ['PHASE_CLEARANCE_PENDING']),
        operationalGate: gate('PASS'),
        readyForAuthorization: false,
        departureAuthorizedBy: null,
        departureAuthorizedAt: null,
        readyForDeparture: false,
        departureBlockers: [],
        receipts: [],
      }),
    );
    mountGates('MANAGER');
    const tiles = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(tiles).toHaveLength(3);
    expect(tiles[1]).toHaveTextContent('Legal gate');
    expect(tiles[1]).toHaveTextContent('BLOCKED');
    expect(tiles[1]).toHaveTextContent('1 open item');
    expect(screen.getByText(/Departure is not authorized yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open departure' })).toHaveAttribute(
      'href',
      '/manager/requests/101/departure',
    );
    // Read-only: no forms or buttons for legal or planning work.
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('explains that gates appear once a plan exists', async () => {
    vi.mocked(departureApi.get).mockRejectedValue(new ApiError(409, 'No plan.'));
    mountGates('COORDINATOR');
    expect(
      await screen.findByText('The gates appear once a journey plan exists for this request.'),
    ).toBeInTheDocument();
  });
});
