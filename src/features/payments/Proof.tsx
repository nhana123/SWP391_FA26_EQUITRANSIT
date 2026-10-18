import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { getSession, useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { Field } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { paymentsApi } from './api';
import { type ProofInput, type ProofReceipt } from './contracts';
import { PaymentError, accessDenied } from './errors';
import { proofBlob, readProofFile } from './proof-files';

export type EvidenceOption = { fileKey: string; label: string };
export function ProofViewer({ orderId, fileKey }: { orderId: number; fileKey: string }) {
  const session = useSession()!;
  const action = useAction();
  const [url, setUrl] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  function releaseImage() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setUrl(null);
  }
  return (
    <div className="proof-view">
      <button
        type="button"
        disabled={action.pending}
        onClick={() =>
          void action.run(async () => {
            releaseImage();
            abort.current?.abort();
            const controller = new AbortController();
            abort.current = controller;
            const proof = await paymentsApi.proof(orderId, fileKey, controller.signal);
            if (controller.signal.aborted || getSession()?.generation !== session.generation)
              return;
            if (proof.fileKey.toLowerCase() !== fileKey.toLowerCase())
              throw new Error('Evidence mismatch');
            objectUrl.current = URL.createObjectURL(
              proofBlob(proof.contentBase64, proof.mediaType),
            );
            setUrl(objectUrl.current);
          })
        }
      >
        {action.pending ? 'Loading evidence...' : 'View evidence'}
      </button>
      <PaymentError error={action.error} />
      {url && (
        <div>
          <img src={url} alt="Protected payment evidence" />
          <button
            type="button"
            onClick={() => {
              abort.current?.abort();
              releaseImage();
            }}
          >
            Close evidence
          </button>
        </div>
      )}
    </div>
  );
}

export function ProofUpload({
  orderId,
  version,
  value,
  options,
  onChange,
  onUploaded,
  onBusy,
  disabled,
  reload,
  onDenied,
}: {
  orderId: number;
  version: string;
  value: string;
  options: EvidenceOption[];
  onChange: (key: string) => void;
  onUploaded: (receipt: ProofReceipt) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
  reload: () => Promise<string>;
  onDenied: (error: unknown) => void;
}) {
  const session = useSession()!;
  const read = useAction(),
    refresh = useAction();
  const [input, setInput] = useState<ProofInput | null>(null);
  const [fileError, setFileError] = useState('');
  const [fileInput, setFileInput] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const upload = useCaseCommand(
    async (body: ProofInput & { operationId: string; recordVersion: string }) => {
      try {
        return await paymentsApi.uploadProof(
          orderId,
          { operationId: body.operationId, recordVersion: body.recordVersion },
          { mediaType: body.mediaType, contentBase64: body.contentBase64 },
        );
      } catch (error) {
        if (accessDenied(error)) onDenied(error);
        throw error;
      }
    },
    ['PAYMENT_LEDGER_BUSY'],
  );
  const busy = read.pending || upload.locked || refresh.pending;
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  const locked = disabled || busy || upload.conflict || !!refresh.error;
  const denied = accessDenied(upload.error) || accessDenied(refresh.error);
  const evidenceError =
    upload.error instanceof ApiError &&
    upload.error.status === 400 &&
    ['mediaType', 'contentBase64'].some((name) => Object.hasOwn(upload.fields, name))
      ? 'Review the evidence format and size before uploading again.'
      : '';
  if (denied) return <PaymentError error={upload.error || refresh.error} />;
  return (
    <section className="proof-upload" aria-label="Payment evidence">
      <h3>Payment evidence</h3>
      <Field label="Use existing evidence">
        {(id) => (
          <select
            id={id}
            value={value}
            disabled={locked}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Choose uploaded evidence</option>
            {options.map((option) => (
              <option key={option.fileKey} value={option.fileKey}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        label="PNG or JPEG evidence"
        hint="Up to 5 MiB; the server validates the image and its dimensions."
        error={fileError || evidenceError}
      >
        {(id) => (
          <input
            key={fileInput}
            id={id}
            type="file"
            accept="image/png,image/jpeg"
            aria-invalid={!!(fileError || evidenceError)}
            aria-describedby={fileError || evidenceError ? `${id}-error` : undefined}
            disabled={locked}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setInput(null);
              setFileError('');
              upload.reset();
              if (file)
                void read.run(async () => {
                  try {
                    const content = await readProofFile(file);
                    if (mounted.current && getSession()?.generation === session.generation)
                      setInput(content);
                  } catch (error) {
                    if (mounted.current)
                      setFileError(
                        error instanceof Error ? error.message : 'Choose a valid image.',
                      );
                  }
                });
            }}
          />
        )}
      </Field>
      <PaymentError error={upload.error || refresh.error} />
      {!upload.frozen && (upload.conflict || !!refresh.error) && (
        <button
          type="button"
          disabled={refresh.pending}
          onClick={() =>
            void refresh.run(async () => {
              await reload();
              upload.reset();
            })
          }
        >
          Reload evidence version
        </button>
      )}
      <button
        type="button"
        disabled={
          upload.pending ||
          read.pending ||
          refresh.pending ||
          (!upload.frozen && (disabled || upload.conflict || !!refresh.error || !input))
        }
        onClick={() =>
          upload.submit(
            () => (input ? { ...input, recordVersion: version } : null),
            async (receipt) => {
              if (getSession()?.generation !== session.generation) return;
              setInput(null);
              setFileInput((n) => n + 1);
              onUploaded(receipt);
              onChange(receipt.fileKey);
            },
          )
        }
      >
        {upload.pending
          ? 'Uploading evidence...'
          : upload.frozen
            ? 'Retry the same evidence upload'
            : 'Upload evidence'}
      </button>
      {value && (
        <>
          <p>Uploaded evidence selected.</p>
          <ProofViewer key={value} orderId={orderId} fileKey={value} />
        </>
      )}
    </section>
  );
}
