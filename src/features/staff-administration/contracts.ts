import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

export const staffRoles = ['MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER'] as const;
export const staffStatuses = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
export const staffRoleSchema = z.enum(staffRoles);
export const staffStatusSchema = z.enum(staffStatuses);
export type StaffRole = z.infer<typeof staffRoleSchema>;
export type StaffStatus = z.infer<typeof staffStatusSchema>;
const count = z.number().int().nonnegative();

// A separate, private adapter. Credentials are never part of a response/cache.
export const staffSchema = z.object({
  staffId: idSchema,
  userId: idSchema,
  email: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  role: staffRoleSchema,
  accountStatus: staffStatusSchema,
  staffStatus: staffStatusSchema,
  employeeCode: z.string(),
  department: z.string().nullable(),
  specialization: z.string().nullable(),
  recordVersion: versionSchema,
  activeOrderAssignments: count,
  activeTripAssignments: count,
  activeAssignments: count,
});
export type Staff = z.infer<typeof staffSchema>;
export const staffPageSchema = z.object({
  items: z.array(staffSchema),
  actorStaffId: idSchema,
  actorRecordVersion: versionSchema,
  page: count,
  size: z.number().int().positive().max(100),
  totalElements: count,
});
export type StaffPage = z.infer<typeof staffPageSchema>;
export type StaffProfile = Pick<
  Staff,
  'email' | 'fullName' | 'phone' | 'role' | 'employeeCode' | 'department' | 'specialization'
>;
export type StaffCommand = { recordVersion: string; operationId: string };
export type ProfileCommand = { command: StaffCommand; profile: StaffProfile };
export type CreateCommand = ProfileCommand & { initialPassword: string };
export type StatusCommand = { command: StaffCommand; status: StaffStatus; reason: string };
export type StaffFilters = { role?: StaffRole; status?: StaffStatus; page: number };

export const staffRoleLabels: Record<StaffRole, string> = {
  MANAGER: 'Manager',
  SPECIALIST: 'Specialist',
  COORDINATOR: 'Coordinator',
  DRIVER: 'Driver',
};
export const staffStatusLabels: Record<StaffStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  LOCKED: 'Locked',
};
