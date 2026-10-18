import type { RouteObject } from 'react-router-dom';
import { StaffTaskPage } from './TaskQueue';

/**
 * Route export for FE1 to place in the shared router (#82: Dev1 owns
 * menu/router wiring). Mount inside the SPECIALIST/COORDINATOR staff block,
 * under /staff, so the path resolves to /staff/tasks.
 *
 * The DRIVER queue needs no route: it is the /driver home (DriverHome).
 */
export const staffTaskRoutes: RouteObject[] = [{ path: 'tasks', element: <StaffTaskPage /> }];
export const staffTaskLink = { to: '/staff/tasks', label: 'My Tasks' } as const;
