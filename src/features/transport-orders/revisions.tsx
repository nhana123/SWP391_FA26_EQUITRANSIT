import { useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import type { Order } from '../../shared/api/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice } from '../../shared/ui/common';
import { PhoneInput } from '../../shared/ui/PhoneInput';
import { DateTimeInput } from '../../shared/ui/DateTimeInput';

import { SnapshotView } from '../assessment/case';
import { useCaseCommand } from '../assessment/command';
import { draftForm, draftInput, journeyFields, validateDraft, type DraftForm } from './form';
import {
  REVISION_PAGE_SIZE,
  revisionsApi,
  type ChangeReceipt,
  type RevisionCommand,
} from './revisions-api';

const MAX_REASON = 500;

// Under queryKeys.order so the editor's and this module's invalidation agree.
export const revisionKeys = {
  list: (generation: string, id: number, page: number) =>
    [...queryKeys.order(generation, id), 'revisions', { page }] as const,
  detail: (generation: string, id: number, revisionId: number) =>
    [...queryKeys.order(generation, id), 'revision', revisionId] as const,
  change: (generation: string, id: number, changeId: number) =>
    [...queryKeys.order(generation, id), 'change', changeId] as const,
};

// BE: direct revision only in these states and before protected commitment.
const revisable: Order['orderStatus'][] = ['SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED'];
const closed: Order['orderStatus'][] = [
  'DRAFT',
  'REJECTED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'CANCELED',
  'CLOSED',
];

const changeLabels: Record<ChangeReceipt['status'], string> = {
  PENDING: 'Pending staff review',
  APPROVED: 'Approved by staff',
  REJECTED: 'Rejected by staff',
  APPLIED: 'Applied',
  CANCELLED: 'Cancelled',
};

function RevisionSnapshot({ orderId, revisionId }: { orderId: number; revisionId: number }) {
  const session = useSession()!;
  const query = useQuery({
    queryKey: revisionKeys.detail(session.generation, orderId, revisionId),
    queryFn: ({ signal }) => revisionsApi.get(orderId, revisionId, signal),
    // Revisions are immutable; once read they never change.
    staleTime: Infinity,
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return <SnapshotView snapshot={query.data.snapshot} />;
}

export function RevisionHistory({ order }: { order: Order }) {
  const session = useSession()!;
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const query = useQuery({
    queryKey: revisionKeys.list(session.generation, order.orderId, page),
    queryFn: ({ signal }) => revisionsApi.list(order.orderId, page, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <section className="card" aria-labelledby="revisions-heading">
      <h2 id="revisions-heading">Submitted revisions</h2>
      <p className="muted">
        Each revision is the request exactly as it was submitted, including the horse profile at
        that time. Later profile edits never change it.
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : !query.data.length ? (
        <p>No submitted revisions yet.</p>
      ) : (
        <div className="table-scroll" aria-busy={query.isPlaceholderData}>
          <table aria-label="Submitted revisions, newest first">
            <thead>
              <tr>
                <th scope="col">Revision</th>
                <th scope="col">Submitted</th>
                <th scope="col">Reason for change</th>
                <th scope="col">Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((r) => (
                <tr key={r.revisionId}>
                  <td>
                    {r.revisionNo}
                    {r.revisionId === order.currentRevisionId && (
                      <span className="badge"> Current</span>
                    )}
                  </td>
                  <td>{displayDate(r.submittedAt)}</td>
                  <td>{r.changeReason ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      aria-expanded={open === r.revisionId}
                      onClick={() => setOpen(open === r.revisionId ? null : r.revisionId)}
                    >
                      {open === r.revisionId ? 'Hide' : 'View'} revision {r.revisionNo}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data && (page > 0 || query.data.length === REVISION_PAGE_SIZE) && (
        <nav className="pagination" aria-label="Revision pages">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Newer
          </button>
          <span>Page {page + 1}</span>
          <button
            type="button"
            disabled={query.data.length < REVISION_PAGE_SIZE || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Older
          </button>
        </nav>
      )}
      {open !== null && <RevisionSnapshot orderId={order.orderId} revisionId={open} />}
    </section>
  );
}

function ChangeReceiptCard({ orderId, receipt }: { orderId: number; receipt: ChangeReceipt }) {
  const session = useSession()!;
  const query = useQuery({
    queryKey: revisionKeys.change(session.generation, orderId, receipt.changeRequestId),
    queryFn: ({ signal }) => revisionsApi.change(orderId, receipt.changeRequestId, signal),
    initialData: receipt,
    staleTime: Infinity,
  });
  return (
    <section className="card" aria-labelledby="change-heading">
      <h2 id="change-heading">Change request {receipt.changeRequestId}</h2>
      <p>
        <span className="badge">{changeLabels[query.data.status]}</span>
      </p>
      <p>
        {query.data.status === 'PENDING'
          ? 'Your proposal was received. It is not approved or applied yet, and your current request stays as it is until our team handles it.'
          : `Last checked status: ${changeLabels[query.data.status]}.`}
      </p>
      <p className="muted">
        Sent {displayDate(query.data.createdAt)}. Keep this number for reference.
      </p>
      <ErrorNotice error={query.error} />
      <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>
        {query.isFetching ? 'Checking…' : 'Check status'}
      </button>
    </section>
  );
}

type Mode = 'revise' | 'change';

/**
 * Full editable request; services are carried over unchanged. Direct revision
 * and change proposals share the input, but each submit is its own action.
 */
function RevisionForm({
  order,
  initialMode,
  onRevised,
  onChangeSent,
  onCancel,
}: {
  order: Order;
  initialMode: Mode;
  onRevised: (revisionNo: number) => Promise<void>;
  onChangeSent: (receipt: ChangeReceipt) => void;
  onCancel: () => void;
}) {
  const session = useSession()!;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [form, setForm] = useState<DraftForm>(() => draftForm(order.draft));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const revise = useCaseCommand((body: RevisionCommand) =>
    revisionsApi.revise(order.orderId, body),
  );
  const change = useCaseCommand((body: RevisionCommand) =>
    revisionsApi.requestChange(order.orderId, body),
  );
  const command = mode === 'revise' ? revise : change;
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const locked = revise.locked || change.locked;

  function build(): Omit<RevisionCommand, 'operationId'> | null {
    const next = validateDraft(form, true);
    const r = reason.trim();
    if (!r) next.changeReason = 'Explain what changed and why.';
    else if (r.length > MAX_REASON) next.changeReason = `Use at most ${MAX_REASON} characters.`;
    setErrors(next);
    if (Object.keys(next).length) return null;
    return {
      ...draftInput(form, order.draft.services),
      recordVersion: order.recordVersion,
      changeReason: r,
    };
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'revise') revise.submit(build, (revision) => onRevised(revision.revisionNo));
    else
      change.submit(build, async (receipt) => {
        onChangeSent(receipt);
      });
  }
  function reload() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.order(session.generation, order.orderId),
    });
  }
  const set = (key: keyof DraftForm, value: string) => {
    if (!locked) setForm((f) => ({ ...f, [key]: value }));
  };
  const fieldError = (key: string) => errors[key] || command.fields[key];
  return (
    <form
      className="card"
      onSubmit={submit}
      noValidate
      aria-label={mode === 'revise' ? 'Revise request' : 'Propose a change'}
    >
      <h2>{mode === 'revise' ? 'Revise request' : 'Propose a change'}</h2>
      <p className="muted">
        {mode === 'revise'
          ? 'Submitting creates a new revision for assessment, captured with your current horse profile. Earlier revisions stay in history.'
          : 'Your proposal is sent for staff review. Nothing changes until it is handled; costs may need a new quote and your consent.'}
      </p>
      <ErrorNotice error={command.error}>
        {code === 'ORDER_CHANGE_REQUEST_REQUIRED' && (
          <button type="button" onClick={() => setMode('change')}>
            Send as a change proposal instead
          </button>
        )}
        {code === 'ORDER_DIRECT_REVISION_REQUIRED' && (
          <button type="button" onClick={() => setMode('revise')}>
            Revise directly instead
          </button>
        )}
        {(code === 'ORDER_VERSION_CONFLICT' || command.frozen) && (
          <button type="button" onClick={reload}>
            Reload request
          </button>
        )}
      </ErrorNotice>
      {command.frozen && !command.pending && (
        <p role="status">
          The connection was interrupted. It may have been received. Retry sends exactly the same
          request again, or reload to check.
        </p>
      )}
      <fieldset className="form-grid" disabled={locked}>
        <legend>Journey and handover</legend>
        {journeyFields.map((f) => (
          <Field key={f.key} label={f.label} error={fieldError(f.key)}>
            {(id) =>
              f.key === 'receiverPhone' ? (
                <PhoneInput
                  id={id}
                  maxLength={f.max}
                  value={form[f.key]}
                  onChange={(v) => set(f.key, v)}
                  invalid={!!fieldError(f.key)}
                />
              ) : 'date' in f ? (
                <DateTimeInput
                  id={id}
                  value={form[f.key]}
                  onChange={(v) => set(f.key, v)}
                  invalid={!!fieldError(f.key)}
                />
              ) : (
                <input
                  id={id}
                  type={f.key === 'receiverEmail' ? 'email' : 'text'}
                  maxLength={'max' in f ? f.max : 35}
                  value={form[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  aria-invalid={!!fieldError(f.key)}
                />
              )
            }
          </Field>
        ))}
        <Field label="Import type" error={fieldError('importType')}>
          {(id) => (
            <select
              id={id}
              value={form.importType}
              onChange={(e) => set('importType', e.target.value)}
            >
              <option value="">Not recorded</option>
              <option value="TEMPORARY">Temporary</option>
              <option value="PERMANENT">Permanent</option>
              <option value="NEEDS_ADVICE">Needs advice</option>
            </select>
          )}
        </Field>
        <Field label="Transit airports (comma separated)" error={fieldError('transitAirports')}>
          {(id) => (
            <input
              id={id}
              value={form.transitAirports}
              maxLength={50}
              onChange={(e) => set('transitAirports', e.target.value)}
            />
          )}
        </Field>
      </fieldset>
      <p className="muted">
        Horse ID {form.horseId || '—'} stays the same. Service preferences are kept unchanged.
      </p>
      <fieldset disabled={locked}>
        <Field
          label="Reason for this change"
          hint={`Required, up to ${MAX_REASON} characters.`}
          error={fieldError('changeReason')}
        >
          {(id) => (
            <textarea
              id={id}
              value={reason}
              maxLength={MAX_REASON}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!fieldError('changeReason')}
            />
          )}
        </Field>
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={command.pending}>
          {command.pending
            ? 'Sending…'
            : command.frozen
              ? 'Retry the same request'
              : mode === 'revise'
                ? 'Submit revision'
                : 'Send change proposal'}
        </button>
        <button type="button" onClick={onCancel} disabled={locked}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Revision history plus the right change path for the order's state. */
export function RevisionsSection({ order }: { order: Order }) {
  const session = useSession()!;
  const [editing, setEditing] = useState<Mode | null>(null);
  const [revised, setRevised] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<ChangeReceipt | null>(null);
  if (order.currentRevisionId === null) return null;
  const canRevise = revisable.includes(order.orderStatus);
  const canPropose = !canRevise && !closed.includes(order.orderStatus);

  async function afterRevision(revisionNo: number) {
    setEditing(null);
    setReceipt(null);
    setRevised(revisionNo);
    // Receipt is history: re-read the order, assessment, list and revisions.
    await queryClient.invalidateQueries({ queryKey: queryKeys.orders(session.generation) });
  }
  return (
    <>
      {revised !== null && (
        <Notice>
          Revision {revised} submitted for assessment. This is not a quote, payment or departure
          confirmation.
        </Notice>
      )}
      {receipt && <ChangeReceiptCard orderId={order.orderId} receipt={receipt} />}
      {editing ? (
        <RevisionForm
          // Remount on a new server version so the form starts from current data.
          key={`${editing}-${order.currentRevisionId}`}
          order={order}
          initialMode={editing}
          onRevised={afterRevision}
          onChangeSent={(next) => {
            setEditing(null);
            setRevised(null);
            setReceipt(next);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        (canRevise || canPropose) && (
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                setRevised(null);
                setEditing(canRevise ? 'revise' : 'change');
              }}
            >
              {canRevise ? 'Revise request' : 'Propose a change'}
            </button>
          </div>
        )
      )}
      <RevisionHistory order={order} />
    </>
  );
}
