/**
 * API origin. Defaults to localhost (not 127.0.0.1): the BE refresh cookie is
 * SameSite=Strict, so the FE (http://localhost:5173) and the API must share
 * the hostname or the browser never sends the cookie.
 */
export const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(
  /\/$/,
  '',
);
