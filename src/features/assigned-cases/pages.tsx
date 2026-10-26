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
import { flag } from '../../shared/api/lookups';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { Details, show, SnapshotView } from '../assessment/case';
import type { ManagerCase } from '../assessment/contracts';
import { caseRoleLabels } from '../assessment/staff';
import { useAssignedCase, useAssignedCases } from './hooks';
import { PlansLink, StudioBanner, studioStatuses } from '../plans/link';
import { DepartureLink } from '../departure/DeparturePage';
import { ExecutionLink } from '../execution/ExecutionPage';
import { staffDashboardLink, staffTaskLink } from '../activity-operations/routes';
import { OrderTimeline } from '../activity-operations/OrderTimeline';
import { ComplianceLink } from '../compliance/link';
import { SettlementPreviewLink } from '../settlement/navigation';
import { SpecialistWorkspace } from '../compliance/SpecialistCompliancePage';
import { DossierDesk } from '../specialist-desk/DossierDesk';
import { OrderWorkflowBanner } from '../workflow/OrderWorkflowBanner';
import { GatesSummary } from '../workflow/GatesSummary';

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
      links={[
        { to: '/staff/cases', label: 'My Cases' },
        { to: '/staff/tasks', label: 'My Tasks' },
        { to: '/coordinator/routes', label: 'Predefined Routes' },
      ]}
      aliases={{
        '/staff/dashboard': '/staff/cases',
        '/coordinator/hubs': '/staff/cases',
        '/coordinator/resources': '/staff/cases',
      }}
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
  const items = query.data?.items ?? [];

  const prepCount = items.filter((c) =>
    ['APPROVED', 'IN_PREPARATION'].includes(c.orderStatus),
  ).length;
  const transitCount = items.filter((c) => c.orderStatus === 'IN_TRANSIT').length;
  const completedCount = items.filter((c) =>
    ['DELIVERED', 'CLOSED'].includes(c.orderStatus),
  ).length;

  return (
    <>
      <StaffHeading
        title="My Cases"
        description="Review customer transport orders assigned to you to schedule departures, configure route legs, and issue formal quotations."
      />

      {query.data && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #0f5132' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>TOTAL ASSIGNED</span>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0f5132', marginTop: 4 }}>
              {query.data.totalElements}
            </div>
            <small style={{ color: '#94a3b8' }}>All active cases</small>
          </div>
          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #eab308' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>NEEDS PLAN & QUOTE</span>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#ca8a04', marginTop: 4 }}>
              {prepCount}
            </div>
            <small style={{ color: '#94a3b8' }}>Preparation & confirmed</small>
          </div>
          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #6366f1' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>IN TRANSIT</span>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#4f46e5', marginTop: 4 }}>
              {transitCount}
            </div>
            <small style={{ color: '#94a3b8' }}>On cross-border journey</small>
          </div>
          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>COMPLETED</span>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#059669', marginTop: 4 }}>
              {completedCount}
            </div>
            <small style={{ color: '#94a3b8' }}>Handover & closed</small>
          </div>
        </section>
      )}

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
            <h2>No assigned transport requests</h2>
            <p>Cases appear here when customer requests are approved and assigned for coordination.</p>
          </div>
        ) : (
          <LoadedOrderFilter items={query.data.items}>
            {(filtered) => (
              <div className="table-scroll" aria-busy={query.isPlaceholderData}>
                <table aria-label={`Assigned cases: ${query.data.totalElements} in total`}>
                  <thead>
                    <tr>
                      <th scope="col">Request Code</th>
                      <th scope="col">Corridor Route</th>
                      <th scope="col">Delivery Deadline</th>
                      <th scope="col">Status</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.orderId}>
                        <td>
                          <CodeChip value={c.orderNumber} to={`/staff/cases/${c.orderId}`} />
                        </td>
                        <td>
                          <strong>
                            {flag(c.originCountryCode)} {c.originCountryCode}
                          </strong>
                          <span style={{ margin: '0 6px', color: '#94a3b8' }}>➔</span>
                          <strong>
                            {flag(c.destinationCountryCode)} {c.destinationCountryCode}
                          </strong>
                        </td>
                        <td>{displayDate(c.deliveryDeadline)}</td>
                        <td>
                          <StatusBadge status={c.orderStatus}>{c.orderStatus}</StatusBadge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            to={`/staff/cases/${c.orderId}`}
                            className="button secondary"
                            style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}
                          >
                            Schedule & Plan Itinerary ➔
                          </Link>
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
      <OrderWorkflowBanner status={current.orderStatus} role="SPECIALIST" />
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
      <OrderWorkflowBanner status={current.orderStatus} role="COORDINATOR" />
      <StudioBanner
        orderId={current.orderId}
        orderStatus={current.orderStatus}
        route={
          revision?.snapshot.request.originCountryCode
            ? `${revision.snapshot.request.originCountryCode} → ${revision.snapshot.request.destinationCountryCode ?? '—'}`
            : null
        }
        horse={revision?.snapshot.horse?.name ?? null}
      />
      <div className="actions">
        <SettlementPreviewLink orderId={current.orderId} />
        {/* During preparation the Studio banner above is the way in. */}
        {!studioStatuses.includes(current.orderStatus) && (
          <PlansLink orderId={current.orderId} orderStatus={current.orderStatus} />
        )}
        <DepartureLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <ExecutionLink orderId={current.orderId} orderStatus={current.orderStatus} />
        <ComplianceLink orderId={current.orderId} orderStatus={current.orderStatus} />
      </div>
      <OrderLifecycle status={current.orderStatus} />
      {['APPROVED', 'IN_PREPARATION', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED'].includes(
        current.orderStatus,
      ) && <GatesSummary orderId={current.orderId} />}
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
