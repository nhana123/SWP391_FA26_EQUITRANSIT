import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import {
  productLabels,
  unitLabel,
  type ServiceProduct,
  type ServiceRate,
} from '../service-pricing/contracts';
import type { SectionCode } from './contracts';
import { ratesApi } from './rates-api';

/** Under the order's services key: scoped to account and order, cleared on logout. */
export function useServiceRates(orderId: number) {
  const session = useSession()!;
  return useQuery({
    queryKey: [...queryKeys.services(session.generation, orderId), 'rates'],
    queryFn: ({ signal }) => ratesApi.get(orderId, signal),
    enabled: orderId > 0,
    retry: false,
  });
}

type RatesState = {
  status: 'loading' | 'error' | 'ready';
  byProduct: Map<ServiceProduct, ServiceRate>;
};
export const RatesContext = createContext<RatesState>({ status: 'loading', byProduct: new Map() });

export function RatesProvider({
  query,
  children,
}: {
  query: ReturnType<typeof useServiceRates>;
  children: ReactNode;
}) {
  const value: RatesState = {
    status: query.isPending ? 'loading' : query.error ? 'error' : 'ready',
    byProduct: new Map((query.data ?? []).map((r) => [r.product, r])),
  };
  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>;
}

/**
 * Describes a current catalog rate. A unit rate is never a final amount:
 * quantities and evidence come from the server preview/disclosure.
 */
export function rateText(rate: ServiceRate | undefined, status: RatesState['status']) {
  if (status === 'loading') return 'Loading price…';
  if (status === 'error') return 'Price unavailable right now';
  if (!rate) return 'Awaiting pricing';
  if (rate.pricingMode === 'INCLUDED') return 'Included';
  if (rate.unitRate === null)
    return rate.pricingMode === 'EVIDENCE' ? 'Awaiting pricing/assessment' : 'Awaiting pricing';
  const unit = rate.product === 'AIR_STALL' ? 'per slot' : unitLabel(rate.unit);
  const base = `${rate.unitRate} ${rate.currency} ${unit}`;
  if (rate.pricingMode === 'EVIDENCE') return `${base} · final amount needs assessment`;
  if (rate.pricingMode === 'EVENT') return `${base} · only if it happens`;
  return base;
}

/** Inline current rate next to a service choice. */
export function RateTag({
  product,
  selected = true,
}: {
  product: ServiceProduct;
  selected?: boolean;
}) {
  const { status, byProduct } = useContext(RatesContext);
  if (!selected) return null;
  return <small className="rate-tag">{rateText(byProduct.get(product), status)}</small>;
}

function amount(rate: ServiceRate) {
  if (rate.pricingMode === 'INCLUDED') return { value: 'Included', unit: '' };
  if (rate.unitRate === null)
    return {
      value: rate.pricingMode === 'EVIDENCE' ? 'Awaiting pricing/assessment' : 'Awaiting pricing',
      unit: '',
    };
  const unit = rate.product === 'AIR_STALL' ? 'per slot' : unitLabel(rate.unit);
  return { value: rate.unitRate, unit: `${rate.currency} ${unit}` };
}
const modeNotes: Partial<Record<ServiceRate['pricingMode'], string>> = {
  EVIDENCE: 'Final amount needs assessment',
  EVENT: 'Charged only if it happens',
  INCLUDED: 'Never charged separately',
};

/** All catalog rates of one booking section, as price cards. Never a quote total. */
export function SectionRates({
  section,
  title,
  selected = true,
}: {
  section: SectionCode;
  title?: string;
  selected?: boolean;
}) {
  const { status, byProduct } = useContext(RatesContext);
  if (!selected) return null;
  const rows = [...byProduct.values()].filter((r) => r.uiSection === section);
  if (status === 'ready' && rows.length === 0) return null;
  const heading = title ?? 'Current unit rates';
  return (
    <section className="section-rates" aria-label={heading}>
      <h4>{heading}</h4>
      {status !== 'ready' ? (
        <p className="muted">{rateText(undefined, status)}</p>
      ) : (
        <ul className="rate-cards">
          {rows.map((r) => {
            const a = amount(r);
            return (
              <li key={r.product} className="rate-card" aria-label={productLabels[r.product]}>
                <span className="rate-card-name">{productLabels[r.product]}</span>
                <span className="rate-card-price">
                  <strong>{a.value}</strong>
                  {a.unit && <small>{a.unit}</small>}
                </span>
                {modeNotes[r.pricingMode] && (
                  <span className={`rate-card-note note-${r.pricingMode.toLowerCase()}`}>{modeNotes[r.pricingMode]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
