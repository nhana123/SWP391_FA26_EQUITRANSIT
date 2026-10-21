import { useEffect, useRef, type ReactNode } from 'react';
import type { SectionCode } from './contracts';
import { Icon } from '../../components/ui/Icons';
import { serviceSections } from './catalog';

/** One-line intent of each section, shown on its card before it is opened. */
export const sectionHints = Object.fromEntries(
  Object.entries(serviceSections).map(([code, section]) => [code, section.hint]),
) as Record<SectionCode, string>;

const shortTitles: Record<SectionCode, string> = {
  TRANSPORTATION: 'Transportation',
  AIR_STALL: 'Air stalls',
  HORSE_CARE: 'Horse care',
  VETERINARY: 'Veterinary',
  QUARANTINE: 'Quarantine',
  INSURANCE: 'Insurance',
  ADDITIONAL_CHARGES: 'Additional charges',
};

/** Prices belong to the selected option inside the dialog. */
export function ServiceCard({
  code,
  title,
  open,
  onOpen,
  selected = false,
}: {
  code: SectionCode;
  title: string;
  open: boolean;
  onOpen: () => void;
  selected?: boolean;
}) {
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
      <span className="service-area-icon">
        <Icon name={serviceSections[code].icon} size={23} />
      </span>
      <span className="service-card-title">{shortTitles[code]}</span>
      <span className="service-card-action">
        {selected ? (
          <span className="service-chosen">
            <Icon name="check" size={13} /> Choice set
          </span>
        ) : code === 'ADDITIONAL_CHARGES' ? (
          'View charges'
        ) : (
          'Choose options'
        )}{' '}
        <Icon name="arrow" size={15} />
      </span>
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
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const controls = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex]',
        ),
      ).filter(
        (el) =>
          el.tabIndex >= 0 && !el.matches(':disabled, [hidden]') && el.getClientRects().length > 0,
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || document.activeElement === ref.current)
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
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
