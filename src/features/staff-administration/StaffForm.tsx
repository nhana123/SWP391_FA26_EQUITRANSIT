import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { useAction } from '../../shared/lib/useAction';
import type { FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Notice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { staffApi, staffErrorHelp } from './api';
import {
  staffRoles,
  staffStatuses,
  staffRoleLabels,
  staffStatusLabels,
  type Staff,
  type StaffProfile,
  type StaffStatus,
} from './contracts';
import { emptyProfile, normalizedProfile, profileOf, validateProfile } from './form';

export const STAFF_ADMIN_PATH = '/manager/staff-administration';
export function StaffError({ error }: { error: unknown }) {
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <ErrorNotice error={error}>
      {code &&
        staffErrorHelp[code] &&
        error instanceof ApiError &&
        error.message !== staffErrorHelp[code] && <p>{staffErrorHelp[code]}</p>}
      {error instanceof ApiError && error.status === 503 && (
        <p>Deployment blocked. Staff actions will be available after migration 013 is deployed.</p>
      )}
    </ErrorNotice>
  );
}
export function inaccessible(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

type Pending = {
  recordVersion: string;
  operationId: string;
  profile?: StaffProfile;
  initialPassword?: string;
  status?: StaffStatus;
  reason?: string;
};
const textFields = [
  ['fullName', 'Full name', 150],
  ['email', 'Staff email', 255],
  ['phone', 'Phone (optional)', 30],
  ['employeeCode', 'Employee code', 50],
  ['department', 'Department (optional)', 100],
  ['specialization', 'Specialization (optional)', 200],
] as const;

/** Observed CAS is pinned until explicit reload; background GETs cannot update it. */
export function StaffForm({
  mode,
  staff,
  initialVersion,
  onReload,
  onDone,
  onCancel,
  readError,
}: {
  mode: 'create' | 'edit' | 'status';
  staff?: Staff;
  initialVersion: string;
  onReload: () => Promise<string>;
  onDone: (staff: Staff) => Promise<void>;
  onCancel: () => void;
  readError?: unknown;
}) {
  const [profile, setProfile] = useState(staff ? profileOf(staff) : emptyProfile);
  const [initialPassword, setInitialPassword] = useState('');
  const [version, setVersion] = useState(initialVersion);
  const [status, setStatus] = useState<StaffStatus>(
    staff?.staffStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
  );
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const reload = useAction();
  const command = useCaseCommand(
    async (body: Pending) => {
      const cas = { recordVersion: body.recordVersion, operationId: body.operationId };
      if (mode === 'create')
        return staffApi.create({
          command: cas,
          profile: body.profile!,
          initialPassword: body.initialPassword!,
        });
      if (mode === 'edit')
        return staffApi.update(staff!.staffId, { command: cas, profile: body.profile! });
      return staffApi.status(staff!.staffId, {
        command: cas,
        status: body.status!,
        reason: body.reason!,
      });
    },
    ['STAFF_ADMIN_BUSY'],
  );
  const fields = { ...errors, ...command.fields };
  const denied = [command.error, reload.error].find(inaccessible);
  if (denied)
    return (
      <>
        <StaffError error={denied} />
        <Link to={STAFF_ADMIN_PATH}>Back to staff administration</Link>
      </>
    );
  const blocked = command.conflict || reload.pending || !!reload.error || !!readError;
  const locked = command.locked || blocked;
  const title =
    mode === 'create'
      ? 'Create staff account'
      : mode === 'edit'
        ? 'Edit staff profile'
        : 'Change account status';
  function submit(event: FormEvent) {
    event.preventDefault();
    if (command.pending || (!command.frozen && blocked)) return;
    command.submit(
      () => {
        const next: FieldErrors =
          mode === 'status'
            ? !reason.trim() || reason.trim().length > 500
              ? { reason: 'Enter a reason (1–500 characters).' }
              : {}
            : validateProfile(profile, mode === 'create' ? initialPassword : undefined);
        setErrors(next);
        if (Object.keys(next).length) return null;
        return mode === 'status'
          ? { recordVersion: version, status, reason: reason.trim() }
          : {
              recordVersion: version,
              profile: normalizedProfile(profile),
              ...(mode === 'create' ? { initialPassword } : {}),
            };
      },
      async (receipt) => {
        setInitialPassword('');
        await onDone(receipt);
      },
    );
  }
  return (
    <form className="card staff-admin-form" aria-label={title} onSubmit={submit} noValidate>
      <h2>{title}</h2>
      {mode === 'create' && (
        <p>Internal accounts only. The initial password is used once to create the account.</p>
      )}
      {mode === 'edit' && (
        <p>
          Save replaces the complete profile. Changing role may require active work to be reassigned
          first.
        </p>
      )}
      {mode === 'status' && (
        <Notice>
          Disabling ends active assignments. Reactivating does not restore them. Changing your own
          account may end your Manager session.
        </Notice>
      )}
      <StaffError error={command.error} />
      <StaffError error={reload.error} />
      <StaffError error={readError} />
      {command.frozen && !command.pending && (
        <p role="status">
          The result is not confirmed yet. Retry sends the same action and keeps your input.
        </p>
      )}
      {!command.frozen && (command.conflict || !!reload.error || !!readError) && (
        <button
          type="button"
          disabled={reload.pending}
          onClick={() =>
            void reload.run(async () => {
              setVersion(await onReload());
              command.reset();
              setErrors({});
            })
          }
        >
          {reload.pending ? 'Reloading...' : 'Reload and review'}
        </button>
      )}
      <fieldset disabled={locked} className="form-grid">
        <legend>{mode === 'status' ? 'Account state' : 'Staff profile'}</legend>
        {mode !== 'status' ? (
          <>
            {textFields.map(([key, label, maxLength]) => (
              <Field key={key} label={label} error={fields[key]}>
                {(id) => (
                  <input
                    id={id}
                    type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                    value={profile[key] ?? ''}
                    maxLength={maxLength}
                    aria-invalid={!!fields[key]}
                    onChange={(event) => setProfile((p) => ({ ...p, [key]: event.target.value }))}
                  />
                )}
              </Field>
            ))}
            <Field label="Staff role" error={fields.role}>
              {(id) => (
                <select
                  id={id}
                  value={profile.role}
                  onChange={(event) =>
                    setProfile((p) => ({ ...p, role: event.target.value as StaffProfile['role'] }))
                  }
                >
                  {staffRoles.map((r) => (
                    <option key={r} value={r}>
                      {staffRoleLabels[r]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {mode === 'create' && (
              <Field
                label="Initial password"
                error={fields.initialPassword}
                hint="12–72 characters, at most 72 UTF-8 bytes. It will not be shown again."
              >
                {(id) => (
                  <input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    value={initialPassword}
                    maxLength={72}
                    aria-invalid={!!fields.initialPassword}
                    onChange={(event) => setInitialPassword(event.target.value)}
                  />
                )}
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="New account status" error={fields.status}>
              {(id) => (
                <select
                  id={id}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as StaffStatus)}
                >
                  {staffStatuses.map((s) => (
                    <option key={s} value={s}>
                      {staffStatusLabels[s]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Reason for status change" error={fields.reason}>
              {(id) => (
                <textarea
                  id={id}
                  maxLength={500}
                  value={reason}
                  aria-invalid={!!fields.reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>
          </>
        )}
      </fieldset>
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={command.pending || (!command.frozen && blocked)}
        >
          {command.pending ? 'Saving...' : command.frozen ? 'Retry the same action' : title}
        </button>
        <button
          type="button"
          disabled={command.locked}
          onClick={() => {
            setInitialPassword('');
            onCancel();
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
