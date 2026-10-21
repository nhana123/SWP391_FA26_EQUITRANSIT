import { StatusBadge } from '../../components/ui/StatusBadge';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { ManagerHeading } from '../assessment/layout';
import { tariffApi } from './api';
import { pricingKeys } from './keys';
import { PriceForm, type PriceTarget } from './PriceForm';
export { validUnitPrice } from './PriceForm';
import { modeLabels, productLabels, unitLabel, type ServiceRate, type Tariff } from './contracts';
import './pricing.css';

export function schemaPending(error: unknown) {
  return error instanceof ApiError && error.status === 503;
}

function DeploymentNotice() {
  return (
    <Notice>
      Price management is not deployed on this server yet (database migration 006 is pending). Ask
      the project owner to deploy it; prices cannot be edited until then.
    </Notice>
  );
}

/** "ACTIVE" alone is not "in effect": read the actual dates. */
export function effectLabel(
  t: Pick<Tariff, 'status' | 'effectiveFrom' | 'effectiveTo'>,
  now = Date.now(),
) {
  if (t.status === 'INACTIVE') return 'Inactive';
  if (Date.parse(t.effectiveFrom) > now) return 'Scheduled';
  if (t.effectiveTo !== null && Date.parse(t.effectiveTo) <= now) return 'Ended';
  return 'In effect';
}

function rateText(r: ServiceRate) {
  if (r.pricingMode === 'INCLUDED') return 'Included';
  return r.unitRate === null ? 'No current price' : `${r.unitRate} ${r.currency}`;
}

export function ManagerPricesPage() {
  const session = useSession()!;
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  const [target, setTarget] = useState<PriceTarget | null>(null);
  const [denied, setDenied] = useState<unknown>(null);
  const [receipt, setReceipt] = useState<Tariff | null>(null);
  const products = useQuery({
    queryKey: pricingKeys.products(session.generation),
    queryFn: ({ signal }) => tariffApi.products(signal),
    enabled: session.role === 'MANAGER',
    retry: false,
  });
  const history = useQuery({
    queryKey: pricingKeys.history(session.generation, page),
    queryFn: ({ signal }) => tariffApi.list(page, signal),
    placeholderData: keepPreviousData,
    enabled: session.role === 'MANAGER',
    retry: false,
  });

  async function published(next: Tariff) {
    setTarget(null);
    setReceipt(next);
    // The receipt may be an older replay: always re-read current versions.
    await queryClient.invalidateQueries({ queryKey: pricingKeys.all(session.generation) });
  }
  function open(next: PriceTarget) {
    setReceipt(null);
    setTarget(next);
  }
  if (session.role !== 'MANAGER')
    return <Notice>Only an active Manager can manage service prices.</Notice>;
  const accessError = [denied, products.error, history.error].find(
    (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
  );
  if (accessError) return <ErrorNotice error={accessError} />;
  const catalog = products.data?.find((p) => p.product === target?.product);
  return (
    <>
      <ManagerHeading
        title="Service Prices"
        description="Retail unit prices customers see while choosing services. Each change publishes a new version."
      />
      {receipt && (
        <Notice>
          Published {receipt.product ? productLabels[receipt.product] : 'price'} version{' '}
          {receipt.version}: {receipt.unitPrice} {receipt.currency}, in effect from{' '}
          {displayDate(receipt.effectiveFrom)}. Existing quotes are not changed.
        </Notice>
      )}
      {target && catalog && (
        <PriceForm
          key={JSON.stringify(target)}
          target={target}
          catalog={catalog}
          readError={products.error || history.error}
          onDenied={setDenied}
          onReloadRead={async () => {
            await Promise.all([
              products.refetch({ throwOnError: true }),
              history.refetch({ throwOnError: true }),
            ]);
          }}
          onDone={published}
          onCancel={() => setTarget(null)}
        />
      )}
      <section className="card" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Products and current prices</h2>
        {products.isPending ? (
          <Loading />
        ) : schemaPending(products.error) ? (
          <DeploymentNotice />
        ) : products.error ? (
          <ErrorNotice error={products.error}>
            <button type="button" onClick={() => void products.refetch()}>
              Try again
            </button>
          </ErrorNotice>
        ) : (
          <div className="table-scroll">
            <table aria-label="Service products">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Pricing</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Current price</th>
                  <th scope="col">Version</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.data.map((r) => (
                  <tr key={r.product}>
                    <td>{productLabels[r.product]}</td>
                    <td>{modeLabels[r.pricingMode]}</td>
                    <td>{unitLabel(r.unit)}</td>
                    <td>{rateText(r)}</td>
                    <td>{r.tariffVersion ?? '—'}</td>
                    <td>
                      {r.pricingMode === 'INCLUDED' ? (
                        <span className="muted">Not chargeable</span>
                      ) : r.tariffId === null ? (
                        <button
                          type="button"
                          disabled={target !== null}
                          onClick={() => open({ mode: 'create', product: r.product })}
                        >
                          Publish price
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={target !== null}
                          onClick={() =>
                            open({ mode: 'replace', product: r.product, tariffId: r.tariffId! })
                          }
                        >
                          Replace price
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">Price history</h2>
        <p className="muted">Newest first. Past versions are never edited or deleted.</p>
        {history.isPending ? (
          <Loading />
        ) : schemaPending(history.error) ? (
          <DeploymentNotice />
        ) : history.error ? (
          <ErrorNotice error={history.error} />
        ) : !history.data.items.length ? (
          <p>No prices have been published yet.</p>
        ) : (
          <div className="table-scroll" aria-busy={history.isPlaceholderData}>
            <table aria-label="Price history">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Version</th>
                  <th scope="col">Unit price</th>
                  <th scope="col">In effect</th>
                  <th scope="col">From</th>
                  <th scope="col">Until</th>
                  <th scope="col">Source (internal)</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((t) => (
                  <tr key={t.tariffId}>
                    <td>
                      {t.product ? productLabels[t.product] : 'Legacy (unrecognised product)'}
                    </td>
                    <td>{t.version}</td>
                    <td>
                      {t.unitPrice === null
                        ? 'Unsupported legacy rate — replace explicitly'
                        : `${t.unitPrice} ${t.currency}`}{' '}
                      <span className="muted">{unitLabel(t.unit)}</span>
                    </td>
                    <td>
                      <StatusBadge status={effectLabel(t)}>{effectLabel(t)}</StatusBadge>
                    </td>
                    <td>{displayDate(t.effectiveFrom)}</td>
                    <td>{t.effectiveTo ? displayDate(t.effectiveTo) : 'No planned end'}</td>
                    <td>
                      {t.sourceReference ?? 'Not recorded'}
                      {t.sourceReviewRequired && (
                        <span className="badge warn"> Source review required</span>
                      )}
                    </td>
                    <td>
                      {t.product &&
                        t.product !== 'BASIC_CARE' &&
                        t.product !== 'DOCUMENT_REVIEW' && (
                          <button
                            type="button"
                            disabled={target !== null}
                            onClick={() =>
                              open({ mode: 'replace', product: t.product!, tariffId: t.tariffId })
                            }
                          >
                            Replace
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.data && (history.data.totalPages > 1 || page > 0) && (
          <Pagination
            page={page}
            pages={history.data.totalPages}
            onChange={(next) => setParams({ page: String(next) })}
            pending={history.isFetching}
          />
        )}
      </section>
    </>
  );
}
