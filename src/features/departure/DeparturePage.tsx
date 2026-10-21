import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { signOut } from '../../shared/api/refresh';
import { useSession } from '../../shared/api/session';
import { displayDate as formatDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { quotationParent } from '../quotations/navigation';
import { departureApi } from './api';
import {
  blockerText,
  errorHelp,
  usableReceipt,
  type Command,
  type Gate,
  type Readiness,
} from './contracts';
import { TaskQueue } from '../activity-operations/TaskQueue';
import { executionPath } from '../execution/ExecutionPage';
import { JourneyStudio } from '../plans/studio/JourneyStudio';
import './departure.css';

const displayDate = (value: string | null) => formatDate(value, 'Asia/Ho_Chi_Minh');

export const departureKeys = {
  detail: (generation: string, orderId: number) =>
    [...queryKeys.session(generation), 'departure', orderId] as const,
};
type StaffRole = 'MANAGER' | 'COORDINATOR' | 'DRIVER';
export const departurePath = (role: StaffRole, orderId: number) =>
  role === 'DRIVER'
    ? `/driver/orders/${orderId}/departure`
    : `${quotationParent(role, orderId)}/departure`;

/** Order version pinned to what the user reviewed; only own receipts or a reload move it. */
function usePinned(orderId: number, current: string | undefined) {
  const { generation } = useSession()!;
  const [pinned, setPinned] = useState<string | null>(null);
  if (current && pinned === null) setPinned(current);
  const changed = !!current && !!pinned && current.toLowerCase() !== pinned.toLowerCase();
  const key = departureKeys.detail(generation, orderId);
  return {
    version: pinned,
    changed,
    async written(next: Readiness) {
      setPinned(next.recordVersion);
      // The response may be a replay: show it, then re-read the live state.
      queryClient.setQueryData(key, next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: queryKeys.order(generation, orderId) }),
      ]);
    },
    adopt: (next: string) => setPinned(next),
    reload: () => queryClient.invalidateQueries({ queryKey: key }),
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
  children,
}: {
  label: string;
  pinned: Pinned;
  send: (body: Command<T>) => Promise<Readiness>;
  build: () => T | null;
  submitLabel: string;
  fieldErrors?: FieldErrors;
  children?: (locked: boolean, fields: FieldErrors) => ReactNode;
}) {
  const command = useCaseCommand(send, ['RESOURCE_LOCK_BUSY']);
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
      (next) => pinned.written(next),
    );
  }
  return (
    <form className="card" onSubmit={submit} noValidate aria-label={label}>
      <h3>{label}</h3>
      <ErrorNotice error={command.error}>
        {code && errorHelp[code] && <p>{errorHelp[code]}</p>}
        {command.frozen && !command.pending && (
          <p>
            The result is uncertain. Retry sends the same action, identifier and version, so it
            cannot be recorded twice.
          </p>
        )}
        {command.conflict && !command.frozen && (
          <button type="button" onClick={() => void pinned.reload()}>
            Reload readiness
          </button>
        )}
      </ErrorNotice>
      {children?.(command.locked, { ...command.fields, ...fieldErrors })}
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={command.pending || (stale && !command.frozen)}
        >
          {command.pending ? 'Sending…' : command.frozen ? 'Retry the same action' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function GateCard({ title, gate }: { title: string; gate: Gate }) {
  return (
    <section className="card departure-gate" aria-label={`${title} gate`}>
      <h3>
        {title}:{' '}
        <span className={`badge ${gate.status === 'PASS' ? '' : 'warn'}`}>{gate.status}</span>
      </h3>
      {gate.blockers.length ? (
        <ul>
          {gate.blockers.map((b) => (
            <li key={b}>
              {blockerText(b)} <small>({b})</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No blockers reported.</p>
      )}
    </section>
  );
}

const text = (v: string) => v.trim();
function ReceiptForm({ r, pinned }: { r: Readiness; pinned: Pinned }) {
  const [f, setF] = useState({
    observedMicrochip: '',
    observedPassportNumber: '',
    fitToTravel: '' as '' | 'true' | 'false',
    locationDescription: '',
    conditionNotes: '',
    evidenceFileKey: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label="Record horse receipt"
      pinned={pinned}
      submitLabel="Record receipt"
      send={(body) => departureApi.receipt(r.orderId, body)}
      fieldErrors={errors}
      build={() => {
        const e: FieldErrors = {};
        const chip = text(f.observedMicrochip);
        const passport = text(f.observedPassportNumber);
        const location = text(f.locationDescription);
        const notes = text(f.conditionNotes);
        const evidence = text(f.evidenceFileKey);
        if (!chip || chip.length > 50) e.observedMicrochip = 'Enter the microchip you read (1–50).';
        if (!passport || passport.length > 50)
          e.observedPassportNumber = 'Enter the passport number you checked (1–50).';
        if (!f.fitToTravel) e.fitToTravel = 'State whether the horse is fit to travel.';
        if (!location || location.length > 500)
          e.locationDescription = 'Enter where you received the horse.';
        if (notes.length > 2000) e.conditionNotes = 'Use at most 2000 characters.';
        if (evidence.length > 1024) e.evidenceFileKey = 'Use at most 1024 characters.';
        setErrors(e);
        if (Object.keys(e).length) return null;
        return {
          planId: r.planId!,
          legId: r.firstLegId!,
          observedMicrochip: chip,
          observedPassportNumber: passport,
          fitToTravel: f.fitToTravel === 'true',
          conditionNotes: notes || null,
          evidenceFileKey: evidence || null,
          locationDescription: location,
        };
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            Record what you physically observe. The server compares the identity with the horse
            record; a mismatch or an unfit horse blocks departure.
          </p>
          <Field label="Observed microchip" error={fields.observedMicrochip}>
            {(id) => (
              <input
                id={id}
                maxLength={50}
                value={f.observedMicrochip}
                onChange={(e) => set({ observedMicrochip: e.target.value })}
              />
            )}
          </Field>
          <Field label="Observed passport number" error={fields.observedPassportNumber}>
            {(id) => (
              <input
                id={id}
                maxLength={50}
                value={f.observedPassportNumber}
                onChange={(e) => set({ observedPassportNumber: e.target.value })}
              />
            )}
          </Field>
          <Field label="Fit to travel" error={fields.fitToTravel}>
            {(id) => (
              <select
                id={id}
                value={f.fitToTravel}
                onChange={(e) => set({ fitToTravel: e.target.value as 'true' | 'false' })}
              >
                <option value="" disabled>
                  Choose…
                </option>
                <option value="true">Yes — fit to travel</option>
                <option value="false">No — not fit to travel</option>
              </select>
            )}
          </Field>
          <Field label="Pickup location" error={fields.locationDescription}>
            {(id) => (
              <input
                id={id}
                maxLength={500}
                value={f.locationDescription}
                onChange={(e) => set({ locationDescription: e.target.value })}
              />
            )}
          </Field>
          <Field label="Condition notes (optional)" error={fields.conditionNotes}>
            {(id) => (
              <textarea
                id={id}
                maxLength={2000}
                value={f.conditionNotes}
                onChange={(e) => set({ conditionNotes: e.target.value })}
              />
            )}
          </Field>
          <Field label="Evidence file key (optional)" error={fields.evidenceFileKey}>
            {(id) => (
              <input
                id={id}
                maxLength={1024}
                value={f.evidenceFileKey}
                onChange={(e) => set({ evidenceFileKey: e.target.value })}
              />
            )}
          </Field>
        </fieldset>
      )}
    </CommandForm>
  );
}

function DepartForm({ r, pinned }: { r: Readiness; pinned: Pinned }) {
  const receipt = usableReceipt(r);
  const [sure, setSure] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label="Depart first leg"
      pinned={pinned}
      submitLabel="Depart now"
      send={(body) => departureApi.depart(r.orderId, body)}
      fieldErrors={errors}
      build={() => {
        const e: FieldErrors = {};
        if (!receipt) e.form = 'Record an accepted receipt with a matching identity first.';
        if (!sure) e.sure = 'Confirm that you have the horse and are leaving now.';
        setErrors(e);
        return receipt && sure
          ? { planId: r.planId!, legId: r.firstLegId!, receiptId: receipt.receiptId }
          : null;
      }}
    >
      {(locked, fields) => (
        <>
          {fields.form && (
            <p className="field-error" role="alert">
              {fields.form}
            </p>
          )}
          <p className="muted">
            The server rechecks all three gates, the manager authorization and your receipt at this
            moment; readiness shown here may already be out of date.
          </p>
          <label className="horse-choice">
            <input
              type="checkbox"
              checked={sure}
              disabled={locked}
              onChange={(e) => setSure(e.target.checked)}
            />
            <span>I have received the horse and am departing on the first road leg now.</span>
          </label>
          {fields.sure && (
            <p className="field-error" role="alert">
              {fields.sure}
            </p>
          )}
        </>
      )}
    </CommandForm>
  );
}

function Workspace({ orderId }: { orderId: number }) {
  const session = useSession()!;
  const role = session.role as StaffRole;
  const query = useQuery({
    queryKey: departureKeys.detail(session.generation, orderId),
    queryFn: ({ signal }) => departureApi.get(orderId, signal),
    staleTime: 0,
    retry: false,
  });
  const pinned = usePinned(orderId, query.data?.recordVersion);
  if (query.isPending) return <Loading />;
  if (query.error && !query.data)
    return (
      <ErrorNotice error={query.error}>
        {query.error instanceof ApiError && query.error.status === 503 ? (
          <>
            <p>
              Departure is not deployed on this server yet (migration 012). This is not "no data".
            </p>
            <button type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </>
        ) : (
          query.error instanceof ApiError &&
          [403, 404].includes(query.error.status) && (
            <p>This case's departure is not available to you.</p>
          )
        )}
      </ErrorNotice>
    );
  const r = query.data!;
  const departed = !!r.firstLegActualDeparture || r.firstLegStatus === 'IN_TRANSIT';
  const hasLeg = r.planId !== null && r.firstLegId !== null;
  return (
    <>
      {pinned.changed && (
        <div className="notice error" role="alert">
          <p>This case changed since you opened it. Reload and review before acting.</p>
          <button type="button" onClick={() => pinned.adopt(r.recordVersion)}>
            Reload and review
          </button>
        </div>
      )}
      <section className="card" aria-label="Departure summary">
        <h2>Departure readiness</h2>
        <p>
          Request {r.orderStatus}; plan {r.planVersionNo !== null ? `v${r.planVersionNo}` : 'none'}
          {r.planStatus && ` (${r.planStatus})`}; first leg {r.firstLegStatus ?? 'not planned'}
          {r.firstLegActualDeparture && `, departed ${displayDate(r.firstLegActualDeparture)}`}.
        </p>
        <p className="muted">
          Checked {displayDate(r.asOf)}
          {r.gatesCheckedAt && `; gates last evaluated ${displayDate(r.gatesCheckedAt)}`}. Gates are
          decided by the server. An accepted quotation or a reported transfer is not the financial
          gate, and nothing here bypasses the legal gate.
        </p>
        <p>
          Authorization:{' '}
          {r.departureAuthorizedAt
            ? `authorized ${displayDate(r.departureAuthorizedAt)}${r.departureAuthorizedBy !== null ? ` by staff ${r.departureAuthorizedBy}` : ''}`
            : 'not authorized'}
          .
        </p>
      </section>
      {role === 'DRIVER' && r.planId !== null && (
        <JourneyStudio
          orderId={orderId}
          planId={r.planId}
          recordVersion={r.recordVersion}
          mode="driver"
        />
      )}
      <div className="departure-gates">
        <GateCard title="Financial" gate={r.financialGate} />
        <GateCard title="Legal" gate={r.legalGate} />
        <GateCard title="Operational" gate={r.operationalGate} />
      </div>
      {r.departureBlockers.length > 0 && (
        <section className="card" aria-label="Departure blockers">
          <h3>Before departure</h3>
          <ul>
            {r.departureBlockers.map((b) => (
              <li key={b}>
                {blockerText(b)} <small>({b})</small>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card" aria-label="Horse receipts">
        <h3>Horse receipts</h3>
        {!r.receipts.length ? (
          <p>No receipt recorded.</p>
        ) : (
          <ul>
            {r.receipts.map((x) => (
              <li key={x.receiptId}>
                Receipt {x.receiptId}, {displayDate(x.receivedAt)} at {x.locationDescription ?? '—'}
                : identity{' '}
                <span className={`badge ${x.identityCheckResult === 'MATCHED' ? '' : 'warn'}`}>
                  {x.identityCheckResult}
                </span>
                , status{' '}
                <span className={`badge ${x.receiptStatus === 'ACCEPTED' ? '' : 'warn'}`}>
                  {x.receiptStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {(role === 'MANAGER' || role === 'COORDINATOR') && !departed && (
        <CommandForm
          label="Evaluate gates"
          pinned={pinned}
          submitLabel="Evaluate gates now"
          send={(body) => departureApi.evaluate(orderId, body)}
          build={() => ({})}
        >
          {() => (
            <p className="muted">
              Re-checks all three gates now. A blocked gate clears any earlier authorization.
            </p>
          )}
        </CommandForm>
      )}
      {role === 'MANAGER' && !departed && r.planId !== null && !r.departureAuthorizedAt && (
        <CommandForm
          label="Authorize departure"
          pinned={pinned}
          submitLabel="Authorize departure"
          send={(body) => departureApi.authorize(orderId, body)}
          build={() => (r.readyForAuthorization ? { planId: r.planId! } : null)}
        >
          {() =>
            r.readyForAuthorization ? (
              <p className="muted">
                All three gates pass now; the server checks them again when you authorize.
              </p>
            ) : (
              <p className="field-error" role="alert">
                Authorization is not possible until all three gates pass.
              </p>
            )
          }
        </CommandForm>
      )}
      {role === 'DRIVER' && !departed && hasLeg && (
        <>
          <ReceiptForm r={r} pinned={pinned} />
          <DepartForm r={r} pinned={pinned} />
        </>
      )}
      {role === 'DRIVER' && !hasLeg && <Notice>No first road leg is planned for you yet.</Notice>}
      {departed && (
        <Notice>
          The first leg has departed.{' '}
          <Link to={executionPath(role, orderId)}>Follow trip progress and later legs</Link>.
        </Notice>
      )}
    </>
  );
}

/** Manager, assigned Coordinator or assigned Driver: three gates, authorization and receipt. */
export function DeparturePage() {
  const session = useSession();
  const orderId = Number(useParams().id);
  if (!session) return null;
  if (!['MANAGER', 'COORDINATOR', 'DRIVER'].includes(session.role))
    return <Notice>You do not have access to departure.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This request is unavailable.</Notice>;
  const back = session.role === 'DRIVER' ? '/driver' : quotationParent(session.role, orderId);
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">DEPARTURE</small>
          <h1>Departure</h1>
          <p>Three server-evaluated gates, manager authorization and the driver's horse receipt.</p>
          <p className="muted">Operational timezone: GMT+07:00 (Asia/Ho_Chi_Minh).</p>
        </div>
        <Link to={back}>Back</Link>
      </header>
      <Workspace key={`${session.generation}/${orderId}`} orderId={orderId} />
    </>
  );
}

/** Entry for the Manager and the assigned Coordinator once a plan can exist. */
const departureStatuses = ['APPROVED', 'IN_PREPARATION', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED'];
export function DepartureLink({ orderId, orderStatus }: { orderId: number; orderStatus: string }) {
  const session = useSession();
  if (!session || (session.role !== 'MANAGER' && session.role !== 'COORDINATOR')) return null;
  if (!departureStatuses.includes(orderStatus)) return null;
  return (
    <Link className="button" to={departurePath(session.role, orderId)}>
      Departure
    </Link>
  );
}

/** Minimal driver workspace; the task queue (#82 part B) lists the driver's orders. */
export function DriverLayout() {
  return (
    <div className="driver-shell">
      <header className="driver-header">
        <Link className="brand" to="/driver">
          EquiTransit
        </Link>
        <nav aria-label="Driver navigation">
          <Link to="/driver">My Tasks</Link> <Link to="/driver/dashboard">Overview</Link>
        </nav>
        <button type="button" onClick={() => void signOut()}>
          Log Out
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
/** Driver home: the live assigned road legs; each opens its departure. */
export function DriverHome() {
  return <TaskQueue />;
}
