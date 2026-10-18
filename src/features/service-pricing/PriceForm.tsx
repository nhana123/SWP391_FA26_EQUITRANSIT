import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { tariffApi } from './api';
import { pricingKeys } from './keys';
import {
  productLabels,
  unitLabel,
  type ServiceProduct,
  type ServiceRate,
  type Tariff,
  type TariffCommand,
} from './contracts';

export type PriceTarget =
  | { mode: 'create'; product: ServiceProduct }
  | { mode: 'replace'; product: ServiceProduct; tariffId: number };
export function validUnitPrice(value: string) {
  return /^\d{1,14}(\.\d{1,2})?$/.test(value);
}
const conflictHelp: Record<string, string> = {
  TARIFF_EXISTS: 'A price family already exists. Cancel and replace its latest version.',
  TARIFF_VERSION_CONFLICT: 'A newer price version exists. Reload and compare before publishing.',
  TARIFF_RETRY_CONFLICT:
    'This operation ID has different input. Reload and review before a new action.',
  TARIFF_INCLUDED: 'Included services cannot be charged a second time.',
  TARIFF_AMOUNT_INVALID: 'The price exceeds supported precision.',
  TARIFF_EXPIRY_INVALID: 'The expiry must follow the new version activation time.',
  TARIFF_BUSY: 'The catalog is busy. Retry the same publication.',
};
function PriceError({ error }: { error: unknown }) {
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <ErrorNotice error={error}>
      {code && conflictHelp[code] && <p>{conflictHelp[code]}</p>}
      {error instanceof ApiError && error.status === 503 && (
        <p>Deployment blocked: price management requires database migration 006.</p>
      )}
    </ErrorNotice>
  );
}
type Props = {
  target: PriceTarget;
  catalog: ServiceRate;
  readError?: unknown;
  onDone: (receipt: Tariff) => Promise<void>;
  onCancel: () => void;
  onDenied: (error: unknown) => void;
  onReloadRead: () => Promise<void>;
};

export function PriceForm(props: Props) {
  const session = useSession()!;
  const { target } = props;
  const replacing = target.mode === 'replace';
  const latest = useQuery({
    queryKey: pricingKeys.tariff(session.generation, replacing ? target.tariffId : 0),
    queryFn: ({ signal }) => tariffApi.get(replacing ? target.tariffId : 0, signal),
    enabled: replacing,
    retry: false,
    staleTime: 0,
  });
  if (replacing && latest.isPending) return <Loading />;
  if (
    replacing &&
    (!latest.data ||
      (latest.error &&
        latest.error instanceof ApiError &&
        [401, 403, 404].includes(latest.error.status)))
  )
    return (
      <section className="card">
        <PriceError error={latest.error} />
        <button type="button" onClick={() => void latest.refetch()}>
          Try again
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </section>
    );
  // The editor keeps its reviewed snapshot even if this GET refreshes in the background.
  return (
    <PriceEditor
      {...props}
      initialTariff={replacing ? latest.data! : null}
      readError={props.readError || (replacing ? latest.error : null)}
      onReloadRead={async () => {
        await props.onReloadRead();
        if (replacing && latest.error) await latest.refetch({ throwOnError: true });
      }}
    />
  );
}

function PriceEditor({
  target,
  catalog: initialCatalog,
  initialTariff,
  readError,
  onDone,
  onCancel,
  onDenied,
  onReloadRead,
}: Props & { initialTariff: Tariff | null }) {
  const [reviewed, setReviewed] = useState(initialTariff);
  const [catalog, setCatalog] = useState(initialCatalog);
  const units = catalog.allowedUnits ?? [catalog.unit]; // Legacy contract permits only its existing/default unit.
  const [unit, setUnit] = useState(initialTariff?.unit ?? initialCatalog.unit);
  const [unitPrice, setUnitPrice] = useState('');
  const [source, setSource] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const reload = useAction();
  const replacing = target.mode === 'replace';
  const command = useCaseCommand(
    async (body: TariffCommand) => {
      try {
        return replacing
          ? await tariffApi.replace(reviewed!.tariffId, body)
          : await tariffApi.create(body);
      } catch (error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) onDenied(error);
        throw error;
      }
    },
    ['TARIFF_BUSY'],
  );
  const fields = { ...errors, ...command.fields };
  const blocked = command.conflict || reload.pending || !!reload.error || !!readError;
  const locked = blocked || command.locked;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (command.pending || (!command.frozen && blocked)) return;
    command.submit(() => {
      const next: FieldErrors = {};
      const price = unitPrice.trim(),
        ref = source.trim(),
        until = validUntil.trim();
      if (!validUnitPrice(price))
        next.unitPrice = 'Use digits with up to 2 decimals and at most 14 integer digits.';
      if (!units.includes(unit)) next.unitCode = 'Choose a unit allowed for this product.';
      if (!ref || ref.length > 1000)
        next.sourceReference = 'Enter a source reference (1–1000 characters).';
      if (until && (!validOffsetDate(until) || Date.parse(until) <= Date.now()))
        next.validUntil = 'Use a future ISO date with offset.';
      setErrors(next);
      if (Object.keys(next).length) return null;
      return {
        product: target.product,
        unitPrice: price,
        sourceReference: ref,
        validUntil: until || null,
        recordVersion: replacing ? reviewed!.recordVersion : null,
        ...(catalog.allowedUnits ? { unitCode: unit } : {}),
      };
    }, onDone);
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
      {reviewed && (
        <p>
          Replacing version {reviewed.version} ({reviewed.unitPrice ?? 'unsupported legacy rate'}{' '}
          {reviewed.currency}, {unitLabel(reviewed.unit)}). A successor is published; historical
          versions and quotation snapshots stay unchanged.
        </p>
      )}
      <PriceError error={command.error} />
      <PriceError error={readError} />
      <PriceError error={reload.error} />
      {command.frozen && !command.pending && (
        <Notice>The result is not confirmed yet. Retry sends the same publication.</Notice>
      )}
      {!command.frozen && (command.conflict || !!readError || !!reload.error) && (
        <button
          type="button"
          disabled={reload.pending}
          onClick={() =>
            void reload.run(async () => {
              await onReloadRead();
              const products = await tariffApi.products();
              const current = products.find((p) => p.product === target.product);
              if (!current)
                throw new ApiError(
                  409,
                  'This product is no longer available. Cancel and review the catalog.',
                );
              if (!replacing && current.tariffId !== null)
                throw new ApiError(409, 'A price family now exists. Cancel and use Replace price.');
              if (replacing) {
                if (current.tariffId === null)
                  throw new ApiError(
                    409,
                    'No current version is available. Cancel and review the catalog.',
                  );
                const next = await tariffApi.get(current.tariffId);
                if (next.product !== target.product)
                  throw new ApiError(409, 'The product changed. Cancel and review the catalog.');
                setReviewed(next);
              }
              setCatalog(current);
              command.reset();
              setErrors({});
            })
          }
        >
          {reload.pending ? 'Reloading...' : 'Reload prices'}
        </button>
      )}
      <fieldset className="form-grid" disabled={locked}>
        <Field
          label="Price unit"
          hint="Only units supported by this product are available."
          error={fields.unitCode}
        >
          {(id) => (
            <select id={id} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {!units.includes(unit) && (
                <option value={unit} disabled>
                  Previous unit ({unit}) — choose a supported unit
                </option>
              )}
              {units.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Unit price (USD)"
          hint="Exact amount with up to two decimal places."
          error={fields.unitPrice}
        >
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              maxLength={17}
              value={unitPrice}
              aria-invalid={!!fields.unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          )}
        </Field>
        <Field label="Source reference (internal)" error={fields.sourceReference}>
          {(id) => (
            <textarea
              id={id}
              maxLength={1000}
              value={source}
              aria-invalid={!!fields.sourceReference}
              onChange={(e) => setSource(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Valid until (optional)"
          hint="ISO date with offset; leave empty for no planned expiry."
          error={fields.validUntil}
        >
          {(id) => (
            <input
              id={id}
              maxLength={35}
              value={validUntil}
              aria-invalid={!!fields.validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          )}
        </Field>
      </fieldset>
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={command.pending || (!command.frozen && blocked)}
        >
          {command.pending
            ? 'Publishing...'
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
