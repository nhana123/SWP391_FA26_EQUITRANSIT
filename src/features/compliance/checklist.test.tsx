import { setDate } from '../../test/date-time';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CustomerLegalChecklist } from './CustomerChecklist';
import { complianceApi } from './api';
import type { Overview, Phase, Requirement } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  COMPLIANCE_PAGE_SIZE: 20,
  complianceApi: { overview: vi.fn(), upload: vi.fn(), submit: vi.fn() },
}));

const requirement = (patch: Partial<Requirement>): Requirement => ({
  requirementId: 44,
  ruleId: 101,
  documentType: 'HEALTH_CERTIFICATE',
  phase: 'PRE_EXPORT',
  status: 'PENDING',
  submissionId: null,
  documentVersionId: null,
  decision: null,
  instructions: null,
  feedback: null,
  ...patch,
});
const overview = (phase: Phase, requirements: Requirement[]): Overview => ({
  revisionId: 7,
  recordVersion: '00000000000000a1',
  readiness: {
    revisionId: 7,
    phase,
    asOf: '2027-02-20T12:00:00Z',
    expiresAt: null,
    status: 'PENDING',
    blockers: [],
  },
  requirements,
  page: 0,
  size: 20,
  totalElements: requirements.length,
});
const byPhase: Record<Phase, Requirement[]> = {
  PRE_EXPORT: [
    requirement({ instructions: 'Issued within 10 days of departure.' }),
    requirement({
      requirementId: 45,
      documentType: 'EXPORT_PERMIT',
      submissionId: 9,
      documentVersionId: 90,
    }),
  ],
  ARRIVAL: [
    requirement({
      requirementId: 46,
      phase: 'ARRIVAL',
      documentType: 'IMPORT_PERMIT',
      submissionId: 10,
      documentVersionId: 91,
      decision: 'REJECTED',
      feedback: 'The scan is unreadable; upload a clearer copy.',
    }),
  ],
  QUARANTINE_RELEASE: [
    requirement({
      requirementId: 47,
      phase: 'QUARANTINE_RELEASE',
      documentType: 'RELEASE_NOTE',
      submissionId: 11,
      documentVersionId: 92,
      decision: 'APPROVED',
    }),
  ],
};
const receipt = (entityId: number, recordVersion: string) => ({
  entityId,
  operationId: 'd86b4f63-5acc-4f20-8da3-e24323268814',
  recordVersion,
  fileKey: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(complianceApi.overview).mockImplementation((_o, phase) =>
    Promise.resolve(overview(phase, byPhase[phase])),
  );
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
function mount(orderStatus = 'IN_PREPARATION') {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CustomerLegalChecklist orderId={9} orderStatus={orderStatus} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}

describe('customer legal documents checklist on the request page', () => {
  it('shows every required document with its state and the Specialist note', async () => {
    mount();
    const pre = await screen.findByRole('list', { name: 'Pre-export documents' });
    const [health, permit] = within(pre).getAllByRole('listitem');
    expect(health).toHaveTextContent('Health certificate');
    expect(health).toHaveTextContent('Action required');
    expect(health).toHaveTextContent('Issued within 10 days of departure.');
    expect(permit).toHaveTextContent('Submitted · under review');
    expect(within(permit).queryByRole('button')).toBeNull();
    const arrival = screen.getByRole('list', { name: 'Arrival documents' });
    expect(arrival).toHaveTextContent('Send a new version');
    expect(within(arrival).getByRole('note')).toHaveTextContent(
      'The scan is unreadable; upload a clearer copy.',
    );
    expect(screen.getByRole('list', { name: 'Quarantine release documents' })).toHaveTextContent(
      'Approved',
    );
    expect(screen.getByText('2 to send')).toBeInTheDocument();
  });

  it('uploads and submits the exact new version in one action, retrying identically', async () => {
    vi.mocked(complianceApi.upload).mockResolvedValue(receipt(103, '00000000000000a2'));
    vi.mocked(complianceApi.submit)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(receipt(500, '00000000000000a3'));
    const user = mount();
    await user.click(
      await screen.findByRole('button', { name: 'Send HEALTH_CERTIFICATE to the Specialist' }),
    );
    const form = within(screen.getByRole('form', { name: 'Send HEALTH_CERTIFICATE' }));
    await user.upload(
      form.getByLabelText('File'),
      new File([new Uint8Array([1])], 'cert.pdf', { type: 'application/pdf' }),
    );
    setDate(form.getByLabelText('Issued date'), '2026-10-01');
    setDate(form.getByLabelText('Expiry date'), '2027-03-01');
    await waitFor(() =>
      expect(form.getByRole('button', { name: 'Send to the Specialist' })).toBeEnabled(),
    );
    await user.click(form.getByRole('button', { name: 'Send to the Specialist' }));
    await user.click(await form.findByRole('button', { name: 'Retry the same action' }));
    await waitFor(() => expect(complianceApi.submit).toHaveBeenCalledTimes(2));
    const [upload1, upload2] = vi.mocked(complianceApi.upload).mock.calls;
    expect(upload2).toEqual(upload1);
    expect(upload1[1]).toMatchObject({
      documentType: 'HEALTH_CERTIFICATE',
      recordVersion: '00000000000000a1',
      fileName: 'cert.pdf',
    });
    const [submit1, submit2] = vi.mocked(complianceApi.submit).mock.calls;
    expect(submit2).toEqual(submit1);
    expect(submit1).toEqual([
      9,
      44,
      {
        documentVersionId: 103,
        recordVersion: '00000000000000a2',
        operationId: expect.any(String),
      },
    ]);
    expect(submit1[2].operationId).not.toBe(upload1[1].operationId);
  });

  it('says the documents are not listed yet before the route checklist', async () => {
    vi.mocked(complianceApi.overview).mockImplementation((_o, phase) =>
      Promise.resolve(overview(phase, [])),
    );
    mount();
    expect(await screen.findByText(/has not listed the documents/)).toBeInTheDocument();
  });

  it('is not shown before legal work starts', () => {
    mount('SUBMITTED');
    expect(screen.queryByRole('region')).toBeNull();
    expect(complianceApi.overview).not.toHaveBeenCalled();
  });
});
