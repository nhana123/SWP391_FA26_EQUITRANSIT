import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resourcesApi } from './api';
import { startSession } from '../../shared/api/session';

beforeEach(() => {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
});
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const window = {
  maintenanceFrom: null,
  maintenanceTo: null,
  documentExpiresAt: null,
  bufferMinutes: null,
  notes: null,
};
const stall = {
  id: 12,
  recordVersion: '00000000000000b1',
  data: {
    stallCode: 'STALL-1',
    capacitySlots: 3.0,
    internalHeightCm: 240.0,
    internalWidthCm: 90.5,
    weightLimitKg: null,
    status: 'ACTIVE',
    ownerSupplierId: null,
    window,
  },
};

describe('resource adapter (#79)', () => {
  it('lists a bounded page and reads BigDecimal numbers as text', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ items: [stall], page: 0, size: 20, totalElements: 1 }));
    vi.stubGlobal('fetch', fetch);
    const page = await resourcesApi.list('stalls', 0);
    expect(fetch.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8080/api/manager/resources/stalls?page=0&size=20',
    );
    expect(page.items[0].data.internalWidthCm).toBe('90.5');
    // A NULL legacy buffer stays unknown, never defaulted to 0.
    expect(page.items[0].data.window.bufferMinutes).toBeNull();
  });

  it('sends the nested {command, data} envelope with a null version on create', async () => {
    const fetch = vi.fn().mockResolvedValue(json(stall));
    vi.stubGlobal('fetch', fetch);
    const data = { ...stall.data, capacitySlots: 3, internalHeightCm: 240, internalWidthCm: 90.5 };
    await resourcesApi.create('stalls', {
      operationId: 'c2046c13-4c31-49b9-8695-edbab59eec2b',
      recordVersion: null,
      data: data as never,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8080/api/manager/resources/stalls');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      command: { operationId: 'c2046c13-4c31-49b9-8695-edbab59eec2b', recordVersion: null },
      data,
    });
    expect(JSON.parse(init.body).data.capacitySlots).toBe(3);
  });

  it('updates with PUT to the record and the reviewed version', async () => {
    const fetch = vi.fn().mockResolvedValue(json(stall));
    vi.stubGlobal('fetch', fetch);
    await resourcesApi.replace('stalls', 12, {
      operationId: 'c2046c13-4c31-49b9-8695-edbab59eec2b',
      recordVersion: '00000000000000b1',
      data: stall.data as never,
    });
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8080/api/manager/resources/stalls/12');
    expect(fetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(fetch.mock.calls[0][1].body).command.recordVersion).toBe('00000000000000b1');
  });

  it('probes with the singular kind and a plain read-only body (no command or UUID)', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        kind: 'STALL',
        resourceId: 12,
        recordVersion: '00000000000000b1',
        status: 'PENDING',
        asOf: '2027-02-01T07:00:00Z',
        policyId: null,
        carrierConfirmed: false,
        blockers: ['FIT_POLICY_PENDING'],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const input = {
      orderId: 101,
      revisionId: 201,
      mode: 'AIR' as const,
      start: '2027-02-01T08:00:00Z',
      end: '2027-02-01T18:00:00Z',
      carrierSupplierId: 21,
      legId: null,
    };
    const result = await resourcesApi.probe('STALL', 12, input);
    expect(fetch.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8080/api/resources/STALL/12/availability',
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
    expect(result.blockers).toEqual(['FIT_POLICY_PENDING']);
  });

  it('rejects an invalid ID before sending anything', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => resourcesApi.get('vehicles', 0)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
