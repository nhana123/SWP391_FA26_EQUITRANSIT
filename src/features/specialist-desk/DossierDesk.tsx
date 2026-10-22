import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/Icons';
import { lifecycleStage } from '../../components/ui/OrderLifecycle';
import { CodeChip, EmptyState } from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ApiError } from '../../shared/api/client';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading } from '../../shared/ui/common';
import { orderStatusLabels } from '../transport-orders/status-contracts';
import { dossierBucket, useDossiers, type Dossier, type DossierBucket } from './data';
import './dossier.css';

const filters: { key: 'ALL' | DossierBucket; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ASSESSMENT', label: 'Needs Assessment' },
  { key: 'COMPLIANCE', label: 'Compliance Pending' },
  { key: 'CLEARED', label: 'Cleared / Completed' },
];
export const dossierPath = (d: Pick<Dossier, 'orderId' | 'caseAvailable'>) =>
  d.caseAvailable ? `/staff/cases/${d.orderId}` : `/staff/cases/${d.orderId}/compliance`;

/** A case folder on the desk: tab (code + work), route, deadline, status clip. */
export function DossierCard({ dossier }: { dossier: Dossier }) {
  const code = dossier.orderNumber ?? `Request ${dossier.orderId}`;
  const stage = dossier.status ? lifecycleStage(dossier.status) : 0;
  const due = dossier.deliveryDeadline ?? dossier.taskDueAt;
  return (
    <li className="dossier-card">
      <div className="dossier-tab">
        <CodeChip value={code} />
        <span className="dossier-work">Specialist review</span>
      </div>
      <div className="dossier-cover">
        <p className="dossier-route" aria-label="Route">
          <strong>{dossier.origin ?? '—'}</strong>
          <Icon name="arrow" size={16} />
          <strong>{dossier.destination ?? '—'}</strong>
        </p>
        <dl className="dossier-facts">
          <div>
            <dt>Delivery deadline</dt>
            <dd>{dossier.deliveryDeadline ? displayDate(dossier.deliveryDeadline) : 'Not set'}</dd>
          </div>
          {dossier.taskDueAt && (
            <div>
              <dt>Preparation due</dt>
              <dd>{displayDate(dossier.taskDueAt)}</dd>
            </div>
          )}
        </dl>
        <div className="dossier-clip">
          {dossier.status ? (
            <StatusBadge status={dossier.status}>{orderStatusLabels[dossier.status]}</StatusBadge>
          ) : (
            <span className="muted">Status loads in the dossier</span>
          )}
          <span
            className="dossier-progress"
            role="progressbar"
            aria-label="Journey progress"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={stage + 1}
          >
            <span style={{ width: `${((stage + 1) / 5) * 100}%` }} />
          </span>
        </div>
        {!dossier.caseAvailable ? (
          <p className="muted dossier-note">
            The case file has moved past preparation; its legal file stays open to you.
          </p>
        ) : (
          !due && <p className="muted dossier-note">No deadline recorded yet.</p>
        )}
        <Link
          className="button primary dossier-open"
          to={dossierPath(dossier)}
          aria-label={`Open dossier ${code}`}
        >
          <Icon name="file" size={16} />
          Open Dossier
          <Icon name="arrow" size={16} />
        </Link>
      </div>
    </li>
  );
}

function DeskState({ query }: { query: ReturnType<typeof useDossiers> }) {
  if (query.isPending) return <Loading />;
  return (
    <ErrorNotice error={query.error}>
      {query.error instanceof ApiError && query.error.status === 503 && (
        <p>Activity is not deployed on this server yet. This is not an empty desk.</p>
      )}
      <button type="button" onClick={() => void query.refetch()}>
        Try again
      </button>
    </ErrorNotice>
  );
}

/** /staff/tasks (and /staff/cases) for a Specialist: every assigned case as a folder. */
export function DossierDesk() {
  const query = useDossiers();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | DossierBucket>('ALL');
  const term = search.trim().toLowerCase();
  const shown = (query.data?.dossiers ?? []).filter(
    (d) =>
      (filter === 'ALL' || dossierBucket(d.status) === filter) &&
      (!term || (d.orderNumber ?? String(d.orderId)).toLowerCase().includes(term)),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">SPECIALIST DESK</small>
          <h1>My Tasks</h1>
          <p>Every case dossier assigned to you. Open one to review its legal file.</p>
        </div>
      </header>
      <section className="card dossier-desk" aria-labelledby="desk-heading">
        <h2 id="desk-heading" className="sr-only">
          Case dossiers
        </h2>
        <div className="table-tools">
          <label className="search-box">
            <Icon name="search" size={18} />
            <input
              type="search"
              aria-label="Search dossiers by request code"
              placeholder="Search request code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="filter-pills" role="group" aria-label="Filter dossiers">
            {filters.map((f) => (
              <button
                type="button"
                key={f.key}
                aria-pressed={f.key === filter}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted dossier-hint">
          Filters follow each request's status. The legal phases inside a dossier are cleared
          separately.
        </p>
        {query.data?.tasksUnavailable && (
          <p className="notice" role="status">
            Task due times could not be loaded; dossiers are listed from your assigned cases.
          </p>
        )}
        {!query.data ? (
          <DeskState query={query} />
        ) : !query.data.dossiers.length ? (
          <EmptyState
            title="No dossiers on your desk"
            description="Cases appear here when a Manager assigns you to an approved request."
          />
        ) : !shown.length ? (
          <EmptyState title="No dossiers match this search or filter." />
        ) : (
          <ul className="dossier-grid" aria-label="Case dossiers">
            {shown.map((d) => (
              <DossierCard key={d.orderId} dossier={d} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Overview: the dossiers that need attention first (open ones, soonest first). */
export function PriorityDossiers({ limit = 6 }: { limit?: number }) {
  const query = useDossiers();
  const open = (query.data?.dossiers ?? []).filter((d) => dossierBucket(d.status) !== 'CLEARED');
  return (
    <section className="card" aria-labelledby="priority-heading">
      <div className="dossier-section-head">
        <h2 id="priority-heading">Priority Dossiers</h2>
        <Link to="/staff/tasks">See all dossiers</Link>
      </div>
      {!query.data ? (
        <DeskState query={query} />
      ) : !open.length ? (
        <EmptyState title="Nothing needs your attention right now." />
      ) : (
        <ul className="dossier-grid" aria-label="Priority dossiers">
          {open.slice(0, limit).map((d) => (
            <DossierCard key={d.orderId} dossier={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
