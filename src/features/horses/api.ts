import { request } from '../../shared/api/client';
import { horseSchema, horsePageSchema, type HorseInput } from '../../shared/api/contracts';
export const horsesApi = {
  list: (page: number, q: string, signal: AbortSignal) =>
    request(
      `/api/horses?${new URLSearchParams({ page: String(page), size: '20', q })}`,
      horsePageSchema,
      { signal },
    ),
  get: (id: number, signal?: AbortSignal) => request(`/api/horses/${id}`, horseSchema, { signal }),
  create: (body: HorseInput) => request('/api/horses', horseSchema, { method: 'POST', body }),
  update: (id: number, body: HorseInput & { recordVersion: string }) =>
    request(`/api/horses/${id}`, horseSchema, { method: 'PUT', body }),
};
