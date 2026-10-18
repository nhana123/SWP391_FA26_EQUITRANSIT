import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { clearSession, useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { Details, show, SnapshotView } from '../assessment/case';
import type { ManagerCase } from '../assessment/contracts';
import { caseRoleLabels } from '../assessment/staff';
import { useAssignedCase, useAssignedCases } from './hooks';
import { QuotationLink } from '../quotations/navigation';
import { PrepareQuotationLink } from '../quotations/prepare-link';
import { AvailabilityLink } from '../resources/availability';
import { SettlementPreviewLink } from '../settlement/navigation';
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

/** Same shell classes as FE1's customer workspace, kept in this module. */
export function AssignedCasesLayout() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const focusRef = useRef<HTMLElement>(null);
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className="workspace">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={menu ? 'sidebar open' : 'sidebar'}>
        <Link className="brand" to="/staff/cases">
          EquiTransit
        </Link>
        <small>Staff PORTAL</small>
        <nav aria-label="Staff navigation">
          <NavLink to="/staff/cases" onClick={() => setMenu(false)}>
            My Cases
          </NavLink>
        </nav>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <button
            className="menu-button"
            type="button"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu((v) => !v)}
          >
            Menu
          </button>
          <span>Case preparation</span>
          <button type="button" onClick={clearSession}>
            Log Out
          </button>
        </header>
        <main id="main" ref={focusRef} tabIndex={-1} className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AssignedCasesPage() {
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
                {query.data.items.map((c) => (
                  <tr key={c.orderId}>
                    <td>
                      <Link to={`/staff/cases/${c.orderId}`}>{c.orderNumber}</Link>
                    </td>
                    <td>
                      {c.originCountryCode} → {c.destinationCountryCode}
                    </td>
                    <td>{displayDate(c.deliveryDeadline)}</td>
                    <td>
                      <span className="badge">{c.orderStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <p>No active assignment is shown for you on this case.</p>
      )}
    </section>
  );
}

export function AssignedCasePage() {
  const id = Number(useParams().id);
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
      </div>
      <Notice>
        Read-only preparation view. Document review, planning, reservations and departure are not
        available in this release.
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
