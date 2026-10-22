import type { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  availabilitySchema,
  CANDIDATE_PAGE_SIZE,
  candidatePageSchema,
  catalogs,
  pageSchemas,
  type AvailabilityRequest,
  type CatalogCommand,
  type CatalogKey,
  type CatalogView,
  type ProbeKind,
} from './contracts';

export const RESOURCE_PAGE_SIZE = 20;
const base = '/api/manager/resources';

export type CatalogPage<K extends CatalogKey> = {
  items: CatalogView[K][];
  page: number;
  size: number;
  totalElements: number;
};
// Indexed by a generic key, TS cannot narrow the schema union; each pair is matched above.
const viewSchema = <K extends CatalogKey>(key: K) =>
  catalogs[key].view as unknown as z.ZodType<CatalogView[K]>;
const pageSchema = <K extends CatalogKey>(key: K) =>
  pageSchemas[key] as unknown as z.ZodType<CatalogPage<K>>;

function idPath(id: number) {
  if (!idSchema.safeParse(id).success) throw new ApiError(400, 'Invalid resource ID.');
  return String(id);
}
const body = ({ operationId, recordVersion, data }: CatalogCommand) => ({
  command: { operationId, recordVersion },
  data,
});

// Manager-only catalogue; the BE rechecks the role and live StaffProfile.
export const resourcesApi = {
  list: <K extends CatalogKey>(key: K, page: number, signal?: AbortSignal) =>
    request(
      `${base}/${catalogs[key].path}?${new URLSearchParams({ page: String(page), size: String(RESOURCE_PAGE_SIZE) })}`,
      pageSchema(key),
      { signal },
    ),
  get: <K extends CatalogKey>(key: K, id: number, signal?: AbortSignal) =>
    request(`${base}/${catalogs[key].path}/${idPath(id)}`, viewSchema(key), { signal }),
  create: <K extends CatalogKey>(key: K, command: CatalogCommand<K>) =>
    request(`${base}/${catalogs[key].path}`, viewSchema(key), {
      method: 'POST',
      body: body(command),
    }),
  replace: <K extends CatalogKey>(key: K, id: number, command: CatalogCommand<K>) =>
    request(`${base}/${catalogs[key].path}/${idPath(id)}`, viewSchema(key), {
      method: 'PUT',
      body: body(command),
    }),
  /**
   * Read-only search of resources for a case window (Manager or the assigned
   * Coordinator). No command/UUID; `search` is a code prefix and is omitted
   * when blank. Results are advice only: assignment rechecks under a lock.
   */
  candidates: (
    kind: ProbeKind,
    input: AvailabilityRequest,
    { search, page }: { search: string; page: number },
    signal?: AbortSignal,
  ) => {
    if (!Number.isSafeInteger(page) || page < 0)
      return Promise.reject(new ApiError(400, 'Invalid page.'));
    const term = search.trim().slice(0, 50);
    const query = new URLSearchParams({
      ...(term ? { search: term } : {}),
      page: String(page),
      size: String(CANDIDATE_PAGE_SIZE),
    });
    return request(`/api/resources/${kind}/candidates?${query}`, candidatePageSchema, {
      method: 'POST',
      body: input,
      signal,
    });
  },
  /** Read-only probe for a case; it never reserves and takes no command/UUID. */
  probe: (kind: ProbeKind, id: number, input: AvailabilityRequest) =>
    request(`/api/resources/${kind}/${idPath(id)}/availability`, availabilitySchema, {
      method: 'POST',
      body: input,
    }),
};
