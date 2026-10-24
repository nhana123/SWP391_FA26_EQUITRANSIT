import { setDate, setDateTime } from '../../test/date-time';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerCompliancePage } from './CustomerCompliancePage';
import { SpecialistCompliancePage } from './SpecialistCompliancePage';
import { complianceApi } from './api';
import { filesApi } from '../../shared/api/files';
import type { ComplianceDocument, Overview, Requirement } from './contracts';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
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
    rules: vi.fn(),
    procedures: vi.fn(),
    assessment: vi.fn(),
    file: vi.fn(),
    upload: vi.fn(),
    submit: vi.fn(),
    uploadAndSubmit: vi.fn(),
    review: vi.fn(),
    rule: vi.fn(),
    checklist: vi.fn(),
    evidence: vi.fn(),
    procedure: vi.fn(),
    assess: vi.fn(),
    clear: vi.fn(),
    revoke: vi.fn(),
  },
}));

const stored = {
  fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
  fileName: 'cert.pdf',
  fileSizeBytes: 2048,
  contentType: 'application/pdf',
};
const requirement = (patch: Partial<Requirement> = {}): Requirement => ({
  requirementId: 44,
  ruleId: 101,
  documentType: 'HEALTH_CERTIFICATE',
  phase: 'PRE_EXPORT',
  status: 'PENDING',
  submissionId: null,
  documentVersionId: null,
  decision: null,
  instructions: 'Upload the full authority-issued certificate.',
  feedback: null,
  attachment: null,
  ...patch,
});
const overview = (patch: Partial<Overview> = {}, version = '00000000000000a1'): Overview => ({
  revisionId: 7,
  recordVersion: version,
  readiness: {
    revisionId: 7,
    phase: 'PRE_EXPORT',
    asOf: '2027-02-20T12:00:00Z',
    expiresAt: null,
    status: 'PENDING',
    blockers: ['DOCUMENT_EVIDENCE_PENDING', 'SOMETHING_NEW'],
  },
  requirements: [requirement()],
  page: 0,
  size: 20,
  totalElements: 1,
  ...patch,
});
const doc = (patch: Partial<ComplianceDocument> = {}): ComplianceDocument => ({
  documentVersionId: 103,
  documentId: 50,
  versionNo: 2,
  documentType: 'HEALTH_CERTIFICATE',
  fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
  issuedDate: '2026-10-01',
  expiryDate: '2027-03-01',
  revokedAt: null,
  ...patch,
});
const receipt = (version = '00000000000000a2', fileKey: string | null = null) => ({
  entityId: 900,
  operationId: 'd86b4f63-5acc-4f20-8da3-e24323268814',
  recordVersion: version,
  fileKey,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(complianceApi.overview).mockResolvedValue(overview());
  vi.mocked(complianceApi.documents).mockResolvedValue([doc()]);
  vi.mocked(complianceApi.rules).mockResolvedValue([]);
  vi.mocked(complianceApi.procedures).mockResolvedValue([]);
  vi.mocked(complianceApi.assessment).mockResolvedValue({
    applicability: null,
    requiredDays: null,
    visitCount: null,
    testCount: null,
    doseCount: null,
    certificateCount: null,
    validUntil: null,
  });
});
function mount(role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  const customer = role === 'CUSTOMER';
  const path = customer ? '/customer/requests/:id/compliance' : '/staff/cases/:id/compliance';
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path.replace(':id', '9')]}>
        <Routes>
          <Route
            path={path}
            element={customer ? <CustomerCompliancePage /> : <SpecialistCompliancePage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
const type = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) => {
  await user.click(field);
  await user.paste(text);
};

describe('customer legal documents (#78)', () => {
  it('shows pending readiness with readable and unknown blockers, per phase', async () => {
    const user = mount('CUSTOMER');
    const readiness = await screen.findByRole('region', { name: 'Pre-export readiness' });
    expect(readiness).toHaveTextContent('Pending');
    expect(
      within(readiness).getByText(/missing, pending review or not approved/),
    ).toBeInTheDocument();
    // An unknown blocker is shown as received, never hidden.
    expect(within(readiness).getByText('SOMETHING_NEW')).toBeInTheDocument();
    expect(complianceApi.overview).toHaveBeenCalledWith(9, 'PRE_EXPORT', 0, expect.anything());
    await user.click(screen.getByRole('button', { name: 'Arrival' }));
    await waitFor(() =>
      expect(complianceApi.overview).toHaveBeenCalledWith(9, 'ARRIVAL', 0, expect.anything()),
    );
    expect(screen.getByText(/does not issue a government permit/)).toBeInTheDocument();
  });

  it('reuses a paper the horse already has instead of scanning it again', async () => {
    vi.mocked(complianceApi.uploadAndSubmit).mockResolvedValue(receipt());
    const user = mount('CUSTOMER');
    // No separate upload-then-submit forms remain.
    await screen.findByRole('list', { name: 'Pre-export documents' });
    expect(screen.queryByRole('form', { name: 'Upload document version' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Send HEALTH_CERTIFICATE to the Specialist' }),
    );
    const form = within(screen.getByRole('form', { name: 'Send HEALTH_CERTIFICATE' }));
    // The paper on file is offered first.
    expect(
      await form.findByRole('radio', { name: /Choose from this horse's papers/ }),
    ).toBeChecked();
    expect(form.getByLabelText('Paper on file')).toHaveValue('103');
    await user.click(form.getByRole('button', { name: 'Send to the Specialist' }));
    await waitFor(() => expect(complianceApi.uploadAndSubmit).toHaveBeenCalledTimes(1));
    expect(complianceApi.uploadAndSubmit).toHaveBeenCalledWith(9, 44, {
      recordVersion: '00000000000000a1',
      operationId: expect.any(String),
      existingDocumentVersionId: 103,
    });
    expect(filesApi.upload).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file before uploading it', async () => {
    mount('CUSTOMER');
    // Bypass the input's accept filter to exercise the app's own check.
    const user = userEvent.setup({ delay: null, applyAccept: false });
    await user.click(
      await screen.findByRole('button', { name: 'Send HEALTH_CERTIFICATE to the Specialist' }),
    );
    const form = within(screen.getByRole('form', { name: 'Send HEALTH_CERTIFICATE' }));
    await user.click(form.getByRole('radio', { name: /Upload a new file/ }));
    await user.upload(
      form.getByLabelText('File'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    );
    await user.click(form.getByRole('button', { name: 'Send to the Specialist' }));
    expect(await form.findByText(/Only PDF, PNG or JPEG/)).toBeInTheDocument();
    expect(filesApi.upload).not.toHaveBeenCalled();
    expect(complianceApi.uploadAndSubmit).not.toHaveBeenCalled();
  });

  it('blocks legal writes after a background change until reload and review', async () => {
    vi.mocked(complianceApi.uploadAndSubmit).mockResolvedValue(receipt('00000000000000a4'));
    const user = mount('CUSTOMER');
    await user.click(
      await screen.findByRole('button', { name: 'Send HEALTH_CERTIFICATE to the Specialist' }),
    );
    const form = within(screen.getByRole('form', { name: 'Send HEALTH_CERTIFICATE' }));
    await form.findByLabelText('Paper on file');
    vi.mocked(complianceApi.overview).mockResolvedValue(overview({}, '00000000000000a3'));
    await act(() => queryClient.refetchQueries());
    expect(await screen.findByText(/This case changed since you opened it/)).toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Send to the Specialist' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reload and review' }));
    await waitFor(() =>
      expect(form.getByRole('button', { name: 'Send to the Specialist' })).toBeEnabled(),
    );
    await user.click(form.getByRole('button', { name: 'Send to the Specialist' }));
    await waitFor(() => expect(complianceApi.uploadAndSubmit).toHaveBeenCalledTimes(1));
    expect(vi.mocked(complianceApi.uploadAndSubmit).mock.calls[0][2].recordVersion).toBe(
      '00000000000000a3',
    );
  });

  it('shows a deployment notice, not an empty checklist, when migration 009 is pending', async () => {
    vi.mocked(complianceApi.overview).mockRejectedValue(
      new ApiError(503, 'Pending', 'COMPLIANCE_SCHEMA_PENDING'),
    );
    mount('CUSTOMER');
    expect(await screen.findAllByText(/migration 009 is pending/)).not.toHaveLength(0);
    expect(screen.queryByText(/No requirements yet/)).toBeNull();
  });

  it('views a private image file through the authorized API', async () => {
    vi.mocked(complianceApi.file).mockResolvedValue({
      fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
      contentType: 'image/png',
      fileName: 'cert.png',
      contentBase64: 'iVBORw==',
    });
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const user = mount('CUSTOMER');
    await user.click(await screen.findByRole('button', { name: '🐎 Horse papers' }));
    const table = await screen.findByRole('table', { name: 'Document versions' });
    await user.click(within(table).getByRole('button', { name: 'View file' }));
    expect(await within(table).findByRole('img', { name: 'cert.png' })).toHaveAttribute(
      'src',
      'blob:test',
    );
    expect(complianceApi.file).toHaveBeenCalledWith(
      9,
      '84032724-eac7-45df-8d04-e54f092279d0',
      expect.anything(),
    );
  });
});

describe('specialist legal compliance (#78)', () => {
  it('uploads a new file for the customer and submits it by its stored key', async () => {
    vi.mocked(filesApi.upload).mockResolvedValue(stored);
    vi.mocked(complianceApi.uploadAndSubmit).mockResolvedValue(receipt());
    const user = mount('SPECIALIST');
    await user.click(
      await screen.findByRole('button', { name: 'Upload HEALTH_CERTIFICATE for the customer' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Upload for the customer HEALTH_CERTIFICATE' }),
    );
    await user.click(form.getByRole('radio', { name: /Upload a new file/ }));
    await user.upload(
      form.getByLabelText('File'),
      new File([new Uint8Array([1])], 'cert.pdf', { type: 'application/pdf' }),
    );
    expect(await form.findByText(/cert\.pdf · 2 KB uploaded/)).toBeInTheDocument();
    setDate(form.getByLabelText('Issued on'), '2026-10-01');
    setDate(form.getByLabelText('Valid until'), '2099-03-01');
    await user.click(form.getByRole('button', { name: 'Upload and submit' }));
    await waitFor(() => expect(complianceApi.uploadAndSubmit).toHaveBeenCalledTimes(1));
    expect(vi.mocked(complianceApi.uploadAndSubmit).mock.calls[0]).toEqual([
      9,
      44,
      {
        fileKey: stored.fileKey,
        documentNumber: null,
        issuedDate: '2026-10-01',
        expiryDate: '2099-03-01',
        recordVersion: '00000000000000a1',
        operationId: expect.any(String),
      },
    ]);
  });

  it('records an approval only with uploaded evidence, then prefills its key', async () => {
    vi.mocked(complianceApi.rules).mockResolvedValue([
      {
        ruleId: 101,
        ruleCode: 'VN-GB-HEALTH',
        versionNo: 1,
        documentType: 'HEALTH_CERTIFICATE',
        phase: 'PRE_EXPORT',
        sourceUrl: 'https://authority.example/rules/health',
        effectiveFrom: '2026-10-01T00:00:00Z',
        effectiveTo: null,
        authorityRequired: true,
        transitCountryCode: null,
        instructions: null,
      },
    ]);
    vi.mocked(complianceApi.evidence).mockResolvedValue(
      receipt('00000000000000a2', '84032724-eac7-45df-8d04-e54f092279d0'),
    );
    vi.mocked(complianceApi.procedure).mockResolvedValue(receipt('00000000000000a3'));
    const user = mount('SPECIALIST');
    // The authority decision opens on the document card that needs it.
    await user.click(await screen.findByRole('button', { name: 'Record authority decision' }));
    const decision = within(await screen.findByRole('form', { name: 'Record authority decision' }));
    expect(decision.getByLabelText('Rule')).toHaveValue('101');
    await user.selectOptions(decision.getByLabelText('Recorded decision'), 'APPROVED');
    await type(user, decision.getByLabelText('Authority name'), 'Competent authority');
    await type(user, decision.getByLabelText('Application reference'), 'AUTH-1');
    await type(user, decision.getByLabelText('Source reference'), 'Decision letter');
    setDateTime(decision.getByLabelText('Decided at'), '2026-10-16T12:00:00Z');
    setDateTime(decision.getByLabelText('Expires at'), '2099-03-01T12:00:00Z');
    await user.click(decision.getByRole('button', { name: 'Record decision' }));
    expect(decision.getByText('Upload the authority evidence first.')).toBeInTheDocument();
    expect(complianceApi.procedure).not.toHaveBeenCalled();

    const upload = within(screen.getByRole('form', { name: 'Upload authority evidence' }));
    await user.click(upload.getByRole('button', { name: 'Upload evidence' }));
    expect(upload.getByText('Choose the evidence file.')).toBeInTheDocument();
    expect(complianceApi.evidence).not.toHaveBeenCalled();
    // After this write the BE reports the receipt's version as current.
    vi.mocked(complianceApi.overview).mockResolvedValue(overview({}, '00000000000000a2'));
    await user.upload(
      upload.getByLabelText('Evidence file'),
      new File([new Uint8Array([1])], 'letter.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() =>
      expect(upload.getByRole('button', { name: 'Upload evidence' })).toBeEnabled(),
    );
    await user.click(upload.getByRole('button', { name: 'Upload evidence' }));
    await waitFor(() =>
      expect(decision.getByLabelText('Evidence file key')).toHaveValue(
        '84032724-eac7-45df-8d04-e54f092279d0',
      ),
    );
    await user.click(decision.getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(complianceApi.procedure).toHaveBeenCalledTimes(1));
    // The next write uses the version from the evidence upload receipt.
    expect(vi.mocked(complianceApi.procedure).mock.calls[0][1]).toMatchObject({
      recordVersion: '00000000000000a2',
      ruleId: 101,
      decision: 'APPROVED',
      evidenceFileKey: '84032724-eac7-45df-8d04-e54f092279d0',
      holdReason: null,
    });
  });

  it('records NOT_REQUIRED quarantine with null days and explicit counts', async () => {
    vi.mocked(complianceApi.assess).mockResolvedValue(receipt());
    const user = mount('SPECIALIST');
    // Opened from the reference sheet only; no duplicate bar at the bottom.
    expect(screen.queryByRole('form', { name: 'Record assessment' })).toBeNull();
    await user.click(
      await screen.findByRole('button', { name: 'Veterinary & quarantine assessment' }),
    );
    const form = within(await screen.findByRole('form', { name: 'Record assessment' }));
    expect(await screen.findByText(/visits Pending, tests Pending/)).toBeInTheDocument();
    await user.selectOptions(form.getByLabelText('Quarantine'), 'NOT_REQUIRED');
    expect(form.queryByLabelText('Required days')).toBeNull();
    for (const label of ['Veterinary visits', 'Tests', 'Vaccine doses', 'Certificates'])
      await type(user, form.getByLabelText(label), '0');
    await type(user, form.getByLabelText('Source reference'), 'Authority guidance');
    setDateTime(form.getByLabelText('Valid until'), '2099-02-20T12:00:00Z');
    await user.click(form.getByRole('button', { name: 'Record assessment' }));
    await waitFor(() => expect(complianceApi.assess).toHaveBeenCalledTimes(1));
    expect(vi.mocked(complianceApi.assess).mock.calls[0][1]).toMatchObject({
      applicability: 'NOT_REQUIRED',
      requiredDays: null,
      visitCount: 0,
    });
  });

  it('explains a blocked clearance without claiming the phase passed', async () => {
    vi.mocked(complianceApi.clear).mockRejectedValue(
      new ApiError(409, 'Blocked', 'CLEARANCE_BLOCKED'),
    );
    const user = mount('SPECIALIST');
    const form = within(await screen.findByRole('form', { name: 'Clear Pre-export' }));
    setDateTime(form.getByLabelText('Clearance expires at'), '2099-01-01T00:00:00Z');
    await user.click(form.getByRole('button', { name: 'Clear pre-export' }));
    expect(
      await form.findByText(/cannot be cleared: some evidence is missing/),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pre-export readiness' })).toHaveTextContent(
      'Pending',
    );
    expect(vi.mocked(complianceApi.clear).mock.calls[0][1]).toMatchObject({ phase: 'PRE_EXPORT' });
  });

  it('fills the clearance expiry from the earliest current evidence', async () => {
    vi.mocked(complianceApi.overview).mockResolvedValue(
      overview({
        readiness: {
          ...overview().readiness,
          blockers: ['PHASE_CLEARANCE_PENDING'],
          expiresAt: '2027-03-02T00:00:00Z',
        },
      }),
    );
    vi.mocked(complianceApi.clear).mockResolvedValue(receipt());
    const user = mount('SPECIALIST');
    const form = within(await screen.findByRole('form', { name: 'Clear Pre-export' }));
    await user.click(form.getByRole('button', { name: 'Clear pre-export' }));
    await waitFor(() => expect(complianceApi.clear).toHaveBeenCalledTimes(1));
    expect(vi.mocked(complianceApi.clear).mock.calls[0][1]).toMatchObject({
      phase: 'PRE_EXPORT',
      expiresAt: '2027-03-02T07:00:00+07:00',
    });
  });

  it('is limited to the specialist', () => {
    mount('MANAGER');
    expect(
      screen.getByText(/Only the assigned specialist records legal decisions/),
    ).toBeInTheDocument();
    expect(complianceApi.overview).not.toHaveBeenCalled();
  });
});
