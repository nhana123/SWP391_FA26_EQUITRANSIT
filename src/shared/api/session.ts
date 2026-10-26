import { useSyncExternalStore } from 'react';
import { roleSchema, type LoginResponse, type Role } from './contracts';

/**
 * The access token lives in memory only. A session started by a real login is
 * "refreshable": the BE also set an HttpOnly refresh cookie (never readable
 * here), so the session renews itself shortly before expiry and is restored
 * after a page reload through POST /api/auth/refresh (see ./refresh).
 * Only this tab's role is kept in sessionStorage/localStorage, as a non-secret hint that
 * this browser was signed in and which role it expects back.
 */
type Session = LoginResponse & { generation: string; expiresAt: number; refreshable: boolean };
let current: Session | null = null;
const listeners = new Set<() => void>();
let expiry: ReturnType<typeof setTimeout> | undefined;
let renewal: ReturnType<typeof setTimeout> | undefined;
let onClear: () => void = () => {};
let renewer: (() => void) | null = null;
const emit = () => listeners.forEach((fn) => fn());
const MAX_DELAY = 2_147_483_647;
/** Renew this long before the access token expires. */
export const RENEW_BEFORE_MS = 60_000;

const ROLE_KEY = 'equitransit.role';
// Older builds stored the access token itself; never keep it around.
try {
  sessionStorage.removeItem('equitransit.session');
} catch {
  // Storage may be blocked; nothing was stored then either.
}

// Ensure localStorage has the roleHint if already signed in in this tab
try {
  const existingRole = sessionStorage.getItem(ROLE_KEY);
  if (existingRole && !localStorage.getItem(ROLE_KEY)) {
    localStorage.setItem(ROLE_KEY, existingRole);
  }
} catch {
  // Storage may be blocked
}

export function roleHint(): Role | null {
  try {
    const raw = sessionStorage.getItem(ROLE_KEY) || localStorage.getItem(ROLE_KEY);
    const parsed = roleSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
function storeRole(role: Role | null) {
  try {
    if (role) {
      sessionStorage.setItem(ROLE_KEY, role);
      localStorage.setItem(ROLE_KEY, role);
    } else {
      sessionStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(ROLE_KEY);
    }
  } catch {
    // Blocked storage: a reload simply asks the user to sign in again.
  }
}

export function configureSessionCleanup(cleanup: () => void) {
  onClear = cleanup;
}
/** Called shortly before expiry for refreshable sessions (set by ./refresh). */
export function configureRenewal(renew: () => void) {
  renewer = renew;
}
function stopTimers() {
  clearTimeout(expiry);
  clearTimeout(renewal);
}
export function clearSession() {
  stopTimers();
  current = null;
  storeRole(null);
  onClear();
  emit();
}
function schedule(session: Session) {
  stopTimers();
  const left = session.expiresAt - Date.now();
  expiry = setTimeout(clearSession, Math.min(Math.max(left, 0), MAX_DELAY));
  if (session.refreshable && renewer) {
    const run = renewer;
    renewal = setTimeout(run, Math.min(Math.max(left - RENEW_BEFORE_MS, 5_000), MAX_DELAY));
  }
}
/** Retry a failed renewal later, while the access token is still valid. */
export function retryRenewal(delayMs: number) {
  if (!current?.refreshable || !renewer) return;
  clearTimeout(renewal);
  const left = current.expiresAt - Date.now();
  if (left > delayMs) renewal = setTimeout(renewer, delayMs);
}
export function startSession(response: LoginResponse, options: { refreshable?: boolean } = {}) {
  clearSession();
  current = {
    ...response,
    generation: crypto.randomUUID(),
    expiresAt: Date.now() + response.expiresIn * 1000,
    refreshable: !!options.refreshable,
  };
  if (current.refreshable) storeRole(current.role);
  schedule(current);
  emit();
}
/**
 * A rotated access token for the same account keeps the generation, so cached
 * data and in-flight requests stay valid.
 */
export function renewSession(response: LoginResponse) {
  if (!current || current.role !== response.role) {
    startSession(response, { refreshable: true });
    return;
  }
  current = {
    ...current,
    accessToken: response.accessToken,
    tokenType: response.tokenType,
    expiresIn: response.expiresIn,
    expiresAt: Date.now() + response.expiresIn * 1000,
  };
  schedule(current);
  emit();
}
export function getSession() {
  return current;
}
export function useSession() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSession,
    () => null,
  );
}
