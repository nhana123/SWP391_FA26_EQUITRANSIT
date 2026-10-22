import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { operationsApi, OPERATIONS_PAGE_SIZE } from '../activity-operations/api';
import type { Task } from '../activity-operations/contracts';
import { ASSIGNED_PAGE_SIZE, assignedCasesApi } from '../assigned-cases/api';
import type { CaseSummary } from '../assessment/contracts';

/**
 * One dossier on the Specialist desk: the assigned case (code, route,
 * deadline, status) joined with its live task (preparation due time). Both
 * come from staff-scoped endpoints, so nothing outside the caller's live
 * assignments is ever shown.
 */
export type Dossier = {
  orderId: number;
  orderNumber: string | null;
  status: CaseSummary['orderStatus'] | null;
  origin: string | null;
  destination: string | null;
  deliveryDeadline: string | null;
  taskDueAt: string | null;
  hasTask: boolean;
  /**
   * False when the staff case routes no longer show this case (e.g. it moved
   * past preparation) although a live task remains: only the legal file opens.
   */
  caseAvailable: boolean;
};

/** Desk filters, derived from the request status only (no per-case calls). */
export type DossierBucket = 'ASSESSMENT' | 'COMPLIANCE' | 'CLEARED' | 'OTHER';
export function dossierBucket(status: Dossier['status']): DossierBucket {
  if (status === 'APPROVED') return 'ASSESSMENT';
  if (status === 'IN_PREPARATION' || status === 'CONFIRMED') return 'COMPLIANCE';
  if (status && ['IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CLOSED'].includes(status))
    return 'CLEARED';
  return 'OTHER';
}

/** Small assignment sets: read every page, but never more than this many. */
const MAX_PAGES = 5;

async function allPages<T>(
  load: (page: number) => Promise<{ items: T[]; totalElements: number }>,
  size: number,
) {
  const items: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await load(page);
    items.push(...result.items);
    if (!result.items.length || (page + 1) * size >= result.totalElements) break;
  }
  return items;
}

export function mergeDossiers(cases: CaseSummary[], tasks: Task[]): Dossier[] {
  const byOrder = new Map<number, Dossier>();
  for (const c of cases)
    byOrder.set(c.orderId, {
      orderId: c.orderId,
      orderNumber: c.orderNumber,
      status: c.orderStatus,
      origin: c.originCountryCode,
      destination: c.destinationCountryCode,
      deliveryDeadline: c.deliveryDeadline,
      taskDueAt: null,
      hasTask: false,
      caseAvailable: true,
    });
  for (const t of tasks) {
    if (t.role !== 'SPECIALIST') continue;
    const known = byOrder.get(t.orderId);
    const dueAt =
      known?.taskDueAt && t.dueAt ? [known.taskDueAt, t.dueAt].sort()[0] : (t.dueAt ?? null);
    byOrder.set(
      t.orderId,
      known
        ? { ...known, taskDueAt: dueAt, hasTask: true }
        : {
            orderId: t.orderId,
            orderNumber: null,
            status: null,
            origin: null,
            destination: null,
            deliveryDeadline: null,
            taskDueAt: t.dueAt,
            hasTask: true,
            caseAvailable: false,
          },
    );
  }
  const time = (d: Dossier) =>
    Date.parse(d.taskDueAt ?? d.deliveryDeadline ?? '') || Number.MAX_SAFE_INTEGER;
  return [...byOrder.values()].sort((a, b) => time(a) - time(b) || a.orderId - b.orderId);
}

/** The Specialist's desk: assigned cases enriched with their tasks. */
export function useDossiers(enabled = true) {
  const session = useSession();
  return useQuery({
    queryKey: [...queryKeys.session(session?.generation ?? ''), 'specialist-desk'],
    queryFn: async ({ signal }) => {
      // Cases are the dossiers; tasks only add preparation due times, so a
      // task failure leaves the desk usable and says so.
      const [cases, tasks] = await Promise.all([
        allPages((p) => assignedCasesApi.list(p, signal), ASSIGNED_PAGE_SIZE),
        allPages((p) => operationsApi.tasks(p, signal), OPERATIONS_PAGE_SIZE).catch(
          (error: unknown) => {
            if (signal.aborted) throw error;
            return null;
          },
        ),
      ]);
      const merged = mergeDossiers(cases, tasks ?? []);
      // A live task whose case the staff case routes no longer list: the
      // caller's own dashboard still names it (code and status).
      let dossiers = merged;
      if (merged.some((d) => !d.caseAvailable)) {
        const named = await allPages(
          (p) => operationsApi.dashboard('SPECIALIST', p, signal),
          OPERATIONS_PAGE_SIZE,
        ).catch(() => []);
        dossiers = merged.map((d) => {
          const found = d.caseAvailable ? null : named.find((n) => n.orderId === d.orderId);
          return found ? { ...d, orderNumber: found.orderNumber, status: found.status } : d;
        });
      }
      return { dossiers, tasksUnavailable: tasks === null };
    },
    enabled: enabled && !!session,
    staleTime: 0,
    retry: false,
  });
}
