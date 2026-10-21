import { isValidElement, useId, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { Skeleton } from '../../components/ui/Primitives';
import { useSession } from '../api/session';
export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: (id: string) => ReactNode;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const control = children(id);
  const required = isValidElement<{ required?: boolean }>(control) && control.props.required;
  return (
    <div className={`field ${error ? 'field-has-error' : ''}`}>
      <div className="field-label-row">
        <label htmlFor={id}>{label}</label>
        {required && (
          <span className="required-marker" aria-hidden="true">
            *
          </span>
        )}
      </div>
      <div className="field-control">{control}</div>
      {hint && <small className="field-hint">{hint}</small>}
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export function ErrorNotice({ error, children }: { error: unknown; children?: ReactNode }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <p>{error instanceof ApiError ? error.message : 'The request could not be completed.'}</p>
      {error instanceof ApiError && error.code && <small>{error.code}</small>}
      {children}
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="status">
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="loading" aria-live="polite">
      <span className="loading-label">Loading…</span>
      <Skeleton />
    </div>
  );
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const session = useSession();
  return (
    <header className="page-heading">
      <div>
        <small className="eyebrow">EQUITRANSIT · {session?.role ?? 'JOURNEY MANAGEMENT'}</small>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function Pagination({
  page,
  pages,
  onChange,
  pending = false,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  pending?: boolean;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" disabled={page === 0 || pending} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page + 1} of {Math.max(1, pages)}
      </span>
      <button
        type="button"
        disabled={page + 1 >= pages || pending}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
