import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startSession } from '../../shared/api/session';
import { ApiError } from '../../shared/api/client';
import { paymentsApi } from './api';
import { ProofUpload, ProofViewer } from './Proof';
import { proofBlob, readProofFile, validateProofFile, MAX_PROOF_BYTES } from './proof-files';
import { pngBase64, proofKey, secondProofKey } from './testing';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  paymentsApi: { proof: vi.fn(), uploadProof: vi.fn() },
}));
const bytes = () => Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
beforeEach(() => {
  vi.resetAllMocks();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn().mockReturnValue('blob:test-evidence'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
it('validates MIME, decoded size and file signature and sends raw base64 only', async () => {
  expect(() =>
    validateProofFile(new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })),
  ).toThrow(/PNG or JPEG/);
  expect(() => validateProofFile(new File([], 'empty.png', { type: 'image/png' }))).toThrow(
    /1 byte/,
  );
  expect(() =>
    validateProofFile(
      new File([new Uint8Array(MAX_PROOF_BYTES + 1)], 'large.png', { type: 'image/png' }),
    ),
  ).toThrow(/5 MiB/);
  await expect(
    readProofFile(new File(['bad-image'], 'fake.png', { type: 'image/png' })),
  ).rejects.toThrow(/contents do not match/);
  expect(await readProofFile(new File([bytes()], 'good.png', { type: 'image/png' }))).toEqual({
    mediaType: 'image/png',
    contentBase64: pngBase64,
  });
  expect(() => proofBlob(pngBase64, 'image/svg+xml')).toThrow();
});
it('loads proof only on request and revokes Blob URL on close and unmount', async () => {
  vi.mocked(paymentsApi.proof).mockResolvedValue({
    fileKey: proofKey,
    mediaType: 'image/png',
    contentBase64: pngBase64,
  });
  const { unmount } = render(<ProofViewer orderId={11} fileKey={proofKey} />);
  expect(paymentsApi.proof).not.toHaveBeenCalled();
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'View evidence' }));
  expect(await screen.findByAltText('Protected payment evidence')).toHaveAttribute(
    'src',
    'blob:test-evidence',
  );
  expect(paymentsApi.proof).toHaveBeenCalledWith(11, proofKey, expect.any(AbortSignal));
  await user.click(screen.getByRole('button', { name: 'Close evidence' }));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'View evidence' }));
  await screen.findByAltText('Protected payment evidence');
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('does not display a mismatched proof or retain an image after access rejection', async () => {
  vi.mocked(paymentsApi.proof)
    .mockResolvedValueOnce({ fileKey: proofKey, mediaType: 'image/png', contentBase64: pngBase64 })
    .mockRejectedValueOnce(new ApiError(403, 'Not allowed.'))
    .mockResolvedValueOnce({
      fileKey: secondProofKey,
      mediaType: 'image/png',
      contentBase64: pngBase64,
    });
  render(<ProofViewer orderId={11} fileKey={proofKey} />);
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'View evidence' }));
  await screen.findByAltText('Protected payment evidence');
  await user.click(screen.getByRole('button', { name: 'View evidence' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('img')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'View evidence' }));
  await waitFor(() => expect(paymentsApi.proof).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('img')).toBeNull();
});
it('retries an uncertain proof upload with its UUID/version/bytes unchanged and returns only metadata', async () => {
  vi.mocked(paymentsApi.uploadProof)
    .mockRejectedValueOnce(new ApiError(0, 'Interrupted.'))
    .mockResolvedValueOnce({ fileKey: proofKey, mediaType: 'image/png', size: bytes().length });
  const uploaded = vi.fn(),
    onBusy = vi.fn(),
    changed = vi.fn();
  render(
    <ProofUpload
      orderId={11}
      version="00000000000000a1"
      value=""
      options={[]}
      onChange={changed}
      onUploaded={uploaded}
      onBusy={onBusy}
      disabled={false}
      reload={vi.fn()}
      onDenied={vi.fn()}
    />,
  );
  const user = userEvent.setup({ delay: null });
  await user.upload(
    screen.getByLabelText('PNG or JPEG evidence'),
    new File([bytes()], 'proof.png', { type: 'image/png' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Upload evidence' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Upload evidence' }));
  await user.click(await screen.findByRole('button', { name: 'Retry the same evidence upload' }));
  await waitFor(() => expect(uploaded).toHaveBeenCalled());
  const calls = vi.mocked(paymentsApi.uploadProof).mock.calls;
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0][2].contentBase64).toBe(pngBase64);
  expect(uploaded).toHaveBeenCalledWith({
    fileKey: proofKey,
    mediaType: 'image/png',
    size: bytes().length,
  });
  expect(changed).toHaveBeenCalledWith(proofKey);
});
it('aborts on unmount and never creates an image for a late response', async () => {
  let finish!: (value: Awaited<ReturnType<typeof paymentsApi.proof>>) => void;
  vi.mocked(paymentsApi.proof).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { unmount } = render(<ProofViewer orderId={11} fileKey={proofKey} />);
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'View evidence' }));
  const signal = vi.mocked(paymentsApi.proof).mock.calls[0][2]!;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({ fileKey: proofKey, mediaType: 'image/png', contentBase64: pngBase64 }),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('never displays bytes returned for a previous account session', async () => {
  let finish!: (value: Awaited<ReturnType<typeof paymentsApi.proof>>) => void;
  vi.mocked(paymentsApi.proof).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<ProofViewer orderId={11} fileKey={proofKey} />);
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'View evidence' }));
  await act(async () => {
    startSession({
      accessToken: 'second-test-only',
      tokenType: 'Bearer',
      expiresIn: 600,
      role: 'CUSTOMER',
    });
    finish({ fileKey: proofKey, mediaType: 'image/png', contentBase64: pngBase64 });
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByRole('img')).toBeNull();
});
