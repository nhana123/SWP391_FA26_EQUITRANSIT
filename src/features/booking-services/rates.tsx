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
    retry: false,
  });
}

type RatesState = {
  status: 'loading' | 'error' | 'ready';
  byProduct: Map<ServiceProduct, ServiceRate>;
};
const RatesContext = createContext<RatesState>({ status: 'loading', byProduct: new Map() });

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
  const base = `${rate.unitRate} ${rate.currency} ${unitLabel(rate.unit)}`;
  if (rate.pricingMode === 'EVIDENCE') return `${base} · final amount needs assessment`;
  if (rate.pricingMode === 'EVENT') return `${base} · only if it happens`;
  return base;
}

/** Inline current rate next to a service choice. */
export function RateTag({ product }: { product: ServiceProduct }) {
  const { status, byProduct } = useContext(RatesContext);
  return <small className="rate-tag">{rateText(byProduct.get(product), status)}</small>;
}

/** All catalog rates belonging to one booking section. */
export function SectionRates({ section, title }: { section: SectionCode; title?: string }) {
  const { status, byProduct } = useContext(RatesContext);
  const rows = [...byProduct.values()].filter((r) => r.uiSection === section);
  if (status === 'ready' && rows.length === 0) return null;
  return (
    <div className="section-rates">
      <h4>{title ?? 'Current unit rates'}</h4>
      {status !== 'ready' ? (
        <p className="muted">{rateText(undefined, status)}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.product}>
              {productLabels[r.product]}: {rateText(r, status)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
