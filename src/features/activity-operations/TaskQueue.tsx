import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { OPERATIONS_PAGE_SIZE, operationsApi } from './api';
import { taskRoleLabels, type Task } from './contracts';

export const operationsKeys = {
  tasks: (generation: string, page: number) =>
    [...queryKeys.session(generation), 'operations', 'tasks', { page }] as const,
  timeline: (generation: string, orderId: number, page: number) =>
    [...queryKeys.session(generation), 'operations', 'timeline', orderId, { page }] as const,
};
const taskRoles = ['SPECIALIST', 'COORDINATOR', 'DRIVER'];

/** Where a task is worked on; a driver leg opens the departure page. */
export function taskPath(task: Task) {
  if (task.role === 'DRIVER')
    return task.legId !== null ? `/driver/orders/${task.orderId}/departure` : null;
  return `/staff/cases/${task.orderId}`;
}

/** The caller's live assigned work. Ended or revoked assignments never appear. */
export function TaskQueue() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const raw = params.get('page') ?? '0';
  const page = /^\d+$/.test(raw) ? Number(raw) : 0;
  const allowed = !!session && taskRoles.includes(session.role);
  const tasks = useQuery({
    queryKey: operationsKeys.tasks(session?.generation ?? '', page),
    queryFn: ({ signal }) => operationsApi.tasks(page, signal),
    enabled: allowed,
    placeholderData: keepPreviousData,
    retry: false,
  });
  if (!session) return null;
  if (!allowed) return <Notice>Task queues are for specialists, coordinators and drivers.</Notice>;
  const pages = tasks.data ? Math.ceil(tasks.data.totalElements / OPERATIONS_PAGE_SIZE) : 0;
  return (
    <section className="card" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">My active tasks</h2>
      {tasks.isPending ? (
        <Loading />
      ) : tasks.error ? (
        <ErrorNotice error={tasks.error}>
          {tasks.error instanceof ApiError && tasks.error.status === 503 ? (
            <p>
              Activity is not deployed on this server yet (migration 008). This is not an empty
              queue.
            </p>
          ) : null}
          <button type="button" onClick={() => void tasks.refetch()}>
            Try again
          </button>
        </ErrorNotice>
      ) : !tasks.data.items.length ? (
        <p>No active tasks are assigned to you right now.</p>
      ) : (
        <div className="table-scroll" aria-busy={tasks.isPlaceholderData}>
          <table aria-label="My active tasks">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Work</th>
                <th scope="col">Due</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.data.items.map((t) => {
                const to = taskPath(t);
                return (
                  <tr key={t.assignmentId}>
                    <td>{t.orderId}</td>
                    <td>
                      {taskRoleLabels[t.role] ?? t.role}
                      {t.legId !== null && ` · leg ${t.legId}`}
                    </td>
                    <td>{t.dueAt ? displayDate(t.dueAt) : 'No due time'}</td>
                    <td>
                      {to ? <Link to={to}>Open</Link> : <span className="muted">No page</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(pages > 1 || page > 0) && (
        <Pagination
          page={page}
          pages={pages}
          onChange={(next) => setParams({ page: String(next) })}
          pending={tasks.isFetching}
        />
      )}
    </section>
  );
}

/** Route component for /staff/tasks (Specialist/Coordinator). */
export function StaffTaskPage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">MY WORK</small>
          <h1>My tasks</h1>
          <p>Cases and legs currently assigned to you.</p>
        </div>
      </header>
      <TaskQueue />
    </>
  );
}
