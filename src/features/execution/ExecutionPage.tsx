import { useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { idSchema, type Role } from '../../shared/api/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice, Pagination } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { EXECUTION_PAGE_SIZE, executionApi } from './api';
import {
  errorHelp,
  healthStatuses,
  milestoneLabels,
  milestoneTypes,
  sourceLabels,
  sourcesFor,
  type Command,
  type ExecutionLeg,
  type ExecutionOverview,
  type ExecutionReceipt,
  type WelfareLog,
} from './contracts';
import {
  validateMilestone,
  validateTransition,
  validateWelfare,
  type MilestoneForm,
  type TransitionForm,
  type WelfareForm,
} from './validation';
import {
  CustomerAdjustments,
  LegIncidents,
  PlanAdjustments,
  ReportIncidentForm,
} from '../incidents/panels';
import { incidentsEnabled } from '../incidents/capability';
import { LegHandovers } from '../handover/panels';
import './execution.css';

export const executionKeys = {
  all: (generation: string, orderId: number) =>
    [...queryKeys.session(generation), 'execution', orderId] as const,
  page: (generation: string, orderId: number, page: number) =>
    [...executionKeys.all(generation, orderId), { page }] as const,
};
const writers: Role[] = ['MANAGER', 'COORDINATOR', 'DRIVER'];
export function executionPath(role: Role, orderId: number) {
  if (role === 'CUSTOMER') return `/customer/requests/${orderId}/execution`;
  if (role === 'MANAGER') return `/manager/requests/${orderId}/execution`;
  if (role === 'DRIVER') return `/driver/orders/${orderId}/execution`;
  return `/staff/cases/${orderId}/execution`;
}
const dateHint = 'ISO date with offset, e.g. 2027-02-01T08:00:00+07:00.';

/** Order version pinned to what the user reviewed; only own receipts or a reload move it. */
function usePinned(orderId: number, current: string | undefined) {
  const { generation } = useSession()!;
  const [pinned, setPinned] = useState<string | null>(null);
  if (current && pinned === null) setPinned(current);
  const changed = !!current && !!pinned && current.toLowerCase() !== pinned.toLowerCase();
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: executionKeys.all(generation, orderId) });
  return {
    version: pinned,
    changed,
    async written(receipt: ExecutionReceipt) {
      setPinned(receipt.recordVersion);
      await Promise.all([
        reload(),
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.session(generation), 'operations'],
        }),
      ]);
    },
    adopt: (next: string) => setPinned(next),
    /** After a write that returns no version (F14), re-pin to what loads next. */
    async repin() {
      setPinned(null);
      await reload();
    },
    reload,
  };
}
type Pinned = ReturnType<typeof usePinned>;

function CommandForm<T>({
  label,
  pinned,
  send,
  build,
  submitLabel,
  fieldErrors,
  onDone,
  children,
}: {
  label: string;
  pinned: Pinned;
  send: (body: Command<T>) => Promise<ExecutionReceipt>;
  build: () => T | null;
  submitLabel: string;
  fieldErrors?: FieldErrors;
  onDone?: (receipt: ExecutionReceipt) => void;
  children: (locked: boolean, fields: FieldErrors) => ReactNode;
}) {
  const command = useCaseCommand(send);
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const stale = pinned.changed || !pinned.version;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (command.pending || (stale && !command.frozen)) return;
    command.submit(
      () => {
        const input = build();
        return input
          ? ({ ...input, recordVersion: pinned.version! } as Omit<Command<T>, 'operationId'>)
          : null;
      },
      async (receipt) => {
        onDone?.(receipt);
        await pinned.written(receipt);
      },
    );
  }
  return (
    <form className="card" onSubmit={submit} noValidate aria-label={label}>
      <h3>{label}</h3>
      <ErrorNotice error={command.error}>
        {code && errorHelp[code] && <p>{errorHelp[code]}</p>}
        {command.frozen && !command.pending && (
          <p>
            The result is uncertain. Retry sends the same entry with the same identifier and
            version, so it cannot be recorded twice.
          </p>
        )}
        {command.conflict && !command.frozen && (
          <button type="button" onClick={() => void pinned.reload()}>
            Reload
          </button>
        )}
      </ErrorNotice>
      {children(command.locked, { ...command.fields, ...fieldErrors })}
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={command.pending || (stale && !command.frozen)}
        >
          {command.pending ? 'Sending…' : command.frozen ? 'Retry the same entry' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Input({
  label,
  value,
  onChange,
  error,
  hint,
  max,
  area,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max: number;
  area?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) =>
        area ? (
          <textarea
            id={id}
            maxLength={max}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input id={id} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}
function Select<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  error,
}: {
  label: string;
  value: T | '';
  options: readonly T[];
  labels?: Partial<Record<string, string>>;
  onChange: (v: T) => void;
  error?: string;
}) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          <option value="" disabled>
            Choose…
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {labels?.[o] ?? o}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
const visibility = ['true', 'false'] as const;
const visibilityLabels = { true: 'Visible to the customer', false: 'Staff only' };

function SourceFields({
  mode,
  f,
  set,
  fields,
}: {
  mode: 'ROAD' | 'AIR';
  f: { occurredAt: string; sourceCode: string; sourceReference: string };
  set: (patch: Partial<TransitionForm>) => void;
  fields: FieldErrors;
}) {
  return (
    <>
      <Input
        label="Occurred at"
        hint={dateHint}
        max={35}
        value={f.occurredAt}
        onChange={(occurredAt) => set({ occurredAt })}
        error={fields.occurredAt}
      />
      <Select
        label="Source"
        value={f.sourceCode as TransitionForm['sourceCode']}
        options={sourcesFor(mode)}
        labels={sourceLabels}
        onChange={(sourceCode) => set({ sourceCode })}
        error={fields.sourceCode}
      />
      <Input
        label="Source reference"
        hint="Message, call or document this comes from."
        max={500}
        value={f.sourceReference}
        onChange={(sourceReference) => set({ sourceReference })}
        error={fields.sourceReference}
      />
    </>
  );
}

function TransitionFormView({
  o,
  leg,
  pinned,
  kind,
}: {
  o: ExecutionOverview;
  leg: ExecutionLeg;
  pinned: Pinned;
  kind: 'start' | 'complete';
}) {
  const [f, setF] = useState<TransitionForm>({
    occurredAt: '',
    sourceCode: '',
    sourceReference: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (patch: Partial<TransitionForm>) => setF((v) => ({ ...v, ...patch }));
  return (
    <CommandForm
      label={`${kind === 'start' ? 'Start' : 'Complete'} leg ${leg.sequenceNo}`}
      pinned={pinned}
      submitLabel={kind === 'start' ? 'Record start' : 'Record arrival'}
      send={(body) =>
        (kind === 'start' ? executionApi.start : executionApi.complete)(o.orderId, leg.legId, body)
      }
      fieldErrors={errors}
      build={() => {
        const r = validateTransition(leg.transportMode, f);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            Records the actual {kind === 'start' ? 'departure' : 'arrival'} time; planned times
            never change.
          </p>
          <SourceFields mode={leg.transportMode} f={f} set={set} fields={fields} />
        </fieldset>
      )}
    </CommandForm>
  );
}

function MilestoneFormView({
  o,
  leg,
  pinned,
}: {
  o: ExecutionOverview;
  leg: ExecutionLeg;
  pinned: Pinned;
}) {
  const [f, setF] = useState<MilestoneForm>({
    occurredAt: '',
    sourceCode: '',
    sourceReference: '',
    milestoneType: '',
    latitude: '',
    longitude: '',
    locationDescription: '',
    estimatedArrivalAt: '',
    delayReason: '',
    publicNote: '',
    internalNotes: '',
    customerVisible: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (patch: Partial<MilestoneForm>) => setF((v) => ({ ...v, ...patch }));
  return (
    <CommandForm
      label={`Add update to leg ${leg.sequenceNo}`}
      pinned={pinned}
      submitLabel="Record update"
      send={(body) => executionApi.milestone(o.orderId, leg.legId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateMilestone(leg.transportMode, f);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            Recorded evidence, not live tracking. Updates do not change the leg state.
          </p>
          <Select
            label="Update type"
            value={f.milestoneType}
            options={milestoneTypes}
            labels={milestoneLabels}
            onChange={(milestoneType) => set({ milestoneType })}
            error={fields.milestoneType}
          />
          <SourceFields mode={leg.transportMode} f={f} set={set} fields={fields} />
          <Input
            label="Latitude (optional)"
            max={12}
            value={f.latitude}
            onChange={(latitude) => set({ latitude })}
            error={fields.latitude}
          />
          <Input
            label="Longitude (optional)"
            max={12}
            value={f.longitude}
            onChange={(longitude) => set({ longitude })}
            error={fields.longitude}
          />
          <Input
            label="Location (optional)"
            max={500}
            value={f.locationDescription}
            onChange={(locationDescription) => set({ locationDescription })}
            error={fields.locationDescription}
          />
          <Input
            label="Estimated arrival (optional)"
            hint={dateHint}
            max={35}
            value={f.estimatedArrivalAt}
            onChange={(estimatedArrivalAt) => set({ estimatedArrivalAt })}
            error={fields.estimatedArrivalAt}
          />
          <Input
            label="Delay reason"
            hint="Required for a delay."
            area
            max={1000}
            value={f.delayReason}
            onChange={(delayReason) => set({ delayReason })}
            error={fields.delayReason}
          />
          <Input
            label="Note for the customer (optional)"
            area
            max={2000}
            value={f.publicNote}
            onChange={(publicNote) => set({ publicNote })}
            error={fields.publicNote}
          />
          <Input
            label="Internal notes (optional)"
            hint="Never shown to the customer."
            area
            max={2000}
            value={f.internalNotes}
            onChange={(internalNotes) => set({ internalNotes })}
            error={fields.internalNotes}
          />
          <Select
            label="Customer visibility"
            value={f.customerVisible}
            options={visibility}
            labels={visibilityLabels}
            onChange={(customerVisible) => set({ customerVisible })}
            error={fields.customerVisible}
          />
        </fieldset>
      )}
    </CommandForm>
  );
}

function WelfareFormView({
  o,
  leg,
  pinned,
  correcting,
  onDone,
}: {
  o: ExecutionOverview;
  leg: ExecutionLeg;
  pinned: Pinned;
  correcting: WelfareLog | null;
  onDone: (receipt: ExecutionReceipt) => void;
}) {
  const [f, setF] = useState<WelfareForm>({
    occurredAt: correcting?.occurredAt ?? '',
    healthStatus: correcting?.healthStatus ?? '',
    sourceCode: '',
    sourceReference: '',
    temperatureCelsius: correcting?.temperatureCelsius ?? '',
    waterIntakeLiters: correcting?.waterIntakeLiters ?? '',
    feedIntakeKg: correcting?.feedIntakeKg ?? '',
    behaviorNotes: correcting?.behaviorNotes ?? '',
    careNotes: correcting?.careNotes ?? '',
    publicNote: correcting?.publicNote ?? '',
    customerVisible: correcting ? (correcting.customerVisible ? 'true' : '') : '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (patch: Partial<WelfareForm>) => setF((v) => ({ ...v, ...patch }));
  return (
    <CommandForm
      label={
        correcting
          ? `Correct welfare entry ${correcting.welfareLogId}`
          : `Add welfare check to leg ${leg.sequenceNo}`
      }
      pinned={pinned}
      submitLabel={correcting ? 'Record correction' : 'Record welfare check'}
      send={(body) => executionApi.welfare(o.orderId, leg.legId, body)}
      fieldErrors={errors}
      onDone={onDone}
      build={() => {
        const r = validateWelfare(leg.transportMode, f, correcting);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            {correcting
              ? 'A correction is a new entry that supersedes this one; the original is kept.'
              : 'Entries cannot be edited later. URGENT opens a critical incident for staff response; it is not a diagnosis.'}
          </p>
          <Select
            label="Health status"
            value={f.healthStatus}
            options={healthStatuses}
            onChange={(healthStatus) => set({ healthStatus })}
            error={fields.healthStatus}
          />
          <SourceFields mode={leg.transportMode} f={f} set={set} fields={fields} />
          <Input
            label="Temperature °C (optional)"
            max={9}
            value={f.temperatureCelsius}
            onChange={(temperatureCelsius) => set({ temperatureCelsius })}
            error={fields.temperatureCelsius}
          />
          <Input
            label="Water intake litres (optional)"
            max={9}
            value={f.waterIntakeLiters}
            onChange={(waterIntakeLiters) => set({ waterIntakeLiters })}
            error={fields.waterIntakeLiters}
          />
          <Input
            label="Feed intake kg (optional)"
            max={9}
            value={f.feedIntakeKg}
            onChange={(feedIntakeKg) => set({ feedIntakeKg })}
            error={fields.feedIntakeKg}
          />
          <Input
            label="Behaviour notes (staff only)"
            area
            max={2000}
            value={f.behaviorNotes}
            onChange={(behaviorNotes) => set({ behaviorNotes })}
            error={fields.behaviorNotes}
          />
          <Input
            label="Care notes (staff only)"
            area
            max={2000}
            value={f.careNotes}
            onChange={(careNotes) => set({ careNotes })}
            error={fields.careNotes}
          />
          <Input
            label="Note for the customer (optional)"
            area
            max={2000}
            value={f.publicNote}
            onChange={(publicNote) => set({ publicNote })}
            error={fields.publicNote}
          />
          <Select
            label="Customer visibility"
            value={f.customerVisible}
            options={visibility}
            labels={visibilityLabels}
            onChange={(customerVisible) => set({ customerVisible })}
            error={fields.customerVisible}
          />
        </fieldset>
      )}
    </CommandForm>
  );
}

type Panel = {
  leg: ExecutionLeg;
  kind: 'start' | 'complete' | 'milestone' | 'welfare' | 'incidents' | 'handover';
  correcting?: WelfareLog;
};

function Workspace({ orderId }: { orderId: number }) {
  const session = useSession()!;
  const [params, setParams] = useSearchParams();
  const raw = params.get('page') ?? '0';
  const page = /^\d+$/.test(raw) ? Number(raw) : 0;
  const query = useQuery({
    queryKey: executionKeys.page(session.generation, orderId, page),
    queryFn: ({ signal }) => executionApi.get(orderId, page, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const pinned = usePinned(orderId, query.data?.recordVersion);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [notice, setNotice] = useState('');
  if (query.isPending) return <Loading />;
  if (query.error && !query.data)
    return (
      <ErrorNotice error={query.error}>
        {query.error instanceof ApiError && query.error.code && errorHelp[query.error.code] && (
          <p>{errorHelp[query.error.code]}</p>
        )}
        {query.error instanceof ApiError && query.error.status === 503 && (
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        )}
      </ErrorNotice>
    );
  const o = query.data!;
  const canWrite = writers.includes(session.role);
  const writable = (leg: ExecutionLeg) =>
    canWrite && !(session.role === 'DRIVER' && leg.transportMode === 'AIR');
  const previous = (leg: ExecutionLeg) => o.legs.find((l) => l.sequenceNo === leg.sequenceNo - 1);
  const canStart = (leg: ExecutionLeg) =>
    leg.sequenceNo > 1 && leg.legStatus === 'CONFIRMED' && previous(leg)?.legStatus === 'COMPLETED';
  const departed = (leg: ExecutionLeg) => !!leg.actualDeparture;
  // F14: a driver hands over their own road leg; Coordinator/Manager any leg.
  const canHandover = (leg: ExecutionLeg) =>
    leg.legStatus === 'IN_TRANSIT' &&
    (session.role === 'DRIVER'
      ? writable(leg)
      : session.role === 'COORDINATOR' || session.role === 'MANAGER');
  // Legs are paged; the last leg is numbered legCount.
  const lastLeg = Math.max(o.legCount, ...o.legs.map((l) => l.sequenceNo));
  const pages = Math.ceil(
    Math.max(o.legCount, o.milestoneCount, o.welfareCount) / EXECUTION_PAGE_SIZE,
  );
  const open = (next: Panel) => {
    setNotice('');
    setPanel(next);
  };
  return (
    <>
      {pinned.changed && (
        <div className="notice error" role="alert">
          <p>
            New entries were recorded since you opened this page. Reload and review before adding
            more.
          </p>
          <button type="button" onClick={() => pinned.adopt(o.recordVersion)}>
            Reload and review
          </button>
        </div>
      )}
      {notice && <Notice>{notice}</Notice>}
      <section className="card" aria-label="Legs">
        <h2>Legs</h2>
        <p className="muted">
          Request {o.orderStatus}. Last update{' '}
          {o.lastUpdateAt ? displayDate(o.lastUpdateAt) : 'none yet'}. Completing the last leg does
          not mark delivery; delivery and closure are separate steps.
        </p>
        <div className="table-scroll">
          <table aria-label="Execution legs">
            <thead>
              <tr>
                <th scope="col">Leg</th>
                <th scope="col">Status</th>
                <th scope="col">Planned</th>
                <th scope="col">Actual</th>
                {canWrite && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {o.legs.map((leg) => (
                <tr key={leg.legId}>
                  <td>
                    {leg.sequenceNo} · {leg.transportMode}
                  </td>
                  <td>
                    <span className="badge">{leg.legStatus}</span>
                  </td>
                  <td>
                    {displayDate(leg.plannedDeparture)} → {displayDate(leg.plannedArrival)}
                  </td>
                  <td>
                    {leg.actualDeparture ? displayDate(leg.actualDeparture) : '—'} →{' '}
                    {leg.actualArrival ? displayDate(leg.actualArrival) : '—'}
                  </td>
                  {canWrite && (
                    <td className="actions">
                      {writable(leg) && canStart(leg) && (
                        <button
                          type="button"
                          disabled={pinned.changed}
                          onClick={() => open({ leg, kind: 'start' })}
                        >
                          Start
                        </button>
                      )}
                      {writable(leg) && leg.legStatus === 'IN_TRANSIT' && (
                        <button
                          type="button"
                          disabled={pinned.changed}
                          onClick={() => open({ leg, kind: 'complete' })}
                        >
                          Complete
                        </button>
                      )}
                      {writable(leg) && departed(leg) && (
                        <>
                          <button
                            type="button"
                            disabled={pinned.changed}
                            onClick={() => open({ leg, kind: 'milestone' })}
                          >
                            Add update
                          </button>
                          <button
                            type="button"
                            disabled={pinned.changed}
                            onClick={() => open({ leg, kind: 'welfare' })}
                          >
                            Add welfare check
                          </button>
                        </>
                      )}
                      {canHandover(leg) && (
                        <button
                          type="button"
                          disabled={pinned.changed}
                          onClick={() => open({ leg, kind: 'handover' })}
                        >
                          Handover
                        </button>
                      )}
                      {incidentsEnabled() && writable(leg) && departed(leg) && (
                        <button type="button" onClick={() => open({ leg, kind: 'incidents' })}>
                          {session.role === 'DRIVER' ? 'Report incident' : 'Incidents'}
                        </button>
                      )}
                      {leg.sequenceNo === 1 && leg.legStatus === 'CONFIRMED' && (
                        <span className="muted">Departs from the departure page</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {panel && (
        <div className="execution-panel">
          {panel.kind === 'start' || panel.kind === 'complete' ? (
            <TransitionFormView
              key={`${panel.kind}-${panel.leg.legId}`}
              o={o}
              leg={panel.leg}
              pinned={pinned}
              kind={panel.kind}
            />
          ) : panel.kind === 'milestone' ? (
            <MilestoneFormView key={`m-${panel.leg.legId}`} o={o} leg={panel.leg} pinned={pinned} />
          ) : panel.kind === 'handover' ? (
            <LegHandovers
              key={`h-${panel.leg.legId}`}
              legId={panel.leg.legId}
              asDriver={session.role === 'DRIVER'}
              finalLeg={panel.leg.sequenceNo === lastLeg}
              onRecorded={async (message) => {
                setNotice(message);
                await pinned.repin();
              }}
            />
          ) : panel.kind === 'incidents' ? (
            session.role === 'DRIVER' ? (
              <ReportIncidentForm
                key={`i-${panel.leg.legId}`}
                legId={panel.leg.legId}
                asDriver
                onReported={(i) =>
                  setNotice(`Incident ${i.incidentId} reported. Staff have been alerted.`)
                }
              />
            ) : (
              <LegIncidents key={`i-${panel.leg.legId}`} legId={panel.leg.legId} />
            )
          ) : (
            <WelfareFormView
              key={`w-${panel.leg.legId}-${panel.correcting?.welfareLogId ?? 'new'}`}
              o={o}
              leg={panel.leg}
              pinned={pinned}
              correcting={panel.correcting ?? null}
              onDone={(r) =>
                r.incidentId !== null &&
                setNotice(
                  `URGENT recorded: incident ${r.incidentId} was opened for staff response.`,
                )
              }
            />
          )}
          <button type="button" onClick={() => setPanel(null)}>
            Close
          </button>
        </div>
      )}
      {!incidentsEnabled() ? (
        session.role !== 'CUSTOMER' && (
          <Notice>
            Incident reporting and plan adjustments are not available on this server. Record urgent
            welfare as an URGENT welfare check.
          </Notice>
        )
      ) : (
        <>
          {(session.role === 'MANAGER' || session.role === 'COORDINATOR') && (
            <PlanAdjustments planId={o.planId} manager={session.role === 'MANAGER'} />
          )}
          {session.role === 'CUSTOMER' && <CustomerAdjustments orderId={o.orderId} />}
        </>
      )}
      <section className="card" aria-label="Updates">
        <h2>Updates ({o.milestoneCount})</h2>
        {!o.milestones.length ? (
          <p>No updates recorded{session.role === 'CUSTOMER' ? ' for you yet' : ''}.</p>
        ) : (
          <ul className="execution-list">
            {o.milestones.map((m) => (
              <li key={m.milestoneId}>
                <strong>{milestoneLabels[m.milestoneType] ?? m.milestoneType}</strong> · leg{' '}
                {o.legs.find((l) => l.legId === m.legId)?.sequenceNo ?? m.legId} ·{' '}
                {displayDate(m.occurredAt)}
                <span className="muted">
                  {' '}
                  (recorded {displayDate(m.recordedAt)},{' '}
                  {sourceLabels[m.sourceCode as keyof typeof sourceLabels] ?? m.sourceCode}
                  {m.sourceReference && `: ${m.sourceReference}`})
                </span>
                {m.locationDescription && <div>Location: {m.locationDescription}</div>}
                {m.latitude && m.longitude && (
                  <div>
                    Coordinates: {m.latitude}, {m.longitude}
                  </div>
                )}
                {m.estimatedArrivalAt && (
                  <div>Estimated arrival: {displayDate(m.estimatedArrivalAt)}</div>
                )}
                {m.delayReason && <div>Delay: {m.delayReason}</div>}
                {m.publicNote && <div>{m.publicNote}</div>}
                {m.internalNotes && <div className="muted">Internal: {m.internalNotes}</div>}
                {session.role !== 'CUSTOMER' && !m.customerVisible && (
                  <span className="badge warn">Staff only</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" aria-label="Welfare checks">
        <h2>Welfare checks ({o.welfareCount})</h2>
        {!o.welfareLogs.length ? (
          <p>No welfare checks recorded{session.role === 'CUSTOMER' ? ' for you yet' : ''}.</p>
        ) : (
          <ul className="execution-list">
            {o.welfareLogs.map((w) => {
              const leg = o.legs.find((l) => l.legId === w.legId);
              const corrected = o.welfareLogs.some((x) => x.supersedesLogId === w.welfareLogId);
              return (
                <li key={w.welfareLogId}>
                  <strong>
                    <span className={`badge ${w.healthStatus === 'NORMAL' ? '' : 'warn'}`}>
                      {w.healthStatus}
                    </span>
                  </strong>{' '}
                  · leg {leg?.sequenceNo ?? w.legId} · {displayDate(w.occurredAt)}
                  <span className="muted">
                    {' '}
                    (entry {w.welfareLogId}, recorded {displayDate(w.recordedAt)})
                  </span>
                  {w.supersedesLogId !== null && <div>Corrects entry {w.supersedesLogId}.</div>}
                  {corrected && <div className="muted">Superseded by a later correction.</div>}
                  <div>
                    {[
                      w.temperatureCelsius && `${w.temperatureCelsius} °C`,
                      w.waterIntakeLiters && `water ${w.waterIntakeLiters} L`,
                      w.feedIntakeKg && `feed ${w.feedIntakeKg} kg`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {w.publicNote && <div>{w.publicNote}</div>}
                  {w.behaviorNotes && <div className="muted">Behaviour: {w.behaviorNotes}</div>}
                  {w.careNotes && <div className="muted">Care: {w.careNotes}</div>}
                  {session.role !== 'CUSTOMER' && !w.customerVisible && (
                    <span className="badge warn">Staff only</span>
                  )}
                  {leg && writable(leg) && !corrected && (
                    <button
                      type="button"
                      disabled={pinned.changed}
                      onClick={() => open({ leg, kind: 'welfare', correcting: w })}
                    >
                      Correct
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {(pages > 1 || page > 0) && (
        <Pagination
          page={page}
          pages={pages}
          onChange={(next) => setParams({ page: String(next) })}
          pending={query.isFetching}
        />
      )}
    </>
  );
}

/** Staff record later-leg progress and welfare; customers read what is shared with them. */
export function ExecutionPage() {
  const session = useSession();
  const orderId = Number(useParams().id);
  if (!session) return null;
  if (!['MANAGER', 'COORDINATOR', 'DRIVER', 'CUSTOMER'].includes(session.role))
    return <Notice>You do not have access to trip progress.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This request is unavailable.</Notice>;
  const back =
    session.role === 'CUSTOMER'
      ? `/customer/requests/${orderId}`
      : session.role === 'DRIVER'
        ? '/driver'
        : session.role === 'MANAGER'
          ? `/manager/requests/${orderId}`
          : `/staff/cases/${orderId}`;
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">TRIP PROGRESS</small>
          <h1>Trip progress</h1>
          <p>Leg progress, recorded updates and welfare checks.</p>
        </div>
        <Link to={back}>Back</Link>
      </header>
      <Workspace key={`${session.generation}/${orderId}`} orderId={orderId} />
    </>
  );
}

/** Entry once the trip is under way. */
const executionStatuses = ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
export function ExecutionLink({ orderId, orderStatus }: { orderId: number; orderStatus: string }) {
  const session = useSession();
  if (!session || !executionStatuses.includes(orderStatus)) return null;
  if (!['MANAGER', 'COORDINATOR', 'CUSTOMER', 'DRIVER'].includes(session.role)) return null;
  return (
    <Link className="button" to={executionPath(session.role, orderId)}>
      Trip progress
    </Link>
  );
}
