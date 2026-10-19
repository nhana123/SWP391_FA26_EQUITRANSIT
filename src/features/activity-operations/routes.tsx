import type { RouteObject } from 'react-router-dom';
import { AssignedCasesLayout } from '../assigned-cases/pages';
import { StaffDashboardPage } from './StaffDashboard';
import { StaffTaskPage } from './TaskQueue';

/**
 * Route export for FE1 to place in the shared router (#82: Dev1 owns
 * menu/router wiring). Add it as a sibling of the '/staff/cases' route inside
 * the SPECIALIST/COORDINATOR RoleGate; it reuses the staff layout.
 *
 * The DRIVER queue needs no route: it is the /driver home (DriverHome).
 */
export const staffTaskRoute: RouteObject = {
  path: '/staff/tasks',
  element: <AssignedCasesLayout />,
  children: [{ index: true, element: <StaffTaskPage /> }],
};
export const staffTaskLink = { to: '/staff/tasks', label: 'My Tasks' } as const;

/** Specialist/Coordinator overview; Manager and Driver mount StaffDashboardPage in their blocks. */
export const staffDashboardRoute: RouteObject = {
  path: '/staff/dashboard',
  element: <AssignedCasesLayout />,
  children: [{ index: true, element: <StaffDashboardPage /> }],
};
export const staffDashboardLink = { to: '/staff/dashboard', label: 'Overview' } as const;
