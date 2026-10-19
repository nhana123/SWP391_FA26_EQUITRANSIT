import { apiBase } from './base';
import { loginSchema } from './contracts';
import {
  clearSession,
  configureRenewal,
  getSession,
  renewSession,
  retryRenewal,
  roleHint,
  startSession,
} from './session';

/**
 * Refresh-cookie flow (BE POST /api/auth/refresh, /api/auth/logout):
 * - the cookie is HttpOnly, so every call uses credentials: 'include';
 * - one refresh at a time, also across tabs (Web Locks): two concurrent
 *   refreshes with the same cookie look like a replay and revoke the session;
 * - X-Expected-Role keeps a tab from silently taking another role's session.
 */
export type RefreshResult = 'renewed' | 'rejected' | 'unknown';
let inflight: Promise<RefreshResult> | null = null;

async function call(): Promise<RefreshResult> {
  const role = getSession()?.role ?? roleHint();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(role ? { 'X-Expected-Role': role } : {}) },
    });
    if (response.status === 401) return 'rejected';
    if (!response.ok) return 'unknown';
    const parsed = loginSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return 'unknown';
    if (getSession()) renewSession(parsed.data);
    else startSession(parsed.data, { refreshable: true });
    return 'renewed';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timeout);
  }
}
async function exclusive(): Promise<RefreshResult> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? await locks.request('equitransit-refresh', call) : call();
}
/** Single-flight refresh. 'rejected' means the BE ended the session. */
export function refreshSession(): Promise<RefreshResult> {
  inflight ??= exclusive().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Before expiry: renew; on a rejection sign out; on a network blip retry soon. */
configureRenewal(() => {
  void refreshSession().then((result) => {
    if (result === 'rejected') clearSession();
    else if (result === 'unknown') retryRenewal(15_000);
  });
});

/** After a reload, a tab that was signed in gets its session back from the cookie. */
export async function restoreSession() {
  if (getSession() || !roleHint()) return;
  const result = await refreshSession();
  if (result === 'rejected') clearSession();
}

/** Revokes the refresh cookie on the server, then forgets the session locally. */
export async function signOut() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(`${apiBase}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
    });
  } catch {
    // Logging out locally must never depend on the network.
  } finally {
    clearTimeout(timeout);
    clearSession();
  }
}
