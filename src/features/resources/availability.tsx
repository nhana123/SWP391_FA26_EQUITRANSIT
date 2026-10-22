import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import type { z } from 'zod';
import { idSchema, type orderStatusSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { displayDate, validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice } from '../../shared/ui/common';
import { quotationParent } from '../quotations/navigation';
import { usePreparationCase } from '../quotations/source';
import { resourcesApi } from './api';
import {
  blockerLabels,
  probeMode,
  type Availability,
  type AvailabilityRequest,
  type ProbeKind,
  type ResourceCandidate,
} from './contracts';
import { ResourcePicker } from './ResourcePicker';
import { DeploymentNotice, schemaPending } from './ManagerResourcesPage';
import './resources.css';

type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Order statuses the BE probes against the current assessed revision. */
export const probeStatuses: readonly OrderStatus[] = [
  'APPROVED',
  'IN_PREPARATION',
  'CONFIRMED',
  'IN_TRANSIT',
  'DELIVERED',
];

const probeHelp: Record<string, string> = {
  RESOURCE_MODE_INVALID: 'Vehicles are checked for ROAD and stalls for AIR only.',
  RESOURCE_REVISION_CONFLICT:
    'The request revision changed or is not eligible. Reload the case and check again.',
  RESOURCE_NOT_FOUND: 'No such resource exists.',
  CASE_NOT_FOUND: 'This case is not available to you.',
  RESOURCE_BUSY: 'The resource catalogue is busy. Try again in a moment.',
  RESOURCE_LOCK_BUSY: 'The resource catalogue is busy. Try again in a moment.',
};
const statusText: Record<Availability['status'], string> = {
  AVAILABLE: 'Available for this window',
  UNAVAILABLE: 'Unavailable',
  PENDING: 'Pending — evidence is missing or ambiguous',
};

type Probe = {
  kind: ProbeKind;
  resourceId: string;
  start: string;
  end: string;
  carrierSupplierId: string;
  legId: string;
};
const empty: Probe = {
  kind: 'STALL',
  resourceId: '',
  start: '',
  end: '',
  carrierSupplierId: '',
  legId: '',
};

const optionalId = (v: string) => (v.trim() ? Number(v.trim()) : null);
const validId = (v: string) =>
  idSchema.safeParse(Number(v.trim())).success && /^\d+$/.test(v.trim());

export function validateProbe(p: Probe): FieldErrors {
  const errors: FieldErrors = {};
  if (!validId(p.resourceId)) errors.resourceId = 'Choose a resource (or enter its ID).';
  if (!validOffsetDate(p.start.trim())) errors.start = 'Choose a date and time.';
  if (!validOffsetDate(p.end.trim())) errors.end = 'Choose a date and time.';
  else if (!errors.start && Date.parse(p.end) <= Date.parse(p.start))
    errors.end = 'The end must follow the start.';
  if (p.carrierSupplierId.trim() && !validId(p.carrierSupplierId))
    errors.carrierSupplierId = 'Use a supplier ID or leave empty.';
  if (p.legId.trim() && !validId(p.legId)) errors.legId = 'Use a leg ID or leave empty.';
  return errors;
}

function ProbeForm({
  orderId,
  revisionId,
  onReload,
}: {
  orderId: number;
  revisionId: number;
  onReload: () => void;
}) {
  const [input, setInput] = useState<Probe>(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  // The result belongs to the exact input that produced it; editing clears it.
  const [result, setResult] = useState<{ probe: Probe; availability: Availability } | null>(null);
  const action = useAction();
  const code = action.error instanceof ApiError ? action.error.code : undefined;
  // A chosen resource belongs to the window it was found in.
  const [picked, setPicked] = useState<ResourceCandidate | null>(null);
  const update = (patch: Partial<Probe>) => {
    setResult(null);
    action.setError(null);
    const contextChanged = Object.keys(patch).some((k) => k !== 'resourceId');
    if (contextChanged && picked) {
      setPicked(null);
      patch = { ...patch, resourceId: '' };
    }
    setInput((p) => ({ ...p, ...patch }));
  };
  const windowErrors = validateProbe({ ...input, resourceId: '1' });
  const search: AvailabilityRequest | null = Object.keys(windowErrors).length
    ? null
    : {
        orderId,
        revisionId,
        mode: probeMode[input.kind],
        start: input.start.trim(),
        end: input.end.trim(),
        carrierSupplierId: input.kind === 'STALL' ? optionalId(input.carrierSupplierId) : null,
        legId: optionalId(input.legId),
      };

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = validateProbe(input);
    setErrors(next);
    if (Object.keys(next).length) return;
    const probe = input;
    void action.run(async () => {
      const availability = await resourcesApi.probe(probe.kind, Number(probe.resourceId), {
        orderId,
        revisionId,
        mode: probeMode[probe.kind],
        start: probe.start.trim(),
        end: probe.end.trim(),
        carrierSupplierId: probe.kind === 'STALL' ? optionalId(probe.carrierSupplierId) : null,
        legId: optionalId(probe.legId),
      });
      setResult({ probe, availability });
    });
  }
  const a = result?.availability;
  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Check resource availability">
      <h2>Check a resource</h2>
      <p className="muted">
        A read-only check for revision ID {revisionId}. It does not reserve or assign anything;
        planning rechecks availability when an assignment is saved.
      </p>
      <fieldset className="form-grid" disabled={action.pending}>
        <Field label="Resource type">
          {(id) => (
            <select
              id={id}
              value={input.kind}
              onChange={(e) => update({ kind: e.target.value as ProbeKind })}
            >
              <option value="STALL">Air stall (AIR)</option>
              <option value="VEHICLE">Road vehicle (ROAD)</option>
            </select>
          )}
        </Field>
        <Field label="Window start" error={errors.start}>
          {(id) => (
            <DateTimeInput id={id} value={input.start} onChange={(start) => update({ start })} />
          )}
        </Field>
        <Field label="Window end" error={errors.end}>
          {(id) => <DateTimeInput id={id} value={input.end} onChange={(end) => update({ end })} />}
        </Field>
        {input.kind === 'STALL' && (
          <Field
            label="Carrier supplier ID (optional)"
            hint="Selects the carrier's fit policy context."
            error={errors.carrierSupplierId}
          >
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                maxLength={19}
                value={input.carrierSupplierId}
                onChange={(e) => update({ carrierSupplierId: e.target.value })}
              />
            )}
          </Field>
        )}
        <Field
          label="Leg ID (optional)"
          hint="Only when replacing this leg's own assignment."
          error={errors.legId}
        >
          {(id) => (
            <input
              id={id}
              inputMode="numeric"
              maxLength={19}
              value={input.legId}
              onChange={(e) => update({ legId: e.target.value })}
            />
          )}
        </Field>
        <ResourcePicker
          key={input.kind}
          kind={input.kind}
          request={search}
          selected={picked}
          onSelect={(c) => {
            setResult(null);
            setPicked(c);
            setInput((p) => ({ ...p, resourceId: c ? String(c.id) : '' }));
          }}
          error={errors.resourceId}
          waitingHint="Choose a valid window start and end to search resources."
          anyStatus
          fallback={
            <Field label="Resource ID" error={errors.resourceId}>
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  maxLength={19}
                  value={input.resourceId}
                  onChange={(e) => update({ resourceId: e.target.value })}
                />
              )}
            </Field>
          }
        />
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={action.pending}>
          {action.pending ? 'Checking…' : 'Check availability'}
        </button>
      </div>
      {schemaPending(action.error) ? (
        <DeploymentNotice />
      ) : (
        <ErrorNotice error={action.error}>
          {code && probeHelp[code] && <p>{probeHelp[code]}</p>}
          {code === 'RESOURCE_REVISION_CONFLICT' && (
            <button type="button" onClick={onReload}>
              Reload case
            </button>
          )}
        </ErrorNotice>
      )}
      {a && (
        <section className="notice probe-result" role="status" aria-label="Availability result">
          <p>
            <strong>
              {a.kind === 'STALL' ? 'Stall' : 'Vehicle'} {a.resourceId}: {statusText[a.status]}
            </strong>
          </p>
          <p className="muted">
            Checked {displayDate(a.asOf)} for {displayDate(result.probe.start)} →{' '}
            {displayDate(result.probe.end)}. Resource version {a.recordVersion}
            {a.policyId !== null && `; fit policy ${a.policyId}`}.
          </p>
          {a.blockers.length > 0 && (
            <ul aria-label="Blockers">
              {a.blockers.map((b) => (
                <li key={b}>
                  {blockerLabels[b]} <small>({b})</small>
                </li>
              ))}
            </ul>
          )}
          <p>
            {a.carrierConfirmed
              ? 'Carrier acceptance is recorded.'
              : 'Carrier acceptance is not confirmed by this check.'}{' '}
            Nothing has been reserved.
          </p>
        </section>
      )}
    </form>
  );
}

/** Manager or the assigned Coordinator: probe vehicles/stalls for the current revision. */
export function CaseAvailabilityPage() {
  const orderId = Number(useParams().id);
  const session = useSession();
  const query = usePreparationCase(orderId);
  if (!session) return null;
  if (session.role !== 'MANAGER' && session.role !== 'COORDINATOR')
    return <Notice>You do not have access to resource availability.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This request is unavailable.</Notice>;
  const parent = quotationParent(session.role, orderId);
  const heading = (
    <header className="page-heading">
      <div>
        <small className="eyebrow">RESOURCE AVAILABILITY</small>
        <h1>Check resource availability</h1>
        <p>Test whether a vehicle or stall can serve this case. Results are advisory.</p>
      </div>
      <Link to={parent}>Back to the case</Link>
    </header>
  );
  if (query.isPending)
    return (
      <>
        {heading}
        <Loading />
      </>
    );
  if (query.error)
    return (
      <>
        {heading}
        <ErrorNotice error={query.error} />
      </>
    );
  const current = query.data;
  const revisionId = current.currentRevisionId;
  if (revisionId === null || !probeStatuses.includes(current.orderStatus))
    return (
      <>
        {heading}
        <Notice>
          Availability can be checked once the request is approved. This request is{' '}
          {current.orderStatus}.
        </Notice>
      </>
    );
  return (
    <>
      {heading}
      <Notice>
        Request {current.orderNumber}, revision ID {revisionId}.
      </Notice>
      <ProbeForm
        key={`${session.generation}/${orderId}/${revisionId}`}
        orderId={orderId}
        revisionId={revisionId}
        onReload={() => void query.refetch()}
      />
    </>
  );
}

/** Entry from the Manager and Coordinator case pages. */
export function AvailabilityLink({
  orderId,
  orderStatus,
}: {
  orderId: number;
  orderStatus: OrderStatus;
}) {
  const session = useSession();
  if (!session || (session.role !== 'MANAGER' && session.role !== 'COORDINATOR')) return null;
  if (!probeStatuses.includes(orderStatus)) return null;
  return (
    <Link className="button" to={`${quotationParent(session.role, orderId)}/availability`}>
      Check resource availability
    </Link>
  );
}
