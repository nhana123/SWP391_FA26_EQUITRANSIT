import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { useAction } from '../../shared/lib/useAction';
import { optional, validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field } from '../../shared/ui/common';
import { assessmentApi } from './api';
import type {
  AssessmentCommand,
  AssessmentReceipt,
  CaseRole,
  CaseStaff,
  DecisionCode,
  ManagerCase,
} from './contracts';
import { caseRoleLabels, StaffDirectory } from './staff';

export const decisionLabels: Record<DecisionCode, string> = {
  APPROVED: 'Approve and assign team',
  CHANGES_REQUESTED: 'Request changes from customer',
  REJECTED: 'Reject request',
};

export const MAX_TEXT = 1000;

/** Optional case deadline: offset ISO date in the future (BE requireFuture). */
export function dueAtError(value: string, now = Date.now()) {
  const due = value.trim();
  if (!due) return undefined;
  if (!validOffsetDate(due)) return 'Choose a date and time.';
  if (Date.parse(due) <= now) return 'The deadline must be in the future.';
  return undefined;
}

/** A picked staff member; the name is unknown when only the StaffID is known. */
export type PickedStaff = { staffId: number; fullName: string | null };

type Form = {
  decision: DecisionCode | '';
  reason: string;
  specialist: CaseStaff | null;
  coordinator: CaseStaff | null;
  dueAt: string;
  assignmentNote: string;
};
const emptyForm: Form = {
  decision: '',
  reason: '',
  specialist: null,
  coordinator: null,
  dueAt: '',
  assignmentNote: '',
};

export function validateDecision(form: Form, now = Date.now()): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.decision) errors.decision = 'Choose an outcome.';
  if (form.decision === 'APPROVED') {
    if (!form.specialist) errors.specialist = 'Select a Specialist.';
    if (!form.coordinator) errors.coordinator = 'Select a Coordinator.';
    const due = dueAtError(form.dueAt, now);
    if (due) errors.dueAt = due;
    if (form.assignmentNote.trim().length > MAX_TEXT)
      errors.assignmentNote = `Use at most ${MAX_TEXT} characters.`;
  } else if (form.decision) {
    const reason = form.reason.trim();
    if (!reason) errors.reason = 'A reason for the customer is required.';
    else if (reason.length > MAX_TEXT) errors.reason = `Use at most ${MAX_TEXT} characters.`;
  }
  return errors;
}

/** Builds the exact BE command; negative outcomes never carry assignment fields. */
export function decisionCommand(
  form: Form,
  current: ManagerCase,
  revisionId: number,
  operationId: string,
): AssessmentCommand {
  const base = {
    revisionId,
    recordVersion: current.recordVersion,
    operationId,
    decision: form.decision as DecisionCode,
  };
  return form.decision === 'APPROVED'
    ? {
        ...base,
        reason: null,
        specialistId: form.specialist!.staffId,
        coordinatorId: form.coordinator!.staffId,
        dueAt: optional(form.dueAt),
        assignmentNote: optional(form.assignmentNote),
      }
    : {
        ...base,
        reason: optional(form.reason),
        specialistId: null,
        coordinatorId: null,
        dueAt: null,
        assignmentNote: null,
      };
}

export function StaffPicker({
  role,
  selected,
  onSelect,
  error,
  disabled,
}: {
  role: CaseRole;
  selected: PickedStaff | null;
  onSelect: (staff: CaseStaff) => void;
  error?: string;
  disabled: boolean;
}) {
  const [page, setPage] = useState(0);
  const label = caseRoleLabels[role];
  return (
    <fieldset className="staff-picker" disabled={disabled}>
      <legend>{label}</legend>
      <p aria-live="polite">
        {selected
          ? `Selected: ${selected.fullName ?? `Staff ID ${selected.staffId}`}`
          : `No ${label.toLowerCase()} selected.`}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <StaffDirectory
        role={role}
        page={page}
        onPageChange={setPage}
        renderAction={(s) => (
          <button
            type="button"
            aria-pressed={selected?.staffId === s.staffId}
            aria-label={`Select ${s.fullName} as ${label}`}
            onClick={() => onSelect(s)}
          >
            {selected?.staffId === s.staffId ? 'Selected' : 'Select'}
          </button>
        )}
      />
    </fieldset>
  );
}

/**
 * Decision for the exact revision on screen. One UUID per action: an
 * uncertain failure freezes the input and retries with the same UUID and
 * version; any other failure ends the action so a new one gets a new UUID.
 */
export function DecisionForm({
  current,
  revisionId,
  onDecided,
  onReload,
}: {
  current: ManagerCase;
  revisionId: number;
  onDecided: (receipt: AssessmentReceipt) => Promise<void>;
  onReload: () => void;
}) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const pendingCommand = useRef<AssessmentCommand | null>(null);
  const [frozen, setFrozen] = useState(false);
  const action = useAction();
  const conflict = action.error instanceof ApiError && action.error.status === 409;
  const serverFields = action.error instanceof ApiError ? action.error.fields : {};

  function update(patch: Partial<Form>) {
    if (!frozen) setForm((f) => ({ ...f, ...patch }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!frozen) {
      const validation = validateDecision(form);
      setErrors(validation);
      if (Object.keys(validation).length) return;
      pendingCommand.current = decisionCommand(form, current, revisionId, crypto.randomUUID());
    }
    const command = pendingCommand.current;
    if (!command) return;
    setFrozen(true);
    void action.run(async () => {
      try {
        const receipt = await assessmentApi.decide(current.orderId, command);
        pendingCommand.current = null;
        setFrozen(false);
        await onDecided(receipt);
      } catch (error) {
        if (!(error instanceof ApiError && error.uncertain)) {
          pendingCommand.current = null;
          setFrozen(false);
        }
        throw error;
      }
    });
  }
  const approving = form.decision === 'APPROVED';
  return (
    <form className="card" onSubmit={submit} aria-labelledby="decision-heading" noValidate>
      <h2 id="decision-heading">Decision for revision {current.revision?.revisionNo}</h2>
      <p className="muted">
        Approval starts case preparation only. Legal, financial and operational checks happen later.
      </p>
      <ErrorNotice error={action.error}>
        {conflict && (
          <button type="button" onClick={onReload}>
            Reload case
          </button>
        )}
      </ErrorNotice>
      {frozen && !action.pending && (
        <p role="status">
          The connection was interrupted. The decision may have been recorded. Retry sends the same
          decision again, or reload the case to check.
        </p>
      )}
      <fieldset disabled={frozen || action.pending}>
        <legend>Outcome</legend>
        {(Object.keys(decisionLabels) as DecisionCode[]).map((code) => (
          <label key={code} className="horse-choice">
            <input
              type="radio"
              name="decision"
              value={code}
              checked={form.decision === code}
              onChange={() => update({ decision: code })}
            />
            <span>{decisionLabels[code]}</span>
          </label>
        ))}
        {errors.decision && (
          <p className="field-error" role="alert">
            {errors.decision}
          </p>
        )}
      </fieldset>
      {approving && (
        <>
          <StaffPicker
            role="SPECIALIST"
            selected={form.specialist}
            onSelect={(specialist) => update({ specialist })}
            error={errors.specialist || serverFields.specialistId}
            disabled={frozen || action.pending}
          />
          <StaffPicker
            role="COORDINATOR"
            selected={form.coordinator}
            onSelect={(coordinator) => update({ coordinator })}
            error={errors.coordinator || serverFields.coordinatorId}
            disabled={frozen || action.pending}
          />
          <fieldset className="form-grid" disabled={frozen || action.pending}>
            <legend>Internal preparation details</legend>
            <Field
              label="Preparation deadline (optional)"
              hint="A work deadline for the team, not a travel booking."
              error={errors.dueAt || serverFields.dueAt}
            >
              {(id) => (
                <DateTimeInput
                  id={id}
                  value={form.dueAt}
                  onChange={(dueAt) => update({ dueAt })}
                  invalid={!!errors.dueAt}
                />
              )}
            </Field>
            <Field
              label="Note for assigned staff (optional, internal)"
              hint="Not shown to the customer."
              error={errors.assignmentNote || serverFields.assignmentNote}
            >
              {(id) => (
                <textarea
                  id={id}
                  value={form.assignmentNote}
                  maxLength={MAX_TEXT}
                  onChange={(e) => update({ assignmentNote: e.target.value })}
                  aria-invalid={!!errors.assignmentNote}
                />
              )}
            </Field>
          </fieldset>
        </>
      )}
      {form.decision && !approving && (
        <fieldset disabled={frozen || action.pending}>
          <Field
            label="Reason shown to the customer"
            hint="The customer reads this exactly as written."
            error={errors.reason || serverFields.reason}
          >
            {(id) => (
              <textarea
                id={id}
                value={form.reason}
                maxLength={MAX_TEXT}
                onChange={(e) => update({ reason: e.target.value })}
                aria-invalid={!!errors.reason}
              />
            )}
          </Field>
        </fieldset>
      )}
      <div className="actions">
        <button className="primary" type="submit" disabled={action.pending}>
          {action.pending ? 'Recording…' : frozen ? 'Retry the same decision' : 'Record decision'}
        </button>
        {frozen && !action.pending && (
          <button type="button" onClick={onReload}>
            Reload case
          </button>
        )}
      </div>
    </form>
  );
}
