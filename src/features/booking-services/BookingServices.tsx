import { useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import { ordersApi } from '../transport-orders/api';
import type { ServicesSlotProps } from '../transport-orders/pages';
import { bookingApi } from './api';
import { AdditionalChargesSection } from './charges';
import { RatesProvider } from './rates';
import { ConfirmBar } from './confirm';
import {
  sectionCodes,
  toPreferences,
  type Confirmation,
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

// One component per booking section.

const sectionViews: Record<SectionCode, ComponentType<SectionProps>> = {
  TRANSPORTATION: TransportationSection,
  AIR_STALL: AirStallSection,
  HORSE_CARE: HorseCareSection,
  VETERINARY: VeterinarySection,
  QUARANTINE: QuarantineSection,
  INSURANCE: InsuranceSection,
  ADDITIONAL_CHARGES: AdditionalChargesSection,
};

export const samePreferences = (a: Preferences, b: Preferences) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * All seven sections edit one shared, full preference object for the horse
 * already chosen in the request. Opening or closing a section never saves.
 */
function BookingEditor({
  disclosure,
  order,
  onSaved,
}: { disclosure: Disclosure } & ServicesSlotProps) {
  const session = useSession()!;
  const saved = toPreferences(disclosure.selected);
  const [prefs, setPrefs] = useState<Preferences>(saved);
  const [open, setOpen] = useState<SectionCode | null>(null);
  const [confirmedNotice, setConfirmedNotice] = useState('');
  const dirty = !samePreferences(prefs, saved);
  const errors = validatePreferences(prefs, disclosure);
  const servicesKey = queryKeys.services(session.generation, order.orderId);

  async function confirmed(result: Confirmation) {
    // The receipt is history: re-read the current order and disclosure.
    const fresh = await ordersApi.get(order.orderId);
    const next = await queryClient.fetchQuery({
      queryKey: servicesKey,
      queryFn: ({ signal }) => bookingApi.get(order.orderId, signal),
      staleTime: 0,
    });
    if (getSession()?.generation !== session.generation) return;
    setPrefs(toPreferences(next.selected));
    setConfirmedNotice(
      result.revision
        ? `Service choices confirmed in new revision ${result.revision.revisionNo}, which goes back for assessment.`
        : 'Service choices saved to your draft.',
    );
    await queryClient.invalidateQueries({ queryKey: queryKeys.orders(session.generation) });
    onSaved(fresh);
  }
  function reload() {
    void queryClient.invalidateQueries({ queryKey: servicesKey });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.order(session.generation, order.orderId),
    });
  }
  const props: SectionProps = {
    order,
    disclosure,
    prefs,
    update: (patch) => setPrefs((p) => ({ ...p, ...patch })),
    errors,
    disabled: false,
  };
  return (
    <RatesProvider orderId={order.orderId}>
      <div className="booking">
        <Notice>
          Choices here are requests for your horse in this order. They are not a quote, a payment or
          a confirmed booking. Rates shown next to options are today&apos;s catalog unit rates, not
          your quote.
        </Notice>
        {confirmedNotice && !dirty && (
          <Notice>{confirmedNotice} This is not a quote or a payment.</Notice>
        )}
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
        <ConfirmBar
          order={order}
          disclosure={disclosure}
          prefs={prefs}
          dirty={dirty}
          hasErrors={Object.keys(errors).length > 0}
          onConfirmed={confirmed}
          onReload={reload}
        />
      </div>
    </RatesProvider>
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
