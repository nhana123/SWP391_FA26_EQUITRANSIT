import { useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate, validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice, Pagination } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { ManagerHeading } from '../assessment/layout';
import { tariffApi } from './api';
import {
  modeLabels,
  productLabels,
  unitLabel,
  type ServiceProduct,
  type ServiceRate,
  type Tariff,
  type TariffCommand,
} from './contracts';
import './pricing.css';

export const pricingKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'service-pricing'] as const,
  products: (generation: string) => [...pricingKeys.all(generation), 'products'] as const,
  history: (generation: string, page: number) =>
    [...pricingKeys.all(generation), 'history', { page }] as const,
  tariff: (generation: string, id: number) =>
    [...pricingKeys.all(generation), 'tariff', id] as const,
};

/** Exact money text: up to 14 integer and 2 fractional digits (DECIMAL(18,4) limit). */
export function validUnitPrice(value: string) {
  return /^\d{1,14}(\.\d{1,2})?$/.test(value);
}

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

type Target =
  | { mode: 'create'; product: ServiceProduct }
  | { mode: 'replace'; product: ServiceProduct; tariffId: number };

const errorHelp: Record<string, string> = {
  TARIFF_EXISTS:
    'This product already has a price family. Use “Replace” on its latest version in the history below.',
  TARIFF_VERSION_CONFLICT:
    'Someone published a newer version. Reload, compare the latest price, then submit again.',
  TARIFF_INCLUDED: 'Included services cannot be charged a second time.',
  TARIFF_AMOUNT_INVALID: 'The price exceeds the supported precision.',
  TARIFF_EXPIRY_INVALID: 'The expiry must be after the time the price takes effect.',
  TARIFF_BUSY: 'The price catalog is busy. Retry sends exactly the same publication.',
};

function PriceForm({
  target,
  onDone,
  onCancel,
}: {
  target: Target;
  onDone: (receipt: Tariff) => Promise<void>;
  onCancel: () => void;
}) {
  const session = useSession()!;
  const replacing = target.mode === 'replace';
  const latest = useQuery({
    queryKey: pricingKeys.tariff(session.generation, replacing ? target.tariffId : 0),
    queryFn: ({ signal }) => tariffApi.get(replacing ? target.tariffId : 0, signal),
    enabled: replacing,
    staleTime: 0,
  });
  const [unitPrice, setUnitPrice] = useState('');
  const [source, setSource] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const command = useCaseCommand(
    (body: TariffCommand) =>
      replacing ? tariffApi.replace(target.tariffId, body) : tariffApi.create(body),
    ['TARIFF_BUSY'],
  );
  const code = command.error instanceof ApiError ? command.error.code : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    command.submit(() => {
      const next: FieldErrors = {};
      const price = unitPrice.trim();
      if (!validUnitPrice(price))
        next.unitPrice = 'Use digits with up to 2 decimals and at most 14 integer digits.';
      const ref = source.trim();
      if (!ref) next.sourceReference = 'A source reference is required.';
      else if (ref.length > 1000) next.sourceReference = 'Use at most 1000 characters.';
      const until = validUntil.trim();
      if (until && !validOffsetDate(until))
        next.validUntil = 'Use an ISO date with offset, e.g. 2027-12-31T00:00:00Z.';
      else if (until && Date.parse(until) <= Date.now())
        next.validUntil = 'The expiry must be in the future.';
      if (replacing && !latest.data) next.form = 'Load the current version before replacing it.';
      setErrors(next);
      if (Object.keys(next).length) return null;
      return {
        product: target.product,
        unitPrice: price,
        sourceReference: ref,
        validUntil: until || null,
        recordVersion: replacing ? latest.data!.recordVersion : null,
      };
    }, onDone);
  }
  function reload() {
    void queryClient.invalidateQueries({ queryKey: pricingKeys.all(session.generation) });
  }
  return (
    <form
      className="card"
      onSubmit={submit}
      noValidate
      aria-label={`${replacing ? 'Replace' : 'Publish'} price for ${productLabels[target.product]}`}
    >
      <h2>
        {replacing ? 'Replace price' : 'Publish price'}: {productLabels[target.product]}
      </h2>
      {replacing &&
        (latest.isPending ? (
          <Loading />
        ) : latest.error ? (
          <ErrorNotice error={latest.error} />
        ) : (
          <p className="muted">
            Replacing version {latest.data.version} (
            {latest.data.unitPrice ?? 'unsupported legacy rate'} {latest.data.currency},{' '}
            {effectLabel(latest.data).toLowerCase()}). A new version is created; the old one stays
            in history and existing quotes keep their captured prices.
          </p>
        ))}
      {schemaPending(command.error) ? (
        <DeploymentNotice />
      ) : (
        <ErrorNotice error={command.error}>
          {code && errorHelp[code] && <p>{errorHelp[code]}</p>}
          {(code === 'TARIFF_VERSION_CONFLICT' || (command.frozen && !command.pending)) && (
            <button type="button" onClick={reload}>
              Reload prices
            </button>
          )}
        </ErrorNotice>
      )}
      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
      <fieldset className="form-grid" disabled={command.locked}>
        <Field
          label="Unit price (USD)"
          hint="Exact amount, e.g. 2.50. Currency and unit come from the product."
          error={errors.unitPrice}
        >
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              maxLength={17}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              aria-invalid={!!errors.unitPrice}
            />
          )}
        </Field>
        <Field
          label="Source reference (internal)"
          hint="Approval or document this price comes from. Never shown to customers."
          error={errors.sourceReference}
        >
          {(id) => (
            <textarea
              id={id}
              maxLength={1000}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-invalid={!!errors.sourceReference}
            />
          )}
        </Field>
        <Field
          label="Valid until (optional)"
          hint="ISO date with offset. Leave empty for no planned expiry."
          error={errors.validUntil}
        >
          {(id) => (
            <input
              id={id}
              maxLength={35}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              aria-invalid={!!errors.validUntil}
            />
          )}
        </Field>
      </fieldset>
      <div className="actions">
        <button className="primary" type="submit" disabled={command.pending}>
          {command.pending
            ? 'Publishing…'
            : command.frozen
              ? 'Retry the same publication'
              : replacing
                ? 'Publish replacement'
                : 'Publish price'}
        </button>
        <button type="button" onClick={onCancel} disabled={command.locked}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function rateText(r: ServiceRate) {
  if (r.pricingMode === 'INCLUDED') return 'Included';
  return r.unitRate === null ? 'No current price' : `${r.unitRate} ${r.currency}`;
}

export function ManagerPricesPage() {
  const session = useSession()!;
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  const [target, setTarget] = useState<Target | null>(null);
  const [receipt, setReceipt] = useState<Tariff | null>(null);
  const products = useQuery({
    queryKey: pricingKeys.products(session.generation),
    queryFn: ({ signal }) => tariffApi.products(signal),
  });
  const history = useQuery({
    queryKey: pricingKeys.history(session.generation, page),
    queryFn: ({ signal }) => tariffApi.list(page, signal),
    placeholderData: keepPreviousData,
  });

  async function published(next: Tariff) {
    setTarget(null);
    setReceipt(next);
    // The receipt may be an older replay: always re-read current versions.
    await queryClient.invalidateQueries({ queryKey: pricingKeys.all(session.generation) });
  }
  function open(next: Target) {
    setReceipt(null);
    setTarget(next);
  }
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
      {target && (
        <PriceForm
          key={JSON.stringify(target)}
          target={target}
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
                          onClick={() => open({ mode: 'create', product: r.product })}
                        >
                          Publish price
                        </button>
                      ) : (
                        <button
                          type="button"
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
                      <span className="badge">{effectLabel(t)}</span>
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
