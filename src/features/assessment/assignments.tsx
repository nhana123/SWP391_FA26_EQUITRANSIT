import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useState, type FormEvent } from 'react';
import { optional, type FieldErrors } from '../../shared/lib/validation';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading } from '../../shared/ui/common';
import { assessmentApi, HISTORY_PAGE_SIZE } from './api';
import { useCaseCommand } from './command';
import {
  caseRoles,
  type AssessmentReceipt,
  type AssignCommand,
  type CaseAssignment,
  type CaseRole,
  type EndAssignmentCommand,
  type ManagerCase,
} from './contracts';
import { dueAtError, MAX_TEXT, StaffPicker, type PickedStaff } from './decision';
import { useAssignmentHistory } from './hooks';
import { caseRoleLabels } from './staff';

function reasonError(value: string) {
  const reason = value.trim();
  if (!reason) return 'A reason is required for the audit trail.';
  if (reason.length > MAX_TEXT) return `Use at most ${MAX_TEXT} characters.`;
  return undefined;
}

function CommandStatus({
  command,
  onReload,
}: {
  command: { error: unknown; conflict: boolean; frozen: boolean; pending: boolean };
  onReload: () => void;
}) {
  return (
    <>
      <ErrorNotice error={command.error}>
        {(command.conflict || command.frozen) && (
          <button type="button" onClick={onReload}>
            Reload case
          </button>
        )}
      </ErrorNotice>
      {command.frozen && !command.pending && (
        <p role="status">
          The connection was interrupted. The change may have been recorded. Retry sends the same
          change again, or reload the case to check.
        </p>
      )}
    </>
  );
}

/**
 * Full replacement of one role. dueAt/note start from the current values,
 * because the BE clears whatever is omitted.
 */
function ReplaceForm({
  current,
  role,
  active,
  onDone,
  onCancel,
  onReload,
}: {
  current: ManagerCase;
  role: CaseRole;
  active: CaseAssignment | undefined;
  onDone: (receipt: AssessmentReceipt) => Promise<void>;
  onCancel: () => void;
  onReload: () => void;
}) {
  const [staff, setStaff] = useState<PickedStaff | null>(
    active ? { staffId: active.staffId, fullName: null } : null,
  );
  const [reason, setReason] = useState('');
  const [dueAt, setDueAt] = useState(active?.dueAt ?? '');
  const [note, setNote] = useState(active?.assignmentNote ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const command = useCaseCommand((body: AssignCommand) =>
    assessmentApi.assign(current.orderId, role, body),
  );
  const label = caseRoleLabels[role];
  function submit(e: FormEvent) {
    e.preventDefault();
    command.submit(() => {
      const next: FieldErrors = {};
      if (!staff) next.staffId = `Select a ${label}.`;
      const r = reasonError(reason);
      if (r) next.reason = r;
      const d = dueAtError(dueAt);
      if (d) next.dueAt = d;
      if (note.trim().length > MAX_TEXT)
        next.assignmentNote = `Use at most ${MAX_TEXT} characters.`;
      setErrors(next);
      if (Object.keys(next).length || !staff) return null;
      return {
        recordVersion: current.recordVersion,
        staffId: staff.staffId,
        reason: reason.trim(),
        dueAt: optional(dueAt),
        assignmentNote: optional(note),
      };
    }, onDone);
  }
  return (
    <form onSubmit={submit} noValidate aria-label={`${active ? 'Replace' : 'Assign'} ${label}`}>
      <CommandStatus command={command} onReload={onReload} />
      <StaffPicker
        role={role}
        selected={staff}
        onSelect={(s) => setStaff({ staffId: s.staffId, fullName: s.fullName })}
        error={errors.staffId || command.fields.staffId}
        disabled={command.locked}
      />
      <fieldset className="form-grid" disabled={command.locked}>
        <legend>Assignment details</legend>
        <Field
          label="Reason for this change"
          hint="Kept in the audit history."
          error={errors.reason || command.fields.reason}
        >
          {(id) => (
            <textarea
              id={id}
              value={reason}
              maxLength={MAX_TEXT}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!errors.reason}
            />
          )}
        </Field>
        <Field
          label="Preparation deadline (optional)"
          hint="Saved as entered. Leave empty to clear it."
          error={errors.dueAt || command.fields.dueAt}
        >
          {(id) => (
            <DateTimeInput id={id} value={dueAt} onChange={setDueAt} invalid={!!errors.dueAt} />
          )}
        </Field>
        <Field
          label="Note for assigned staff (optional, internal)"
          hint="Saved as entered. Leave empty to clear it."
          error={errors.assignmentNote || command.fields.assignmentNote}
        >
          {(id) => (
            <textarea
              id={id}
              value={note}
              maxLength={MAX_TEXT}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={!!errors.assignmentNote}
            />
          )}
        </Field>
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={command.pending}>
          {command.pending
            ? 'Saving…'
            : command.frozen
              ? 'Retry the same change'
              : `Save ${label} assignment`}
        </button>
        <button type="button" onClick={onCancel} disabled={command.locked}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EndForm({
  current,
  role,
  onDone,
  onCancel,
  onReload,
}: {
  current: ManagerCase;
  role: CaseRole;
  onDone: (receipt: AssessmentReceipt) => Promise<void>;
  onCancel: () => void;
  onReload: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const command = useCaseCommand((body: EndAssignmentCommand) =>
    assessmentApi.endAssignment(current.orderId, role, body),
  );
  const label = caseRoleLabels[role];
  function submit(e: FormEvent) {
    e.preventDefault();
    command.submit(() => {
      const next: FieldErrors = {};
      const r = reasonError(reason);
      if (r) next.reason = r;
      if (!confirmed) next.confirm = 'Confirm that access ends immediately.';
      setErrors(next);
      if (Object.keys(next).length) return null;
      return { recordVersion: current.recordVersion, reason: reason.trim() };
    }, onDone);
  }
  return (
    <form onSubmit={submit} noValidate aria-label={`End ${label} assignment`}>
      <CommandStatus command={command} onReload={onReload} />
      <fieldset disabled={command.locked}>
        <Field label="Reason for ending" error={errors.reason || command.fields.reason}>
          {(id) => (
            <textarea
              id={id}
              value={reason}
              maxLength={MAX_TEXT}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!errors.reason}
            />
          )}
        </Field>
        <label className="horse-choice">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I understand the {label.toLowerCase()} loses access to this case immediately. The
            assignment stays in history.
          </span>
        </label>
        {errors.confirm && (
          <p className="field-error" role="alert">
            {errors.confirm}
          </p>
        )}
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={command.pending}>
          {command.pending
            ? 'Ending…'
            : command.frozen
              ? 'Retry ending'
              : `End ${label} assignment`}
        </button>
        <button type="button" onClick={onCancel} disabled={command.locked}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RoleCard({
  current,
  role,
  onChanged,
  onReload,
}: {
  current: ManagerCase;
  role: CaseRole;
  onChanged: (receipt: AssessmentReceipt) => Promise<void>;
  onReload: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'replace' | 'end'>('view');
  const active = current.assignments.find((a) => a.role === role && a.endedAt === null);
  const label = caseRoleLabels[role];
  async function done(receipt: AssessmentReceipt) {
    setMode('view');
    await onChanged(receipt);
  }
  return (
    <div className="role-card">
      <h3>{label}</h3>
      {active ? (
        <p>
          Staff ID {active.staffId} · assigned {displayDate(active.assignedAt)}
          {active.dueAt && <> · due {displayDate(active.dueAt)}</>}
          {active.assignmentNote && <span className="muted"> · {active.assignmentNote}</span>}
        </p>
      ) : (
        <p>No active {label.toLowerCase()}.</p>
      )}
      {mode === 'view' && (
        <div className="actions">
          <button type="button" onClick={() => setMode('replace')}>
            {active ? `Replace ${label}` : `Assign ${label}`}
          </button>
          {active && (
            <button type="button" onClick={() => setMode('end')}>
              End {label} assignment
            </button>
          )}
        </div>
      )}
      {mode === 'replace' && (
        <ReplaceForm
          current={current}
          role={role}
          active={active}
          onDone={done}
          onCancel={() => setMode('view')}
          onReload={onReload}
        />
      )}
      {mode === 'end' && (
        <EndForm
          current={current}
          role={role}
          onDone={done}
          onCancel={() => setMode('view')}
          onReload={onReload}
        />
      )}
    </div>
  );
}

/** Responsibility management for an APPROVED case; BE rejects protected states. */
export function TeamManager({
  current,
  onChanged,
  onReload,
}: {
  current: ManagerCase;
  onChanged: (receipt: AssessmentReceipt) => Promise<void>;
  onReload: () => void;
}) {
  return (
    <section className="card" aria-labelledby="team-heading">
      <h2 id="team-heading">Case team</h2>
      <p className="muted">
        Replacing or ending an assignment revokes the previous person&apos;s access immediately.
        History is never deleted.
      </p>
      {caseRoles.map((role) => (
        <RoleCard
          key={role}
          current={current}
          role={role}
          onChanged={onChanged}
          onReload={onReload}
        />
      ))}
    </section>
  );
}

export function AssignmentHistory({ id }: { id: number }) {
  const [page, setPage] = useState(0);
  const query = useAssignmentHistory(id, page);
  return (
    <section className="card">
      <h2>Assignment history</h2>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : !query.data.length ? (
        <p>No assignments recorded yet.</p>
      ) : (
        <div className="table-scroll" aria-busy={query.isPlaceholderData}>
          <table aria-label="Assignment history">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Staff ID</th>
                <th scope="col">Assigned</th>
                <th scope="col">Ended</th>
                <th scope="col">Deadline</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((a) => (
                <tr key={a.assignmentId}>
                  <td>{caseRoleLabels[a.role]}</td>
                  <td>{a.staffId}</td>
                  <td>{displayDate(a.assignedAt)}</td>
                  <td>{a.endedAt ? displayDate(a.endedAt) : 'Active'}</td>
                  <td>{a.dueAt ? displayDate(a.dueAt) : '—'}</td>
                  <td>{a.assignmentNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data && (page > 0 || query.data.length === HISTORY_PAGE_SIZE) && (
        <nav className="pagination" aria-label="Assignment history pages">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            type="button"
            disabled={query.data.length < HISTORY_PAGE_SIZE || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
