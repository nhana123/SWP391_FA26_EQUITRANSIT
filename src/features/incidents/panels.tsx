import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { displayDate, validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice } from '../../shared/ui/common';
import { incidentsApi } from './api';
import {
  changeSummary,
  errorHelp,
  incidentTypes,
  severities,
  typeLabels,
  type Adjustment,
  type Incident,
  type IncidentType,
  type Severity,
} from './contracts';

export const incidentKeys = {
  leg: (generation: string, legId: number) =>
    [...queryKeys.session(generation), 'incidents', 'leg', legId] as const,
  plan: (generation: string, planId: number) =>
    [...queryKeys.session(generation), 'incidents', 'plan', planId] as const,
  customer: (generation: string, orderId: number) =>
    [...queryKeys.session(generation), 'incidents', 'customer', orderId] as const,
};
const notDeployed = (error: unknown) =>
  error instanceof ApiError && error.status === 404 && !error.code;

/**
 * F13 writes have no operation ID, so the server cannot de-duplicate a retry.
 * After an uncertain failure the form locks until the user reloads and checks
 * whether the first attempt was recorded.
 */
export function useWrite(reload: () => Promise<unknown>, help: Record<string, string> = errorHelp) {
  const action = useAction();
  const [unknown, setUnknown] = useState(false);
  const code = action.error instanceof ApiError ? action.error.code : undefined;
  return {
    pending: action.pending,
    locked: action.pending || unknown,
    run(work: () => Promise<void>) {
      if (unknown) return;
      void action.run(async () => {
        try {
          await work();
        } catch (error) {
          if (error instanceof ApiError && error.uncertain) setUnknown(true);
          throw error;
        }
      });
    },
    notice: (
      <ErrorNotice error={action.error}>
        {code && help[code] && <p>{help[code]}</p>}
        {unknown && (
          <>
            <p>
              The result is unknown and this action cannot be safely repeated. Reload and check the
              list before trying again.
            </p>
            <button
              type="button"
              onClick={() =>
                void reload().then(() => {
                  setUnknown(false);
                  action.setError(null);
                })
              }
            >
              Reload and check
            </button>
          </>
        )}
      </ErrorNotice>
    ),
  };
}

function TextField({
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

/** Report form; a driver uses the driver endpoint for their own ROAD leg. */
export function ReportIncidentForm({
  legId,
  asDriver,
  onReported,
}: {
  legId: number;
  asDriver: boolean;
  onReported: (incident: Incident) => Promise<void> | void;
}) {
  const { generation } = useSession()!;
  const [f, setF] = useState({
    incidentType: '' as IncidentType | '',
    severityLevel: '' as Severity | '',
    incidentTime: '',
    description: '',
    immediateActionNotes: '',
    emergencyContact: '',
    evidence: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const write = useWrite(() =>
    queryClient.invalidateQueries({ queryKey: incidentKeys.leg(generation, legId) }),
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (!f.incidentType) next.incidentType = 'Choose the kind of incident.';
    if (!f.severityLevel) next.severityLevel = 'Choose the severity.';
    const time = f.incidentTime.trim();
    if (time && (!validOffsetDate(time) || Date.parse(time) > Date.now()))
      next.incidentTime = 'Use a past ISO date with offset, or leave empty for now.';
    const description = f.description.trim();
    if (!description) next.description = 'Describe what happened.';
    const keys = f.evidence
      .split(/[\s,]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    const evidence = keys.length ? JSON.stringify(keys) : null;
    if (evidence && evidence.length > 4000) next.evidence = 'Too many evidence keys.';
    setErrors(next);
    if (Object.keys(next).length) return;
    write.run(async () => {
      const body = {
        incidentType: f.incidentType as IncidentType,
        severityLevel: f.severityLevel as Severity,
        incidentTime: time || null,
        description,
        immediateActionNotes: f.immediateActionNotes.trim() || null,
        emergencyContact: f.emergencyContact.trim() || null,
        evidenceFilesJson: evidence,
      };
      const incident = await (asDriver ? incidentsApi.reportAsDriver : incidentsApi.reportAsStaff)(
        legId,
        body,
      );
      await onReported(incident);
    });
  }
  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Report incident">
      <h3>Report incident</h3>
      <p className="muted">
        In a welfare emergency, give first aid and call a vet now — reporting never waits for any
        cost approval.
      </p>
      {write.notice}
      <fieldset className="form-grid" disabled={write.locked}>
        <Field label="Incident type" error={errors.incidentType}>
          {(id) => (
            <select
              id={id}
              value={f.incidentType}
              onChange={(e) => set({ incidentType: e.target.value as IncidentType })}
            >
              <option value="" disabled>
                Choose…
              </option>
              {incidentTypes.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Severity" error={errors.severityLevel}>
          {(id) => (
            <select
              id={id}
              value={f.severityLevel}
              onChange={(e) => set({ severityLevel: e.target.value as Severity })}
            >
              <option value="" disabled>
                Choose…
              </option>
              {severities.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </Field>
        <TextField
          label="Incident time (optional)"
          hint="ISO date with offset; empty means now."
          max={35}
          value={f.incidentTime}
          onChange={(incidentTime) => set({ incidentTime })}
          error={errors.incidentTime}
        />
        <TextField
          label="What happened"
          area
          max={2000}
          value={f.description}
          onChange={(description) => set({ description })}
          error={errors.description}
        />
        <TextField
          label="Immediate action taken (optional)"
          area
          max={2000}
          value={f.immediateActionNotes}
          onChange={(immediateActionNotes) => set({ immediateActionNotes })}
        />
        <TextField
          label="Emergency contact (optional)"
          max={500}
          value={f.emergencyContact}
          onChange={(emergencyContact) => set({ emergencyContact })}
        />
        <TextField
          label="Evidence file keys (optional)"
          hint="Separated by commas."
          area
          max={3000}
          value={f.evidence}
          onChange={(evidence) => set({ evidence })}
          error={errors.evidence}
        />
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={write.locked}>
          {write.pending ? 'Sending…' : 'Report incident'}
        </button>
      </div>
    </form>
  );
}

function IncidentRow({ incident, legId }: { incident: Incident; legId: number }) {
  const { generation } = useSession()!;
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: incidentKeys.leg(generation, legId) });
  const write = useWrite(reload);
  const open = incident.status === 'REPORTED' || incident.status === 'ACKNOWLEDGED';
  return (
    <li>
      <strong>
        {typeLabels[incident.incidentType as IncidentType] ?? incident.incidentType} ·{' '}
        <span
          className={`badge ${incident.severityLevel === 'CRITICAL' || incident.severityLevel === 'HIGH' ? 'warn' : ''}`}
        >
          {incident.severityLevel}
        </span>{' '}
        · <span className="badge">{incident.status}</span>
      </strong>
      <div>
        Incident {incident.incidentId}
        {incident.incidentTime && `, ${displayDate(incident.incidentTime)}`}; reported by{' '}
        {incident.reporterName ?? `staff ${incident.reportedBy}`}.
      </div>
      <div>{incident.description}</div>
      {incident.immediateActionNotes && (
        <div>Immediate action: {incident.immediateActionNotes}</div>
      )}
      {incident.acknowledgedAt && (
        <div className="muted">
          Acknowledged {displayDate(incident.acknowledgedAt)} by{' '}
          {incident.acknowledgedByName ?? incident.acknowledgedBy}
        </div>
      )}
      {incident.resolvedAt && (
        <div className="muted">
          Resolved {displayDate(incident.resolvedAt)}: {incident.resolutionNotes}
        </div>
      )}
      {open && (
        <div className="incident-actions">
          {write.notice}
          <TextField
            label={`Notes for incident ${incident.incidentId}`}
            hint="Required to resolve."
            area
            max={2000}
            value={notes}
            onChange={setNotes}
            error={error}
          />
          <div className="actions">
            {incident.status === 'REPORTED' && (
              <button
                type="button"
                disabled={write.locked}
                onClick={() =>
                  write.run(async () => {
                    await incidentsApi.acknowledge(incident.incidentId, notes.trim() || null);
                    setNotes('');
                    await reload();
                  })
                }
              >
                Acknowledge
              </button>
            )}
            <button
              type="button"
              disabled={write.locked}
              onClick={() => {
                if (!notes.trim()) return setError('Resolution notes are required to resolve.');
                setError('');
                write.run(async () => {
                  await incidentsApi.resolve(incident.incidentId, notes.trim());
                  setNotes('');
                  await reload();
                });
              }}
            >
              Resolve
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Staff view of a leg's incidents with acknowledge/resolve. */
export function LegIncidents({ legId }: { legId: number }) {
  const { generation } = useSession()!;
  const query = useQuery({
    queryKey: incidentKeys.leg(generation, legId),
    queryFn: ({ signal }) => incidentsApi.forLeg(legId, signal),
    retry: false,
  });
  return (
    <section className="card" aria-label={`Incidents for leg ${legId}`}>
      <h3>Incidents</h3>
      {query.isPending ? (
        <Loading />
      ) : notDeployed(query.error) ? (
        <Notice>Incident management is not available on this server yet.</Notice>
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : !query.data.length ? (
        <p>No incidents reported on this leg.</p>
      ) : (
        <ul className="execution-list">
          {query.data.map((i) => (
            <IncidentRow key={i.incidentId} incident={i} legId={legId} />
          ))}
        </ul>
      )}
      <ReportIncidentForm
        legId={legId}
        asDriver={false}
        onReported={() =>
          queryClient.invalidateQueries({ queryKey: incidentKeys.leg(generation, legId) })
        }
      />
    </section>
  );
}

const money = /^\d{1,14}(\.\d{1,2})?$/;
function ProposeForm({ planId }: { planId: number }) {
  const { generation } = useSession()!;
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: incidentKeys.plan(generation, planId) });
  const write = useWrite(reload);
  const [f, setF] = useState({
    incidentId: '',
    changeRequestId: '',
    summary: '',
    details: '',
    cost: '',
    customerDescription: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [errors, setErrors] = useState<FieldErrors>({});
  function submit(e: FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    const optionalId = (name: 'incidentId' | 'changeRequestId') => {
      const t = f[name].trim();
      if (t && (!/^\d+$/.test(t) || Number(t) < 1))
        next[name] = 'Use a positive ID or leave empty.';
      return t ? Number(t) : null;
    };
    const incidentId = optionalId('incidentId');
    const changeRequestId = optionalId('changeRequestId');
    const summary = f.summary.trim();
    if (!summary) next.summary = 'Summarize the proposed change.';
    const cost = f.cost.trim();
    if (!money.test(cost)) next.cost = 'Enter 0 or a positive amount with up to 2 decimals.';
    setErrors(next);
    if (Object.keys(next).length) return;
    write.run(async () => {
      await incidentsApi.propose(planId, {
        incidentId,
        changeRequestId,
        proposedChanges: JSON.stringify(
          f.details.trim() ? { summary, details: f.details.trim() } : { summary },
        ),
        additionalCostEstimate: cost,
        customerDescription: f.customerDescription.trim() || null,
      });
      setF({
        incidentId: '',
        changeRequestId: '',
        summary: '',
        details: '',
        cost: '',
        customerDescription: '',
      });
      await reload();
    });
  }
  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Propose adjustment">
      <h3>Propose an adjustment</h3>
      <p className="muted">
        With an additional cost above 0 the customer must accept it before a manager can approve.
        Approval creates a new plan version; the current one is kept as history.
      </p>
      {write.notice}
      <fieldset className="form-grid" disabled={write.locked}>
        <TextField
          label="Related incident ID (optional)"
          max={15}
          value={f.incidentId}
          onChange={(incidentId) => set({ incidentId })}
          error={errors.incidentId}
        />
        <TextField
          label="Related change request ID (optional)"
          max={15}
          value={f.changeRequestId}
          onChange={(changeRequestId) => set({ changeRequestId })}
          error={errors.changeRequestId}
        />
        <TextField
          label="Summary"
          max={500}
          value={f.summary}
          onChange={(summary) => set({ summary })}
          error={errors.summary}
        />
        <TextField
          label="Details (optional)"
          area
          max={2000}
          value={f.details}
          onChange={(details) => set({ details })}
        />
        <TextField
          label="Additional cost estimate"
          hint="0 when the customer is not charged."
          max={17}
          value={f.cost}
          onChange={(cost) => set({ cost })}
          error={errors.cost}
        />
        <TextField
          label="Explanation for the customer (optional)"
          area
          max={2000}
          value={f.customerDescription}
          onChange={(customerDescription) => set({ customerDescription })}
        />
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={write.locked}>
          {write.pending ? 'Sending…' : 'Propose adjustment'}
        </button>
      </div>
    </form>
  );
}

function AdjustmentRow({
  a,
  planId,
  manager,
}: {
  a: Adjustment;
  planId: number;
  manager: boolean;
}) {
  const { generation } = useSession()!;
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: incidentKeys.plan(generation, planId) });
  const write = useWrite(reload);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState('');
  const undecided = a.approvalStatus === 'PROPOSED' || a.approvalStatus === 'CUSTOMER_PENDING';
  const consented = a.customerDecision === 'ACCEPTED';
  return (
    <li>
      <strong>
        Adjustment {a.adjustmentId}: {changeSummary(a.proposedChanges)}
      </strong>
      <div>
        Status <span className="badge">{a.approvalStatus}</span> · customer{' '}
        <span className={`badge ${consented ? '' : 'warn'}`}>{a.customerDecision}</span> ·
        additional cost {a.additionalCostEstimate}
      </div>
      <div className="muted">
        Proposed {a.proposedAt ? displayDate(a.proposedAt) : ''} by{' '}
        {a.proposerName ?? `staff ${a.proposedBy}`}
        {a.incidentId !== null && ` · incident ${a.incidentId}`}
        {a.changeRequestId !== null && ` · change request ${a.changeRequestId}`}
      </div>
      {a.customerResponseNotes && <div>Customer: {a.customerResponseNotes}</div>}
      {result && <Notice>{result}</Notice>}
      {manager && undecided && (
        <div className="incident-actions">
          {write.notice}
          {!consented && (
            <p className="muted">Approval waits for the customer to accept the additional cost.</p>
          )}
          <TextField
            label={`Decision notes for adjustment ${a.adjustmentId} (optional)`}
            area
            max={2000}
            value={notes}
            onChange={setNotes}
          />
          <div className="actions">
            <button
              type="button"
              disabled={write.locked || !consented}
              onClick={() =>
                write.run(async () => {
                  const r = await incidentsApi.approve(a.adjustmentId, notes.trim() || null);
                  setResult(
                    `Approved: plan version ${r.newVersionNo} (plan ${r.newPlanId}) now applies; ${r.evolvedLegCount} legs carried over.`,
                  );
                  await reload();
                })
              }
            >
              Approve
            </button>
            <button
              type="button"
              disabled={write.locked}
              onClick={() =>
                write.run(async () => {
                  await incidentsApi.reject(a.adjustmentId, notes.trim() || null);
                  await reload();
                })
              }
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Staff: adjustments of the current plan; managers decide. */
export function PlanAdjustments({ planId, manager }: { planId: number; manager: boolean }) {
  const { generation } = useSession()!;
  const query = useQuery({
    queryKey: incidentKeys.plan(generation, planId),
    queryFn: ({ signal }) => incidentsApi.adjustments(planId, signal),
    retry: false,
  });
  return (
    <section className="card" aria-label="Operational adjustments">
      <h2>Operational adjustments</h2>
      {query.isPending ? (
        <Loading />
      ) : notDeployed(query.error) ? (
        <Notice>Operational adjustments are not available on this server yet.</Notice>
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : !query.data.length ? (
        <p>No adjustments proposed for this plan.</p>
      ) : (
        <ul className="execution-list">
          {query.data.map((a) => (
            <AdjustmentRow key={a.adjustmentId} a={a} planId={planId} manager={manager} />
          ))}
        </ul>
      )}
      <ProposeForm planId={planId} />
    </section>
  );
}

function DecisionForm({
  orderId,
  adjustmentId,
  cost,
  onDone,
}: {
  orderId: number;
  adjustmentId: number;
  cost: string;
  onDone: () => Promise<unknown>;
}) {
  const write = useWrite(onDone);
  const [decision, setDecision] = useState<'' | 'ACCEPTED' | 'REJECTED'>('');
  const [notes, setNotes] = useState('');
  const [sure, setSure] = useState(false);
  const [error, setError] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!decision) return setError('Choose accept or reject.');
    if (!sure) return setError('Confirm your decision.');
    setError('');
    write.run(async () => {
      await incidentsApi.decide(orderId, adjustmentId, {
        decision,
        responseNotes: notes.trim() || null,
      });
      await onDone();
    });
  }
  return (
    <form onSubmit={submit} noValidate aria-label={`Decide on adjustment ${adjustmentId}`}>
      {write.notice}
      <fieldset disabled={write.locked}>
        <Field label="Your decision" error={error}>
          {(id) => (
            <select
              id={id}
              value={decision}
              onChange={(e) => setDecision(e.target.value as 'ACCEPTED' | 'REJECTED')}
            >
              <option value="" disabled>
                Choose…
              </option>
              <option value="ACCEPTED">Accept the additional cost</option>
              <option value="REJECTED">Reject</option>
            </select>
          )}
        </Field>
        <TextField label="Notes (optional)" area max={2000} value={notes} onChange={setNotes} />
        <label className="horse-choice">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>
            I understand that accepting agrees to an additional cost of {cost}. It does not make a
            payment; the manager still has to approve the change.
          </span>
        </label>
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={write.locked}>
          {write.pending ? 'Sending…' : 'Send decision'}
        </button>
      </div>
    </form>
  );
}

/** Customer: redacted adjustments of their own order and their consent decision. */
export function CustomerAdjustments({ orderId }: { orderId: number }) {
  const { generation } = useSession()!;
  const query = useQuery({
    queryKey: incidentKeys.customer(generation, orderId),
    queryFn: ({ signal }) => incidentsApi.customerAdjustments(orderId, signal),
    retry: false,
  });
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: incidentKeys.customer(generation, orderId) });
  let body: ReactNode;
  if (query.isPending) body = <Loading />;
  else if (notDeployed(query.error))
    body = <Notice>Trip changes are not available on this server yet.</Notice>;
  else if (query.error) body = <ErrorNotice error={query.error} />;
  else if (!query.data.length) body = <p>No changes have been proposed for your trip.</p>;
  else
    body = (
      <ul className="execution-list">
        {query.data.map((a) => (
          <li key={a.adjustmentId}>
            <strong>{a.summary ?? `Change ${a.adjustmentId}`}</strong>
            <div>
              Additional cost {a.additionalCost} · your decision{' '}
              <span className="badge">{a.customerDecision}</span> · status{' '}
              <span className="badge">{a.approvalStatus}</span>
            </div>
            {a.customerResponseNotes && <div>Your notes: {a.customerResponseNotes}</div>}
            {a.customerDecision === 'PENDING' && (
              <DecisionForm
                orderId={orderId}
                adjustmentId={a.adjustmentId}
                cost={a.additionalCost}
                onDone={reload}
              />
            )}
          </li>
        ))}
      </ul>
    );
  return (
    <section className="card" aria-label="Proposed trip changes">
      <h2>Proposed trip changes</h2>
      {body}
    </section>
  );
}
