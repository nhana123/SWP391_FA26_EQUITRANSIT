import { useCallback, useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import type { Order } from '../../shared/api/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
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
import { ServiceCard, ServiceDialog } from './service-cards';
import { serviceSections } from './catalog';
import './booking.css';

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

function cardDetail(code: SectionCode, prefs: Preferences): string | null {
  switch (code) {
    case 'TRANSPORTATION':
      if (prefs.roadArrangement === 'EQUITRANSIT') return 'Gói EquiTransit tiêu chuẩn';
      if (prefs.roadArrangement === 'CUSTOMER') return 'Tự sắp xếp xe';
      return null;
    case 'AIR_STALL':
      if (prefs.airStall === 'SHARED_ONE') return 'Shared stall (1 slot)';
      if (prefs.airStall === 'WIDE') return 'Wide stall (1.5 slots)';
      if (prefs.airStall === 'PRIVATE') return 'Private stall (3 slots)';
      return null;
    case 'HORSE_CARE': {
      const parts: string[] = [];
      if (prefs.enhancedCare) parts.push('Chăm sóc nâng cao');
      if (prefs.groomingDays) parts.push(`${prefs.groomingDays} ngày groom`);
      if (prefs.boardingNights) parts.push(`${prefs.boardingNights} đêm chuồng`);
      return parts.length > 0 ? parts.join(' · ') : 'Chăm sóc cơ bản';
    }
    case 'VETERINARY':
      if (prefs.veterinaryArrangement === 'EQUITRANSIT') return 'Gói kiểm dịch EquiTransit';
      if (prefs.veterinaryArrangement === 'CUSTOMER') return 'Tự sắp xếp bác sĩ';
      return null;
    case 'QUARANTINE':
      if (prefs.quarantinePackage === 'STANDARD') return 'Cách ly tiêu chuẩn';
      if (prefs.quarantinePackage === 'ENHANCED') return 'Cách ly nâng cao';
      if (prefs.quarantinePackage === 'NONE') return 'Không yêu cầu cách ly';
      return null;
    case 'INSURANCE':
      if (prefs.insurance === 'MORTALITY') return 'Bảo hiểm sinh mạng';
      if (prefs.insurance === 'COMBINED') return 'Bảo hiểm kết hợp';
      if (prefs.insurance === 'NONE') return 'Không mua bảo hiểm';
      return null;
    default:
      return null;
  }
}

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
  const [airStallTouched, setAirStallTouched] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(() => ({
    ...initialSaved,
    airStall: initialSaved.airStall ?? (recommendsWide(initialDisclosure) ? 'WIDE' : null),
  }));
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [reloadError, setReloadError] = useState<unknown>(null);
  // A successful write stays acknowledged even when a subsequent read fails.
  // Recovery must finish reading current data before another write is possible.
  const [confirmationToRefresh, setConfirmationToRefresh] = useState<Confirmation | null>(null);
  const confirmationRefresh = useAction();
  const awaitingRefresh = confirmationToRefresh !== null;
  const rates = useServiceRates(order.orderId);
  const [open, setOpen] = useState<SectionCode | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const [confirmedNotice, setConfirmedNotice] = useState('');
  const dirty = !samePreferences(prefs, saved);
  const localErrors = validatePreferences(prefs, disclosure);
  const previewEnabled =
    !awaitingRefresh &&
    dirty &&
    Object.keys(localErrors).length === 0 &&
    !serviceWriteBlocked(mutationError);
  const preview = useServicePreview(order.orderId, disclosure, prefs, previewEnabled);
  const previewError = awaitingRefresh || preview.settling ? null : preview.query.error;
  const errors = {
    ...localErrors,
    ...serviceFields(previewError),
    ...serviceFields(mutationError),
  };
  const versionMismatch =
    order.recordVersion.toLowerCase() !== disclosure.recordVersion.toLowerCase();
  const blocked =
    awaitingRefresh ||
    versionMismatch ||
    serviceWriteBlocked(readError) ||
    serviceWriteBlocked(previewError) ||
    serviceWriteBlocked(mutationError) ||
    serviceWriteBlocked(rates.error);
  const servicesKey = queryKeys.services(session.generation, order.orderId);

  async function readCurrent() {
    const [next, fresh] = await Promise.all([
      bookingApi.get(order.orderId),
      ordersApi.get(order.orderId),
    ]);
    if (getSession()?.generation !== session.generation) return null;
    if (next.recordVersion.toLowerCase() !== fresh.recordVersion.toLowerCase())
      throw new ApiError(409, 'The request changed while reloading. Reload again and review.');
    return { disclosure: next, order: fresh };
  }

  function refreshConfirmation(result: Confirmation) {
    return confirmationRefresh.run(async () => {
      // Only GETs are retried here. The original confirmation already succeeded.
      const current = await readCurrent();
      if (!current) return;
      const { disclosure: next, order: fresh } = current;
      setReview({ disclosure: next, order: fresh });
      setSaved(savedPreferences(next, fresh));
      setPrefs(savedPreferences(next, fresh));
      setMutationError(null);
      setReloadError(null);
      setConfirmedNotice(
        result.revision
          ? `Service choices confirmed in new revision ${result.revision.revisionNo}, which goes back for assessment.`
          : 'Service choices saved to your draft.',
      );
      queryClient.setQueryData(servicesKey, next);
      queryClient.setQueryData(queryKeys.order(session.generation, order.orderId), fresh);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders(session.generation) });
      if (getSession()?.generation !== session.generation) return;
      onSaved(fresh);
      setConfirmationToRefresh(null);
    });
  }

  async function confirmed(result: Confirmation) {
    setConfirmationToRefresh(result);
    setMutationError(null);
    setConfirmedNotice('');
    await refreshConfirmation(result);
  }
  async function reload() {
    try {
      const current = await readCurrent();
      if (!current) return;
      const { disclosure: next, order: fresh } = current;
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
  const titleOf = (code: SectionCode) =>
    disclosure.sections.find((s) => s.code === code)?.title ?? serviceSections[code].title;
  const props: SectionProps = {
    order,
    disclosure,
    prefs,
    update: (patch) => {
      if (blocked) return;
      if (patch.airStall !== undefined) setAirStallTouched(true);
      setPrefs((p) => ({ ...p, ...patch }));
      setMutationError(null);
    },
    errors,
    disabled: blocked,
    airStallPriceVisible: saved.airStall !== null || airStallTouched,
  };
  const accessError = [
    previewError,
    mutationError,
    reloadError,
    confirmationRefresh.error,
    rates.error,
  ].find((error) => error instanceof ApiError && [401, 403, 404].includes(error.status));
  if (accessError) return <ServiceError error={accessError} />;
  return (
    <RatesProvider query={rates}>
      <div className="booking">
        <Notice>
          Choose a service to see its current unit price. Final costs require a quotation; selecting
          services does not confirm a booking.
        </Notice>
        {confirmedNotice && <Notice>{confirmedNotice} This is not a quote or a payment.</Notice>}
        {awaitingRefresh && (
          <div className="notice" role="status">
            <p>
              Service choices were saved. Load current data before making further changes. Retrying
              this step only reloads data; it does not confirm services again.
            </p>
            <button
              type="button"
              disabled={confirmationRefresh.pending}
              onClick={() => void refreshConfirmation(confirmationToRefresh)}
            >
              {confirmationRefresh.pending
                ? 'Loading saved choices...'
                : 'Retry loading saved choices'}
            </button>
          </div>
        )}
        <ServiceError error={confirmationRefresh.error} />
        {dirty && !awaitingRefresh && (
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
        <div className="service-grid">
          {sectionCodes.map((code) => (
            <ServiceCard
              key={code}
              code={code}
              title={titleOf(code)}
              open={open === code}
              selected={
                {
                  TRANSPORTATION: prefs.roadArrangement !== null,
                  AIR_STALL:
                    prefs.airStall !== null && (saved.airStall !== null || airStallTouched),
                  HORSE_CARE:
                    prefs.enhancedCare === true ||
                    (prefs.groomingDays ?? 0) > 0 ||
                    (prefs.boardingNights ?? 0) > 0 ||
                    !!prefs.escortNotes?.trim(),
                  VETERINARY: prefs.veterinaryArrangement !== null,
                  QUARANTINE: prefs.quarantinePackage !== null,
                  INSURANCE: prefs.insurance !== null,
                  ADDITIONAL_CHARGES: false,
                }[code]
              }
              detail={cardDetail(code, prefs)}
              onOpen={() => setOpen(open === code ? null : code)}
            />
          ))}
        </div>
        {open &&
          (() => {
            const View = sectionViews[open];
            return (
              <ServiceDialog id={`panel-${open}`} title={titleOf(open)} onClose={close}>
                <View {...props} />
              </ServiceDialog>
            );
          })()}
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
