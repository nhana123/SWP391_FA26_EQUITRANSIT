import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RequestFormTemplateCard } from './RequestFormTemplateCard';
import { CustomerLegalChecklist } from './CustomerChecklist';
import { complianceApi } from './api';
import { filesApi } from '../../shared/api/files';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Overview, Requirement } from './contracts';

vi.mock('../../shared/api/files', async (original) => ({
  ...(await original<typeof import('../../shared/api/files')>()),
  filesApi: { upload: vi.fn(), read: vi.fn() },
}));

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  complianceApi: {
    rule: vi.fn(),
    attachTemplateFile: vi.fn(),
    overview: vi.fn(),
    documents: vi.fn(),
    uploadAndSubmit: vi.fn(),
  },
}));

describe('Specialist form template request and customer download flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    startSession({
      accessToken: 'test-token',
      tokenType: 'Bearer',
      expiresIn: 600,
      role: 'SPECIALIST',
    });
  });

  it('allows Specialist to enter form name, upload PDF sample, and send to customer', async () => {
    const user = userEvent.setup({ delay: null });
    const storedPdf = {
      fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
      fileName: 'cam_ket_chu_ngua.pdf',
      fileSizeBytes: 2048,
      contentType: 'application/pdf',
    };
    vi.mocked(filesApi.upload).mockResolvedValue(storedPdf);
    vi.mocked(complianceApi.rule).mockResolvedValue({
      entityId: 101,
      operationId: 'op-1',
      recordVersion: '00000000000000a2',
      fileKey: null,
    });

    const pinned = {
      version: '00000000000000a1',
      changed: false,
      generation: 'gen-1',
      written: vi.fn().mockResolvedValue(undefined),
      adopt: vi.fn(),
      refreshAll: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RequestFormTemplateCard
            orderId={7}
            pinned={pinned as never}
            phase="PRE_EXPORT"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Click trigger button to open form
    await user.click(screen.getByRole('button', { name: /\+ Yêu cầu mẫu đơn mới tới Khách hàng/ }));

    // 2. Fill form name and instructions
    const nameInput = screen.getByPlaceholderText(/Ví dụ: Phiếu xét nghiệm Coggins/);
    await user.type(nameInput, 'Bản cam kết chủ ngựa');

    const instructionsInput = screen.getByPlaceholderText(/Ví dụ: Vui lòng tải mẫu đính kèm/);
    await user.type(instructionsInput, 'In mẫu ra ký tên trước ngày xuất phát.');

    // 3. Select PDF file
    const file = new File(['%PDF-1.4 sample content'], 'cam_ket_chu_ngua.pdf', {
      type: 'application/pdf',
    });
    const fileInput = document.getElementById('template-pdf-input') as HTMLInputElement;
    await user.upload(fileInput, file);

    // 4. Verify file upload notice
    expect(await screen.findByText('cam_ket_chu_ngua.pdf')).toBeInTheDocument();
    expect(filesApi.upload).toHaveBeenCalledWith(file, 'documents');

    // 5. Submit form
    await user.click(screen.getByRole('button', { name: /Gửi yêu cầu tới Khách hàng/ }));

    // 6. Verify complianceApi.rule was called with embedded template file key
    await waitFor(() => expect(complianceApi.rule).toHaveBeenCalledTimes(1));
    const callArgs = vi.mocked(complianceApi.rule).mock.calls[0];
    expect(callArgs[0]).toBe(7);
    expect(callArgs[1].displayName).toBe('Bản cam kết chủ ngựa');
    expect(callArgs[1].instructions).toContain('[MẪU_ĐÍNH_KÈM: cam_ket_chu_ngua.pdf | KEY:84032724-eac7-45df-8d04-e54f092279d0]');
    expect(callArgs[1].phase).toBe('PRE_EXPORT');
  });

  it('renders download button on Customer checklist when template file is attached', async () => {
    const user = userEvent.setup({ delay: null });
    startSession({
      accessToken: 'test-token',
      tokenType: 'Bearer',
      expiresIn: 600,
      role: 'CUSTOMER',
    });

    const mockBlob = new Blob(['sample pdf bytes'], { type: 'application/pdf' });
    vi.mocked(filesApi.read).mockResolvedValue(mockBlob);
    URL.createObjectURL = vi.fn(() => 'blob:test-url');
    URL.revokeObjectURL = vi.fn();

    const req: Requirement = {
      requirementId: 88,
      ruleId: 101,
      documentType: 'BAN_CAM_KET',
      phase: 'PRE_EXPORT',
      status: 'PENDING',
      submissionId: null,
      documentVersionId: null,
      decision: null,
      instructions: 'Vui lòng ký tên. [MẪU_ĐÍNH_KÈM: cam_ket.pdf | KEY:84032724-eac7-45df-8d04-e54f092279d0]',
      feedback: null,
      attachment: null,
    };

    const overviewData: Overview = {
      revisionId: 7,
      recordVersion: '00000000000000a1',
      readiness: {
        revisionId: 7,
        phase: 'PRE_EXPORT',
        asOf: '2026-10-26T00:00:00Z',
        expiresAt: null,
        status: 'PENDING',
        blockers: [],
      },
      requirements: [req],
      page: 0,
      size: 20,
      totalElements: 1,
    };

    vi.mocked(complianceApi.overview).mockResolvedValue(overviewData);
    vi.mocked(complianceApi.documents).mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerLegalChecklist orderId={7} orderStatus="IN_PREPARATION" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Verify clean instructions are displayed without internal tags
    const instructionElements = await screen.findAllByText('Vui lòng ký tên.');
    expect(instructionElements.length).toBeGreaterThan(0);
    expect(screen.queryByText(/MẪU_ĐÍNH_KÈM/)).toBeNull();

    // 2. Verify download sample button is present
    const downloadBtns = await screen.findAllByRole('button', {
      name: 'Download sample form cam_ket.pdf',
    });
    expect(downloadBtns[0]).toHaveTextContent('Tải mẫu đơn đính kèm (cam_ket.pdf)');

    // 3. Click download and verify filesApi.read was called
    await user.click(downloadBtns[0]);
    expect(filesApi.read).toHaveBeenCalledWith('84032724-eac7-45df-8d04-e54f092279d0');
  });
});
