import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { request } from './client';
import { restoreSession, signOut } from './refresh';
import { clearSession, getSession, RENEW_BEFORE_MS, startSession } from './session';

const login = (accessToken = 'first', role: 'CUSTOMER' | 'MANAGER' = 'CUSTOMER') => ({
  accessToken,
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  role,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const calls = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.map(([url, init]) => ({
    url: String(url).replace('http://localhost:8080', ''),
    credentials: (init as RequestInit).credentials,
    headers: (init as RequestInit).headers as Record<string, string>,
  }));

beforeEach(() => {
  sessionStorage.clear();
  clearSession();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('access token in memory, renewed from the refresh cookie', () => {
  it('stores no token, only the tab role hint, and forgets both on clear', () => {
    startSession(login(), { refreshable: true });
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('first');
    expect(sessionStorage.getItem('equitransit.role')).toBe('CUSTOMER');
    clearSession();
    expect(sessionStorage.getItem('equitransit.role')).toBeNull();
  });

  it('removes a token left by an older build', async () => {
    sessionStorage.setItem('equitransit.session', '{"accessToken":"old"}');
    vi.resetModules();
    await import('./session');
    expect(sessionStorage.getItem('equitransit.session')).toBeNull();
  });

  it('restores a reloaded tab from the cookie, asking for the same role', async () => {
    sessionStorage.setItem('equitransit.role', 'MANAGER');
    const fetch = vi.fn().mockResolvedValue(json(login('restored', 'MANAGER')));
    vi.stubGlobal('fetch', fetch);
    await restoreSession();
    expect(getSession()).toMatchObject({
      accessToken: 'restored',
      role: 'MANAGER',
      refreshable: true,
    });
    expect(calls(fetch)).toEqual([
      {
        url: '/api/auth/refresh',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-Expected-Role': 'MANAGER' }),
      },
    ]);
  });

  it('does not call the server for a tab that never signed in', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await restoreSession();
    expect(fetch).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });

  it('a rejected restore leaves the tab signed out', async () => {
    sessionStorage.setItem('equitransit.role', 'CUSTOMER');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ errorCode: 'REFRESH_TOKEN_EXPIRED' }, 401)),
    );
    await restoreSession();
    expect(getSession()).toBeNull();
    expect(sessionStorage.getItem('equitransit.role')).toBeNull();
  });

  it('renews shortly before expiry and keeps the cache generation', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(json(login('second')));
    vi.stubGlobal('fetch', fetch);
    startSession(login(), { refreshable: true });
    const generation = getSession()!.generation;
    await vi.advanceTimersByTimeAsync(900_000 - RENEW_BEFORE_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(getSession()).toMatchObject({ accessToken: 'second', generation });
    // The old 15-minute expiry no longer signs the user out.
    await vi.advanceTimersByTimeAsync(RENEW_BEFORE_MS + 1_000);
    expect(getSession()?.accessToken).toBe('second');
  });

  it('signs out when the server rejects the renewal', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ errorCode: 'REFRESH_TOKEN_REUSED' }, 401)),
    );
    startSession(login(), { refreshable: true });
    await vi.advanceTimersByTimeAsync(900_000 - RENEW_BEFORE_MS + 1);
    expect(getSession()).toBeNull();
  });

  it('a session without a refresh cookie still ends at expiry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    startSession(login());
    await vi.advanceTimersByTimeAsync(900_000 + 1);
    expect(getSession()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('on a 401 renews once and repeats the identical request with the new token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ message: 'expired' }, 401))
      .mockResolvedValueOnce(json(login('second')))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    startSession(login(), { refreshable: true });
    const generation = getSession()!.generation;
    await expect(
      request('/api/x', z.object({ ok: z.boolean() }), { method: 'POST', body: { a: 1 } }),
    ).resolves.toEqual({ ok: true });
    const [first, refresh, retry] = fetch.mock.calls;
    expect(String(refresh[0])).toBe('http://localhost:8080/api/auth/refresh');
    expect(retry[1].body).toBe(first[1].body);
    expect(retry[1].headers.Authorization).toBe('Bearer second');
    expect(getSession()?.generation).toBe(generation);
  });

  it('a second 401 after renewal signs out instead of looping', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(login('second')))
      .mockResolvedValueOnce(json({}, 401));
    vi.stubGlobal('fetch', fetch);
    startSession(login(), { refreshable: true });
    await expect(request('/api/x', z.object({}))).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(getSession()).toBeNull();
  });

  it('concurrent 401s share one refresh call', async () => {
    let refreshes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        if (url.endsWith('/api/auth/refresh')) {
          refreshes++;
          return Promise.resolve(json(login('second')));
        }
        const auth = (init.headers as Record<string, string>).Authorization;
        return Promise.resolve(auth === 'Bearer second' ? json({}) : json({}, 401));
      }),
    );
    startSession(login(), { refreshable: true });
    await Promise.all([request('/api/a', z.object({})), request('/api/b', z.object({}))]);
    expect(refreshes).toBe(1);
  });

  it('log out revokes the cookie on the server, and still signs out offline', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    startSession(login(), { refreshable: true });
    await signOut();
    expect(calls(fetch)[0]).toMatchObject({ url: '/api/auth/logout', credentials: 'include' });
    expect(getSession()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    startSession(login(), { refreshable: true });
    await signOut();
    expect(getSession()).toBeNull();
  });
});
