import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import {
  addressSuggestionSchema,
  addressValidationResponseSchema,
  routeCountrySchema,
  routeLocationSchema,
  routeMatchResponseSchema,
  type AddressSuggestion,
  type AddressValidationResponse,
  type RouteCountry,
  type RouteLocation,
  type RouteMatchRequest,
  type RouteMatchResponse,
} from '../../shared/api/contracts';

/** Default country catalog matching supported countries with an active EquiTransit Hub */
export const CATALOG_COUNTRIES: RouteCountry[] = [
  { countryCode: 'VN', countryName: 'Việt Nam', supportsRoad: true, supportsAir: true },
  { countryCode: 'LA', countryName: 'Lào', supportsRoad: true, supportsAir: false },
  { countryCode: 'CN', countryName: 'Trung Quốc', supportsRoad: true, supportsAir: true },
  { countryCode: 'TH', countryName: 'Thái Lan', supportsRoad: true, supportsAir: true },
  { countryCode: 'US', countryName: 'Hoa Kỳ', supportsRoad: false, supportsAir: true },
];

/** Default locations matching migration 024 & 027 */
export const CATALOG_LOCATIONS: RouteLocation[] = [
  { locationId: 1, countryCode: 'VN', locationType: 'CITY', locationName: 'TP. Hồ Chí Minh', locationCode: null },
  { locationId: 2, countryCode: 'VN', locationType: 'CITY', locationName: 'Hà Nội', locationCode: null },
  { locationId: 3, countryCode: 'VN', locationType: 'CITY', locationName: 'Lạng Sơn', locationCode: null },
  { locationId: 4, countryCode: 'CN', locationType: 'CITY', locationName: 'Nam Ninh (Nanning)', locationCode: null },
  { locationId: 5, countryCode: 'CN', locationType: 'CITY', locationName: 'Bằng Tường (Pingxiang)', locationCode: null },
  { locationId: 6, countryCode: 'TH', locationType: 'CITY', locationName: 'Bangkok', locationCode: null },
  { locationId: 7, countryCode: 'KH', locationType: 'CITY', locationName: 'Phnom Penh', locationCode: null },
  { locationId: 8, countryCode: 'LA', locationType: 'CITY', locationName: 'Vientiane', locationCode: null },
  { locationId: 9, countryCode: 'SG', locationType: 'CITY', locationName: 'Singapore', locationCode: null },
  { locationId: 10, countryCode: 'MY', locationType: 'CITY', locationName: 'Kuala Lumpur', locationCode: null },
  { locationId: 11, countryCode: 'VN', locationType: 'AIRPORT', locationName: 'Sân bay Tân Sơn Nhất', locationCode: 'SGN' },
  { locationId: 12, countryCode: 'VN', locationType: 'AIRPORT', locationName: 'Sân bay Nội Bài', locationCode: 'HAN' },
  { locationId: 13, countryCode: 'CN', locationType: 'AIRPORT', locationName: 'Guangzhou Baiyun', locationCode: 'CAN' },
  { locationId: 14, countryCode: 'TH', locationType: 'AIRPORT', locationName: 'Suvarnabhumi', locationCode: 'BKK' },
  { locationId: 15, countryCode: 'SG', locationType: 'AIRPORT', locationName: 'Changi', locationCode: 'SIN' },
  { locationId: 16, countryCode: 'MY', locationType: 'AIRPORT', locationName: 'Kuala Lumpur International', locationCode: 'KUL' },
  { locationId: 17, countryCode: 'HK', locationType: 'AIRPORT', locationName: 'Hong Kong International', locationCode: 'HKG' },
  { locationId: 18, countryCode: 'JP', locationType: 'AIRPORT', locationName: 'Narita', locationCode: 'NRT' },
  { locationId: 19, countryCode: 'KR', locationType: 'AIRPORT', locationName: 'Incheon', locationCode: 'ICN' },
  { locationId: 20, countryCode: 'AE', locationType: 'AIRPORT', locationName: 'Dubai', locationCode: 'DXB' },
  { locationId: 21, countryCode: 'AU', locationType: 'AIRPORT', locationName: 'Sydney', locationCode: 'SYD' },
  { locationId: 22, countryCode: 'GB', locationType: 'AIRPORT', locationName: 'London Heathrow', locationCode: 'LHR' },
  { locationId: 23, countryCode: 'FR', locationType: 'AIRPORT', locationName: 'Paris Charles de Gaulle', locationCode: 'CDG' },
  { locationId: 24, countryCode: 'US', locationType: 'AIRPORT', locationName: 'Los Angeles International', locationCode: 'LAX' },
  { locationId: 25, countryCode: 'DE', locationType: 'AIRPORT', locationName: 'Frankfurt', locationCode: 'FRA' },
  {
    locationId: 26,
    countryCode: 'VN',
    locationType: 'HUB',
    locationName: 'Trụ sở EquiTransit Việt Nam (Củ Chi Hub)',
    locationCode: 'HUB-VN',
    address: 'Khu Nông nghiệp Công nghệ cao Củ Chi, Quốc lộ 22, TP. Hồ Chí Minh',
    latitude: 11.0067,
    longitude: 106.5132,
    isPrimaryHub: true,
    domesticRatePerKm: 1.5,
  },
  {
    locationId: 27,
    countryCode: 'CN',
    locationType: 'HUB',
    locationName: 'Trạm trung chuyển EquiTransit Bằng Tường (Pingxiang Hub)',
    locationCode: 'HUB-CN',
    address: 'Khu kiểm dịch cửa khẩu Hữu Nghị Quan, Bằng Tường, Quảng Tây',
    latitude: 22.0988,
    longitude: 106.7581,
    isPrimaryHub: true,
    domesticRatePerKm: 1.8,
  },
  {
    locationId: 28,
    countryCode: 'LA',
    locationType: 'HUB',
    locationName: 'Trụ sở EquiTransit Lào (Vientiane Hub)',
    locationCode: 'HUB-LA',
    address: 'Thanaleng Dry Port & Equine Quarantine Park, Vientiane',
    latitude: 17.8825,
    longitude: 102.71,
    isPrimaryHub: true,
    domesticRatePerKm: 1.5,
  },
  {
    locationId: 29,
    countryCode: 'KH',
    locationType: 'HUB',
    locationName: 'Trụ sở EquiTransit Campuchia (Phnom Penh Hub)',
    locationCode: 'HUB-KH',
    address: 'Phnom Penh Special Economic Zone Equine Depot, National Road 4',
    latitude: 11.5564,
    longitude: 104.9282,
    isPrimaryHub: true,
    domesticRatePerKm: 1.5,
  },
  {
    locationId: 30,
    countryCode: 'TH',
    locationType: 'HUB',
    locationName: 'Trụ sở EquiTransit Thái Lan (Bangkok Hub)',
    locationCode: 'HUB-TH',
    address: 'Pathum Thani Equine Quarantine & Transit Facility, Bangkok',
    latitude: 14.0135,
    longitude: 100.5305,
    isPrimaryHub: true,
    domesticRatePerKm: 1.6,
  },
];

export const COUNTRY_TIMEZONES: Record<string, string> = {
  VN: 'Asia/Ho_Chi_Minh',
  CN: 'Asia/Shanghai',
  LA: 'Asia/Vientiane',
  KH: 'Asia/Phnom_Penh',
  TH: 'Asia/Bangkok',
  SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur',
  HK: 'Asia/Hong_Kong',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  AE: 'Asia/Dubai',
  AU: 'Australia/Sydney',
  GB: 'Europe/London',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  US: 'America/Los_Angeles',
};

export const POPULAR_TRANSIT_AIRPORTS = [
  { code: 'BKK', label: 'BKK · Bangkok' },
  { code: 'SIN', label: 'SIN · Singapore' },
  { code: 'HKG', label: 'HKG · Hong Kong' },
  { code: 'DXB', label: 'DXB · Dubai' },
  { code: 'ICN', label: 'ICN · Seoul' },
  { code: 'FRA', label: 'FRA · Frankfurt' },
] as const;

function waitSlot(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 429 &&
      !signal?.aborted
    ) {
      await waitSlot(1050, signal);
      return await fn();
    }
    throw err;
  }
}

export const routesApi = {
  countries: async (signal?: AbortSignal): Promise<RouteCountry[]> => {
    try {
      const list = await request('/api/lookups/countries', z.array(routeCountrySchema), {
        signal,
        public: true,
      });
      return list.length > 0 ? list : CATALOG_COUNTRIES;
    } catch {
      return CATALOG_COUNTRIES;
    }
  },
  locations: async (
    country: string,
    type: 'CITY' | 'AIRPORT' | 'HUB',
    signal?: AbortSignal,
  ): Promise<RouteLocation[]> => {
    const code = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return [];
    try {
      const list = await request(
        `/api/lookups/locations?country=${encodeURIComponent(code)}&type=${type}`,
        z.array(routeLocationSchema),
        { signal, public: true },
      );
      return list.length > 0
        ? list
        : CATALOG_LOCATIONS.filter((l) => l.countryCode === code && l.locationType === type);
    } catch {
      return CATALOG_LOCATIONS.filter((l) => l.countryCode === code && l.locationType === type);
    }
  },
  hubs: async (
    country: string,
    primaryOnly = true,
    signal?: AbortSignal,
  ): Promise<RouteLocation[]> => {
    const code = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return [];
    try {
      const list = await request(
        `/api/lookups/hubs?country=${encodeURIComponent(code)}&primaryOnly=${primaryOnly}`,
        z.array(routeLocationSchema),
        { signal, public: true },
      );
      return list.length > 0
        ? list
        : CATALOG_LOCATIONS.filter(
            (l) =>
              l.countryCode === code &&
              l.locationType === 'HUB' &&
              (!primaryOnly || l.isPrimaryHub),
          );
    } catch {
      return CATALOG_LOCATIONS.filter(
        (l) =>
          l.countryCode === code &&
          l.locationType === 'HUB' &&
          (!primaryOnly || l.isPrimaryHub),
      );
    }
  },
  match: (payload: RouteMatchRequest, signal?: AbortSignal): Promise<RouteMatchResponse> =>
    request('/api/routes/match', routeMatchResponseSchema, {
      method: 'POST',
      body: payload,
      signal,
      public: true,
    }),
  searchAddress: (
    query: string,
    countryCode?: string,
    limit = 5,
    signal?: AbortSignal,
  ): Promise<AddressSuggestion[]> => {
    const q = query.trim();
    if (q.length < 2) return Promise.resolve([]);
    const params = new URLSearchParams({
      query: q,
      limit: String(Math.min(10, Math.max(1, limit))),
    });
    if (countryCode && /^[A-Za-z]{2}$/.test(countryCode.trim())) {
      params.set('countryCode', countryCode.trim().toUpperCase());
    }
    return withRateLimitRetry(
      () =>
        request(
          `/api/routes/address/search?${params.toString()}`,
          z.array(addressSuggestionSchema),
          { signal, public: true },
        ),
      signal,
    );
  },
  validateAddress: (
    address: string,
    countryCode?: string,
    signal?: AbortSignal,
  ): Promise<AddressValidationResponse> => {
    const trimmed = address.trim();
    return withRateLimitRetry(
      () =>
        request('/api/routes/address/validate', addressValidationResponseSchema, {
          method: 'POST',
          body: {
            address: trimmed,
            ...(countryCode && /^[A-Za-z]{2}$/.test(countryCode.trim())
              ? { countryCode: countryCode.trim().toUpperCase() }
              : {}),
          },
          signal,
          public: true,
        }),
      signal,
    );
  },
};
