import { z } from 'zod';
import { request } from '../../shared/api/client';
import { serviceRateSchema } from '../service-pricing/contracts';

export const ratesApi = {
  // Owning customer only; public rates carry no source reference or cost.
  get: (orderId: number, signal?: AbortSignal) =>
    request(`/api/transport-orders/${orderId}/services/rates`, z.array(serviceRateSchema), {
      signal,
    }),
};
