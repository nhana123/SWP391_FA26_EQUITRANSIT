import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { Loading } from '../../shared/ui/common';
import { ServiceError } from './errors';
import { bookingApi } from './api';
import { ChargeRows, ChargeTotals } from './charges';
import type { Disclosure, Preferences } from './contracts';

export const PREVIEW_DEBOUNCE_MS = 400;

/** Value that only changes after `delay` ms without further edits. */
function useDebounced<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * Read-only estimate for unsaved choices. The query key holds the exact
 * preferences and observed versions, so a superseded request is cancelled
 * and an old response can never be shown for newer choices.
 */
export function useServicePreview(
  orderId: number,
  disclosure: Disclosure,
  prefs: Preferences,
  enabled: boolean,
) {
  const session = useSession()!;
  const settled = useDebounced(prefs, PREVIEW_DEBOUNCE_MS);
  const settling = JSON.stringify(settled) !== JSON.stringify(prefs);
  const query = useQuery({
    queryKey: [
      ...queryKeys.services(session.generation, orderId),
      'preview',
      disclosure.recordVersion,
      disclosure.horseRecordVersion,
      settled,
    ],
    queryFn: ({ signal }) =>
      bookingApi.preview(
        orderId,
        {
          recordVersion: disclosure.recordVersion,
          horseRecordVersion: disclosure.horseRecordVersion,
          services: settled,
        },
        signal,
      ),
    enabled: enabled && !settling,
    // Errors need the customer's attention, not a silent loop.
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  return { query, settling };
}

export function LivePreview({
  preview,
  enabled,
  onReload,
}: {
  preview: ReturnType<typeof useServicePreview>;
  enabled: boolean;
  onReload: () => void;
}) {
  const { query, settling } = preview;
  if (!enabled) return null;
  return (
    <section className="live-preview" aria-labelledby="live-preview-heading" aria-live="polite">
      <h3 id="live-preview-heading">Live estimate for your unsaved choices</h3>
      <p className="muted">
        Not saved, not payable and no carrier booking. Confirm your choices to keep them; a quote is
        prepared separately.
      </p>
      {settling || query.isFetching ? (
        <Loading />
      ) : query.error ? (
        <ServiceError error={query.error} reload={onReload} retry={() => void query.refetch()} />
      ) : query.data ? (
        <>
          <ChargeRows
            charges={query.data.charges.filter((c) => c.selected || c.mandatory)}
            currency={query.data.currency}
          />
          <ChargeTotals disclosure={query.data} />
        </>
      ) : null}
    </section>
  );
}
