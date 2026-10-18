import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { quotationParent } from '../quotations/navigation';
import { usePreparationCase } from '../quotations/source';
import { PLAN_PAGE_SIZE, plansApi } from './api';
import { legModes, type Candidate, type LegMode } from './contracts';
import { CommandForm, StaleBanner, planKeys, usePinnedVersion, type Pinned } from './hooks';
import { TextInput, dateHint } from './ui';
import { emptyLeg, legToForm, validateLegs, type LegForm } from './validation';
import './plans.css';

export const schemaPending = (error: unknown) => error instanceof ApiError && error.status === 503;
export function DeploymentNotice({ retry }: { retry: () => void }) {
  return (
    <div className="notice" role="status">
      <p>
        Operational planning is not deployed on this server yet (database migration 011 is pending).
        This is not an empty plan list.
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export const planAccess = (role: string | undefined) =>
  role === 'MANAGER' || role === 'COORDINATOR';
export const plansPath = (role: 'MANAGER' | 'COORDINATOR', orderId: number) =>
  `${quotationParent(role, orderId)}/plans`;

function LegFields({
  leg,
  index,
  count,
  fields,
  onChange,
  onRemove,
}: {
  leg: LegForm;
  index: number;
  count: number;
  fields: FieldErrors;
  onChange: (patch: Partial<LegForm>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const err = (name: string) => fields[`leg${n}.${name}`];
  const air = leg.transportMode === 'AIR';
  return (
    <fieldset className="plan-leg" aria-label={`Leg ${n}`}>
      <legend>
        Leg {n} — {air ? 'AIR' : 'ROAD'}
      </legend>
      <div className="form-grid">
        <TextInput
          label={`Leg ${n} from`}
          max={300}
          value={leg.startPoint}
          onChange={(startPoint) => onChange({ startPoint })}
          error={err('startPoint')}
        />
        <TextInput
          label={`Leg ${n} to`}
          max={300}
          value={leg.endPoint}
          onChange={(endPoint) => onChange({ endPoint })}
          error={err('endPoint')}
        />
        <TextInput
          label={`Leg ${n} distance (km)`}
          hint="Positive, up to 3 decimals."
          inputMode="decimal"
          max={13}
          value={leg.distanceKm}
          onChange={(distanceKm) => onChange({ distanceKm })}
          error={err('distanceKm')}
        />
        <TextInput
          label={`Leg ${n} distance source`}
          hint="Where the distance comes from; it feeds pricing."
          max={1000}
          value={leg.distanceSource}
          onChange={(distanceSource) => onChange({ distanceSource })}
          error={err('distanceSource')}
        />
        <TextInput
          label={`Leg ${n} departs`}
          hint={dateHint}
          max={35}
          value={leg.plannedDeparture}
          onChange={(plannedDeparture) => onChange({ plannedDeparture })}
          error={err('plannedDeparture')}
        />
        <TextInput
          label={`Leg ${n} arrives`}
          hint={dateHint}
          max={35}
          value={leg.plannedArrival}
          onChange={(plannedArrival) => onChange({ plannedArrival })}
          error={err('plannedArrival')}
        />
        <TextInput
          label={`Leg ${n} start time zone (optional)`}
          hint="IANA, e.g. Asia/Ho_Chi_Minh."
          max={100}
          value={leg.startTimezone}
          onChange={(startTimezone) => onChange({ startTimezone })}
          error={err('startTimezone')}
        />
        <TextInput
          label={`Leg ${n} end time zone (optional)`}
          max={100}
          value={leg.endTimezone}
          onChange={(endTimezone) => onChange({ endTimezone })}
          error={err('endTimezone')}
        />
        <TextInput
          label={`Leg ${n} supplier ID (optional)`}
          inputMode="numeric"
          max={15}
          value={leg.supplierId}
          onChange={(supplierId) => onChange({ supplierId })}
          error={err('supplierId')}
        />
        {air && (
          <TextInput
            label={`Leg ${n} planned flight number (optional)`}
            max={50}
            value={leg.plannedFlightNumber}
            onChange={(plannedFlightNumber) => onChange({ plannedFlightNumber })}
            error={err('plannedFlightNumber')}
          />
        )}
        <TextInput
          label={`Leg ${n} connection buffer (min, optional)`}
          inputMode="numeric"
          max={6}
          value={leg.connectionBufferMinutes}
          onChange={(connectionBufferMinutes) => onChange({ connectionBufferMinutes })}
          error={err('connectionBufferMinutes')}
        />
        <TextInput
          label={`Leg ${n} rest (min, optional)`}
          inputMode="numeric"
          max={6}
          value={leg.restDurationMinutes}
          onChange={(restDurationMinutes) => onChange({ restDurationMinutes })}
          error={err('restDurationMinutes')}
        />
        <TextInput
          label={`Leg ${n} care instructions (optional)`}
          area
          max={2000}
          value={leg.careInstructions}
          onChange={(careInstructions) => onChange({ careInstructions })}
          error={err('careInstructions')}
        />
      </div>
      {count > 1 && (
        <button type="button" onClick={onRemove}>
          Remove leg {n}
        </button>
      )}
    </fieldset>
  );
}

/** Creates the next DRAFT version. Plans are never edited in place. */
function DraftForm({
  orderId,
  revisionId,
  pinned,
  initial,
  basedOn,
}: {
  orderId: number;
  revisionId: number;
  pinned: Pinned;
  initial: LegForm[];
  basedOn: number | null;
}) {
  const session = useSession()!;
  const navigate = useNavigate();
  const [legs, setLegs] = useState<LegForm[]>(initial);
  const [current, setCurrent] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const update = (i: number, patch: Partial<LegForm>) =>
    setLegs((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (mode: LegMode) =>
    setLegs((all) => (all.length < 20 ? [...all, emptyLeg(mode)] : all));
  return (
    <CommandForm
      label="New plan version"
      title={basedOn ? `New draft version based on plan ${basedOn}` : 'New draft plan'}
      pinned={pinned}
      submitLabel="Create draft version"
      send={(body) => plansApi.draft(orderId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateLegs(legs);
        setErrors(r.errors);
        return r.input ? { revisionId, setAsCurrentDraft: current, legs: r.input } : null;
      }}
      onDone={(detail) =>
        navigate(
          `${plansPath(session.role as 'MANAGER' | 'COORDINATOR', orderId)}/${detail.planId}`,
        )
      }
    >
      {(locked, fields) => (
        <>
          <p className="muted">
            Add every leg in order. Use one AIR leg per flight, including transit airports;
            international travel is not a single flight. Earlier drafts of this revision become
            superseded.
          </p>
          {fields.legs && (
            <p className="field-error" role="alert">
              {fields.legs}
            </p>
          )}
          <fieldset className="plan-legs" disabled={locked}>
            {legs.map((leg, i) => (
              <LegFields
                key={i}
                leg={leg}
                index={i}
                count={legs.length}
                fields={fields}
                onChange={(patch) => update(i, patch)}
                onRemove={() => setLegs((all) => all.filter((_, j) => j !== i))}
              />
            ))}
          </fieldset>
          <div className="actions">
            {legModes.map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={locked || legs.length >= 20}
                onClick={() => add(mode)}
              >
                Add {mode} leg
              </button>
            ))}
          </div>
          <label className="horse-choice">
            <input
              type="checkbox"
              checked={current}
              disabled={locked}
              onChange={(e) => setCurrent(e.target.checked)}
            />
            <span>Make this the current draft (only if no plan is confirmed)</span>
          </label>
        </>
      )}
    </CommandForm>
  );
}

function CandidatesSection({ orderId }: { orderId: number }) {
  const { generation } = useSession()!;
  const query = useQuery({
    queryKey: planKeys.candidates(generation, orderId),
    queryFn: ({ signal }) => plansApi.candidates(orderId, signal),
    retry: false,
  });
  return (
    <section className="card" aria-labelledby="candidates-heading">
      <h2 id="candidates-heading">Shared stall candidates</h2>
      <p className="muted">
        Advisory shortlist only. Nothing is matched or booked automatically. Sharing still needs the
        same actual flight, physical fit, carrier acceptance and at most 3 slots in total; it does
        not prove compatibility of the horses or legal clearance.
      </p>
      {query.isPending ? (
        <Loading />
      ) : schemaPending(query.error) ? (
        <DeploymentNotice retry={() => void query.refetch()} />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : !query.data.length ? (
        <p>No candidates for this route and window.</p>
      ) : (
        <div className="table-scroll">
          <table aria-label="Shared stall candidates">
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Route</th>
                <th scope="col">Sharing</th>
                <th scope="col">Slots (theirs / combined)</th>
                <th scope="col">Flight</th>
                <th scope="col">Stall</th>
                <th scope="col">Window</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((c: Candidate) => (
                <tr key={`${c.candidateOrderId}-${c.candidateAirLegId ?? 'none'}`}>
                  <td>
                    {c.candidateOrderId} (rev. {c.candidateRevisionId})
                  </td>
                  <td>
                    {c.originCountryCode} → {c.destinationCountryCode}
                  </td>
                  <td>{c.sharingCode}</td>
                  <td>
                    {c.candidateSlotQuantity} / {c.combinedSlotQuantity}
                    {Number(c.combinedSlotQuantity) > 3 && (
                      <span className="badge warn"> over 3</span>
                    )}
                  </td>
                  <td>{c.plannedFlightNumber ?? 'Not planned'}</td>
                  <td>{c.assignedStallId ?? 'Not assigned'}</td>
                  <td>
                    {displayDate(c.windowStart)} → {displayDate(c.windowEnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PlansWorkspace({ orderId }: { orderId: number }) {
  const session = useSession()!;
  const role = session.role as 'MANAGER' | 'COORDINATOR';
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  const from = Number(params.get('from'));
  const fromValid = idSchema.safeParse(from).success;
  const caseQuery = usePreparationCase(orderId);
  const pinned = usePinnedVersion(orderId, caseQuery.data?.recordVersion);
  const list = useQuery({
    queryKey: planKeys.list(session.generation, orderId, page),
    queryFn: ({ signal }) => plansApi.list(orderId, page, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const source = useQuery({
    queryKey: planKeys.detail(session.generation, orderId, fromValid ? from : 0),
    queryFn: ({ signal }) => plansApi.get(orderId, from, signal),
    enabled: fromValid,
    retry: false,
  });
  if (caseQuery.isPending) return <Loading />;
  if (caseQuery.error) return <ErrorNotice error={caseQuery.error} />;
  const revisionId = caseQuery.data.currentRevisionId;
  const pages = list.data ? Math.ceil(list.data.totalElements / PLAN_PAGE_SIZE) : 0;
  return (
    <>
      <StaleBanner pinned={pinned} latest={caseQuery.data.recordVersion} />
      <section className="card" aria-labelledby="plans-heading">
        <h2 id="plans-heading">Plan versions</h2>
        {list.isPending ? (
          <Loading />
        ) : schemaPending(list.error) ? (
          <DeploymentNotice retry={() => void list.refetch()} />
        ) : list.error ? (
          <ErrorNotice error={list.error} />
        ) : !list.data.items.length ? (
          <p>No plan versions yet.</p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Plan versions">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Revision</th>
                  <th scope="col">Window</th>
                  <th scope="col">Gates (financial / operational / legal)</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((p) => (
                  <tr key={p.planId}>
                    <td>
                      v{p.versionNo}
                      {p.currentPlan && <span className="badge"> current</span>}
                    </td>
                    <td>
                      <span className="badge">{p.planStatus}</span>
                    </td>
                    <td>{p.revisionId}</td>
                    <td>
                      {displayDate(p.plannedStartTime)} → {displayDate(p.plannedEndTime)}
                    </td>
                    <td>
                      {p.financialGateStatus} / {p.operationalGateStatus} / {p.docGateStatus}
                    </td>
                    <td>
                      <Link to={`${plansPath(role, orderId)}/${p.planId}`}>
                        Open v{p.versionNo}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(pages > 1 || page > 0) && (
          <Pagination
            page={page}
            pages={pages}
            onChange={(next) => setParams({ page: String(next) })}
          />
        )}
      </section>
      {revisionId === null ? (
        <Notice>Plans can be drafted once the request has a current approved revision.</Notice>
      ) : fromValid && source.isPending ? (
        <Loading />
      ) : (
        <DraftForm
          key={`${revisionId}-${fromValid ? from : 'new'}-${source.data ? 'loaded' : ''}`}
          orderId={orderId}
          revisionId={revisionId}
          pinned={pinned}
          basedOn={source.data ? source.data.planId : null}
          initial={
            source.data?.legs.length
              ? source.data.legs.map(legToForm)
              : [emptyLeg('ROAD'), emptyLeg('AIR'), emptyLeg('ROAD')]
          }
        />
      )}
      <CandidatesSection orderId={orderId} />
    </>
  );
}

/** Manager or the assigned Coordinator: versioned multimodal plans for a case. */
export function PlansPage() {
  const session = useSession();
  const orderId = Number(useParams().id);
  if (!session) return null;
  if (!planAccess(session.role))
    return <Notice>You do not have access to operational plans.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This request is unavailable.</Notice>;
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">OPERATIONAL PLAN</small>
          <h1>Operational plans</h1>
          <p>Versioned road and air legs, resources and reservations for this case.</p>
        </div>
        <Link to={quotationParent(session.role, orderId)}>Back to the case</Link>
      </header>
      <PlansWorkspace key={`${session.generation}/${orderId}`} orderId={orderId} />
    </>
  );
}
