import { setDate } from '../../test/date-time';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CustomerLegalChecklist } from './CustomerChecklist';
import { complianceApi } from './api';
import { filesApi } from '../../shared/api/files';
import type { Overview, Phase, Requirement } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('../../shared/api/files', async (original) => ({
  ...(await original<typeof import('../../shared/api/files')>()),
  filesApi: { upload: vi.fn(), read: vi.fn() },
}));
vi.mock('./api', () => ({
  COMPLIANCE_PAGE_SIZE: 20,
  complianceApi: {
    overview: vi.fn(),
    documents: vi.fn(),
    upload: vi.fn(),
    submit: vi.fn(),
    uploadAndSubmit: vi.fn(),
  },
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
  attachment: null,
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
  // No paper is on file for this horse yet.
  vi.mocked(complianceApi.documents).mockResolvedValue([]);
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
    // Nothing to send while under review; the standard form stays available.
    expect(within(permit).queryByRole('button', { name: /Send/ })).toBeNull();
    expect(
      within(permit).getByRole('button', { name: 'View the standard form for EXPORT_PERMIT' }),
    ).toBeInTheDocument();
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

  it('stores a new file first, then submits it by key and retries identically', async () => {
    vi.mocked(filesApi.upload).mockResolvedValue({
      fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
      fileName: 'cert.pdf',
      fileSizeBytes: 1024,
      contentType: 'application/pdf',
    });
    vi.mocked(complianceApi.uploadAndSubmit)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(receipt(500, '00000000000000a3'));
    const user = mount();
    await user.click(
      await screen.findByRole('button', { name: 'Send HEALTH_CERTIFICATE to the Specialist' }),
    );
    const form = within(screen.getByRole('form', { name: 'Send HEALTH_CERTIFICATE' }));
    // No paper on file yet: uploading is the only way.
    expect(form.getByRole('radio', { name: /Choose from this horse's papers/ })).toBeDisabled();
    const file = new File([new Uint8Array([1])], 'cert.pdf', { type: 'application/pdf' });
    await user.upload(form.getByLabelText('File'), file);
    expect(await form.findByText(/cert\.pdf · 1 KB uploaded/)).toBeInTheDocument();
    expect(filesApi.upload).toHaveBeenCalledWith(file);
    setDate(form.getByLabelText('Issued on'), '2026-10-01');
    setDate(form.getByLabelText('Valid until'), '2099-03-01');
    await user.type(form.getByLabelText('Certificate number (optional)'), 'CERT-1');
    await user.click(form.getByRole('button', { name: 'Send to the Specialist' }));
    await user.click(await form.findByRole('button', { name: 'Retry the same action' }));
    await waitFor(() => expect(complianceApi.uploadAndSubmit).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(complianceApi.uploadAndSubmit).mock.calls;
    expect(second).toEqual(first);
    expect(first).toEqual([
      9,
      44,
      {
        fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
        documentNumber: 'CERT-1',
        issuedDate: '2026-10-01',
        expiryDate: '2099-03-01',
        recordVersion: '00000000000000a1',
        operationId: expect.any(String),
      },
    ]);
    expect(complianceApi.upload).not.toHaveBeenCalled();
    expect(complianceApi.submit).not.toHaveBeenCalled();
  });

  it('asks for a current version when a submitted document expired', async () => {
    vi.mocked(complianceApi.overview).mockImplementation((_o, phase) =>
      Promise.resolve(
        overview(
          phase,
          phase === 'PRE_EXPORT'
            ? [
                requirement({
                  status: 'EXPIRED',
                  submissionId: 9,
                  documentVersionId: 90,
                  decision: 'APPROVED',
                  attachment: {
                    fileKey: null,
                    fileName: 'old-cert.pdf',
                    contentType: 'application/pdf',
                    fileSizeBytes: 10,
                    referenceNumber: null,
                    expiresAt: '2026-01-01T00:00:00Z',
                  },
                }),
              ]
            : [],
        ),
      ),
    );
    mount();
    const item = (await screen.findByRole('list', { name: 'Pre-export documents' })).firstChild;
    expect(item).toHaveTextContent('Sent: old-cert.pdf');
    expect(item).toHaveTextContent('This document is no longer valid. Send a current version.');
    expect(
      screen.getByRole('button', { name: 'Send HEALTH_CERTIFICATE to the Specialist' }),
    ).toHaveTextContent('Send a new version');
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
