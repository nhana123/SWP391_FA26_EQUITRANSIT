import { afterEach, expect, it, vi } from 'vitest';
import { tariffApi } from './api';
import { startSession } from '../../shared/api/session';

afterEach(() => vi.unstubAllGlobals());
it('sends create as a top-level UUID/unit command with no version or nested command', async () => {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' });
  const receipt = {
    tariffId: 31,
    product: 'ROAD_TRANSPORT',
    unit: 'SHIPMENT',
    unitPrice: '150.00',
    currency: 'USD',
    version: 1,
    effectiveFrom: '2026-10-18T00:00:00Z',
    effectiveTo: null,
    status: 'ACTIVE',
    sourceReference: 'Approved source',
    sourceReviewRequired: false,
    recordVersion: '00000000000000a1',
  };
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(receipt)));
  vi.stubGlobal('fetch', fetch);
  const input = {
    product: 'ROAD_TRANSPORT' as const,
    unitCode: 'SHIPMENT',
    unitPrice: '150.00',
    sourceReference: 'Approved source',
    validUntil: null,
    operationId: '141933ae-eae5-448d-a3f3-80b3f219fbec',
    recordVersion: null,
  };
  await tariffApi.create(input);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body).not.toHaveProperty('recordVersion');
  expect(body).not.toHaveProperty('command');
  expect(body.unitPrice).toBe('150.00');
  expect(body.unitCode).toBe('SHIPMENT');
  expect(body.operationId).toBe(input.operationId);
  await tariffApi.replace(31, { ...input, recordVersion: receipt.recordVersion });
  expect(fetch.mock.calls[1][0]).toContain('/api/manager/service-tariffs/31');
  expect(fetch.mock.calls[1][1].method).toBe('PUT');
  expect(JSON.parse(fetch.mock.calls[1][1].body).recordVersion).toBe(receipt.recordVersion);
});
