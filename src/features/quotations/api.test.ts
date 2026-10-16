import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quotationsApi } from './api';
import { quotation, pageOf } from './testing';
import { quotationStatuses, quoteResponseSchema } from './contracts';
import { startSession } from '../../shared/api/session';
import { queryClient } from '../../shared/api/query';

beforeEach(() => {
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('quotation contracts and reads', () => {
  it('uses the bounded list endpoint without requiring totalPages or reading each detail', async () => {
    const fetch = vi.fn().mockResolvedValue(json(pageOf()));
    vi.stubGlobal('fetch', fetch);
    const page = await quotationsApi.list(9, 0, 20);
    expect(page).not.toHaveProperty('totalPages');
    expect(page.totalElements).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8080/api/transport-orders/9/quotes?page=0&size=20',
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only');
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });
  it.each([
    [-1, 20],
    [0, 0],
    [0, 101],
    [0.5, 20],
  ])('rejects page=%s size=%s before sending a request', (page, size) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => quotationsApi.list(9, page, size)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reads detail by order and quote, keeps decimal text and strips unknown private fields', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({
          ...quotation,
          quote: { ...quotation.quote, total: '9007199254740993.01', supplierCost: 'private' },
          purchaseCost: 'private',
          margin: 'private',
          internalNotes: 'private',
          items: [{ ...quotation.items[0], evidenceFileKey: 'private' }],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await quotationsApi.get(9, 31);
    expect(fetch.mock.calls[0][0]).toContain('/9/quotes/31');
    expect(result.quote.total).toBe('9007199254740993.01');
    expect(result.items[0].quantity).toBe('100.125');
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result.recordVersion).toBe(quotation.recordVersion);
  });
  it.each(quotationStatuses)('supports the declared %s status', (status) => {
    expect(
      quoteResponseSchema.parse({ ...quotation, quote: { ...quotation.quote, status } }).quote
        .status,
    ).toBe(status);
  });
  it('keeps null totals and pending amounts distinct from zero and rejects numeric money', () => {
    expect(
      quoteResponseSchema.parse({ ...quotation, quote: { ...quotation.quote, total: null } }).quote
        .total,
    ).toBeNull();
    expect(
      quoteResponseSchema.safeParse({ ...quotation, quote: { ...quotation.quote, total: 0 } })
        .success,
    ).toBe(false);
    for (const amount of ['1e3', '1.001'])
      expect(
        quoteResponseSchema.safeParse({
          ...quotation,
          quote: { ...quotation.quote, total: amount },
        }).success,
      ).toBe(false);
    expect(
      quoteResponseSchema.safeParse({
        ...quotation,
        items: [{ ...quotation.items[0], quantity: '1.0001' }],
      }).success,
    ).toBe(false);
  });
  it.each([403, 404])(
    'preserves ownership/authorization error %s without fixture fallback',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Unavailable' }, status)));
      await expect(quotationsApi.get(9, 31)).rejects.toMatchObject({ status });
    },
  );
  it('discards an old account response even if it arrives after the account changed', async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      ),
    );
    const result = quotationsApi.get(9, 31);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    startSession({
      accessToken: 'second-test-token',
      tokenType: 'Bearer',
      expiresIn: 60,
      role: 'MANAGER',
    });
    finish(json(quotation));
    await rejected;
  });
  it('passes cancellation into fetch and discards a cancelled read', async () => {
    let signal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            signal = options.signal;
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const result = quotationsApi.get(9, 31, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(signal.aborted).toBe(true);
  });
});
