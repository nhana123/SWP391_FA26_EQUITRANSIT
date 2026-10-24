import { z } from 'zod';
import { apiBase } from './base';
import { refreshSession } from './refresh';
import { clearSession, getSession } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
  get uncertain() {
    return this.status === 0 || this.status >= 500;
  }
}
const safeErrorSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
});
type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  signal?: AbortSignal;
  public?: boolean;
  /** Send and accept the HttpOnly refresh cookie (login). */
  withCookies?: boolean;
  /** Multipart upload; the browser sets the boundary header. */
  formData?: FormData;
  /** Read the successful response as bytes instead of JSON. */
  blob?: boolean;
};
/** The access token was renewed after a 401: repeat the identical request once. */
class RetryAfterRefresh extends Error {}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await attempt(path, schema, options, false);
  } catch (error) {
    if (error instanceof RetryAfterRefresh) return attempt(path, schema, options, true);
    throw error;
  }
}

async function attempt<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions,
  retried: boolean,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const session = options.public ? null : getSession();
  try {
    const response = await fetch(apiBase + path, {
      method: options.method || 'GET',
      signal: controller.signal,
      credentials: options.withCookies ? 'include' : 'omit',
      headers: {
        Accept: options.blob ? '*/*' : 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Authorization: `${session.tokenType} ${session.accessToken}` } : {}),
      },
      ...(options.formData
        ? { body: options.formData }
        : options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
    });
    const data: unknown =
      options.blob && response.ok ? await response.blob() : await response.json().catch(() => null);
    if (!options.public && getSession()?.generation !== session?.generation)
      throw new DOMException('Session changed', 'AbortError');
    if (!response.ok) {
      if (response.status === 401 && !options.public) {
        // A rejected access token on a refreshable session: renew once, then
        // repeat the identical request (a 401 means it was not executed).
        if (session?.refreshable && !retried && (await refreshSession()) === 'renewed')
          throw new RetryAfterRefresh();
        clearSession();
      }
      const parsed = safeErrorSchema.safeParse(data);
      // Never reflect backend text in authentication errors; it can contain credentials.
      const messages: Record<number, string> = {
        400: 'Please check the supplied information.',
        401: 'Sign-in failed or your session has expired.',
        403: 'You do not have permission for this action.',
        404: 'This record is unavailable.',
        409: 'The request conflicts with current data.',
        429: 'Too many requests. Please try again later.',
      };
      const publicMessage =
        path === '/api/auth/register' && response.status === 409
          ? 'This email is already registered. Sign in or request a new verification link.'
          : messages[response.status] || 'The request could not be completed.';
      throw new ApiError(
        response.status,
        options.public
          ? publicMessage
          : parsed.success
            ? parsed.data.message ||
              messages[response.status] ||
              'The request could not be completed.'
            : messages[response.status] || 'The request could not be completed.',
        parsed.success ? parsed.data.code : undefined,
        parsed.success && !options.public ? parsed.data.fields : {},
      );
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new ApiError(
        502,
        'The API response does not match the expected contract. Please contact the project team.',
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError || error instanceof RetryAfterRefresh) throw error;
    if (
      options.signal?.aborted ||
      (getSession()?.generation !== session?.generation && !options.public)
    )
      throw new DOMException('Cancelled', 'AbortError');
    throw new ApiError(
      0,
      'Connection interrupted. The action may have completed; check current data before trying again.',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

/** Private bytes (files, previews) with the same session, refresh and error handling. */
export function requestBlob(path: string, signal?: AbortSignal) {
  // Checked by shape: a Blob may come from another realm than the page global,
  // and not every implementation has arrayBuffer(); all have size and type.
  const blob = z.custom<Blob>(
    (v) =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as Blob).size === 'number' &&
      typeof (v as Blob).type === 'string',
  );
  return request(path, blob, { blob: true, signal });
}
