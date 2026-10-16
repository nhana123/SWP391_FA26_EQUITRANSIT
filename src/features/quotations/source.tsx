import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field } from '../../shared/ui/common';
import { assessmentApi } from '../assessment/api';
import { useCaseCommand } from '../assessment/command';
import { assessmentKeys } from '../assessment/hooks';
import { assignedCasesApi } from '../assigned-cases/api';
import { assignedKeys } from '../assigned-cases/hooks';
import {
  airfareInclusions,
  chargeLabels,
  chargeUnits,
  quoteChargeCodes,
  validateEvidence,
  validateOffer,
  type QuoteChargeCode,
  type QuoteEvidence,
  type SupplierOfferReceipt,
} from './mutation-contracts';
import { quoteMutationsApi, type SupplierOfferCommand } from './mutations';

/**
 * Current case for quotation preparation: Manager reads the manager case,
 * an assigned Coordinator the staff case. Both carry the parent order
 * recordVersion and current revision; the BE rechecks role and assignment.
 */
export function usePreparationCase(orderId: number) {
  const session = useSession()!;
  const manager = session.role === 'MANAGER';
  return useQuery({
    queryKey: manager
      ? assessmentKeys.case(session.generation, orderId)
      : assignedKeys.detail(session.generation, orderId),
    queryFn: ({ signal }) =>
      manager ? assessmentApi.getCase(orderId, signal) : assignedCasesApi.get(orderId, signal),
    enabled: (manager || session.role === 'COORDINATOR') && idSchema.safeParse(orderId).success,
    staleTime: 0,
  });
}

export function refreshPreparationCase(generation: string, orderId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: assessmentKeys.case(generation, orderId) }),
    queryClient.invalidateQueries({ queryKey: assignedKeys.detail(generation, orderId) }),
  ]);
}

/** Public-safe memory of an offer recorded in this session (no purchase cost). */
export type RecordedOffer = {
  offerId: number;
  serviceCode: QuoteChargeCode;
  providerName: string;
  retailUnitPrice: string;
  unitCode: string;
  validUntil: string;
};

const emptyOffer = {
  serviceCode: 'AIRFARE' as QuoteChargeCode,
  providerName: '',
  offerReference: '',
  quantity: '',
  purchaseUnitPrice: '',
  retailUnitPrice: '',
  validUntil: '',
  evidenceFileKey: '',
  includesStall: false,
  includedCharges: [] as QuoteChargeCode[],
};

const offerHelp: Record<string, string> = {
  ORDER_VERSION_CONFLICT: 'The request changed. Reload the case, then record the offer again.',
  QUOTE_REVISION_CONFLICT: 'The current revision changed. Reload the case before recording.',
  QUOTE_SOURCE_INVALID: 'The offer amounts or inclusions are not accepted. Check the values.',
  QUOTE_ORDER_PROTECTED: 'An accepted quotation protects this request; offers cannot change it.',
};

/**
 * Internal supplier offer. Purchase and retail prices are separate inputs;
 * nothing is copied or marked up. The purchase price is cleared after use.
 */
export function SupplierOfferForm({
  orderId,
  revisionId,
  parentVersion,
  onRecorded,
  onReload,
}: {
  orderId: number;
  revisionId: number;
  parentVersion: string;
  onRecorded: (receipt: SupplierOfferReceipt, offer: RecordedOffer) => Promise<void>;
  onReload: () => void;
}) {
  const [form, setForm] = useState(emptyOffer);
  const [errors, setErrors] = useState<FieldErrors>({});
  const command = useCaseCommand((body: SupplierOfferCommand) =>
    quoteMutationsApi.recordOffer(orderId, body),
  );
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const set = (patch: Partial<typeof emptyOffer>) => {
    if (!command.locked) setForm((f) => ({ ...f, ...patch }));
  };
  const airfare = form.serviceCode === 'AIRFARE';

  function submit(e: FormEvent) {
    e.preventDefault();
    command.submit(
      () => {
        const input = {
          revisionId,
          serviceCode: form.serviceCode,
          providerName: form.providerName.trim(),
          offerReference: form.offerReference.trim(),
          unitCode: chargeUnits[form.serviceCode],
          quantity: form.quantity.trim(),
          purchaseUnitPrice: form.purchaseUnitPrice.trim(),
          retailUnitPrice: form.retailUnitPrice.trim(),
          validUntil: form.validUntil.trim(),
          evidenceFileKey: form.evidenceFileKey.trim(),
          includesStall: airfare && form.includesStall,
          includedCharges: airfare ? form.includedCharges : [],
        };
        const next = validateOffer(input);
        setErrors(next);
        return Object.keys(next).length ? null : { ...input, recordVersion: parentVersion };
      },
      async (receipt) => {
        const recorded: RecordedOffer = {
          offerId: receipt.offerId,
          serviceCode: form.serviceCode,
          providerName: form.providerName.trim(),
          retailUnitPrice: form.retailUnitPrice.trim(),
          unitCode: chargeUnits[form.serviceCode],
          validUntil: form.validUntil.trim(),
        };
        setForm(emptyOffer);
        await onRecorded(receipt, recorded);
      },
    );
  }
  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Record supplier offer">
      <h2>Record a supplier offer</h2>
      <p className="muted">
        Internal only. The purchase price is never shown to customers and is not kept after
        recording. An offer is a priced source, not a reservation.
      </p>
      <ErrorNotice error={command.error}>
        {code && offerHelp[code] && <p>{offerHelp[code]}</p>}
        {(code === 'ORDER_VERSION_CONFLICT' ||
          code === 'QUOTE_REVISION_CONFLICT' ||
          command.frozen) && (
          <button type="button" onClick={onReload}>
            Reload case
          </button>
        )}
      </ErrorNotice>
      {command.frozen && !command.pending && (
        <p role="status">
          The connection was interrupted. The offer may have been recorded. Retry sends exactly the
          same offer, or reload the case to check.
        </p>
      )}
      <fieldset className="form-grid" disabled={command.locked}>
        <Field label="Service">
          {(id) => (
            <select
              id={id}
              value={form.serviceCode}
              onChange={(e) => {
                const serviceCode = e.target.value as QuoteChargeCode;
                set({
                  serviceCode,
                  ...(serviceCode === 'AIRFARE'
                    ? {}
                    : { includesStall: false, includedCharges: [] }),
                });
              }}
            >
              {quoteChargeCodes.map((c) => (
                <option key={c} value={c}>
                  {chargeLabels[c]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Unit" hint="Fixed by the service so the offer matches its quote line.">
          {(id) => <input id={id} value={chargeUnits[form.serviceCode]} readOnly />}
        </Field>
        <Field label="Provider name" error={errors.providerName}>
          {(id) => (
            <input
              id={id}
              maxLength={200}
              value={form.providerName}
              onChange={(e) => set({ providerName: e.target.value })}
            />
          )}
        </Field>
        <Field label="Offer reference" error={errors.offerReference}>
          {(id) => (
            <input
              id={id}
              maxLength={100}
              value={form.offerReference}
              onChange={(e) => set({ offerReference: e.target.value })}
            />
          )}
        </Field>
        <Field label="Quantity" hint="Positive, up to 3 decimals." error={errors.quantity}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              maxLength={18}
              value={form.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Purchase unit price (USD, internal cost)"
          hint="What the supplier charges us. Never used as the customer price."
          error={errors.purchaseUnitPrice}
        >
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              autoComplete="off"
              maxLength={17}
              value={form.purchaseUnitPrice}
              onChange={(e) => set({ purchaseUnitPrice: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Retail unit price (USD, customer price)"
          hint="Entered separately; no automatic margin."
          error={errors.retailUnitPrice}
        >
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              maxLength={17}
              value={form.retailUnitPrice}
              onChange={(e) => set({ retailUnitPrice: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Offer valid until"
          hint="ISO date with offset, e.g. 2027-01-31T12:00:00Z."
          error={errors.validUntil}
        >
          {(id) => (
            <input
              id={id}
              maxLength={35}
              value={form.validUntil}
              onChange={(e) => set({ validUntil: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Evidence reference"
          hint="Reference of an existing stored document. File upload is not available yet."
          error={errors.evidenceFileKey}
        >
          {(id) => (
            <input
              id={id}
              maxLength={1024}
              value={form.evidenceFileKey}
              onChange={(e) => set({ evidenceFileKey: e.target.value })}
            />
          )}
        </Field>
      </fieldset>
      {airfare && (
        <fieldset disabled={command.locked}>
          <legend>Included in this airfare (avoids charging twice)</legend>
          <label className="horse-choice">
            <input
              type="checkbox"
              checked={form.includesStall}
              onChange={(e) => set({ includesStall: e.target.checked })}
            />
            <span>Air stall</span>
          </label>
          {airfareInclusions.map((c) => (
            <label key={c} className="horse-choice">
              <input
                type="checkbox"
                checked={form.includedCharges.includes(c)}
                onChange={(e) =>
                  set({
                    includedCharges: e.target.checked
                      ? [...form.includedCharges, c]
                      : form.includedCharges.filter((x) => x !== c),
                  })
                }
              />
              <span>{chargeLabels[c]}</span>
            </label>
          ))}
        </fieldset>
      )}
      {errors.includedCharges && (
        <p className="field-error" role="alert">
          {errors.includedCharges}
        </p>
      )}
      <div className="actions">
        <button className="primary" type="submit" disabled={command.pending}>
          {command.pending
            ? 'Recording…'
            : command.frozen
              ? 'Retry the same offer'
              : 'Record offer'}
        </button>
      </div>
    </form>
  );
}

export const newEvidence = (code: QuoteChargeCode = 'AIRFARE'): QuoteEvidence => ({
  code,
  status: 'PRICED',
  quantity: null,
  tariffId: null,
  offerId: null,
  sourceReference: '',
  validUntil: '',
  reason: '',
});

const idText = (value: number | null) => (value === null ? '' : String(value));
const idOrNull = (raw: string) => (/^[1-9]\d{0,15}$/.test(raw.trim()) ? Number(raw.trim()) : null);

/**
 * Commercial evidence for evidence-dependent charges, kept in form state and
 * sent with the quotation. Missing evidence is never turned into NOT_REQUIRED.
 */
export function EvidenceEditor({
  rows,
  onChange,
  offers,
  quoteValidUntil,
  disabled,
}: {
  rows: QuoteEvidence[];
  onChange: (rows: QuoteEvidence[]) => void;
  offers: RecordedOffer[];
  quoteValidUntil: string | null;
  disabled: boolean;
}) {
  const update = (i: number, patch: Partial<QuoteEvidence>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="card" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Commercial evidence</h2>
      <p className="muted">
        Only for airfare, airport/terminal handling, customs, government duties, insurance and
        escort. Clinical, quarantine, fit and distance data come from the assigned specialists and
        cannot be entered here. Anything without evidence stays pending.
      </p>
      {rows.length === 0 && <p>No evidence added.</p>}
      {rows.map((row, i) => {
        const errors = validateEvidence(row, quoteValidUntil);
        const priced = row.status === 'PRICED';
        return (
          <fieldset key={i} className="evidence-row" disabled={disabled}>
            <legend>
              Evidence {i + 1}: {chargeLabels[row.code]}
            </legend>
            <div className="form-grid">
              <Field label="Charge">
                {(id) => (
                  <select
                    id={id}
                    value={row.code}
                    onChange={(e) => update(i, { code: e.target.value as QuoteChargeCode })}
                  >
                    {quoteChargeCodes.map((c) => (
                      <option key={c} value={c}>
                        {chargeLabels[c]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Outcome">
                {(id) => (
                  <select
                    id={id}
                    value={row.status}
                    onChange={(e) =>
                      update(
                        i,
                        e.target.value === 'PRICED'
                          ? { status: 'PRICED' }
                          : {
                              status: 'NOT_REQUIRED',
                              quantity: null,
                              tariffId: null,
                              offerId: null,
                            },
                      )
                    }
                  >
                    <option value="PRICED">Priced from a source</option>
                    <option value="NOT_REQUIRED">Not required (with reason)</option>
                  </select>
                )}
              </Field>
              {priced && (
                <>
                  <Field label="Quantity" error={errors.quantity}>
                    {(id) => (
                      <input
                        id={id}
                        inputMode="decimal"
                        maxLength={18}
                        value={row.quantity ?? ''}
                        onChange={(e) =>
                          update(i, {
                            quantity: e.target.value.trim() === '' ? null : e.target.value.trim(),
                          })
                        }
                      />
                    )}
                  </Field>
                  <Field
                    label="Offer"
                    hint="An offer recorded above, or enter its ID."
                    error={errors.source}
                  >
                    {(id) => (
                      <input
                        id={id}
                        list={`offers-${i}`}
                        inputMode="numeric"
                        value={idText(row.offerId)}
                        onChange={(e) => update(i, { offerId: idOrNull(e.target.value) })}
                      />
                    )}
                  </Field>
                  <datalist id={`offers-${i}`}>
                    {offers
                      .filter((o) => o.serviceCode === row.code)
                      .map((o) => (
                        <option key={o.offerId} value={o.offerId}>
                          {`${o.providerName} · ${o.retailUnitPrice} USD`}
                        </option>
                      ))}
                  </datalist>
                  <Field label="Tariff ID" hint="Use instead of an offer when priced by tariff.">
                    {(id) => (
                      <input
                        id={id}
                        inputMode="numeric"
                        value={idText(row.tariffId)}
                        onChange={(e) => update(i, { tariffId: idOrNull(e.target.value) })}
                      />
                    )}
                  </Field>
                </>
              )}
              <Field label="Evidence reference" error={errors.sourceReference}>
                {(id) => (
                  <input
                    id={id}
                    maxLength={1000}
                    value={row.sourceReference}
                    onChange={(e) => update(i, { sourceReference: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Reason" error={errors.reason}>
                {(id) => (
                  <input
                    id={id}
                    maxLength={1000}
                    value={row.reason}
                    onChange={(e) => update(i, { reason: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label="Evidence valid until"
                hint="Must cover the quotation's validity."
                error={errors.validUntil}
              >
                {(id) => (
                  <input
                    id={id}
                    maxLength={35}
                    value={row.validUntil}
                    onChange={(e) => update(i, { validUntil: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              Remove evidence {i + 1}
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={disabled || rows.length >= 20}
        onClick={() => onChange([...rows, newEvidence()])}
      >
        Add evidence
      </button>
    </section>
  );
}

export function RecordedOffers({ offers }: { offers: RecordedOffer[] }) {
  if (!offers.length) return null;
  return (
    <section className="card" aria-labelledby="offers-heading">
      <h2 id="offers-heading">Offers recorded in this session</h2>
      <div className="table-scroll">
        <table aria-label="Recorded offers">
          <thead>
            <tr>
              <th scope="col">Offer ID</th>
              <th scope="col">Service</th>
              <th scope="col">Provider</th>
              <th scope="col">Retail unit price</th>
              <th scope="col">Valid until</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.offerId}>
                <td>{o.offerId}</td>
                <td>{chargeLabels[o.serviceCode]}</td>
                <td>{o.providerName}</td>
                <td>
                  {o.retailUnitPrice} USD <span className="muted">{o.unitCode}</span>
                </td>
                <td>{displayDate(o.validUntil)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
