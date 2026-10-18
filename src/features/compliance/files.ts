import type { FileInput } from './contracts';

/** BE accepts PDF, PNG and JPEG only, at most 5 MiB decoded. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const types: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
};
export const acceptedTypes = Object.keys(types).join(',');

/**
 * Early, friendly checks mirroring the BE (simple ASCII name, no folders,
 * declared type matching the extension). The server still parses the content.
 */
export function fileProblem(file: { name: string; type: string; size: number }) {
  if (!file.size) return 'The file is empty.';
  if (file.size > MAX_FILE_BYTES) return 'The file must be at most 5 MiB.';
  if (file.name.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(file.name))
    return 'Rename the file using letters, digits, spaces, dots, dashes or underscores.';
  const extension = file.name.split('.').pop()!.toLowerCase();
  if (!types[file.type]?.includes(extension))
    return 'Only PDF, PNG or JPEG files are accepted, with a matching file extension.';
  return null;
}

/** Reads a selected file as the JSON base64 payload (without a data: prefix). */
export function readFile(file: File): Promise<FileInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve({
        fileName: file.name,
        contentType: file.type,
        contentBase64: url.slice(url.indexOf(',') + 1),
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * A blob URL for viewing private content. Images may render inline; PDFs are
 * only offered as a download, never as active HTML in the page.
 */
export function blobUrl(contentBase64: string, contentType: string) {
  const bytes = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
}
