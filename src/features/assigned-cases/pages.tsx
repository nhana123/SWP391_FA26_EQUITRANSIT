import { LoadedOrderFilter } from '../../components/ui/LoadedOrderFilter';
import { CodeChip } from '../../components/ui/Primitives';
import { OrderLifecycle } from '../../components/ui/OrderLifecycle';
import { EmptyState } from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { ReactNode } from 'react';
import { WorkspaceShell } from '../../components/ui/WorkspaceShell';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { Details, show, SnapshotView } from '../assessment/case';
import type { ManagerCase } from '../assessment/contracts';
import { caseRoleLabels } from '../assessment/staff';
import { useAssignedCase, useAssignedCases } from './hooks';
import { QuotationLink } from '../quotations/navigation';
import { PrepareQuotationLink } from '../quotations/prepare-link';
import { AvailabilityLink } from '../resources/availability';
import { PlansLink } from '../plans/link';
import { DepartureLink } from '../departure/DeparturePage';
import { ExecutionLink } from '../execution/ExecutionPage';
import { staffDashboardLink, staffTaskLink } from '../activity-operations/routes';
import { OrderTimeline } from '../activity-operations/OrderTimeline';
import { ComplianceLink } from '../compliance/link';
import { SettlementPreviewLink } from '../settlement/navigation';
import { SpecialistWorkspace } from '../compliance/SpecialistCompliancePage';
import { DossierDesk } from '../specialist-desk/DossierDesk';
import './assigned-cases.css';

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

function StaffHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const session = useSession();
  const role =
    session?.role === 'SPECIALIST' || session?.role === 'COORDINATOR'
      ? caseRoleLabels[session.role].toUpperCase()
      : 'STAFF';
  return (
    <header className="page-heading">
      <div>
        <small className="eyebrow">CASE PREPARATION · {role}</small>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}

/**
 * Same shell classes as FE1's customer workspace, kept in this module. A
 * Specialist works from two places only — Overview and My Tasks (the dossier
 * desk); case routes stay reachable and count as My Tasks.
 */
export function AssignedCasesLayout() {
  const session = useSession();
  if (session?.role === 'SPECIALIST')
    return (
      <WorkspaceShell
        home="/staff/tasks"
        navigationLabel="Staff navigation"
        links={[staffDashboardLink, staffTaskLink]}
        aliases={{ '/staff/cases': staffTaskLink.to }}
      />
    );
  return (
    <WorkspaceShell
      home="/staff/cases"
      navigationLabel="Staff navigation"
      links={[staffDashboardLink, { to: '/staff/cases', label: 'My Cases' }, staffTaskLink]}
    />
  );
}

/** /staff/cases: the dossier desk for a Specialist, the case list for a Coordinator. */
export function AssignedCasesPage() {
  const session = useSession();
  return session?.role === 'SPECIALIST' ? <DossierDesk /> : <CaseListPage />;
}

function CaseListPage() {
  const [params, setParams] = useSearchParams();
  const page = parsePage(params.get('page'));
  const query = useAssignedCases(page);
  return (
    <>
      <StaffHeading
        title="My Cases"
        description="Approved requests currently assigned to you for preparation."
      />
      <section className="card">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorNotice error={query.error}>
            <button type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </ErrorNotice>
        ) : !query.data.items.length ? (
          <div className="empty">
            <h2>No assigned cases</h2>
            <p>Cases appear here when a Manager assigns you to an approved request.</p>
          </div>
        ) : (
          <LoadedOrderFilter items={query.data.items}>
            {(filtered) => (
              <div className="table-scroll" aria-busy={query.isPlaceholderData}>
                <table aria-label={`Assigned cases: ${query.data.totalElements} in total`}>
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col">Route</th>
                      <th scope="col">Delivery deadline</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.orderId}>
                        <td>
                          <CodeChip value={c.orderNumber} to={`/staff/cases/${c.orderId}`} />
                        </td>
                        <td>
                          {c.originCountryCode} → {c.destinationCountryCode}
                        </td>
                        <td>{displayDate(c.deliveryDeadline)}</td>
                        <td>
                          <StatusBadge status={c.orderStatus}>{c.orderStatus}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LoadedOrderFilter>
        )}
        {query.data && (query.data.totalPages > 1 || page > 0) && (
          <Pagination
            page={page}
            pages={query.data.totalPages}
            onChange={(next) => setParams({ page: String(next) })}
            pending={query.isFetching}
          />
        )}
      </section>
    </>
  );
}

/** Only the caller's own active assignment is returned by the staff route. */
function MyAssignment({ current }: { current: ManagerCase }) {
  const mine = current.assignments.filter((a) => a.endedAt === null);
  return (
    <section className="card">
      <h2>Your assignment</h2>
      {mine.length ? (
        mine.map((a) => (
          <Details
            key={a.assignmentId}
            rows={[
              ['Role', caseRoleLabels[a.role]],
              ['Assigned', displayDate(a.assignedAt)],
              ['Preparation deadline', a.dueAt ? displayDate(a.dueAt) : 'No deadline set'],
              ['Instructions from Manager', show(a.assignmentNote)],
            ]}
          />
        ))
      ) : (
        <EmptyState title="No active assignment is shown for you on this case." />
      )}
    </section>
  );
}

/** A Specialist opens the case as a two-page legal dossier; the case file is folded in. */
function SpecialistCaseDossier({ current }: { current: ManagerCase }) {
  const revision = current.revision;
  return (
    <>
      <StaffHeading
        title={`Case ${current.orderNumber}`}
        description={
          revision
            ? `Open dossier · revision ${revision.revisionNo} submitted ${displayDate(revision.submittedAt)}`
            : 'Open dossier · no submitted revision'
        }
      >
        <Link to="/staff/tasks">Back to My Tasks</Link>
      </StaffHeading>
      <SpecialistWorkspace
        orderId={current.orderId}
        caseFile={
          <>
            <OrderLifecycle status={current.orderStatus} />
            <MyAssignment current={current} />
            <OrderTimeline orderId={current.orderId} />
            {revision ? (
              <SnapshotView snapshot={revision.snapshot} />
            ) : (
              <Notice>No submitted revision is available for this case.</Notice>
            )}
          </>
        }
      />
    </>
  );
}

export function AssignedCasePage() {
  const id = Number(useParams().id);
  const session = useSession();
  const query = useAssignedCase(id);
  if (!Number.isSafeInteger(id) || id <= 0) return <Notice>This case is unavailable.</Notice>;
  // Check the error before data: a revoked assignment must hide the cached case.
  if (query.error instanceof ApiError && query.error.status === 404)
    return (
      <section className="card">
        <h1>Case not available</h1>
        <p>
          You no longer have access to this case. It may have been reassigned or the assignment
          ended.
        </p>
        <Link to="/staff/cases">Back to my cases</Link>
      </section>
    );
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        <button type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </ErrorNotice>
    );
  if (query.isPending) return <Loading />;
  const current = query.data;
  const revision = current.revision;
  if (session?.role === 'SPECIALIST') return <SpecialistCaseDossier current={current} />;
  return (
    <>
      <StaffHeading
        title={`Case ${current.orderNumber}`}
        description={
          revision
            ? `Revision ${revision.revisionNo} submitted ${displayDate(revision.submittedAt)}`
            : 'No submitted revision'
        }
      >
        <Link to="/staff/cases">Back to my cases</Link>
      </StaffHeading>
      <div className="actions">
        <QuotationLink orderId={current.orderId} />
        <SettlementPreviewLink orderId={current.orderId} />
        {current.orderStatus === 'APPROVED' && <PrepareQuotationLink orderId={current.orderId} />}
        <AvailabilityLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <PlansLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <DepartureLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <ExecutionLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <ComplianceLink orderId={current.orderId} orderStatus={current.orderStatus} />
      </div>
      <OrderLifecycle status={current.orderStatus} />
      <OrderTimeline orderId={current.orderId} />
      <Notice>
        The case details below are read-only. Use the links above for your role's work on this case;
        a link appears only when your role and the case status allow it.
      </Notice>
      <MyAssignment current={current} />
      {revision ? (
        <SnapshotView snapshot={revision.snapshot} />
      ) : (
        <Notice>No submitted revision is available for this case.</Notice>
      )}
    </>
  );
}
