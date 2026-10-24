import { z } from 'zod';
import { request, requestBlob } from './client';

/** A private file stored by the BE (migration 024); the key alone grants nothing. */
export const storedFileSchema = z.object({
  fileKey: z.string(),
  fileName: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  contentType: z.string(),
});
export type StoredFile = z.infer<typeof storedFileSchema>;

/** The BE accepts PDF, PNG and JPEG up to 10 MiB and parses the content itself. */
export const STORED_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const storedFileTypes = 'application/pdf,image/png,image/jpeg';
export function storedFileProblem(file: { name: string; type: string; size: number }) {
  if (!file.size) return 'The file is empty.';
  if (file.size > STORED_FILE_MAX_BYTES) return 'The file must be at most 10 MB.';
  if (!storedFileTypes.split(',').includes(file.type))
    return 'Only PDF, PNG or JPEG files are accepted.';
  return null;
}

export const filesApi = {
  /** Multipart upload; returns the key to attach to a document or a template. */
  upload: (file: File, category = 'documents') => {
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    return request('/api/files/upload', storedFileSchema, { method: 'POST', formData: form });
  },
  /** Authenticated bytes for preview or download; never a URL with a token. */
  read: (fileKey: string, signal?: AbortSignal) =>
    requestBlob(`/api/files/${encodeURIComponent(fileKey)}`, signal),
};
