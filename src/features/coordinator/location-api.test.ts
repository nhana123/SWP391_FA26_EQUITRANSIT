import { afterEach, describe, expect, it, vi } from 'vitest';
import { coordinatorApi, type CoordinatorLocationRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('Location write wire contract', () => {
  it.each(['create', 'update'] as const)(
    'sends Backend DTO fields for %s and SQL-safe coordinate precision',
    async (action) => {
      const body: CoordinatorLocationRequest = {
        countryCode: 'VN',
        locationCode: 'HUB-VN-01',
        locationName: 'Equitransit NVH',
        locationType: 'HUB',
        address: 'Lưu Hữu Phước, Hồ Chí Minh, Việt Nam',
        latitude: 10.87513712345,
        longitude: 106.80145531234,
        domesticRatePerKm: 2,
        isActive: true,
        isPrimaryHub: true,
      };
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...body,
            locationId: 123,
          }),
          { status: action === 'create' ? 201 : 200 },
        ),
      );
      vi.stubGlobal('fetch', fetcher);
      if (action === 'create') await coordinatorApi.createLocation(body);
      else await coordinatorApi.updateLocation(123, body);
      const options = fetcher.mock.calls[0][1] as RequestInit;
      const payload = JSON.parse(options.body as string);
      expect(payload).toMatchObject({
        countryCode: 'VN',
        locationName: 'Equitransit NVH',
        locationCode: 'HUB-VN-01',
        latitude: 10.8751371,
        longitude: 106.8014553,
      });
      expect(payload).not.toHaveProperty('country');
      expect(payload).not.toHaveProperty('name');
      expect(payload).not.toHaveProperty('code');
    },
  );

  it('rejects an overlong Hub code before sending the request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(() =>
      coordinatorApi.createLocation({
        countryCode: 'VN',
        locationCode: 'HUB-VN-123456',
        locationName: 'Hub',
        locationType: 'HUB',
      }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
