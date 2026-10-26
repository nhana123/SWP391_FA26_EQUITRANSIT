import { z } from 'zod';
import { request } from '../../shared/api/client';

export const routeTransportModeSchema = z.enum(['ROAD', 'AIR']);
export type RouteTransportMode = z.infer<typeof routeTransportModeSchema>;

export const routeTemplateSchema = z.object({
  routeTemplateId: z.number().int(),
  routeCode: z.string(),
  routeName: z.string(),
  originCountryCode: z.string(),
  originCity: z.string().nullable().optional(),
  originAirportCode: z.string().nullable().optional(),
  destinationCountryCode: z.string(),
  destinationCity: z.string().nullable().optional(),
  destinationAirportCode: z.string().nullable().optional(),
  transportMode: routeTransportModeSchema,
  estimatedRoadKm: z.number().nullable().optional(),
  estimatedAirKm: z.number().nullable().optional(),
  estimatedHours: z.number(),
  routeSummary: z.string(),
  baseRoadRate: z.number(),
  baseAirRate: z.number(),
  isActive: z.boolean(),
  createdBy: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type RouteTemplate = z.infer<typeof routeTemplateSchema>;

export const routeTemplateRequestSchema = z.object({
  routeCode: z.string().min(1, 'Route code is required').max(50),
  routeName: z.string().min(1, 'Route name is required').max(200),
  originCountryCode: z.string().length(2, 'Must be 2-letter ISO country code'),
  originCity: z.string().max(100).optional().nullable(),
  originAirportCode: z.string().length(3).optional().nullable(),
  destinationCountryCode: z.string().length(2, 'Must be 2-letter ISO country code'),
  destinationCity: z.string().max(100).optional().nullable(),
  destinationAirportCode: z.string().length(3).optional().nullable(),
  transportMode: routeTransportModeSchema,
  estimatedRoadKm: z.number().min(0),
  estimatedAirKm: z.number().min(0),
  estimatedHours: z.number().positive('Hours must be positive'),
  routeSummary: z.string().min(1, 'Summary is required').max(1000),
  baseRoadRate: z.number().min(0),
  baseAirRate: z.number().min(0),
  isActive: z.boolean().optional(),
});
export type RouteTemplateRequest = z.infer<typeof routeTemplateRequestSchema>;

export const coordinatorLocationSchema = z.object({
  locationId: z.number().int(),
  countryCode: z.string(),
  locationType: z.string(),
  locationName: z.string(),
  locationCode: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  isPrimaryHub: z.boolean().nullable().optional(),
  domesticRatePerKm: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CoordinatorLocation = z.infer<typeof coordinatorLocationSchema>;

export const coordinatorLocationRequestSchema = z.object({
  country: z.string().length(2, 'Country code must be 2 characters'),
  code: z.string().max(32).optional().nullable(),
  name: z.string().min(1, 'Name is required').max(128),
  locationType: z.enum(['HUB', 'CITY', 'AIRPORT']),
  address: z.string().max(256).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isPrimaryHub: z.boolean().optional().nullable(),
  domesticRatePerKm: z.number().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type CoordinatorLocationRequest = z.infer<typeof coordinatorLocationRequestSchema>;

export const coordinatorApi = {
  listRouteTemplates: (includeInactive = true, signal?: AbortSignal) =>
    request(
      `/api/coordinator/route-templates?includeInactive=${includeInactive}&page=0&size=100`,
      z.array(routeTemplateSchema),
      { signal },
    ),
  createRouteTemplate: (body: RouteTemplateRequest) =>
    request('/api/coordinator/route-templates', routeTemplateSchema, {
      method: 'POST',
      body,
    }),
  updateRouteTemplate: (id: number, body: RouteTemplateRequest) =>
    request(`/api/coordinator/route-templates/${id}`, routeTemplateSchema, {
      method: 'PUT',
      body,
    }),
  hideRouteTemplate: (id: number) =>
    request(`/api/coordinator/route-templates/${id}`, z.unknown(), {
      method: 'DELETE',
    }),

  listLocations: (type?: string, country?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (country) params.set('country', country);
    params.set('includeInactive', 'false');
    params.set('size', '100');
    return request(
      `/api/manager/locations?${params.toString()}`,
      z.array(coordinatorLocationSchema),
      { signal },
    );
  },
  createLocation: (body: CoordinatorLocationRequest) =>
    request('/api/manager/locations', coordinatorLocationSchema, {
      method: 'POST',
      body,
    }),
  updateLocation: (id: number, body: CoordinatorLocationRequest) =>
    request(`/api/manager/locations/${id}`, coordinatorLocationSchema, {
      method: 'PUT',
      body,
    }),
  deleteLocation: (id: number) =>
    request(`/api/manager/locations/${id}`, z.unknown(), {
      method: 'DELETE',
    }),
};
