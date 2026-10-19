/**
 * F13 incidents and operational adjustments have no controller on the released
 * BE (dev); their routes exist only on an unmerged BE branch. Off by default so
 * the execution page never calls routes that do not exist. Set
 * VITE_F13_INCIDENTS=true once the BE contract is deployed.
 */
export const incidentsEnabled = () => import.meta.env.VITE_F13_INCIDENTS === 'true';
