import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { ApiError } from '../../shared/api/client';
import type { Order, ServicePreferences } from '../../shared/api/contracts';
import { ordersApi, type SubmitCommand } from './api';
import { draftForm, draftInput, journeyFields, validateDraft, type DraftForm } from './form';
import { useHorseSearch } from '../horses/hooks';
import { useAction } from '../../shared/lib/useAction';
import type { FieldErrors } from '../../shared/lib/validation';
import {
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeading,
  Pagination,
} from '../../shared/ui/common';

export function OrderPage() {
  const id = Number(useParams().id);
  const session = useSession()!;
  const query = useQuery({
    queryKey: queryKeys.order(session.generation, id),
    queryFn: ({ signal }) => ordersApi.get(id, signal),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  if (!Number.isSafeInteger(id) || id <= 0) return <Notice>This request is unavailable.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return <OrderEditor key={id} order={query.data} />;
}
export function OpenDraftPage() {
  const [id, setId] = useState('');
  const navigate = useNavigate();
  return (
    <>
      <PageHeading
        title="Transport Requests"
        description="Create a request or reopen a saved draft."
      />
      <section className="card">
        <Link className="button primary" to="/customer/requests/new">
          New Request
        </Link>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (Number.isSafeInteger(Number(id)) && Number(id) > 0)
              navigate(`/customer/requests/${id}`);
          }}
        >
          <Field label="Saved request ID">
            {(fieldId) => (
              <input
                id={fieldId}
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            )}
          </Field>
          <button>Open Request</button>
        </form>
        <p className="muted">
          Your request ID is shown after saving. Use it to reopen your saved request.
        </p>
      </section>
    </>
  );
}
function HorsePicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const { search, setSearch, page, setPage, query } = useHorseSearch();
  return (
    <section className="card">
      <h2>Select one horse</h2>
      <p>One request is for one horse belonging to your account.</p>
      <Field label="Search your horses">
        {(id) => (
          <input
            id={id}
            type="search"
            maxLength={150}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </Field>
      {value && <p>Selected horse ID: {value}</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : (
        <fieldset className="horse-picker">
          <legend>Your horses</legend>
          {query.data.items.length ? (
            query.data.items.map((h) => (
              <label key={h.horseId} className="horse-choice">
                <input
                  type="radio"
                  name="horse"
                  checked={value === String(h.horseId)}
                  onChange={() => onChange(String(h.horseId))}
                />
                <span>
                  <strong>{h.name}</strong>
                  <small>
                    {h.measurementsComplete ? 'Measurements recorded' : 'Measurements incomplete'}
                  </small>
                </span>
              </label>
            ))
          ) : (
            <p>
              No horses found. <Link to="/customer/horses/new">Add a horse</Link>.
            </p>
          )}
        </fieldset>
      )}
      {query.data && (
        <Pagination
          page={page}
          pages={query.data.totalPages}
          onChange={setPage}
          pending={query.isFetching}
        />
      )}
    </section>
  );
}
export type ServicesSlotProps = {
  order: Order;
  preferences: ServicePreferences | null;
  onSaved: (order: Order) => void;
};
export function OrderEditor({
  order,
  servicesSlot,
}: {
  order?: Order;
  servicesSlot?: (props: ServicesSlotProps) => ReactNode;
}) {
  const [current, setCurrent] = useState(order);
  const [form, setForm] = useState(() => draftForm(order?.draft));
  const [baseline, setBaseline] = useState(() => draftForm(order?.draft));
  const [services, setServices] = useState(order?.draft.services || null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [latest, setLatest] = useState<Order | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const submitCommand = useRef<SubmitCommand | null>(null);
  const [frozenSubmit, setFrozenSubmit] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const action = useAction();
  const session = useSession()!;
  const navigate = useNavigate();
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const isDraft = !current || current.orderStatus === 'DRAFT';
  const conflict = action.error instanceof ApiError && action.error.status === 409;
  const uncertain = action.error instanceof ApiError && action.error.uncertain;
  const fieldError = (key: keyof DraftForm) =>
    errors[key] ||
    (action.error instanceof ApiError
      ? action.error.fields[key] ||
        Object.entries(action.error.fields).find(([field]) => field.startsWith(`${key}[`))?.[1]
      : undefined);
  const hasFieldErrors =
    Object.keys(errors).length > 0 ||
    (action.error instanceof ApiError && Object.keys(action.error.fields).length > 0);
  function change(key: keyof DraftForm, value: string) {
    if (!frozenSubmit) {
      setSavedMessage('');
      setForm((v) => ({ ...v, [key]: value }));
    }
  }
  async function adopt(saved: Order) {
    if (getSession()?.generation !== session.generation) return;
    setCurrent(saved);
    const values = draftForm(saved.draft);
    setForm(values);
    setBaseline(values);
    setServices(saved.draft.services);
    queryClient.setQueryData(queryKeys.order(session.generation, saved.orderId), saved);
    await queryClient.invalidateQueries({ queryKey: queryKeys.orders(session.generation) });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.services(session.generation, saved.orderId),
    });
  }
  function save() {
    const validation = validateDraft(form);
    setErrors(validation);
    if (Object.keys(validation).length || !isDraft || frozenSubmit || conflict || uncertain) return;
    void action.run(async () => {
      const input = draftInput(form, services);
      const saved = current
        ? await ordersApi.update(current.orderId, {
            ...input,
            recordVersion: current.recordVersion,
          })
        : await ordersApi.create(input);
      await adopt(saved);
      if (getSession()?.generation !== session.generation) return;
      setSavedMessage('Draft saved. This is not a confirmed booking.');
      if (!current) navigate(`/customer/requests/${saved.orderId}`, { replace: true });
    });
  }
  async function refreshSubmission() {
    if (!current) return;
    const fresh = await ordersApi.get(current.orderId);
    if (getSession()?.generation !== session.generation) return;
    await adopt(fresh);
    submitCommand.current = null;
    setFrozenSubmit(false);
    setRefreshPending(false);
    setSavedMessage(
      'Request submitted for assessment. No quote, payment or departure is confirmed.',
    );
  }
  function submit() {
    if (refreshPending) {
      void action.run(refreshSubmission);
      return;
    }
    if (!current || dirty || !isDraft) return;
    const validation = validateDraft(form, true);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    submitCommand.current ??= {
      recordVersion: current.recordVersion,
      operationId: crypto.randomUUID(),
    };
    const command = submitCommand.current;
    setFrozenSubmit(true);
    void action.run(async () => {
      try {
        await ordersApi.submit(current.orderId, command);
      } catch (e) {
        if (e instanceof ApiError && !e.uncertain) {
          submitCommand.current = null;
          setFrozenSubmit(false);
        }
        throw e;
      }
      // A successful POST is confirmed. If GET fails, retry only that read.
      setRefreshPending(true);
      await refreshSubmission();
    });
  }
  async function checkCurrent() {
    if (!current) {
      navigate('/customer/requests');
      return;
    }
    try {
      setLatest(await ordersApi.get(current.orderId));
    } catch (e) {
      action.setError(e);
    }
  }
  async function reload() {
    if (frozenSubmit && latest?.orderStatus === 'DRAFT') return;
    if (!latest || !window.confirm('Replace the unsaved form with current server data?')) return;
    submitCommand.current = null;
    setFrozenSubmit(false);
    setRefreshPending(false);
    await adopt(latest);
    setLatest(null);
    action.setError(null);
    setErrors({});
  }
  const labels = ['Journey', 'Horse', 'Service preferences', 'Review & Submit'];
  const fitError =
    action.error instanceof ApiError &&
    ['AIR_STALL_UNSUITABLE', 'AIR_STALL_ASSESSMENT_REQUIRED', 'HORSE_SNAPSHOT_STALE'].includes(
      action.error.code || '',
    );
  return (
    <>
      <PageHeading
        title={current ? `Request ${current.orderNumber}` : 'New Transport Request'}
        description={
          current
            ? `ID ${current.orderId} · ${current.orderStatus}`
            : 'Prepare an international journey for one horse.'
        }
      />
      <Notice>
        A draft or submitted request is for assessment. Flight space, pricing and clearance are
        confirmed separately.
      </Notice>
      {savedMessage && <Notice>{savedMessage}</Notice>}
      <ErrorNotice error={action.error}>
        {(conflict || uncertain) && (
          <button type="button" onClick={() => void checkCurrent()}>
            {current ? 'Check current request' : 'Check requests before creating again'}
          </button>
        )}
      </ErrorNotice>
      {hasFieldErrors && (
        <div className="notice error" role="alert">
          <p>Review the highlighted fields. Your entries have been kept.</p>
          <div className="actions">
            <button type="button" onClick={() => setStep(0)}>
              Review Journey
            </button>
            {fieldError('horseId') && (
              <button type="button" onClick={() => setStep(1)}>
                Review Horse
              </button>
            )}
          </div>
        </div>
      )}
      {latest && (
        <fieldset
          className="card"
          aria-label="Current server data"
          disabled={action.pending || (frozenSubmit && latest.orderStatus === 'DRAFT')}
        >
          <h2>Current server data</h2>
          <p>Status: {latest.orderStatus}. Your unsaved entries remain below.</p>
          <dl className="details">
            <div>
              <dt>Selected horse ID</dt>
              <dd>{latest.draft.horseId || 'Not selected'}</dd>
            </div>
            <div>
              <dt>Import type</dt>
              <dd>{latest.draft.importType || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Transit airports</dt>
              <dd>{latest.draft.transitAirports?.join(', ') || 'Not recorded'}</dd>
            </div>
            {journeyFields
              .filter((f) => (latest.draft[f.key] || '') !== form[f.key])
              .map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{latest.draft[f.key] || 'Not recorded'}</dd>
                </div>
              ))}
          </dl>
          <button type="button" disabled={action.pending} onClick={() => void reload()}>
            Reload form with server data
          </button>
        </fieldset>
      )}
      {!isDraft && (
        <Notice>
          This request has been submitted. Its captured revision is preserved. It cannot be edited
          here.
        </Notice>
      )}
      {refreshPending && (
        <Notice>
          Submission was accepted, but the current request could not be loaded. Use Refresh
          submitted request to load its current status without submitting again.
        </Notice>
      )}
      {fitError && (
        <Notice>
          {action.error instanceof ApiError && action.error.code === 'AIR_STALL_UNSUITABLE'
            ? 'The selected stall does not meet the approved fit limits. Review the saved measurements and service preferences.'
            : action.error instanceof ApiError && action.error.code === 'HORSE_SNAPSHOT_STALE'
              ? 'The horse profile changed after capture. Review the horse and current request; an explicit request update is required to refresh the captured information.'
              : 'The selected one-slot stall needs complete measurements and an approved fit assessment. Review the horse profile and ask your team to assess the stall choice.'}
          <div className="actions">
            {current?.draft.horseId && (
              <Link to={`/customer/horses/${current.draft.horseId}`}>Review horse profile</Link>
            )}
            <button type="button" onClick={() => setStep(2)}>
              Review saved service preferences
            </button>
          </div>
          <p>No stall choice, measurement or approval has been changed automatically.</p>
        </Notice>
      )}
      <nav className="steps" aria-label="Request steps">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-current={step === i ? 'step' : undefined}
            onClick={() => setStep(i)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>
      <fieldset className="editor-fields" disabled={!isDraft || action.pending || frozenSubmit}>
        {step === 0 && (
          <section className="card">
            <h2>Journey and handover</h2>
            <p className="muted">
              Dates must include an offset. Route timezone is separate from your device timezone.
            </p>
            <div className="form-grid">
              {journeyFields.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  error={fieldError(f.key)}
                  hint={
                    'hint' in f
                      ? f.hint
                      : 'date' in f
                        ? 'Example: 2027-02-01T08:00:00+07:00'
                        : undefined
                  }
                >
                  {(id) => (
                    <input
                      id={id}
                      type={f.key === 'receiverEmail' ? 'email' : 'text'}
                      maxLength={'max' in f ? f.max : 35}
                      value={form[f.key]}
                      onChange={(e) => change(f.key, e.target.value)}
                      aria-invalid={!!fieldError(f.key)}
                      aria-describedby={fieldError(f.key) ? `${id}-error` : undefined}
                    />
                  )}
                </Field>
              ))}
              <Field label="Import type" error={fieldError('importType')}>
                {(id) => (
                  <select
                    id={id}
                    value={form.importType}
                    aria-invalid={!!fieldError('importType')}
                    aria-describedby={fieldError('importType') ? `${id}-error` : undefined}
                    onChange={(e) => change('importType', e.target.value)}
                  >
                    <option value="">Not recorded</option>
                    <option value="TEMPORARY">Temporary</option>
                    <option value="PERMANENT">Permanent</option>
                    <option value="NEEDS_ADVICE">Needs advice</option>
                  </select>
                )}
              </Field>
              <Field
                label="Transit airports (comma separated)"
                error={fieldError('transitAirports')}
              >
                {(id) => (
                  <input
                    id={id}
                    value={form.transitAirports}
                    maxLength={50}
                    aria-invalid={!!fieldError('transitAirports')}
                    aria-describedby={fieldError('transitAirports') ? `${id}-error` : undefined}
                    onChange={(e) => change('transitAirports', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </section>
        )}
        {step === 1 && (
          <HorsePicker
            value={form.horseId}
            onChange={(id) => change('horseId', id)}
            error={fieldError('horseId')}
          />
        )}
      </fieldset>
      {step === 2 && (
        <section className="card">
          <h2>Service preferences</h2>
          {current && servicesSlot ? (
            servicesSlot({
              order: current,
              preferences: services,
              onSaved: (saved) => {
                void adopt(saved);
              },
            })
          ) : (
            <>
              <p>
                Service selection is not available in this release. Existing preferences are
                preserved when this draft is saved.
              </p>
              <dl className="details">
                {services ? (
                  Object.entries(services).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value == null ? 'Not selected' : String(value)}</dd>
                    </div>
                  ))
                ) : (
                  <p>No saved service preferences. They are not required to submit this request.</p>
                )}
              </dl>
            </>
          )}
        </section>
      )}
      {step === 3 && (
        <section className="card">
          <h2>Review your request</h2>
          <dl className="details">
            <div>
              <dt>Selected horse ID</dt>
              <dd>{form.horseId || 'Not selected'}</dd>
            </div>
            {journeyFields.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  {form[f.key] || 'Not recorded'}
                  {fieldError(f.key) && <span className="field-error">{fieldError(f.key)}</span>}
                </dd>
              </div>
            ))}
            <div>
              <dt>Import type</dt>
              <dd>
                {form.importType || 'Not recorded'}
                {fieldError('importType') && (
                  <span className="field-error">{fieldError('importType')}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Transit airports</dt>
              <dd>
                {form.transitAirports || 'Not recorded'}
                {fieldError('transitAirports') && (
                  <span className="field-error">{fieldError('transitAirports')}</span>
                )}
              </dd>
            </div>
          </dl>
          {fieldError('horseId') && (
            <p className="field-error" role="alert">
              {fieldError('horseId')}
            </p>
          )}
          {hasFieldErrors && (
            <p role="alert">Review the highlighted fields in Journey and Horse.</p>
          )}
          <p>
            Save changes before submitting. The backend validates horse fit and captures an
            immutable revision.
          </p>
          <button
            className="primary"
            type="button"
            disabled={
              action.pending ||
              dirty ||
              !current ||
              !isDraft ||
              (conflict && !frozenSubmit) ||
              (uncertain && !frozenSubmit)
            }
            onClick={submit}
          >
            {action.pending
              ? 'Submitting…'
              : refreshPending
                ? 'Refresh submitted request'
                : frozenSubmit
                  ? 'Retry the same submission'
                  : 'Submit for Review'}
          </button>
        </section>
      )}
      <div className="actions">
        <button
          type="button"
          onClick={() => setStep((v) => Math.max(0, v - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        {step < 3 && (
          <button type="button" onClick={() => setStep((v) => Math.min(3, v + 1))}>
            Continue
          </button>
        )}
        <button
          type="button"
          className="primary"
          disabled={
            action.pending ||
            !isDraft ||
            frozenSubmit ||
            conflict ||
            uncertain ||
            (!!current && !dirty)
          }
          onClick={save}
        >
          {action.pending ? 'Saving…' : 'Save Draft'}
        </button>
        <span className="muted" aria-live="polite">
          {dirty ? 'Unsaved changes' : 'No unsaved changes'}
        </span>
      </div>
      <p>
        <Link to="/customer/requests">Back to requests</Link>
      </p>
    </>
  );
}
