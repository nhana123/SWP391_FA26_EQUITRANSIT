import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ErrorNotice } from '../../shared/ui/common';
import { acceptedTypes, fileProblem, readFile } from '../compliance/files';
import { handoverApi } from './api';
import type { FilePurpose, HandoverFile } from './contracts';

/** Only the BE's data, as an inline image or a download; never active HTML. */
function Preview({ file }: { file: HandoverFile }) {
  const src = `data:${file.contentType};base64,${file.contentBase64}`;
  return file.contentType.startsWith('image/') ? (
    <img className="handover-preview" src={src} alt={file.fileName} />
  ) : (
    <a href={src} download={file.fileName}>
      Download {file.fileName}
    </a>
  );
}

/**
 * Chooses a file and stores it as handover evidence straight away; the form
 * only keeps the returned key. PDF, PNG or JPEG of at most 5 MB.
 */
export function HandoverFileField({
  orderId,
  purpose,
  label,
  fileKey,
  onChange,
  error,
  disabled = false,
}: {
  orderId: number;
  purpose: FilePurpose;
  label: string;
  fileKey: string;
  onChange: (fileKey: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [uploaded, setUploaded] = useState<HandoverFile | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function choose(file: File | undefined) {
    setProblem(null);
    if (!file) return;
    const issue = fileProblem(file);
    if (issue) return setProblem(new Error(issue));
    setBusy(true);
    try {
      // readFile drops the data: prefix, as the upload expects.
      const input = await readFile(file);
      const stored = await handoverApi.uploadFile(orderId, { ...input, purpose });
      setUploaded(stored);
      onChange(stored.fileKey);
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="handover-file">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept={acceptedTypes}
        disabled={disabled || busy}
        aria-invalid={!!error || undefined}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {busy && <small role="status">Uploading…</small>}
      {uploaded && uploaded.fileKey === fileKey && (
        <div className="handover-file-stored">
          <Preview file={uploaded} />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setUploaded(null);
              onChange('');
            }}
          >
            Remove
          </button>
        </div>
      )}
      <ErrorNotice error={problem} />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/** A stored handover file, loaded only for the roles the BE allows. */
export function HandoverFileView({
  orderId,
  fileKey,
  label,
}: {
  orderId: number;
  fileKey: string;
  label: string;
}) {
  const session = useSession()!;
  const file = useQuery({
    queryKey: [...queryKeys.session(session.generation), 'handover-file', orderId, fileKey],
    queryFn: ({ signal }) => handoverApi.file(orderId, fileKey, signal),
    retry: false,
    staleTime: Infinity,
  });
  return (
    <figure className="handover-figure">
      {file.data ? (
        <Preview file={file.data} />
      ) : file.error ? (
        <small className="muted">The file is not available.</small>
      ) : (
        <small className="muted">Loading…</small>
      )}
      <figcaption>{label}</figcaption>
    </figure>
  );
}
