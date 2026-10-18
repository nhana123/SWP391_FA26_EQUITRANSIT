import type { Staff, StaffPage } from './contracts';
// Test fixtures only; never imported by production code.
export const testStaff = (patch: Partial<Staff> = {}): Staff => ({
  staffId: 31,
  userId: 81,
  email: 'staff@example.invalid',
  fullName: 'Test Specialist',
  phone: null,
  role: 'SPECIALIST',
  accountStatus: 'ACTIVE',
  staffStatus: 'ACTIVE',
  employeeCode: 'TEST-31',
  department: 'Compliance',
  specialization: null,
  recordVersion: '00000000000000a1',
  activeOrderAssignments: 2,
  activeTripAssignments: 0,
  activeAssignments: 2,
  ...patch,
});
export const testStaffPage = (patch: Partial<StaffPage> = {}): StaffPage => ({
  items: [testStaff()],
  actorStaffId: 11,
  actorRecordVersion: '00000000000000b1',
  page: 0,
  size: 20,
  totalElements: 1,
  ...patch,
});
