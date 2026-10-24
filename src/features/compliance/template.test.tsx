import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { StandardFormTemplate } from './StandardFormTemplate';
import { lookupsApi, flag } from '../../shared/api/lookups';
import { filesApi } from '../../shared/api/files';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('../../shared/api/lookups', async (original) => ({
  ...(await original<typeof import('../../shared/api/lookups')>()),
  lookupsApi: { documentTemplate: vi.fn() },
}));
vi.mock('../../shared/api/files', async (original) => ({
  ...(await original<typeof import('../../shared/api/files')>()),
  filesApi: { upload: vi.fn(), read: vi.fn() },
}));

const coggins = {
  typeCode: 'COGGINS_EIA',
  displayName: 'EIA Test',
  formCode: 'AGID-EIA-TEST FORM 10-11',
  issuingAuthority: 'Authorized veterinary authority',
  subAuthority: 'Authorized diagnostic laboratory',
  certTextTemplate: 'UNSIGNED REFERENCE FORM. <b>Sample</b>: ______.',
  badgeColor: 'volcano',
  emblemIcon: 'blood',
  templateFileKey: '84032724-eac7-45df-8d04-e54f092279d0',
  hasTemplateFile: true,
  templateDownloadUrl: '/api/files/84032724-eac7-45df-8d04-e54f092279d0',
};
beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
function mount(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={queryClient}>
      <StandardFormTemplate typeCode="COGGINS_EIA" onClose={onClose} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup({ delay: null }), onClose };
}

describe('standard form template (F08)', () => {
  it('shows the catalogue layout as plain text, prints it and downloads the blank PDF', async () => {
    vi.mocked(lookupsApi.documentTemplate).mockResolvedValue(coggins);
    vi.mocked(filesApi.read).mockResolvedValue(new Blob(['%PDF']));
    URL.createObjectURL = vi.fn(() => 'blob:form');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { user } = mount();
    const dialog = await screen.findByRole('dialog', { name: 'EIA Test' });
    expect(dialog).toHaveTextContent('AGID-EIA-TEST FORM 10-11');
    expect(dialog).toHaveTextContent('Authorized diagnostic laboratory');
    // Catalogue text is never interpreted as markup.
    expect(dialog).toHaveTextContent('<b>Sample</b>');
    expect(dialog.querySelector('b')).toBeNull();
    expect(dialog).toHaveTextContent(/not a certificate/);
    await user.click(screen.getByRole('button', { name: '🖨️ Print this form' }));
    expect(print).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '⬇️ Download blank PDF' }));
    expect(filesApi.read).toHaveBeenCalledWith(coggins.templateFileKey);
    expect(click).toHaveBeenCalled();
  });

  it('says when no standard form is published and closes with Escape', async () => {
    vi.mocked(lookupsApi.documentTemplate).mockRejectedValue(
      new ApiError(404, 'Missing', 'DOCUMENT_TEMPLATE_NOT_FOUND'),
    );
    const { user, onClose } = mount();
    expect(await screen.findByText(/No standard form is published/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download blank PDF/ })).toBeNull();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('draws a flag from the country code', () => {
    expect(flag('VN')).toBe('🇻🇳');
    expect(flag('vn')).toBe('');
  });
});
