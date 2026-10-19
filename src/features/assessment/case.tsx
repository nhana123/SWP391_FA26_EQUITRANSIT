import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import { HISTORY_PAGE_SIZE } from './api';
import type { AssessmentReceipt, CaseDecision, ManagerCase, OrderSnapshot } from './contracts';
import { AssignmentHistory, TeamManager } from './assignments';
import { DecisionForm } from './decision';
import { assessmentKeys, useDecisionHistory, useManagerCase } from './hooks';
import { ManagerHeading } from './layout';
import { reviewStateLabels } from './pages';
import { caseRoleLabels } from './staff';
import { QuotationLink } from '../quotations/navigation';
import { PaymentLink } from '../payments/pages';
import { PrepareQuotationLink } from '../quotations/prepare-link';
import { AvailabilityLink } from '../resources/availability';
import { PlansLink } from '../plans/link';
import { DepartureLink } from '../departure/DeparturePage';
import { ExecutionLink } from '../execution/ExecutionPage';
import { OrderTimeline } from '../activity-operations/OrderTimeline';
import { SettlementPreviewLink } from '../settlement/navigation';

const outcomeLabels: Record<CaseDecision['decision'], string> = {
  APPROVED: reviewStateLabels.APPROVED,
  CHANGES_REQUESTED: reviewStateLabels.CHANGES_REQUESTED,
  REJECTED: reviewStateLabels.REJECTED,
};

export const show = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? 'Not recorded' : String(value);

export function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="details">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SnapshotView({ snapshot }: { snapshot: OrderSnapshot }) {
  const r = snapshot.request;
  const h = snapshot.horse;
  return (
    <>
      <section className="card">
        <h2>Journey (as submitted)</h2>
        <Details
          rows={[
            ['Route', `${show(r.originCountryCode)} → ${show(r.destinationCountryCode)}`],
            ['Pickup address', show(r.originAddress)],
            ['Delivery address', show(r.destinationAddress)],
            ['Preferred departure', displayDate(r.preferredDepartureAt ?? null)],
            ['Delivery deadline', displayDate(r.deliveryDeadline ?? null)],
            ['Date flexibility', show(r.dateFlexibilityNotes)],
            ['Import type', show(r.importType)],
            ['Transit airports', r.transitAirports?.length ? r.transitAirports.join(', ') : 'None'],
            ['Receiver', show(r.receiverName)],
            ['Receiver authority', show(r.receiverAuthority)],
            ['Event', show(r.eventName)],
            ['Event start', displayDate(r.eventStartAt ?? null)],
            ['Special needs', show(r.specialNeeds)],
          ]}
        />
      </section>
      <section className="card">
        <h2>Horse (captured at submission)</h2>
        {h ? (
          <Details
            rows={[
              ['Name', h.name],
              ['Microchip', show(h.microchipId)],
              ['Passport', show(h.passportNumber)],
              ['Sex', show(h.sexCode)],
              ['Weight (kg)', show(h.weightKg)],
              ['Height (cm)', show(h.heightCm)],
              ['Body width (cm)', show(h.bodyWidthCm)],
              ['Measured at', displayDate(h.measuredAt ?? null)],
              ['Handling', show(h.handlingNotes)],
              ['Feed and water', show(h.feedWaterRequirements)],
              ['Veterinary instructions', show(h.veterinaryInstructions)],
            ]}
          />
        ) : (
          <p>No horse was captured in this revision.</p>
        )}
      </section>
      <section className="card">
        <h2>Requested services</h2>
        <p className="muted">Requested intent only, not confirmed eligibility or price.</p>
        {snapshot.services.length ? (
          <div className="table-scroll">
            <table aria-label="Requested services">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Option</th>
                  <th scope="col">Arranged by</th>
                  <th scope="col">Provider</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.services.map((s, i) => (
                  <tr key={`${s.serviceCode}-${i}`}>
                    <td>{s.serviceCode}</td>
                    <td>{show(s.optionCode)}</td>
                    <td>{show(s.arrangedBy)}</td>
                    <td>{show(s.providerName)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No service preferences were submitted.</p>
        )}
      </section>
    </>
  );
}

function TeamView({ current }: { current: ManagerCase }) {
  const active = current.assignments.filter((a) => a.endedAt === null);
  if (!active.length) return null;
  return (
    <section className="card">
      <h2>Current team</h2>
      <Details
        rows={active.map((a) => [
          caseRoleLabels[a.role],
          <>
            Staff ID {a.staffId}
            {a.dueAt && <> · due {displayDate(a.dueAt)}</>}
            {a.assignmentNote && <span className="muted"> · {a.assignmentNote}</span>}
          </>,
        ])}
      />
    </section>
  );
}

function DecisionHistory({ id }: { id: number }) {
  const [page, setPage] = useState(0);
  const query = useDecisionHistory(id, page);
  return (
    <section className="card">
      <h2>Decision history</h2>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : !query.data.length ? (
        <p>No decisions recorded yet.</p>
      ) : (
        <div className="table-scroll" aria-busy={query.isPlaceholderData}>
          <table aria-label="Decision history, newest first">
            <thead>
              <tr>
                <th scope="col">Decided</th>
                <th scope="col">Revision ID</th>
                <th scope="col">Outcome</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((d) => (
                <tr key={d.decisionId}>
                  <td>{displayDate(d.decidedAt)}</td>
                  <td>{d.revisionId}</td>
                  <td>{outcomeLabels[d.decision]}</td>
                  <td>{show(d.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* History is a bounded array without a total: only offer Next on a full page. */}
      {query.data && (page > 0 || query.data.length === HISTORY_PAGE_SIZE) && (
        <nav className="pagination" aria-label="Decision history pages">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Newer
          </button>
          <span>Page {page + 1}</span>
          <button
            type="button"
            disabled={query.data.length < HISTORY_PAGE_SIZE || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Older
          </button>
        </nav>
      )}
    </section>
  );
}

export function ManagerCasePage() {
  const id = Number(useParams().id);
  const session = useSession()!;
  const query = useManagerCase(id);
  const [receipt, setReceipt] = useState<AssessmentReceipt | null>(null);
  const [teamChanged, setTeamChanged] = useState(false);
  const valid = Number.isSafeInteger(id) && id > 0;

  // Receipts are history; re-read current case, queue, workload and history.
  const refreshAll = () =>
    queryClient.invalidateQueries({ queryKey: assessmentKeys.all(session.generation) });
  async function refreshAfterDecision(next: AssessmentReceipt) {
    setReceipt(next);
    setTeamChanged(false);
    await refreshAll();
  }
  async function refreshAfterTeamChange() {
    setReceipt(null);
    setTeamChanged(true);
    await refreshAll();
  }
  function reload() {
    void queryClient.invalidateQueries({ queryKey: assessmentKeys.case(session.generation, id) });
  }

  if (!valid) return <Notice>This request is unavailable.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        <Link to="/manager/requests">Back to requests</Link>
      </ErrorNotice>
    );
  const current = query.data;
  const revision = current.revision;
  const decidable =
    current.orderStatus === 'SUBMITTED' &&
    revision !== null &&
    revision.revisionId === current.currentRevisionId;
  return (
    <>
      <ManagerHeading
        title={`Request ${current.orderNumber}`}
        description={
          revision
            ? `Revision ${revision.revisionNo} submitted ${displayDate(revision.submittedAt)}`
            : 'No submitted revision'
        }
      >
        <Link to="/manager/requests">Back to requests</Link>
      </ManagerHeading>
      <div className="actions">
        <QuotationLink orderId={current.orderId} />
        <SettlementPreviewLink orderId={current.orderId} />
        <PaymentLink orderId={current.orderId} />
        {current.orderStatus === 'APPROVED' && <PrepareQuotationLink orderId={current.orderId} />}
        <AvailabilityLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <PlansLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <DepartureLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <ExecutionLink orderId={current.orderId} orderStatus={current.orderStatus} />
      </div>
      <OrderTimeline orderId={current.orderId} />
      {receipt && (
        <Notice>
          Decision recorded: {receipt.decision ? outcomeLabels[receipt.decision.decision] : '—'}.
          {receipt.decision?.decision === 'APPROVED' &&
            ' Preparation has started; this is not payment, clearance or departure approval.'}
        </Notice>
      )}
      {teamChanged && <Notice>Case team updated. The current team is shown below.</Notice>}
      <section className="card">
        <Details
          rows={[
            ['Status', <span className="badge">{current.orderStatus}</span>],
            [
              'Current decision',
              current.decision ? outcomeLabels[current.decision.decision] : 'Not decided',
            ],
            ['Revision change reason', show(revision?.changeReason)],
          ]}
        />
      </section>
      {revision ? (
        <SnapshotView snapshot={revision.snapshot} />
      ) : (
        <Notice>No submitted revision is available for this request.</Notice>
      )}
      {current.orderStatus === 'APPROVED' ? (
        <TeamManager current={current} onChanged={refreshAfterTeamChange} onReload={reload} />
      ) : (
        <TeamView current={current} />
      )}
      {decidable && (
        <DecisionForm
          key={revision.revisionId}
          current={current}
          revisionId={revision.revisionId}
          onDecided={refreshAfterDecision}
          onReload={reload}
        />
      )}
      <DecisionHistory id={current.orderId} />
      <AssignmentHistory id={current.orderId} />
    </>
  );
}
