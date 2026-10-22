import { useState } from 'react';
import { quotationsApi } from '../quotations/api';
import type { QuotePage, QuoteResponse } from '../quotations/contracts';
import { getSession, useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { Field } from '../../shared/ui/common';
import { PaymentActionForm, type ActionSpec, type ActionContext } from './ActionForm';
import { PaymentError } from './errors';
import { managerPaymentsApi } from './manager-api';

/** Load persisted installments; never substitute their display sequence for an ID. */
export function RequestPayment({
  context,
  disabled,
  onEditingChange,
}: {
  context: ActionContext;
  disabled: boolean;
  onEditingChange: (value: boolean) => void;
}) {
  const session = useSession()!;
  const [page, setPage] = useState<QuotePage | null>(null);
  const [quotation, setQuotation] = useState<QuoteResponse | null>(null);
  const [form, setForm] = useState<{ spec: ActionSpec; version: string } | null>(null);
  const read = useAction();
  async function loadQuote(id: number) {
    const value = await quotationsApi.get(context.orderId, id);
    if (getSession()?.generation === session.generation) setQuotation(value);
  }
  function loadPage(index: number) {
    return read.run(async () => {
      setQuotation(null);
      const value = await quotationsApi.list(context.orderId, index);
      if (getSession()?.generation !== session.generation) return;
      setPage(value);
      const accepted = value.items.filter((quote) => quote.status === 'ACCEPTED');
      if (accepted.length === 1) await loadQuote(accepted[0].quoteId);
    });
  }
  const identified =
    quotation?.quote.status === 'ACCEPTED'
      ? quotation.paymentSchedule.filter((stage) => typeof stage.scheduleId === 'number')
      : [];
  const available = identified.filter(
    (stage) =>
      !context.overview.obligations.some(
        (obligation) => obligation.scheduleId === stage.scheduleId,
      ),
  );
  const spec: ActionSpec | null =
    quotation && available.length
      ? {
          key: `request-${quotation.quote.quoteId}`,
          title: 'Create payment request',
          help: 'Create an obligation from the accepted installment. This does not record received funds.',
          initial: { scheduleId: '' },
          fields: [
            {
              name: 'scheduleId',
              label: 'Quotation installment',
              options: available.map((stage) => ({
                value: String(stage.scheduleId),
                label: `${stage.paymentStage} · ${stage.amountDue} ${quotation.currency} · ${displayDate(stage.dueAt)}`,
              })),
            },
          ],
          validate: (values): FieldErrors =>
            available.some((stage) => String(stage.scheduleId) === values.scheduleId)
              ? {}
              : { scheduleId: 'Choose an installment from this accepted quotation.' },
          send: (command, values) =>
            managerPaymentsApi.request(context.orderId, command, {
              quoteId: quotation.quote.quoteId,
              scheduleId: Number(values.scheduleId),
            }),
        }
      : null;
  const locked = disabled || read.pending || form !== null;
  if (form)
    return (
      <PaymentActionForm
        key={form.spec.key}
        spec={form.spec}
        context={{
          ...context,
          overview: { ...context.overview, recordVersion: form.version },
          onDone: (receipt) => {
            setForm(null);
            // Payment creation changes the parent version. Reload the quotation
            // before choosing another installment instead of reusing its stale version.
            setQuotation(null);
            onEditingChange(false);
            context.onDone(receipt);
          },
          onCancel: () => {
            setForm(null);
            onEditingChange(false);
          },
        }}
      />
    );
  return (
    <section className="card">
      <h2>Payment requests from accepted quotation</h2>
      <PaymentError error={read.error} backTo={context.backTo} />
      <button type="button" disabled={locked} onClick={() => void loadPage(page?.page ?? 0)}>
        {read.pending ? 'Loading installments...' : 'Load quotation installments'}
      </button>
      {page && (
        <>
          <Field label="Accepted quotation">
            {(id) => (
              <select
                id={id}
                disabled={locked}
                value={quotation?.quote.quoteId ?? ''}
                onChange={(event) => {
                  setQuotation(null);
                  if (event.target.value)
                    void read.run(() => loadQuote(Number(event.target.value)));
                }}
              >
                <option value="">Choose a quotation</option>
                {page.items
                  .filter((quote) => quote.status === 'ACCEPTED')
                  .map((quote) => (
                    <option key={quote.quoteId} value={quote.quoteId}>
                      {quote.quoteNumber}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          {!page.items.some((quote) => quote.status === 'ACCEPTED') && (
            <p>No accepted quotation on this page.</p>
          )}
          <nav className="pagination" aria-label="Quotation pages">
            <button
              type="button"
              disabled={locked || page.page === 0}
              onClick={() => void loadPage(page.page - 1)}
            >
              Previous quotation page
            </button>
            <span>Quotation page {page.page + 1}</span>
            <button
              type="button"
              disabled={locked || (page.page + 1) * page.size >= page.totalElements}
              onClick={() => void loadPage(page.page + 1)}
            >
              Next quotation page
            </button>
          </nav>
        </>
      )}
      {quotation && !identified.length && (
        <p>
          Installment identifiers are unavailable. Reload after the quotation service is updated.
        </p>
      )}
      {identified.length > 0 && !available.length && (
        <p>These installments already have payment requests in the loaded ledger.</p>
      )}
      <button
        type="button"
        disabled={locked || !spec}
        onClick={() => {
          if (!spec || !quotation) return;
          setForm({ spec, version: quotation.recordVersion });
          onEditingChange(true);
        }}
      >
        Create payment request
      </button>
    </section>
  );
}
