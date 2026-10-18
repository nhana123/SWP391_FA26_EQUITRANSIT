import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { queryClient } from '../../shared/api/query';
import { idSchema } from '../../shared/api/contracts';
import { clearSession, getSession, useSession } from '../../shared/api/session';
import { Field, Loading, Notice, Pagination } from '../../shared/ui/common';
import { assessmentKeys } from '../assessment/hooks';
import { ManagerHeading } from '../assessment/layout';
import { staffApi, staffKeys } from './api';
import {
  staffRoles,
  staffStatuses,
  staffRoleLabels,
  staffStatusLabels,
  staffRoleSchema,
  staffStatusSchema,
  type Staff,
} from './contracts';
import { inaccessible, STAFF_ADMIN_PATH, StaffError, StaffForm } from './StaffForm';
import './staff.css';

function useActor() {
  const session = useSession();
  return useQuery({
    queryKey: staffKeys.list(session?.generation ?? '', { page: 0 }),
    queryFn: ({ signal }) => staffApi.list({ page: 0 }, signal),
    enabled: session?.role === 'MANAGER',
    retry: false,
    staleTime: 0,
  });
}
function Forbidden() {
  return <Notice>Only an active Manager can administer staff.</Notice>;
}
function ReadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <StaffError error={error} />
      {!inaccessible(error) && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
      <p>
        <Link to="/manager/requests">Back to requests</Link>
      </p>
    </>
  );
}

export function StaffAdministrationPage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const role = staffRoleSchema.safeParse(params.get('role'));
  const status = staffStatusSchema.safeParse(params.get('status'));
  const page = Math.min(100000, Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0));
  const filters = {
    page,
    ...(role.success ? { role: role.data } : {}),
    ...(status.success ? { status: status.data } : {}),
  };
  const list = useQuery({
    queryKey: staffKeys.list(session?.generation ?? '', filters),
    queryFn: ({ signal }) => staffApi.list(filters, signal),
    enabled: session?.role === 'MANAGER',
    retry: false,
  });
  if (session?.role !== 'MANAGER') return <Forbidden />;
  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.set('page', '0');
    setParams(next);
  }
  return (
    <>
      <ManagerHeading
        title="Staff Administration"
        description="Internal staff accounts, roles and assignment workload."
      />
      <section className="card">
        <div className="form-grid">
          <Field label="Filter staff role">
            {(id) => (
              <select
                id={id}
                value={role.success ? role.data : ''}
                onChange={(e) => filter('role', e.target.value)}
              >
                <option value="">All roles</option>
                {staffRoles.map((r) => (
                  <option key={r} value={r}>
                    {staffRoleLabels[r]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Filter account status">
            {(id) => (
              <select
                id={id}
                value={status.success ? status.data : ''}
                onChange={(e) => filter('status', e.target.value)}
              >
                <option value="">All statuses</option>
                {staffStatuses.map((s) => (
                  <option key={s} value={s}>
                    {staffStatusLabels[s]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ReadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <>
            <p>
              <Link className="button primary" to={`${STAFF_ADMIN_PATH}/new`}>
                Create staff account
              </Link>
            </p>
            {!list.data.items.length ? (
              <p>No staff match these filters.</p>
            ) : (
              <div className="table-scroll">
                <table aria-label="Staff accounts">
                  <thead>
                    <tr>
                      {[
                        'Staff / User ID',
                        'Name',
                        'Role',
                        'Account / Staff status',
                        'Employee code',
                        'Department',
                        'Specialization',
                        'Order / Trip / All assignments',
                        'Action',
                      ].map((t) => (
                        <th key={t} scope="col">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((s) => (
                      <tr key={s.staffId}>
                        <td>
                          {s.staffId} / {s.userId}
                        </td>
                        <td>
                          {s.fullName}
                          <small className="staff-email">{s.email}</small>
                        </td>
                        <td>{staffRoleLabels[s.role]}</td>
                        <td>
                          {staffStatusLabels[s.accountStatus]} / {staffStatusLabels[s.staffStatus]}
                        </td>
                        <td>{s.employeeCode}</td>
                        <td>{s.department ?? 'Not recorded'}</td>
                        <td>{s.specialization ?? 'Not recorded'}</td>
                        <td>
                          {s.activeOrderAssignments} / {s.activeTripAssignments} /{' '}
                          {s.activeAssignments}
                        </td>
                        <td>
                          <Link to={`${STAFF_ADMIN_PATH}/${s.staffId}`}>View {s.fullName}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>{list.data.totalElements} staff match these filters.</p>
            {(list.data.totalElements > list.data.size || page > 0) && (
              <Pagination
                page={list.data.page}
                pages={Math.ceil(list.data.totalElements / list.data.size)}
                pending={list.isFetching}
                onChange={(value) => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(value));
                  setParams(next);
                }}
              />
            )}
          </>
        )}
      </section>
    </>
  );
}

export function CreateStaffPage() {
  const session = useSession();
  const actor = useActor();
  const navigate = useNavigate();
  if (session?.role !== 'MANAGER') return <Forbidden />;
  return (
    <>
      <ManagerHeading
        title="Create Staff"
        description="Provision an internal account using the current Manager's reviewed authority."
      />
      {actor.isPending ? (
        <Loading />
      ) : actor.error && (!actor.data || inaccessible(actor.error)) ? (
        <ReadError error={actor.error} retry={() => void actor.refetch()} />
      ) : (
        <StaffForm
          key={session.generation}
          mode="create"
          initialVersion={actor.data!.actorRecordVersion}
          readError={actor.error}
          onReload={async () => {
            const current = await staffApi.list();
            queryClient.setQueryData(staffKeys.list(session.generation, { page: 0 }), current);
            return current.actorRecordVersion;
          }}
          onCancel={() => navigate(STAFF_ADMIN_PATH)}
          onDone={async (receipt) => {
            if (getSession()?.generation !== session.generation) return;
            void queryClient.invalidateQueries({ queryKey: staffKeys.all(session.generation) });
            void queryClient.invalidateQueries({
              queryKey: assessmentKeys.staffAll(session.generation),
            });
            navigate(`${STAFF_ADMIN_PATH}/${receipt.staffId}`, {
              state: { staffNotice: 'Staff account created.' },
            });
          }}
        />
      )}
    </>
  );
}

export function StaffAdministrationDetailPage() {
  const session = useSession();
  const { staffId } = useParams();
  const id = idSchema.safeParse(Number(staffId));
  const actor = useActor();
  const detail = useQuery({
    queryKey: staffKeys.detail(session?.generation ?? '', id.success ? id.data : 0),
    queryFn: ({ signal }) => staffApi.get(id.success ? id.data : 0, signal),
    enabled: session?.role === 'MANAGER' && id.success,
    retry: false,
  });
  const [panel, setPanel] = useState<'edit' | 'status' | null>(null);
  const [notice, setNotice] = useState('');
  if (session?.role !== 'MANAGER') return <Forbidden />;
  if (!id.success)
    return (
      <>
        <Notice>Invalid staff ID.</Notice>
        <Link to={STAFF_ADMIN_PATH}>Back to staff administration</Link>
      </>
    );
  if (actor.isPending || detail.isPending) return <Loading />;
  const readError = actor.error || detail.error;
  if (readError && (!actor.data || !detail.data || inaccessible(readError)))
    return (
      <ReadError
        error={readError}
        retry={() => {
          void actor.refetch();
          void detail.refetch();
        }}
      />
    );
  const staff = detail.data!;
  async function updated(receipt: Staff) {
    if (getSession()?.generation !== session!.generation) return;
    if (
      receipt.staffId === actor.data!.actorStaffId &&
      (receipt.role !== 'MANAGER' ||
        receipt.accountStatus !== 'ACTIVE' ||
        receipt.staffStatus !== 'ACTIVE')
    ) {
      clearSession();
      return;
    }
    setPanel(null);
    setNotice('Staff change saved. Current data is being refreshed.');
    await queryClient.invalidateQueries({ queryKey: staffKeys.all(session!.generation) });
    await queryClient.invalidateQueries({ queryKey: assessmentKeys.staffAll(session!.generation) });
  }
  return (
    <>
      <ManagerHeading
        title={staff.fullName}
        description="Staff profile and account state. Staff ID and User ID are separate keys."
      />
      <p>
        <Link to={STAFF_ADMIN_PATH}>Back to staff administration</Link>
      </p>
      {notice && <Notice>{notice}</Notice>}
      {!panel && readError && (
        <ReadError
          error={readError}
          retry={() => {
            void actor.refetch();
            void detail.refetch();
          }}
        />
      )}
      <section className="card">
        <dl className="details">
          {Object.entries({
            'Staff ID': staff.staffId,
            'User ID': staff.userId,
            Email: staff.email,
            Phone: staff.phone,
            Role: staffRoleLabels[staff.role],
            'Account status': staffStatusLabels[staff.accountStatus],
            'Staff status': staffStatusLabels[staff.staffStatus],
            'Employee code': staff.employeeCode,
            Department: staff.department,
            Specialization: staff.specialization,
            'Active order assignments': staff.activeOrderAssignments,
            'Active trip assignments': staff.activeTripAssignments,
            'Total active assignments': staff.activeAssignments,
          }).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? 'Not recorded'}</dd>
            </div>
          ))}
        </dl>
        <div className="actions">
          <button
            type="button"
            disabled={!!readError || panel !== null || detail.isFetching || actor.isFetching}
            onClick={() => setPanel('edit')}
          >
            Edit profile
          </button>
          <button
            type="button"
            disabled={!!readError || panel !== null || detail.isFetching || actor.isFetching}
            onClick={() => setPanel('status')}
          >
            Change status
          </button>
        </div>
      </section>
      {panel && (
        <StaffForm
          key={`${session.generation}-${staff.staffId}-${panel}`}
          mode={panel}
          staff={staff}
          initialVersion={staff.recordVersion}
          readError={readError}
          onReload={async () => {
            const [current, manager] = await Promise.all([
              staffApi.get(staff.staffId),
              staffApi.list(),
            ]);
            queryClient.setQueryData(staffKeys.detail(session.generation, staff.staffId), current);
            queryClient.setQueryData(staffKeys.list(session.generation, { page: 0 }), manager);
            return current.recordVersion;
          }}
          onDone={updated}
          onCancel={() => setPanel(null)}
        />
      )}
    </>
  );
}
