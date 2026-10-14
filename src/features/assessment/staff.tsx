import type { ReactNode } from 'react';
import {
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeading,
  Pagination,
} from '../../shared/ui/common';
import { caseRoles, type CaseRole, type CaseStaff } from './contracts';
import { useStaffDirectory, useStaffDirectoryParams } from './hooks';

export const caseRoleLabels: Record<CaseRole, string> = {
  SPECIALIST: 'Specialist',
  COORDINATOR: 'Coordinator',
};

// Never translate NOT_CONFIGURED into "Available": no calendar exists yet.
export function availabilityLabel(status: string) {
  return status === 'NOT_CONFIGURED' ? 'Schedule not configured' : 'Availability unknown';
}

/**
 * Paged directory for one role. FE-16/FE-18 reuse it as a picker through
 * `renderAction`; the StaffID it passes is the key assignment commands need.
 */
export function StaffDirectory({
  role,
  page,
  onPageChange,
  renderAction,
}: {
  role: CaseRole;
  page: number;
  onPageChange: (page: number) => void;
  renderAction?: (staff: CaseStaff) => ReactNode;
}) {
  const query = useStaffDirectory(role, page);
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        <button type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </ErrorNotice>
    );
  const { items, totalElements, totalPages } = query.data;
  return (
    <>
      {!items.length ? (
        <div className="empty">
          <h2>No active {caseRoleLabels[role].toLowerCase()}s</h2>
          <p>Staff accounts are provisioned separately; none are active for this role.</p>
        </div>
      ) : (
        <div className="table-scroll" aria-busy={query.isPlaceholderData}>
          <table>
            <caption className="sr-only">
              {caseRoleLabels[role]} directory: {totalElements} active staff
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Active cases</th>
                <th scope="col">Schedule</th>
                {renderAction && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.staffId}>
                  <td>{s.fullName}</td>
                  <td>{caseRoleLabels[s.role]}</td>
                  <td>{s.activeCases}</td>
                  <td>
                    <span className="badge">{availabilityLabel(s.availabilityStatus)}</span>
                  </td>
                  {renderAction && <td>{renderAction(s)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(totalPages > 1 || page > 0) && (
        <Pagination
          page={page}
          pages={totalPages}
          onChange={onPageChange}
          pending={query.isFetching}
        />
      )}
    </>
  );
}

export function ManagerStaffPage() {
  const { role, page, setRole, setPage } = useStaffDirectoryParams();
  return (
    <>
      <PageHeading
        eyebrow="REQUEST ASSESSMENT · MANAGER"
        title="Case Staff"
        description="Active Specialists and Coordinators with their current case workload."
      />
      <Notice>
        Staff can hold several cases. Active cases show workload only; travel availability is not
        tracked yet.
      </Notice>
      <section className="card">
        <Field label="Role">
          {(id) => (
            <select id={id} value={role} onChange={(e) => setRole(e.target.value as CaseRole)}>
              {caseRoles.map((r) => (
                <option key={r} value={r}>
                  {caseRoleLabels[r]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <StaffDirectory role={role} page={page} onPageChange={setPage} />
      </section>
    </>
  );
}
