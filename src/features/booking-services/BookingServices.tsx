import { useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import type { Order } from '../../shared/api/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { Loading, Notice } from '../../shared/ui/common';
import { ordersApi } from '../transport-orders/api';
import type { ServicesSlotProps } from '../transport-orders/pages';
import { bookingApi } from './api';
import { AdditionalChargesSection } from './charges';
import { RatesProvider, useServiceRates } from './rates';
import { ConfirmBar } from './confirm';
import { LivePreview, useServicePreview } from './preview';
import { ServiceError, serviceFields, serviceWriteBlocked } from './errors';
import { recommendsWide } from './stall-options';
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

function savedPreferences(disclosure: Disclosure, order: Order) {
  const saved = toPreferences(disclosure.selected);
  const persistedStall = order.draft.services?.airStall;
  if (persistedStall) saved.airStall = persistedStall;
  else if (recommendsWide(disclosure)) saved.airStall = null;
  return saved;
}

/**
 * All seven sections edit one shared, full preference object for the horse
 * already chosen in the request. Opening or closing a section never saves.
 */
function BookingEditor({
  disclosure: initialDisclosure,
  order: initialOrder,
  onSaved,
  readError,
  retryRead,
}: { disclosure: Disclosure; readError: unknown; retryRead: () => void } & ServicesSlotProps) {
  const session = useSession()!;
  // Only explicit reload/confirmation adopts new versions. A background GET
  // must never silently upgrade the version of an unconfirmed edit.
  const [{ disclosure, order }, setReview] = useState({
    disclosure: initialDisclosure,
    order: initialOrder,
  });
  const initialSaved = savedPreferences(initialDisclosure, initialOrder);
  const [saved, setSaved] = useState<Preferences>(initialSaved);
  const [prefs, setPrefs] = useState<Preferences>(() => ({
    ...initialSaved,
    airStall: initialSaved.airStall ?? (recommendsWide(initialDisclosure) ? 'WIDE' : null),
  }));
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [reloadError, setReloadError] = useState<unknown>(null);
  const rates = useServiceRates(order.orderId);
  const [open, setOpen] = useState<SectionCode | null>(null);
  const [confirmedNotice, setConfirmedNotice] = useState('');
  const dirty = !samePreferences(prefs, saved);
  const localErrors = validatePreferences(prefs, disclosure);
  const previewEnabled =
    dirty && Object.keys(localErrors).length === 0 && !serviceWriteBlocked(mutationError);
  const preview = useServicePreview(order.orderId, disclosure, prefs, previewEnabled);
  const previewError = preview.settling ? null : preview.query.error;
  const errors = {
    ...localErrors,
    ...serviceFields(previewError),
    ...serviceFields(mutationError),
  };
  const versionMismatch =
    order.recordVersion.toLowerCase() !== disclosure.recordVersion.toLowerCase();
  const blocked =
    versionMismatch ||
    serviceWriteBlocked(readError) ||
    serviceWriteBlocked(previewError) ||
    serviceWriteBlocked(mutationError) ||
    serviceWriteBlocked(rates.error);
  const servicesKey = queryKeys.services(session.generation, order.orderId);

  async function confirmed(result: Confirmation) {
    try {
      // The receipt is history: re-read the current order and disclosure.
      const fresh = await ordersApi.get(order.orderId);
      const next = await queryClient.fetchQuery({
        queryKey: servicesKey,
        queryFn: ({ signal }) => bookingApi.get(order.orderId, signal),
        staleTime: 0,
      });
      if (getSession()?.generation !== session.generation) return;
      setReview({ disclosure: next, order: fresh });
      setSaved(savedPreferences(next, fresh));
      setPrefs(savedPreferences(next, fresh));
      setMutationError(null);
      setConfirmedNotice(
        result.revision
          ? `Service choices confirmed in new revision ${result.revision.revisionNo}, which goes back for assessment.`
          : 'Service choices saved to your draft.',
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders(session.generation) });
      onSaved(fresh);
    } catch (error) {
      // The write succeeded; retry the GET, never turn a failed refresh into
      // a second confirmation with a new UUID and another revision.
      setMutationError(error);
      setReloadError(error);
    }
  }
  async function reload() {
    try {
      const [next, fresh] = await Promise.all([
        bookingApi.get(order.orderId),
        ordersApi.get(order.orderId),
      ]);
      if (getSession()?.generation !== session.generation) return;
      if (next.recordVersion.toLowerCase() !== fresh.recordVersion.toLowerCase())
        throw new ApiError(409, 'The request changed while reloading. Reload again and review.');
      setReview({ disclosure: next, order: fresh });
      setSaved(savedPreferences(next, fresh));
      setMutationError(null);
      setReloadError(null);
      setConfirmedNotice(
        'Current versions loaded. Review your unconfirmed choices before confirming.',
      );
      queryClient.setQueryData(servicesKey, next);
      queryClient.setQueryData(queryKeys.order(session.generation, order.orderId), fresh);
      await queryClient.invalidateQueries({ queryKey: [...servicesKey, 'preview'] });
      // Keep the customer's unconfirmed preferences for explicit review.
    } catch (error) {
      setReloadError(error);
      throw error;
    }
  }
  const props: SectionProps = {
    order,
    disclosure,
    prefs,
    update: (patch) => {
      setPrefs((p) => ({ ...p, ...patch }));
      if (!blocked) setMutationError(null);
    },
    errors,
    disabled: blocked,
  };
  const accessError = [previewError, mutationError, reloadError, rates.error].find(
    (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
  );
  if (accessError) return <ServiceError error={accessError} />;
  return (
    <RatesProvider query={rates}>
      <div className="booking">
        <Notice>
          Choices here are requests for your horse in this order. They are not a quote, a payment or
          a confirmed booking. Rates shown next to options are today&apos;s catalog unit rates, not
          your quote.
        </Notice>
        {confirmedNotice && <Notice>{confirmedNotice} This is not a quote or a payment.</Notice>}
        {dirty && (
          <p className="booking-dirty" role="status">
            You have unconfirmed changes. Saved estimates in the sections are for your last
            confirmed choices; the live estimate below reflects your unsaved choices.
          </p>
        )}
        <ServiceError error={reloadError} retry={() => void reload().catch(() => {})} />
        <ServiceError error={readError} retry={retryRead} />
        <ServiceError error={rates.error} retry={() => void rates.refetch()} />
        {versionMismatch && (
          <ServiceError
            error={
              new ApiError(
                409,
                'The order and service versions differ. Reload and review before confirming.',
              )
            }
            reload={() => void reload().catch(() => {})}
          />
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
        <LivePreview
          preview={preview}
          enabled={previewEnabled}
          onReload={() => void reload().catch(() => {})}
        />
        <ConfirmBar
          order={order}
          disclosure={disclosure}
          prefs={prefs}
          dirty={dirty}
          hasErrors={Object.keys(errors).length > 0}
          onConfirmed={confirmed}
          onReload={reload}
          onFailure={setMutationError}
          disabled={blocked}
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
    retry: false,
  });
  if (query.isPending) return <Loading />;
  if (
    query.error &&
    (!query.data ||
      (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)))
  )
    return <ServiceError error={query.error} retry={() => void query.refetch()} />;
  // Local edits belong to one order and one account; never carried across.
  return (
    <BookingEditor
      key={`${session.generation}-${props.order.orderId}`}
      {...props}
      disclosure={query.data}
      readError={query.error}
      retryRead={() => void query.refetch()}
    />
  );
}
