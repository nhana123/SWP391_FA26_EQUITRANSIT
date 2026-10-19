import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quoteMutationsApi, type QuoteActionCommand } from './mutations';
import { quotation } from './testing';
import { startSession } from '../../shared/api/session';
import { queryClient } from '../../shared/api/query';

beforeEach(() => {
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
afterEach(() => vi.unstubAllGlobals());
const command: QuoteActionCommand = {
  action: 'ACCEPT',
  recordVersion: '00000000000000a2',
  operationId: 'd86b4f63-5acc-4f20-8da3-e24323268814',
};
describe('Customer quotation action adapter', () => {
  it.each(['ACCEPT', 'REJECT'] as const)(
    'sends only the nested contract for %s, without payment or booking requests',
    async (action) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...quotation,
            supplierPurchaseCost: 'PRIVATE',
            internalNotes: 'PRIVATE',
          }),
        ),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await quoteMutationsApi.act(9, 31, {
        ...command,
        action,
        reason: 'must not be sent',
      } as QuoteActionCommand);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe('http://localhost:8080/api/transport-orders/9/quotes/31/actions');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        command: { recordVersion: command.recordVersion, operationId: command.operationId },
        action,
      });
      expect(options.headers.Authorization).toBe('Bearer test-only');
      expect(JSON.stringify(result)).not.toContain('PRIVATE');
      expect(result.quote.total).toBe('1234.50');
    },
  );
  it.each([400, 401, 403, 404, 409, 503])(
    'preserves error %s and never retries a POST automatically',
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: status === 503 ? 'QUOTE_SCHEMA_PENDING' : 'QUOTE_STATE_CONFLICT',
          }),
          { status },
        ),
      );
      vi.stubGlobal('fetch', fetch);
      await expect(quoteMutationsApi.act(9, 31, command)).rejects.toMatchObject({ status });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects an invalid parent or quote ID before dispatch', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => quoteMutationsApi.act(0, 31, command)).toThrow();
    expect(() => quoteMutationsApi.act(9, -1, command)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
