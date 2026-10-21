import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icons';
import { Link } from 'react-router-dom';
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-illustration">
        <Icon name="orders" size={36} />
        <span />
        <span />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="skeleton-line"
          style={{ width: `${i === lines - 1 ? 62 : 100}%` }}
        />
      ))}
    </div>
  );
}
export function CodeChip({ value, to }: { value: string; to?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const display = value.length > 21 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  return (
    <span className="code-chip" title={value}>
      {to ? (
        <Link to={to} aria-label={value}>
          {display}
        </Link>
      ) : (
        <span aria-label={value}>{display}</span>
      )}
      <button
        type="button"
        className="copy-code"
        aria-label={`Copy ${value}`}
        onClick={() => {
          if (!navigator.clipboard) {
            setFailed(true);
            return;
          }
          void navigator.clipboard
            .writeText(value)
            .then(() => {
              setCopied(true);
              setFailed(false);
            })
            .catch(() => setFailed(true));
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={13} />
      </button>
      {(copied || failed) && (
        <span className="sr-only" role="status">
          {failed ? `Copy unavailable. Request code: ${value}` : 'Request code copied'}
        </span>
      )}
    </span>
  );
}
export function StatCard({
  label,
  value,
  icon = 'orders',
  tone = 'green',
}: {
  label: string;
  value: number;
  icon?: IconName;
  tone?: string;
}) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString()}</dd>
      <span className="stat-icon">
        <Icon name={icon} size={22} />
      </span>
      <small>Current portfolio</small>
    </div>
  );
}
