import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { getSession, useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import type { FieldErrors } from '../../shared/lib/validation';
import { Field } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import type { Command, Overview, ProofReceipt, Receipt, Values } from './contracts';
import { accessDenied, PaymentError } from './errors';
import { ProofUpload, type EvidenceOption } from './Proof';

export type PaymentField = {
  name: string;
  label: string;
  maxLength?: number;
  hint?: string;
  options?: { value: string; label: string }[];
  multiline?: boolean;
  money?: boolean;
  readonly?: boolean;
};
export type ActionSpec = {
  key: string;
  title: string;
  help: string;
  initial: Values;
  fields: PaymentField[];
  proof?: boolean;
  validate: (values: Values) => FieldErrors;
  send: (command: Command, values: Values) => Promise<Receipt>;
};
export type ActionContext = {
  orderId: number;
  overview: Overview;
  readError: unknown;
  backTo: string;
  refresh: () => Promise<Overview>;
  evidence: EvidenceOption[];
  onUploaded: (proof: ProofReceipt) => void;
  onDone: (receipt: Receipt) => void;
  onCancel: () => void;
};

export function PaymentActionForm({ spec, context }: { spec: ActionSpec; context: ActionContext }) {
  const session = useSession()!;
  const [version, setVersion] = useState(context.overview.recordVersion);
  const [values, setValues] = useState<Values>({ proofFileKey: '', ...spec.initial });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [proofBusy, setProofBusy] = useState(false);
  const [evidenceDenied, setEvidenceDenied] = useState<unknown>(null);
  const [acknowledged, setAcknowledged] = useState<Receipt | null>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const read = useAction();
  const command = useCaseCommand(
    (body: { recordVersion: string; operationId: string; values: Values }) =>
      spec.send({ recordVersion: body.recordVersion, operationId: body.operationId }, body.values),
    ['PAYMENT_LEDGER_BUSY'],
  );
  const fieldErrors =
    command.error instanceof ApiError
      ? Object.fromEntries(
          Object.keys(command.fields).map((key) => [
            key,
            'Review this value against the field requirements.',
          ]),
        )
      : {};
  const fields = { ...errors, ...fieldErrors };
  const blocked =
    !!acknowledged || !!context.readError || command.conflict || !!read.error || read.pending;
  const locked = blocked || command.locked;
  const denied = [context.readError, command.error, read.error, evidenceDenied].find(accessDenied);
  async function reload() {
    const fresh = await context.refresh();
    if (getSession()?.generation !== session.generation) throw new Error('Session changed');
    setVersion(fresh.recordVersion);
    setReviewNotice('Current ledger loaded. Review your input before recording a new action.');
    return fresh.recordVersion;
  }
  function recover(receipt: Receipt) {
    return read.run(async () => {
      await context.refresh();
      if (getSession()?.generation !== session.generation) return;
      context.onDone(receipt);
      setAcknowledged(null);
    });
  }
  if (denied) return <PaymentError error={denied} backTo={context.backTo} />;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (proofBusy || acknowledged || command.pending || (!command.frozen && blocked)) return;
    command.submit(
      () => {
        const input = Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, value.trim()]),
        );
        const next = spec.validate(input);
        setErrors(next);
        return Object.keys(next).length ? null : { recordVersion: version, values: input };
      },
      async (receipt) => {
        setAcknowledged(receipt);
        await recover(receipt);
      },
    );
  }
  return (
    <form className="card payment-action" aria-label={spec.title} noValidate onSubmit={submit}>
      <h2>{spec.title}</h2>
      <p>{spec.help}</p>
      <PaymentError error={command.error} />
      <PaymentError error={read.error} />
      <PaymentError error={context.readError} />
      {reviewNotice && !acknowledged && <p role="status">{reviewNotice}</p>}
      {acknowledged && (
        <div className="notice" role="status">
          <p>
            Action recorded, reference {acknowledged.entityId}. Current ledger must be loaded before
            another action.
          </p>
          <button type="button" disabled={read.pending} onClick={() => void recover(acknowledged)}>
            {read.pending ? 'Loading current ledger...' : 'Retry loading current ledger'}
          </button>
        </div>
      )}
      {!acknowledged &&
        !command.frozen &&
        (command.conflict || !!read.error || !!context.readError) && (
          <button
            type="button"
            disabled={read.pending}
            onClick={() =>
              void read.run(async () => {
                await reload();
                command.reset();
                setErrors({});
              })
            }
          >
            Reload ledger and review
          </button>
        )}
      {command.frozen && !command.pending && (
        <p role="status">
          The result is uncertain. Retry sends the same action, version and input.
        </p>
      )}
      <fieldset className="form-grid" disabled={locked || proofBusy}>
        <legend>Payment details</legend>
        {spec.fields.map((field) => (
          <Field key={field.name} label={field.label} hint={field.hint} error={fields[field.name]}>
            {(id) =>
              field.options ? (
                <select
                  id={id}
                  value={values[field.name] ?? ''}
                  aria-invalid={!!fields[field.name]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                >
                  <option value="">Choose an item</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.multiline ? (
                <textarea
                  id={id}
                  maxLength={field.maxLength}
                  value={values[field.name] ?? ''}
                  aria-invalid={!!fields[field.name]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                />
              ) : (
                <input
                  id={id}
                  inputMode={field.money ? 'decimal' : undefined}
                  readOnly={field.readonly}
                  maxLength={field.maxLength}
                  value={values[field.name] ?? ''}
                  aria-invalid={!!fields[field.name]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                />
              )
            }
          </Field>
        ))}
      </fieldset>
      {spec.proof && (
        <>
          <p className="field-error" role={fields.proofFileKey ? 'alert' : undefined}>
            {fields.proofFileKey}
          </p>
          <ProofUpload
            orderId={context.orderId}
            version={version}
            value={values.proofFileKey}
            options={context.evidence}
            disabled={locked}
            onChange={(key) => setValues((v) => ({ ...v, proofFileKey: key }))}
            onUploaded={context.onUploaded}
            onBusy={setProofBusy}
            onDenied={setEvidenceDenied}
            reload={reload}
          />
        </>
      )}
      <div className="actions">
        <button
          type="submit"
          className="primary"
          disabled={command.pending || proofBusy || !!acknowledged || (!command.frozen && blocked)}
        >
          {command.pending
            ? 'Recording...'
            : command.frozen
              ? 'Retry the same payment action'
              : spec.title}
        </button>
        <button
          type="button"
          disabled={command.locked || proofBusy || !!acknowledged}
          onClick={context.onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
