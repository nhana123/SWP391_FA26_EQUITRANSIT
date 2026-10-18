import { Link } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { ErrorNotice } from '../../shared/ui/common';
import type { ReactNode } from 'react';

export function commercialWriteBlocked(error: unknown) {
  return error instanceof ApiError && [401, 403, 404, 409, 503].includes(error.status);
}

export function CommercialError({
  error,
  backTo,
  reload,
  children,
}: {
  error: unknown;
  backTo: string;
  reload?: () => void;
  children?: ReactNode;
}) {
  const status = error instanceof ApiError ? error.status : undefined;
  return (
    <ErrorNotice error={error}>
      {children}
      {status === 403 && (
        <p>
          Actions are locked because your role or active assignment no longer permits this action.
        </p>
      )}
      {(status === 403 || status === 404) && <Link to={backTo}>Back to requests</Link>}
      {status === 409 && (
        <p>Reload current data and review the form before another write. Your input is kept.</p>
      )}
      {status === 503 && (
        <p>
          Deployment blocked: the quotation schema or migration is not ready. Your input is kept.
        </p>
      )}
      {reload && (status === 409 || status === 503) && (
        <button type="button" onClick={reload}>
          Reload case
        </button>
      )}
    </ErrorNotice>
  );
}
