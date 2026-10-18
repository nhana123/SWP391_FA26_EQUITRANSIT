import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { productLabels } from '../service-pricing/contracts';
import type { SectionCode } from './contracts';
import { RatesContext, rateText } from './rates';

/** One-line intent of each section, shown on its card before it is opened. */
export const sectionHints: Record<SectionCode, string> = {
  TRANSPORTATION: 'Road legs and who arranges them',
  AIR_STALL: 'Stall size and sharing on the aircraft',
  HORSE_CARE: 'Grooming, boarding and enhanced care',
  VETERINARY: 'Exams, tests, vaccines and certificates',
  QUARANTINE: 'Quarantine package for this route',
  INSURANCE: 'Mortality or combined cover',
  ADDITIONAL_CHARGES: 'Handling, customs and event-based charges',
};

/** A section tile: title, hint and up to two of today's catalog rates. */
export function ServiceCard({
  code,
  title,
  open,
  onOpen,
}: {
  code: SectionCode;
  title: string;
  open: boolean;
  onOpen: () => void;
}) {
  const { status, byProduct } = useContext(RatesContext);
  const rates = [...byProduct.values()].filter((r) => r.uiSection === code);
  return (
    <button
      type="button"
      className="service-card"
      // The accessible name stays the section title; the rest is a preview.
      aria-label={title}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
    >
      <span className="service-card-title">{title}</span>
      <span className="service-card-hint">{sectionHints[code]}</span>
      <span className="service-card-rates">
        {status !== 'ready'
          ? rateText(undefined, status)
          : rates.length
            ? rates.slice(0, 2).map((r) => (
                <span key={r.product}>
                  {productLabels[r.product]} · {rateText(r, status)}
                </span>
              ))
            : 'Choose your preference'}
        {status === 'ready' && rates.length > 2 && <span>+{rates.length - 2} more</span>}
      </span>
      <span className="service-card-action">{open ? 'Open' : 'View options'}</span>
    </button>
  );
}

/**
 * Popup for one section. Choices live in the editor, so closing keeps them.
 * Esc, the backdrop or "Done" close it; focus returns to the opener.
 */
export function ServiceDialog({
  id,
  title,
  onClose,
  children,
}: {
  id: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="service-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        id={id}
        className="service-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <header className="service-dialog-head">
          <h3 id={`${id}-title`}>{title}</h3>
          <button
            type="button"
            className="service-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="service-dialog-body">{children}</div>
        <footer className="service-dialog-foot">
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
