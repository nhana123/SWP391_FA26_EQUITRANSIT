import { useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import type { ServicesSlotProps } from '../transport-orders/pages';
import { bookingApi } from './api';
import {
  sectionCodes,
  toPreferences,
  type Disclosure,
  type Preferences,
  type SectionCode,
} from './contracts';
import { HorseCareSection, QuarantineSection, VeterinarySection } from './care-sections';
import { validatePreferences } from './form';
import { InsuranceSection } from './insurance-section';
import { AirStallSection, TransportationSection, type SectionProps } from './sections';
import './booking.css';

const fallbackTitles: Record<SectionCode, string> = {
  TRANSPORTATION: 'Transportation',
  AIR_STALL: 'Available Air Stalls for Your Horse',
  HORSE_CARE: 'Horse Care',
  VETERINARY: 'Veterinary',
  QUARANTINE: 'Quarantine Packages',
  INSURANCE: 'Insurance',
  ADDITIONAL_CHARGES: 'Additional Charges',
};

function NotYetAvailable() {
  return <p className="muted">This section is not available in this release.</p>;
}

// One component per booking section; later features replace placeholders.
const sectionViews: Record<SectionCode, ComponentType<SectionProps>> = {
  TRANSPORTATION: TransportationSection,
  AIR_STALL: AirStallSection,
  HORSE_CARE: HorseCareSection,
  VETERINARY: VeterinarySection,
  QUARANTINE: QuarantineSection,
  INSURANCE: InsuranceSection,
  ADDITIONAL_CHARGES: NotYetAvailable,
};

export const samePreferences = (a: Preferences, b: Preferences) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * All seven sections edit one shared, full preference object for the horse
 * already chosen in the request. Opening or closing a section never saves.
 */
function BookingEditor({ disclosure, order }: { disclosure: Disclosure } & ServicesSlotProps) {
  const saved = toPreferences(disclosure.selected);
  const [prefs, setPrefs] = useState<Preferences>(saved);
  const [open, setOpen] = useState<SectionCode | null>(null);
  const dirty = !samePreferences(prefs, saved);
  const errors = validatePreferences(prefs, disclosure);
  const props: SectionProps = {
    order,
    disclosure,
    prefs,
    update: (patch) => setPrefs((p) => ({ ...p, ...patch })),
    errors,
    disabled: false,
  };
  return (
    <div className="booking">
      <Notice>
        Choices here are requests for your horse in this order. They are not a quote, a payment or a
        confirmed booking.
      </Notice>
      {dirty && (
        <p className="booking-dirty" role="status">
          You have unconfirmed changes. Estimates shown are for your last confirmed choices.
        </p>
      )}
      {sectionCodes.map((code) => {
        const title =
          disclosure.sections.find((s) => s.code === code)?.title ?? fallbackTitles[code];
        const View = sectionViews[code];
        const expanded = open === code;
        return (
          <section key={code} className="booking-section" aria-labelledby={`section-${code}`}>
            <h3 id={`section-${code}`}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`panel-${code}`}
                onClick={() => setOpen(expanded ? null : code)}
              >
                {title}
              </button>
            </h3>
            {expanded && (
              <div id={`panel-${code}`} className="booking-panel">
                <View {...props} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** FE1 OrderEditor servicesSlot entry point. */
export function BookingServices(props: ServicesSlotProps) {
  const session = useSession()!;
  const query = useQuery({
    queryKey: queryKeys.services(session.generation, props.order.orderId),
    queryFn: ({ signal }) => bookingApi.get(props.order.orderId, signal),
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        <button type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </ErrorNotice>
    );
  // Local edits belong to one order and one account; never carried across.
  return (
    <BookingEditor
      key={`${session.generation}-${props.order.orderId}`}
      {...props}
      disclosure={query.data}
    />
  );
}
