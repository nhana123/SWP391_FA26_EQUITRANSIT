import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Notice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import type { QuoteResponse } from './contracts';
import { quotationKeys, useQuotation } from './hooks';
import { quoteMutationsApi, type QuoteAction, type QuoteActionCommand } from './mutations';
import { QuotationDetailPage } from './pages';
import { refreshPreparationCase } from './source';

type ManagerAction = Exclude<QuoteAction, 'ACCEPT'>;

const actionText: Record<ManagerAction, { label: string; confirm: string; done: string }> = {
  APPROVE: {
    label: 'Approve',
    confirm: 'Approve this draft. It is not sent to the customer until you issue it separately.',
    done: 'approved',
  },
  ISSUE: {
    label: 'Issue to customer',
    confirm: 'Issue this approved version so the customer can accept or reject it.',
    done: 'issued',
  },
  REJECT: {
    label: 'Reject',
    confirm: 'Reject this version. Prepare a new version to continue.',
    done: 'rejected',
  },
  EXPIRE: {
    label: 'Mark as expired',
    confirm: 'Its validity has passed. Record it as expired.',
    done: 'marked as expired',
  },
};

const actionHelp: Record<string, string> = {
  QUOTE_PRICING_PENDING:
    'Some prices are still pending. Resolve the sources and prepare a new version.',
  QUOTE_PRICING_CHANGED: 'A pricing source changed. Prepare a new version instead.',
  QUOTE_PRICING_INVALID: 'The captured prices are no longer valid. Prepare a new version.',
  QUOTE_SCHEDULE_INVALID: 'The payment schedule does not match the total. Prepare a new version.',
  QUOTE_EXPIRED: 'This quotation has expired. Mark it as expired or prepare a new version.',
  QUOTE_STATE_CONFLICT: 'The quotation changed state. Review its current status.',
  ORDER_VERSION_CONFLICT: 'The request changed. Review the current quotation before acting.',
  QUOTE_REVISION_CONFLICT: 'The request has a newer revision. Prepare a new version for it.',
  QUOTE_SCHEMA_PENDING:
    'Quotations are not deployed on this server yet (migration 005 is pending).',
};

/** Ticks once a minute so elapsed validity is reflected without polling the API. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Actions the BE allows a Manager for this status; the server still decides. */
export function managerActions(quotation: QuoteResponse, now: number): ManagerAction[] {
  const { status, validUntil } = quotation.quote;
  const elapsed = Date.parse(validUntil) <= now;
  if (['DRAFT', 'APPROVED', 'ISSUED'].includes(status) && elapsed) return ['EXPIRE'];
  if (status === 'DRAFT') return ['APPROVE', 'REJECT'];
  if (status === 'APPROVED') return ['ISSUE', 'REJECT'];
  return [];
}

export function ManagerQuoteActions({
  orderId,
  quotation,
}: {
  orderId: number;
  quotation: QuoteResponse;
}) {
  const session = useSession()!;
  const now = useMinuteClock();
  const [selected, setSelected] = useState<ManagerAction | null>(null);
  const [done, setDone] = useState('');
  const command = useCaseCommand((body: QuoteActionCommand) =>
    quoteMutationsApi.act(orderId, quotation.quote.quoteId, body),
  );
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const actions = managerActions(quotation, now);
  const pricedOut = quotation.quote.total === null || quotation.blockers.length > 0;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: quotationKeys.all(session.generation) }),
      refreshPreparationCase(session.generation, orderId),
    ]);
  }
  function run(action: ManagerAction) {
    command.submit(
      () => ({ recordVersion: quotation.recordVersion, action }),
      async (receipt) => {
        setSelected(null);
        setDone(
          `Quotation ${receipt.quote.quoteNumber} ${actionText[action].done}. Current status is shown above.`,
        );
        // The receipt may be a replay: always re-read the current state.
        await refresh();
      },
    );
  }
  return (
    <section className="card" aria-labelledby="manager-actions-heading">
      <h2 id="manager-actions-heading">Manager actions</h2>
      {done && <Notice>{done}</Notice>}
      {actions.length === 0 ? (
        <p>
          No Manager action is available for a {quotation.quote.status.toLowerCase()} quotation.
          {quotation.quote.status === 'ISSUED' && ' The customer accepts or rejects it.'}
        </p>
      ) : (
        <>
          {actions.includes('APPROVE') && pricedOut && (
            <p className="field-error" role="alert">
              This draft has pending prices or blockers and cannot be approved. Resolve the sources
              and prepare a new version.
            </p>
          )}
          <div className="actions">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={command.locked || (action === 'APPROVE' && pricedOut)}
                aria-pressed={selected === action}
                onClick={() => setSelected(action)}
              >
                {actionText[action].label}
              </button>
            ))}
          </div>
        </>
      )}
      {selected && (
        <div className="notice" role="dialog" aria-label={`Confirm ${actionText[selected].label}`}>
          <p>
            <strong>
              {actionText[selected].label}: {quotation.quote.quoteNumber}, version{' '}
              {quotation.quote.version}, revision ID {quotation.quote.revisionId}
            </strong>
          </p>
          <p>{actionText[selected].confirm}</p>
          <p className="muted">
            Total {quotation.quote.total ?? 'not available'} {quotation.currency}; valid until{' '}
            {displayDate(quotation.quote.validUntil)}.
          </p>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={command.pending}
              onClick={() => run(selected)}
            >
              {command.pending
                ? 'Sending…'
                : command.frozen
                  ? 'Retry the same action'
                  : `Confirm ${actionText[selected].label.toLowerCase()}`}
            </button>
            <button type="button" disabled={command.locked} onClick={() => setSelected(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ErrorNotice error={command.error}>
        {code && actionHelp[code] && <p>{actionHelp[code]}</p>}
        {(command.conflict || command.frozen) && (
          <button type="button" onClick={() => void refresh()}>
            Refresh quotation
          </button>
        )}
      </ErrorNotice>
    </section>
  );
}

/** Manager detail: Dev1's shared detail page plus the Manager action panel. */
export function ManagerQuotationDetailPage() {
  const params = useParams();
  const orderId = Number(params.id);
  const query = useQuotation(orderId, Number(params.quoteId));
  return (
    <>
      <QuotationDetailPage />
      {query.data && !query.error && (
        <ManagerQuoteActions
          key={query.data.quote.quoteId}
          orderId={orderId}
          quotation={query.data}
        />
      )}
    </>
  );
}
