import { z } from 'zod';
import { request } from './client';

// Public catalogues from the BE (migrations 024/025). The lists come from SQL,
// never from arrays hardcoded in the FE.
const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
export const countrySchema = z.object({
  countryCode: z.string(),
  countryName: z.string(),
  supportsRoad: z.boolean(),
  supportsAir: z.boolean(),
});
export type Country = z.infer<typeof countrySchema>;
export const locationSchema = z.object({
  locationId: z.number().int(),
  countryCode: z.string(),
  locationType: z.enum(['CITY', 'AIRPORT']),
  locationName: z.string(),
  locationCode: text,
});
export type Location = z.infer<typeof locationSchema>;
/** Layout of a standard reference form; the text is plain text, never markup. */
export const documentTemplateSchema = z.object({
  typeCode: z.string(),
  displayName: z.string(),
  formCode: text,
  issuingAuthority: text,
  subAuthority: text,
  certTextTemplate: text,
  badgeColor: text,
  emblemIcon: text,
  templateFileKey: text,
  hasTemplateFile: z.boolean(),
  templateDownloadUrl: text,
});
export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;

const country = /^[A-Z]{2}$/;
export const lookupsApi = {
  countries: (signal?: AbortSignal) =>
    request('/api/lookups/countries', z.array(countrySchema), { signal }),
  locations: (countryCode: string, type: 'CITY' | 'AIRPORT', signal?: AbortSignal) => {
    if (!country.test(countryCode)) return Promise.resolve([] as Location[]);
    return request(
      `/api/lookups/locations?${new URLSearchParams({ country: countryCode, type })}`,
      z.array(locationSchema),
      { signal },
    );
  },
  documentTemplate: (typeCode: string, signal?: AbortSignal) =>
    request(
      `/api/lookups/document-templates/${encodeURIComponent(typeCode)}`,
      documentTemplateSchema,
      { signal },
    ),
};

/** 🇻🇳 from VN: regional-indicator letters, no image assets needed. */
export function flag(countryCode: string) {
  return country.test(countryCode)
    ? String.fromCodePoint(...[...countryCode].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';
}
