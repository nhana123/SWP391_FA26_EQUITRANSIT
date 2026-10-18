import { optional, passwordErrors, type FieldErrors } from '../../shared/lib/validation';
import { staffRoles, type Staff, type StaffProfile } from './contracts';

export const emptyProfile: StaffProfile = {
  email: '',
  fullName: '',
  phone: null,
  role: 'SPECIALIST',
  employeeCode: '',
  department: null,
  specialization: null,
};
export function profileOf(staff: Staff): StaffProfile {
  const { email, fullName, phone, role, employeeCode, department, specialization } = staff;
  return { email, fullName, phone, role, employeeCode, department, specialization };
}
export function normalizedProfile(profile: StaffProfile): StaffProfile {
  return {
    ...profile,
    email: profile.email.trim(),
    fullName: profile.fullName.trim(),
    employeeCode: profile.employeeCode.trim(),
    phone: optional(profile.phone ?? ''),
    department: optional(profile.department ?? ''),
    specialization: optional(profile.specialization ?? ''),
  };
}
export function validateProfile(profile: StaffProfile, initialPassword?: string): FieldErrors {
  const p = normalizedProfile(profile);
  const errors: FieldErrors = {};
  if (!p.email || p.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
    errors.email = 'Enter an email address of at most 255 characters.';
  if (!p.fullName || p.fullName.length > 150) errors.fullName = 'Enter a name (1–150 characters).';
  if (!p.employeeCode || p.employeeCode.length > 50)
    errors.employeeCode = 'Enter an employee code (1–50 characters).';
  if (!staffRoles.includes(p.role)) errors.role = 'Choose an internal staff role.';
  if (p.phone !== null && !/^\+[1-9]\d{7,14}$/.test(p.phone))
    errors.phone = 'Use an international phone number, e.g. +84901234567.';
  if (p.department !== null && p.department.length > 100)
    errors.department = 'Use at most 100 characters.';
  if (p.specialization !== null && p.specialization.length > 200)
    errors.specialization = 'Use at most 200 characters.';
  if (
    initialPassword !== undefined &&
    (initialPassword.trim().length === 0 ||
      passwordErrors(initialPassword, initialPassword).password)
  )
    errors.initialPassword = 'Use 12–72 characters and at most 72 UTF-8 bytes.';
  return errors;
}
