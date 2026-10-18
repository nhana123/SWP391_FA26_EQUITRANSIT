import { ApiError, request } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query';
import {
  staffPageSchema,
  staffSchema,
  type CreateCommand,
  type ProfileCommand,
  type StaffFilters,
  type StatusCommand,
} from './contracts';

export const STAFF_PAGE_SIZE = 20;
export const staffKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'staff-administration'] as const,
  list: (generation: string, filters: StaffFilters) =>
    [...staffKeys.all(generation), 'list', filters] as const,
  detail: (generation: string, id: number) => [...staffKeys.all(generation), 'detail', id] as const,
};
export const staffErrorHelp: Record<string, string> = {
  LAST_ACTIVE_MANAGER_PROTECTED:
    'At least one other active Manager must remain before this change.',
  STAFF_DUPLICATE: 'This email or employee code already exists. Reload, then review both fields.',
  STAFF_VERSION_CONFLICT: 'The staff profile changed. Reload and review before submitting again.',
  IDEMPOTENCY_CONFLICT:
    'This operation ID has different input. Reload and review before a new action.',
  STAFF_ASSIGNMENT_ROLE_CONFLICT:
    'End or reassign incompatible active work before changing the role.',
  DRIVER_IN_TRANSIT: 'Reassign the in-transit driver before disabling this account.',
  STAFF_ADMIN_BUSY: 'Staff administration is busy. Retry the same action.',
  ACTIVE_MANAGER_REQUIRED: 'An active Manager is required. Staff actions are unavailable.',
  STAFF_NOT_FOUND: 'This staff profile is unavailable.',
  STAFF_SCHEMA_PENDING: 'Deployment blocked: staff management requires backend migration 013.',
};

// Do not render arbitrary backend text: a credential validation error can echo
// its input. Only known messages and field names reach the staff UI.
export function safeStaffError(error: unknown): never {
  if (!(error instanceof ApiError))
    throw new ApiError(0, 'Connection interrupted. Retry the same action.');
  const messages: Record<number, string> = {
    400: 'Check the highlighted staff information.',
    401: 'Your session has expired. Sign in again.',
    403: 'An active Manager is required. Staff actions are unavailable.',
    404: 'This staff profile is unavailable.',
    409: 'Staff data conflicts with this action. Reload and review.',
    422: 'This staff change cannot be applied. Review the role, assignments and account state.',
    503: 'Deployment blocked: staff management requires backend migration 013.',
  };
  const fields: Record<string, string> = {};
  const names = [
    'email',
    'fullName',
    'phone',
    'role',
    'employeeCode',
    'department',
    'specialization',
    'initialPassword',
    'reason',
    'status',
  ];
  for (const key of Object.keys(error.fields)) {
    const field = key.replace(/^profile\./, '');
    if (names.includes(field))
      fields[field] =
        field === 'initialPassword'
          ? 'Use 12–72 characters and at most 72 UTF-8 bytes.'
          : 'Check this value against the field requirements.';
  }
  const code = error.code && Object.hasOwn(staffErrorHelp, error.code) ? error.code : undefined;
  throw new ApiError(
    error.status,
    (code && staffErrorHelp[code]) ||
      messages[error.status] ||
      'The request could not be completed. Retry the same action after a connection or server failure.',
    code,
    fields,
  );
}
const base = '/api/manager/staff';
export const staffApi = {
  list: (filters: StaffFilters = { page: 0 }, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      page: String(filters.page),
      size: String(STAFF_PAGE_SIZE),
    });
    if (filters.role) params.set('role', filters.role);
    if (filters.status) params.set('status', filters.status);
    return request(`${base}?${params}`, staffPageSchema, { signal }).catch(safeStaffError);
  },
  get: (id: number, signal?: AbortSignal) =>
    request(`${base}/${id}`, staffSchema, { signal }).catch(safeStaffError),
  create: (body: CreateCommand) =>
    request(base, staffSchema, { method: 'POST', body }).catch(safeStaffError),
  update: (id: number, body: ProfileCommand) =>
    request(`${base}/${id}`, staffSchema, { method: 'PUT', body }).catch(safeStaffError),
  status: (id: number, body: StatusCommand) =>
    request(`${base}/${id}/status`, staffSchema, { method: 'POST', body }).catch(safeStaffError),
};
