import { useSyncExternalStore } from 'react';
import { loginSchema, type LoginResponse } from './contracts';
type Session = LoginResponse & { generation: string; expiresAt: number };
let current: Session | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let onClear: () => void = () => {};
const emit = () => listeners.forEach((fn) => fn());

/**
 * The session survives a page refresh in this tab only (sessionStorage):
 * closing the tab, logging out, a 401 or expiry removes it. Team decision for
 * the release; a BE refresh-token cookie would avoid storing the token at all.
 */
const STORAGE_KEY = 'equitransit.session';
function store(session: Session | null) {
  try {
    if (session)
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken: session.accessToken,
          tokenType: session.tokenType,
          role: session.role,
          expiresAt: session.expiresAt,
        }),
      );
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be blocked (private mode, policy): the session stays in memory only.
  }
}
/** A stored, unexpired, well-formed session or null. Anything else is discarded. */
function stored(now = Date.now()): LoginResponse | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    const expiresAt =
      value && typeof value === 'object' && 'expiresAt' in value ? Number(value.expiresAt) : NaN;
    const remaining = Math.floor((expiresAt - now) / 1000);
    const parsed = loginSchema.safeParse({ ...(value as object), expiresIn: remaining });
    if (!Number.isFinite(expiresAt) || remaining <= 0 || !parsed.success) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function configureSessionCleanup(cleanup: () => void) {
  onClear = cleanup;
}
export function clearSession() {
  clearTimeout(timer);
  current = null;
  store(null);
  onClear();
  emit();
}
function begin(response: LoginResponse) {
  current = {
    ...response,
    generation: crypto.randomUUID(),
    expiresAt: Date.now() + response.expiresIn * 1000,
  };
  timer = setTimeout(clearSession, Math.min(response.expiresIn * 1000, 2_147_483_647));
}
export function startSession(response: LoginResponse) {
  clearSession();
  begin(response);
  store(current);
  emit();
}
/** Restores the tab's session after a refresh; a fresh generation keeps caches separate. */
export function restoreSession() {
  if (current) return current;
  const saved = stored();
  if (saved) begin(saved);
  return current;
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

restoreSession();
