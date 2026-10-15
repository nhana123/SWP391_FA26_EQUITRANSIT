import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import type { Order } from '../../shared/api/contracts';
import { ErrorNotice, Field } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { bookingApi } from './api';
import type { Confirmation, ConfirmCommand, Disclosure, Preferences } from './contracts';

const MAX_REASON = 500;

/**
 * One action confirms the whole preference object. A draft is saved in
 * place; a submitted request needs a reason and gets a new revision.
 */
export function ConfirmBar({
  order,
  disclosure,
  prefs,
  dirty,
  hasErrors,
  onConfirmed,
  onReload,
}: {
  order: Order;
  disclosure: Disclosure;
  prefs: Preferences;
  dirty: boolean;
  hasErrors: boolean;
  onConfirmed: (confirmation: Confirmation) => Promise<void>;
  onReload: () => void;
}) {
  const draft = order.orderStatus === 'DRAFT';
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const command = useCaseCommand((body: ConfirmCommand) => bookingApi.confirm(order.orderId, body));
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const horseVersion = disclosure.horseRecordVersion;

  function submit(e: FormEvent) {
    e.preventDefault();
    command.submit(() => {
      const r = reason.trim();
      const error = draft
        ? undefined
        : !r
          ? 'Explain the change to your submitted service choices.'
          : r.length > MAX_REASON
            ? `Use at most ${MAX_REASON} characters.`
            : undefined;
      setReasonError(error);
      if (error || hasErrors || !horseVersion) return null;
      return {
        recordVersion: disclosure.recordVersion,
        horseRecordVersion: horseVersion,
        services: prefs,
        changeReason: draft ? null : r,
      };
    }, onConfirmed);
  }
  return (
    <form className="confirm-bar" onSubmit={submit} noValidate aria-label="Confirm service choices">
      <h3>Confirm service choices</h3>
      <p className="muted">
        Save any journey changes first: confirming reloads this request from the server. Confirming
        is a request, not a quote, a payment or a carrier booking.
      </p>
      {!horseVersion && (
        <p className="field-error" role="alert">
          Choose a horse in the request before confirming services.
        </p>
      )}
      {hasErrors && (
        <p className="field-error" role="alert">
          Fix the highlighted choices in the sections above before confirming.
        </p>
      )}
      <ErrorNotice error={command.error}>
        {code === 'HORSE_SNAPSHOT_STALE' && (
          <p>
            Your horse profile changed after this request was submitted. Use “Revise request” below
            to capture the updated profile, then confirm your services again.
          </p>
        )}
        {(code === 'ORDER_VERSION_CONFLICT' ||
          code === 'HORSE_VERSION_CONFLICT' ||
          command.frozen) && (
          <button type="button" onClick={onReload}>
            Reload request
          </button>
        )}
      </ErrorNotice>
      {command.frozen && !command.pending && (
        <p role="status">
          The connection was interrupted. Your choices may have been saved. Retry sends exactly the
          same choices again, or reload to check.
        </p>
      )}
      {!draft && (
        <fieldset disabled={command.locked}>
          <Field
            label="Reason for changing services"
            hint={`Required for a submitted request, up to ${MAX_REASON} characters. A new revision is created for assessment.`}
            error={reasonError}
          >
            {(id) => (
              <textarea
                id={id}
                value={reason}
                maxLength={MAX_REASON}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={!!reasonError}
              />
            )}
          </Field>
        </fieldset>
      )}
      <button
        className="primary"
        type="submit"
        disabled={command.pending || (!command.frozen && (!dirty || !horseVersion))}
      >
        {command.pending
          ? 'Confirming…'
          : command.frozen
            ? 'Retry the same confirmation'
            : 'Confirm service choices'}
      </button>
      {!dirty && !command.frozen && <span className="muted"> No unconfirmed changes.</span>}
    </form>
  );
}
