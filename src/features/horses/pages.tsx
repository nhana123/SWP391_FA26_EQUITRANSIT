import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHorse, useHorseSearch } from './hooks';
import { horseFields, horseForm, horseInput, validateHorse, type HorseForm } from './form';
import { horsesApi } from './api';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ApiError } from '../../shared/api/client';
import type { Horse } from '../../shared/api/contracts';
import {
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeading,
  Pagination,
} from '../../shared/ui/common';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { useAction } from '../../shared/lib/useAction';

export function HorsesPage() {
  const { search, setSearch, page, setPage, query } = useHorseSearch();
  return (
    <>
      <PageHeading title="My Horses" description="Search and manage your horse profiles.">
        <Link className="button primary" to="/customer/horses/new">
          Add Horse
        </Link>
      </PageHeading>
      <Notice>A saved profile does not confirm transport eligibility or carrier space.</Notice>
      <section className="card">
        <Field label="Search horses by name">
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
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorNotice error={query.error}>
            <button onClick={() => void query.refetch()}>Try again</button>
          </ErrorNotice>
        ) : !query.data.items.length ? (
          <div className="empty">
            <h2>{search ? 'No matching horses' : 'Your horses belong here'}</h2>
            <p>
              {search
                ? 'Try a different name.'
                : 'Add your first horse to prepare a transport request.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Sex</th>
                  <th>Measurements</th>
                  <th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((h) => (
                  <tr key={h.horseId}>
                    <td>{h.name}</td>
                    <td>{h.sexCode || 'Not recorded'}</td>
                    <td>
                      <span className="badge">
                        {h.measurementsComplete ? 'Recorded' : 'Incomplete'}
                      </span>
                    </td>
                    <td>
                      <Link to={`/customer/horses/${h.horseId}`}>View profile</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </>
  );
}
export function HorseDetailPage() {
  const id = Number(useParams().id);
  const query = useHorse(id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return <Notice>This horse record is unavailable.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        <Link to="/customer/horses">Back to horses</Link>
      </ErrorNotice>
    );
  const horse = query.data;
  return (
    <>
      <PageHeading
        title={horse.name}
        description="Identification, measurements and care instructions."
      >
        <Link className="button primary" to={`/customer/horses/${id}/edit`}>
          Edit Horse
        </Link>
      </PageHeading>
      <Notice>
        {horse.measurementsComplete
          ? 'Measurements are recorded.'
          : 'Some measurements are not recorded.'}{' '}
        Fit, legal clearance and carrier acceptance require separate assessment.
      </Notice>
      <section className="card">
        <h2>Horse profile</h2>
        <dl className="details">
          {horseFields.map((f) => (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>
                {f.key === 'measuredAt'
                  ? displayDate(horse.measuredAt)
                  : horse[f.key] == null
                    ? 'Not recorded'
                    : String(horse[f.key])}
              </dd>
            </div>
          ))}
          <div>
            <dt>Sex</dt>
            <dd>{horse.sexCode || 'Not recorded'}</dd>
          </div>
        </dl>
      </section>
      <Link to="/customer/horses">Back to horses</Link>
    </>
  );
}
export function HorseEditPage() {
  const id = Number(useParams().id);
  const query = useHorse(id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return <Notice>This horse record is unavailable.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return <HorseEditor key={id} horse={query.data} />;
}
export function HorseEditor({ horse }: { horse?: Horse }) {
  const [form, setForm] = useState<HorseForm>(() => horseForm(horse));
  const [baseline, setBaseline] = useState(() => horseForm(horse));
  const [version, setVersion] = useState(horse?.recordVersion);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [latest, setLatest] = useState<Horse | null>(null);
  const action = useAction();
  const navigate = useNavigate();
  const session = useSession()!;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const conflict = action.error instanceof ApiError && action.error.status === 409;
  const uncertain = action.error instanceof ApiError && action.error.uncertain;
  function update(key: keyof HorseForm, value: string) {
    setForm((v) => ({ ...v, [key]: value }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const validation = validateHorse(form);
    setErrors(validation);
    if (Object.keys(validation).length || conflict || uncertain) return;
    void action.run(async () => {
      const input = horseInput(form);
      const saved =
        horse && version
          ? await horsesApi.update(horse.horseId, { ...input, recordVersion: version })
          : await horsesApi.create(input);
      if (sessionGenerationChanged(session.generation)) return;
      queryClient.setQueryData(queryKeys.horse(session.generation, saved.horseId), saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.horses(session.generation) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.services(session.generation) });
      navigate(`/customer/horses/${saved.horseId}`, { replace: true });
    });
  }
  async function loadLatest() {
    if (!horse) {
      navigate('/customer/horses');
      return;
    }
    try {
      setLatest(await horsesApi.get(horse.horseId));
    } catch (e) {
      action.setError(e);
    }
  }
  function discard() {
    if (!latest || !window.confirm('Replace your unsaved form with the current server profile?'))
      return;
    const values = horseForm(latest);
    setForm(values);
    setBaseline(values);
    setVersion(latest.recordVersion);
    setLatest(null);
    action.setError(null);
    setErrors({});
  }
  return (
    <>
      <PageHeading
        title={horse ? 'Edit Horse' : 'Add Horse'}
        description="Save identification and care requirements."
      />
      <Notice>
        Unknown measurements can stay blank. Clearing an optional field removes its saved value.
        Profile changes do not change submitted snapshots.
      </Notice>
      <form onSubmit={submit}>
        <ErrorNotice error={action.error}>
          {(conflict || uncertain) && (
            <button type="button" onClick={() => void loadLatest()}>
              {horse
                ? 'Load current profile for comparison'
                : 'Check horse list before creating again'}
            </button>
          )}
        </ErrorNotice>
        {latest && (
          <section className="card">
            <h2>Current server profile</h2>
            <p>Your entries remain in the form below.</p>
            <dl className="details">
              {horseFields
                .filter((f) => String(latest[f.key] ?? '') !== form[f.key])
                .map((f) => (
                  <div key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>{String(latest[f.key] ?? 'Not recorded')}</dd>
                  </div>
                ))}
            </dl>
            <button type="button" onClick={discard}>
              Reload form with server values
            </button>
          </section>
        )}
        <section className="card">
          <h2>Horse identity and care</h2>
          <div className="form-grid">
            {horseFields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                error={
                  errors[f.key] ||
                  (action.error instanceof ApiError ? action.error.fields[f.key] : undefined)
                }
                hint={'hint' in f ? f.hint : undefined}
              >
                {(id) =>
                  'type' in f && f.type === 'datetime' ? (
                    <DateTimeInput
                      id={id}
                      value={form[f.key]}
                      invalid={!!errors[f.key]}
                      describedBy={errors[f.key] ? `${id}-error` : undefined}
                      onChange={(v) => update(f.key, v)}
                    />
                  ) : 'multiline' in f ? (
                    <textarea
                      id={id}
                      maxLength={f.max}
                      value={form[f.key]}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  ) : (
                    <input
                      id={id}
                      required={f.key === 'name'}
                      type={'type' in f ? f.type : 'text'}
                      inputMode={'number' in f ? 'decimal' : undefined}
                      maxLength={'max' in f ? f.max : undefined}
                      value={form[f.key]}
                      aria-invalid={!!errors[f.key]}
                      aria-describedby={errors[f.key] ? `${id}-error` : undefined}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  )
                }
              </Field>
            ))}
            <Field label="Sex">
              {(id) => (
                <select
                  id={id}
                  value={form.sexCode}
                  onChange={(e) => update('sexCode', e.target.value)}
                >
                  <option value="">Not recorded</option>
                  <option value="STALLION">Stallion</option>
                  <option value="MARE">Mare</option>
                  <option value="GELDING">Gelding</option>
                </select>
              )}
            </Field>
          </div>
        </section>
        <div className="actions">
          <button
            className="primary"
            disabled={action.pending || conflict || uncertain || (!!horse && !dirty)}
          >
            {action.pending ? 'Saving…' : 'Save Horse Profile'}
          </button>
          <Link to="/customer/horses">Back to horses</Link>
          <span className="muted" aria-live="polite">
            {dirty ? 'Unsaved changes' : 'No unsaved changes'}
          </span>
        </div>
      </form>
    </>
  );
}
import { getSession } from '../../shared/api/session';
function sessionGenerationChanged(generation: string) {
  return getSession()?.generation !== generation;
}
