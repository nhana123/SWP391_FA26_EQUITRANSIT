import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plansApi } from './api';
import { startSession } from '../../shared/api/session';
import { planDetail } from './testing';

beforeEach(() => {
  startSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresIn: 60,
    role: 'COORDINATOR',
  });
});
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
const origin = 'http://localhost:8080/api/transport-orders/101/plans';
const command = {
  operationId: 'd2046c13-4c31-49b9-8695-edbab59eec2b',
  recordVersion: '000000000001A2B3',
};

describe('plan adapter (#80)', () => {
  it('reads detail with km/slot numbers as text and the order version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(planDetail())));
    const p = await plansApi.get(101, 311);
    expect(p.recordVersion).toBe('000000000001A2B3');
    expect(p.legs[0].distanceKm).toBe('45.5');
  });

  it('creates a draft with a nested command and flat legs', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(planDetail())));
    vi.stubGlobal('fetch', fetch);
    const legs = [
      {
        sequenceNo: 1,
        transportMode: 'ROAD' as const,
        startPoint: 'A',
        endPoint: 'B',
        distanceKm: 45.5,
        distanceSource: 'Verified',
        plannedDeparture: '2027-02-01T06:00:00Z',
        plannedArrival: '2027-02-01T08:00:00Z',
        startTimezone: null,
        endTimezone: null,
        supplierId: null,
        plannedFlightNumber: null,
        connectionBufferMinutes: null,
        restDurationMinutes: null,
        careInstructions: null,
      },
    ];
    await plansApi.draft(101, { ...command, revisionId: 201, setAsCurrentDraft: true, legs });
    expect(fetch.mock.calls[0][0]).toBe(origin);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      command,
      revisionId: 201,
      setAsCurrentDraft: true,
      legs,
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).legs[0].distanceKm).toBe(45.5);
  });

  it('targets the exact plan and leg for assignments and confirmation', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(planDetail())));
    vi.stubGlobal('fetch', fetch);
    await plansApi.road(101, 311, 401, {
      ...command,
      vehicleId: 11,
      vehicleRecordVersion: '00000000000000B1',
      driverStaffId: 41,
      driverBufferMinutes: 60,
      conflictNotes: null,
    });
    await plansApi.confirm(101, 311, { ...command, acceptedQuoteId: 301 });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      `${origin}/311/legs/401/road-assignment`,
      `${origin}/311/confirm`,
    ]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ command, acceptedQuoteId: 301 });
  });

  it('rejects invalid IDs before sending', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => plansApi.get(101, 0)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
