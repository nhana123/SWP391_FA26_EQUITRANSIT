/**
 * F13 incidents and operational adjustments are on BE dev (11f684e), so they
 * are on by default. Set VITE_F13_INCIDENTS=false for a server that still
 * runs an older BE without those controllers.
 */
export const incidentsEnabled = () => import.meta.env.VITE_F13_INCIDENTS !== 'false';
