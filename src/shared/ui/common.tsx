import { useId, type ReactNode } from 'react';
import { ApiError } from '../api/client';
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
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small>{hint}</small>}
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
    <p role="status" className="loading">
      Loading…
    </p>
  );
}
export function PageHeading({
  title,
  description,
  eyebrow = 'STABLE OPERATIONS · CUSTOMER',
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <small className="eyebrow">{eyebrow}</small>
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
