import { z } from 'zod';
import { request } from '../../shared/api/client';

import { serviceRateSchema, tariffPageSchema, tariffSchema, type TariffCommand } from './contracts';

export const TARIFF_PAGE_SIZE = 20;
const base = '/api/manager/service-tariffs';
// Manager-only routes; the BE rechecks the role and live StaffProfile.
export const tariffApi = {
  products: (signal?: AbortSignal) =>
    request(`${base}/products`, z.array(serviceRateSchema), { signal }),
  list: (page: number, signal?: AbortSignal) =>
    request(
      `${base}?${new URLSearchParams({ page: String(page), size: String(TARIFF_PAGE_SIZE) })}`,
      tariffPageSchema,
      { signal },
    ),
  get: (id: number, signal?: AbortSignal) => request(`${base}/${id}`, tariffSchema, { signal }),
  create: (body: TariffCommand) => {
    const { recordVersion, ...input } = body;
    return request(base, tariffSchema, {
      method: 'POST',
      body: recordVersion === null ? input : body,
    });
  },
  replace: (id: number, body: TariffCommand) =>
    request(`${base}/${id}`, tariffSchema, { method: 'PUT', body }),
};
