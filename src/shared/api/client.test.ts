import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, ApiError } from './client';
import { messageSchema } from './contracts';
import { getSession, startSession } from './session';
import { queryClient } from './query';
afterEach(() => vi.unstubAllGlobals());
describe('HTTP boundaries and session isolation', () => {
  it('clears the token and user cache on protected 401', async () => {
    startSession({
      accessToken: 'test-only',
      tokenType: 'Bearer',
      expiresIn: 60,
      role: 'CUSTOMER',
    });
    queryClient.setQueryData(['session', 'test', 'horses'], ['private horse']);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'Authentication required.' }), { status: 401 }),
        ),
    );
    await expect(request('/api/customers/me', messageSchema)).rejects.toBeInstanceOf(ApiError);
    expect(getSession()).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
  it('does not retry a mutation after network ambiguity', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', fetch);
    await expect(
      request('/api/horses', messageSchema, { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ status: 0, uncertain: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed success payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 12 }), { status: 200 })),
    );
    await expect(request('/api/health', messageSchema, { public: true })).rejects.toMatchObject({
      status: 502,
    });
  });
  it('keeps a session on 403 and does not attach credentials to public calls', async () => {
    startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    await expect(request('/api/horses', messageSchema)).rejects.toMatchObject({ status: 403 });
    expect(getSession()?.role).toBe('MANAGER');
    fetch.mockResolvedValue(new Response(JSON.stringify({ message: 'ok' }), { status: 200 }));
    await request('/api/auth/forgot-password', messageSchema, { public: true });
    expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });
});
