import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { type FieldErrors } from '../../shared/lib/validation';
import { Field } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import type { QuoteResponse } from './contracts';
import {
  moneyPattern,
  sumMoney,
  validateEvidence,
  validateQuoteTerms,
  type QuoteEvidence,
  type ScheduleRow,
} from './mutation-contracts';
import { quoteMutationsApi, type QuotePrepareCommand } from './mutations';
import { CommercialError, commercialWriteBlocked } from './commercial-errors';

const prepareHelp: Record<string, string> = {
  ORDER_VERSION_CONFLICT: 'The request changed. Reload the case and review before preparing again.',
  QUOTE_REVISION_CONFLICT: 'The current revision changed. Reload the case before preparing.',
  QUOTE_ORDER_PROTECTED:
    'An accepted quotation protects this request. Changes now need the controlled change process.',
  QUOTE_SCHEDULE_INVALID: 'The payment schedule is not accepted. Check stages, amounts and dates.',
  QUOTE_SOURCE_INVALID: 'An evidence source is not accepted. Check its ID, unit and validity.',
  QUOTE_SCHEMA_PENDING:
    'Quotations are not deployed on this server yet (migration 005 is pending).',
};

const emptyRow: ScheduleRow = { paymentStage: '', amountDue: '', dueAt: '' };

/**
 * Terms, validity and payment schedule for a NEW quotation version. The
 * server prices the lines; a draft may come back with blockers and no total.
 */
export function QuoteForm({
  orderId,
  revisionId,
  parentVersion,
  evidence,
  validUntil,
  onValidUntil,
  onCreated,
  onReload,
  onFailure = () => {},
  disabled = false,
}: {
  orderId: number;
  revisionId: number;
  parentVersion: string;
  evidence: QuoteEvidence[];
  validUntil: string;
  onValidUntil: (value: string) => void;
  onCreated: (quote: QuoteResponse) => Promise<void>;
  onReload: () => void | Promise<void>;
  onFailure?: (error: unknown) => void;
  disabled?: boolean;
}) {
  const [termsVersion, setTermsVersion] = useState('');
  const [terms, setTerms] = useState('');
  const [cancellationTerms, setCancellationTerms] = useState('');
  const [schedule, setSchedule] = useState<ScheduleRow[]>([{ ...emptyRow }]);
  const [understood, setUnderstood] = useState(false);
  const [clientErrors, setErrors] = useState<FieldErrors>({});
  const command = useCaseCommand(async (body: QuotePrepareCommand) => {
    try {
      return await quoteMutationsApi.prepare(orderId, body);
    } catch (error) {
      onFailure(error);
      throw error;
    }
  });
  const serverErrors = Object.fromEntries(
    Object.entries(command.fields).map(([key, value]) => {
      const match = /^paymentSchedule\[(\d+)\]\.(paymentStage|amountDue|dueAt)$/.exec(key);
      return [
        match
          ? `${({ paymentStage: 'stage', amountDue: 'amount', dueAt: 'due' } as Record<string, string>)[match[2]]}${Number(match[1]) + 1}`
          : key,
        value,
      ];
    }),
  );
  const errors = { ...clientErrors, ...serverErrors };
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const blocked = disabled || commercialWriteBlocked(command.error);
  const locked = command.locked || blocked;
  const amounts = schedule.map((r) => r.amountDue.trim());
  // Informational only; the server compares the schedule with its own total.
  const scheduleSum = amounts.every((a) => moneyPattern.test(a)) ? sumMoney(amounts) : null;

  function updateRow(i: number, patch: Partial<ScheduleRow>) {
    if (!locked) setSchedule((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (command.conflict || (blocked && !command.frozen)) return;
    command.submit(() => {
      const trimmed = {
        validUntil: validUntil.trim(),
        termsVersion: termsVersion.trim(),
        terms,
        cancellationTerms,
        schedule: schedule.map((r) => ({
          paymentStage: r.paymentStage.trim(),
          amountDue: r.amountDue.trim(),
          dueAt: r.dueAt.trim(),
        })),
      };
      const next = validateQuoteTerms(trimmed);
      if (evidence.some((row) => Object.keys(validateEvidence(row, trimmed.validUntil)).length))
        next.evidence = 'Fix the commercial evidence above before preparing.';
      if (!understood) next.understood = 'Confirm that earlier unaccepted versions are superseded.';
      setErrors(next);
      if (Object.keys(next).length) return null;
      return {
        recordVersion: parentVersion,
        revisionId,
        validUntil: trimmed.validUntil,
        termsVersion: trimmed.termsVersion,
        terms: trimmed.terms,
        cancellationTerms: trimmed.cancellationTerms,
        paymentSchedule: trimmed.schedule.map((r, i) => ({ sequenceNo: i + 1, ...r })),
        assessments: evidence,
      };
    }, onCreated);
  }
  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Prepare quotation version">
      <h2>Quotation terms and payment schedule</h2>
      <p className="muted">
        Preparing creates a new DRAFT version. The server prices each line; anything without a
        source stays pending and the total stays empty until resolved. Approval and issue are
        separate Manager steps.
      </p>
      <CommercialError error={command.error} backTo="/staff">
        {code && prepareHelp[code] && <p>{prepareHelp[code]}</p>}
        {(command.conflict || command.frozen) && (
          <button
            type="button"
            onClick={() =>
              void Promise.resolve(onReload())
                .then(command.reset)
                .catch(() => {})
            }
          >
            Reload case
          </button>
        )}
      </CommercialError>
      {command.frozen && !command.pending && (
        <p role="status">
          The connection was interrupted. The version may have been created. Retry sends exactly the
          same preparation and cannot create a duplicate.
        </p>
      )}
      <fieldset className="form-grid" disabled={locked}>
        <Field
          label="Quotation valid until"
          hint="ISO date with offset. Evidence must stay valid at least this long."
          error={errors.validUntil}
        >
          {(id) => (
            <input
              id={id}
              maxLength={35}
              value={validUntil}
              onChange={(e) => onValidUntil(e.target.value)}
            />
          )}
        </Field>
        <Field label="Terms version" error={errors.termsVersion}>
          {(id) => (
            <input
              id={id}
              maxLength={50}
              value={termsVersion}
              onChange={(e) => setTermsVersion(e.target.value)}
            />
          )}
        </Field>
        <Field label="Terms" error={errors.terms}>
          {(id) => (
            <textarea
              id={id}
              maxLength={10000}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          )}
        </Field>
        <Field label="Cancellation terms" error={errors.cancellationTerms}>
          {(id) => (
            <textarea
              id={id}
              maxLength={10000}
              value={cancellationTerms}
              onChange={(e) => setCancellationTerms(e.target.value)}
            />
          )}
        </Field>
      </fieldset>
      <fieldset disabled={locked}>
        <legend>Payment schedule</legend>
        {schedule.map((row, i) => {
          const n = i + 1;
          return (
            <div key={i} className="form-grid schedule-row">
              <Field label={`Stage ${n} name`} error={errors[`stage${n}`]}>
                {(id) => (
                  <input
                    id={id}
                    maxLength={50}
                    value={row.paymentStage}
                    onChange={(e) => updateRow(i, { paymentStage: e.target.value })}
                  />
                )}
              </Field>
              <Field label={`Stage ${n} amount (USD)`} error={errors[`amount${n}`]}>
                {(id) => (
                  <input
                    id={id}
                    inputMode="decimal"
                    maxLength={17}
                    value={row.amountDue}
                    onChange={(e) => updateRow(i, { amountDue: e.target.value })}
                  />
                )}
              </Field>
              <Field label={`Stage ${n} due at`} error={errors[`due${n}`]}>
                {(id) => (
                  <input
                    id={id}
                    maxLength={35}
                    value={row.dueAt}
                    onChange={(e) => updateRow(i, { dueAt: e.target.value })}
                  />
                )}
              </Field>
              {schedule.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSchedule((rows) => rows.filter((_, j) => j !== i))}
                >
                  Remove stage {n}
                </button>
              )}
            </div>
          );
        })}
        {errors.schedule && (
          <p className="field-error" role="alert">
            {errors.schedule}
          </p>
        )}
        <button
          type="button"
          disabled={schedule.length >= 12}
          onClick={() => setSchedule((rows) => [...rows, { ...emptyRow }])}
        >
          Add payment stage
        </button>
        <p className="muted">
          Schedule total: {scheduleSum ?? '—'} USD. It must equal the quotation total before
          approval; the server checks this.
        </p>
      </fieldset>
      {errors.evidence && (
        <p className="field-error" role="alert">
          {errors.evidence}
        </p>
      )}
      <fieldset disabled={locked}>
        <label className="horse-choice">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
          />
          <span>
            I understand that earlier DRAFT, APPROVED or ISSUED versions that were not accepted
            become SUPERSEDED.
          </span>
        </label>
        {errors.understood && (
          <p className="field-error" role="alert">
            {errors.understood}
          </p>
        )}
      </fieldset>
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={command.pending || command.conflict || (blocked && !command.frozen)}
        >
          {command.pending
            ? 'Preparing…'
            : command.frozen
              ? 'Retry the same preparation'
              : 'Prepare new quotation version'}
        </button>
      </div>
    </form>
  );
}
