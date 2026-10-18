import type { ProofInput } from './contracts';

export const MAX_PROOF_BYTES = 5242880;
export function validateProofFile(file: File) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Use a PNG or JPEG image.');
  if (!file.size || file.size > MAX_PROOF_BYTES)
    throw new Error('Choose an image between 1 byte and 5 MiB.');
}
export function readProofFile(file: File): Promise<ProofInput> {
  validateProofFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read. Choose it again.'));
    reader.onload = () => {
      const match =
        typeof reader.result === 'string' &&
        /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(reader.result);
      if (!match || match[1] !== file.type || match[2].length > 6990508)
        return reject(new Error('The image could not be read.'));
      const bytes = atob(match[2]);
      const png = bytes.startsWith('\x89PNG\r\n\x1a\n');
      const jpeg = bytes.startsWith('\xff\xd8\xff');
      if (file.type === 'image/png' ? !png : !jpeg)
        return reject(new Error('The file contents do not match PNG/JPEG.'));
      resolve({ mediaType: file.type as ProofInput['mediaType'], contentBase64: match[2] });
    };
    reader.readAsDataURL(file);
  });
}
export function proofBlob(contentBase64: string, mediaType: string) {
  if (!['image/png', 'image/jpeg'].includes(mediaType)) throw new Error('Unsupported proof image.');
  const bytes = atob(contentBase64);
  if (!bytes.length || bytes.length > MAX_PROOF_BYTES) throw new Error('Invalid proof image size.');
  return new Blob([Uint8Array.from(bytes, (character) => character.charCodeAt(0))], {
    type: mediaType,
  });
}
