import { Link } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { ErrorNotice } from '../../shared/ui/common';
import type { ReactNode } from 'react';

/** Both {message,fields} and {code,message}; no guessed business codes. */
export function serviceFields(error: unknown) {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(
    Object.entries(error.fields).map(([key, value]) => [key.replace(/^services\./, ''), value]),
  );
}

export function serviceWriteBlocked(error: unknown) {
  return error instanceof ApiError && [401, 403, 404, 409, 503].includes(error.status);
}

export function ServiceError({
  error,
  reload,
  retry,
  children,
}: {
  error: unknown;
  reload?: () => void;
  retry?: () => void;
  children?: ReactNode;
}) {
  const status = error instanceof ApiError ? error.status : undefined;
  return (
    <ErrorNotice error={error}>
      {children}
      {status === 403 && (
        <p>Service actions are locked. Your account cannot access this request.</p>
      )}
      {(status === 403 || status === 404) && <Link to="/customer/requests">Back to requests</Link>}
      {status === 409 && reload && (
        <>
          <p>
            Your request or horse profile changed. Reload to estimate against current data. Review
            your choices before confirming again.
          </p>
          <button type="button" onClick={reload}>
            Reload request
          </button>
        </>
      )}
      {status === 503 && (
        <p>
          Deployment blocked: the service schema or migration is not ready. Your choices are kept;
          no price needs to be entered again.
        </p>
      )}
      {retry && status !== 409 && ![400, 401, 403, 404, 422].includes(status ?? 0) && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
    </ErrorNotice>
  );
}
