import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { Field, Notice } from '../../shared/ui/common';
import { activityApi } from './api';
import type { EmailPreference } from './contracts';
import {
  activityKeys,
  ActivityError,
  ActivityHeading,
  ActivityReadState,
  deniedActivity,
  uncertainActivity,
  useActivityQuery,
} from './shared';

export function EmailPreferencesPage() {
  const query = useActivityQuery(['preference'], (signal) => activityApi.preference(signal), [
    'CUSTOMER',
  ]);
  if (!query.allowed) return <Notice>Email preferences are available to Customers only.</Notice>;
  return (
    <>
      <ActivityHeading title="Email preferences" />
      {!query.data || deniedActivity(query.error) ? (
        <ActivityReadState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <PreferenceForm
          key={query.session!.generation}
          current={query.data}
          readError={query.error}
          reload={async () => {
            await query.refetch({ throwOnError: true });
          }}
        />
      )}
    </>
  );
}
function PreferenceForm({
  current,
  readError,
  reload,
}: {
  current: EmailPreference;
  readError: unknown;
  reload: () => Promise<void>;
}) {
  const session = useSession()!;
  const [enabled, setEnabled] = useState(current.enabled);
  const [frozen, setFrozen] = useState<EmailPreference | null>(null);
  const targetRef = useRef<EmailPreference | null>(null);
  const [notice, setNotice] = useState('');
  const write = useAction(),
    refresh = useAction();
  const failed = write.error instanceof ApiError ? write.error : null;
  const mustReload = !!readError || !!refresh.error || failed?.status === 409;
  const denied = [readError, write.error, refresh.error].find(deniedActivity);
  if (denied) return <ActivityError error={denied} />;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (write.pending || refresh.pending || (!frozen && mustReload)) return;
    const target = targetRef.current ?? { enabled };
    targetRef.current = target;
    setFrozen(target);
    setNotice('');
    void write.run(async () => {
      try {
        const saved = await activityApi.savePreference(target.enabled);
        if (getSession()?.generation !== session.generation) return;
        const key = [...activityKeys.all(session.generation, session.role), 'preference'];
        await queryClient.cancelQueries({ queryKey: key });
        if (getSession()?.generation !== session.generation) return;
        queryClient.setQueryData(key, saved);
        setEnabled(saved.enabled);
        targetRef.current = null;
        setFrozen(null);
        setNotice('Email preference saved.');
      } catch (error) {
        if (!uncertainActivity(error)) {
          targetRef.current = null;
          setFrozen(null);
        }
        throw error;
      }
    });
  }
  const fieldError =
    failed?.status === 400 && Object.hasOwn(failed.fields, 'enabled')
      ? 'Choose whether to receive ordinary email updates.'
      : undefined;
  return (
    <form
      className="card activity-preference"
      aria-label="Email notification preference"
      onSubmit={submit}
    >
      <h2>Ordinary order email updates</h2>
      <p>
        This preference controls ordinary order emails. In-app notifications and security
        verification or password-recovery emails remain available.
      </p>
      <p>Saved preference: {current.enabled ? 'Enabled' : 'Disabled'}.</p>
      <ActivityError error={readError || refresh.error} />
      <ActivityError error={write.error} />
      <Field label="Receive ordinary order email updates" error={fieldError}>
        {(id) => (
          <input
            id={id}
            type="checkbox"
            checked={enabled}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? `${id}-error` : undefined}
            disabled={!!frozen || write.pending || refresh.pending || mustReload}
            onChange={(event) => setEnabled(event.target.checked)}
          />
        )}
      </Field>
      {notice && <p role="status">{notice}</p>}
      {frozen && !write.pending && (
        <p role="status">The result is uncertain. Retry sends the same email choice.</p>
      )}
      {mustReload && !frozen && (
        <button
          type="button"
          disabled={refresh.pending}
          onClick={() =>
            void refresh.run(async () => {
              await reload();
              write.setError(null);
              setNotice('Current preference loaded. Review your choice before saving.');
            })
          }
        >
          Reload preference and review
        </button>
      )}
      <button
        type="submit"
        className="primary"
        disabled={write.pending || refresh.pending || (!frozen && mustReload)}
      >
        {write.pending
          ? 'Saving preference...'
          : frozen
            ? 'Retry the same email preference'
            : 'Save email preference'}
      </button>
    </form>
  );
}
