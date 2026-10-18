import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'equitransit.session';
const login = {
  accessToken: 'test-only',
  tokenType: 'Bearer' as const,
  expiresIn: 600,
  role: 'CUSTOMER' as const,
};
/** A page refresh: the module is evaluated again against the same tab storage. */
const reload = async () => {
  vi.resetModules();
  return import('./session');
};

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('session across a refresh', () => {
  it('restores the same account after a refresh with a new cache generation', async () => {
    const first = await reload();
    first.startSession(login);
    const before = first.getSession()!;
    const after = (await reload()).getSession();
    expect(after).toMatchObject({
      accessToken: 'test-only',
      tokenType: 'Bearer',
      role: 'CUSTOMER',
    });
    expect(after!.generation).not.toBe(before.generation);
    expect(after!.expiresIn).toBeGreaterThan(590);
  });

  it('stores only token, type, role and expiry', async () => {
    (await reload()).startSession(login);
    expect(Object.keys(JSON.parse(sessionStorage.getItem(KEY)!)).sort()).toEqual([
      'accessToken',
      'expiresAt',
      'role',
      'tokenType',
    ]);
  });

  it('logout removes it, so a refresh stays signed out', async () => {
    const s = await reload();
    s.startSession(login);
    s.clearSession();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect((await reload()).getSession()).toBeNull();
  });

  it('never restores an expired, malformed or tampered session', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...login, expiresAt: Date.now() - 1000 }));
    expect((await reload()).getSession()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    sessionStorage.setItem(KEY, '{not json');
    expect((await reload()).getSession()).toBeNull();
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...login, role: 'ADMIN', expiresAt: Date.now() + 60_000 }),
    );
    expect((await reload()).getSession()).toBeNull();
  });

  it('keeps working in memory when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const s = await reload();
    expect(() => s.startSession(login)).not.toThrow();
    expect(s.getSession()?.role).toBe('CUSTOMER');
  });
});
