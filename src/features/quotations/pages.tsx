import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { Loading, Notice } from '../../shared/ui/common';
import { QUOTE_PAGE_SIZE, validQuotePage } from './api';
import { QUOTATION_CURRENCY, type QuoteResponse, type QuoteSummary } from './contracts';
import { quotationStatus, useQuotationClock } from './clock';
import { canReadQuotations, useQuotation, useQuotations } from './hooks';
import { quotationParent } from './navigation';
import './quotations.css';

const customerVisible = (quote: QuoteSummary) =>
  !['DRAFT', 'APPROVED', 'SUPERSEDED'].includes(quote.status);
const decimal = (value: string | null) => value ?? 'Pending';

function QuotationHeading({ title, children }: { title: string; children: ReactNode }) {
  const session = useSession();
  return (
    <header className="page-heading">
      <div>
        <small className="eyebrow">
          {session?.role === 'CUSTOMER' ? 'YOUR QUOTATIONS' : 'QUOTATION WORKSPACE'}
        </small>
        <h1>{title}</h1>
        <p>Versioned quotations for this transport request.</p>
      </div>
      {children}
    </header>
  );
}
export function QuotationError({ error, retry }: { error: unknown; retry: () => void }) {
  const api = error instanceof ApiError ? error : null;
  const messages: Record<number, string> = {
    400: 'The quotation request is invalid. Check its link or pagination.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have permission to view quotations for this request.',
    404: 'This quotation or request is unavailable to your account.',
    409: 'The quotation changed. Refresh to review its current state.',
    503: 'The quotation service is temporarily unavailable. Please try again later.',
  };
  return (
    <div className="notice error" role="alert">
      <p>
        {api?.code === 'QUOTE_SCHEMA_PENDING'
          ? 'Quotations are not available because the quotation service has not been deployed. Please contact the project team.'
          : messages[api?.status ?? 0] || 'Quotations could not be loaded. Please try again.'}
      </p>
      {(!api || ![400, 401, 403, 404].includes(api.status)) && (
        <button type="button" onClick={retry}>
          Refresh quotations
        </button>
      )}
    </div>
  );
}

export function QuotationsPage() {
  const orderId = Number(useParams().id);
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 0);
  const size = Number(params.get('size') ?? QUOTE_PAGE_SIZE);
  const query = useQuotations(orderId, page, size);
  const now = useQuotationClock(query.data?.items || []);
  if (!session) return null;
  if (!canReadQuotations(session.role))
    return <Notice>You do not have access to quotations.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This request is unavailable.</Notice>;
  const parent = quotationParent(session.role, orderId);
  if (!validQuotePage(page, size))
    return (
      <Notice>
        Invalid quotation page.{' '}
        <button onClick={() => setParams({ page: '0', size: '20' })}>Reset pagination</button>
      </Notice>
    );
  const items =
    query.data?.items.filter((q) => session.role !== 'CUSTOMER' || customerVisible(q)) || [];
  const choices = [...new Set([20, 50, 100, size])].sort((a, b) => a - b);
  return (
    <>
      <QuotationHeading title="Quotations">
        <Link to={parent}>Back to request</Link>
      </QuotationHeading>
      <Notice>
        These are saved quotation versions. Live service estimates are shown separately in the
        request.
      </Notice>
      <section className="card quotation-page">
        <label className="quotation-page-size">
          Quotations per page
          <select value={size} onChange={(e) => setParams({ page: '0', size: e.target.value })}>
            {choices.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {query.error ? (
          <QuotationError error={query.error} retry={() => void query.refetch()} />
        ) : query.isPending ? (
          <Loading />
        ) : !items.length ? (
          <div className="empty">
            <h2>No quotations available</h2>
            <p>No quotation versions are available to your account on this page.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="quotation-caption">
                Quotation versions for request {orderId}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Quotation</th>
                  <th scope="col">Version</th>
                  <th scope="col">Revision ID</th>
                  <th scope="col">Status</th>
                  <th scope="col">Valid until</th>
                  <th scope="col">Total ({QUOTATION_CURRENCY})</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.quoteId}>
                    <td>
                      <Link to={`${parent}/quotes/${q.quoteId}`}>{q.quoteNumber}</Link>
                    </td>
                    <td>{q.version}</td>
                    <td>{q.revisionId}</td>
                    <td>
                      <span className="badge">{quotationStatus(q, now)}</span>
                    </td>
                    <td>{displayDate(q.validUntil)}</td>
                    <td>{decimal(q.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!query.error && query.data && (
          <nav className="pagination" aria-label="Quotation pagination">
            <button
              type="button"
              disabled={page === 0 || query.isFetching}
              onClick={() => setParams({ page: String(page - 1), size: String(size) })}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(query.data.totalElements / size))}
            </span>
            <button
              type="button"
              disabled={(page + 1) * size >= query.data.totalElements || query.isFetching}
              onClick={() => setParams({ page: String(page + 1), size: String(size) })}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </>
  );
}

const lineLabels = {
  PRICED: 'Priced',
  INCLUDED: 'Included',
  PENDING: 'Pending',
  NOT_REQUIRED: 'Not required',
  EXTERNAL_PROVIDER: 'External provider',
  NOT_SELECTED: 'Not selected',
  EVENT_ONLY: 'Event only',
};

// Read-only and reusable by preparation/publication/customer-response issues.
export function QuotationDetail({ quotation }: { quotation: QuoteResponse }) {
  const now = useQuotationClock([quotation.quote]);
  return (
    <>
      <Notice>
        This is a saved quotation snapshot, not a live service estimate.
        {quotation.quote.status === 'ACCEPTED'
          ? ' Acceptance records a commercial commitment. It does not confirm payment, flight space or departure.'
          : ' Viewing this quotation does not confirm payment, flight space or departure.'}
      </Notice>
      <section className="card">
        <h2>Quotation summary</h2>
        <dl className="details">
          <div>
            <dt>Quotation</dt>
            <dd>{quotation.quote.quoteNumber}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{quotation.quote.version}</dd>
          </div>
          <div>
            <dt>Revision ID</dt>
            <dd>{quotation.quote.revisionId}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="badge">{quotationStatus(quotation.quote, now)}</span>
            </dd>
          </div>
          <div>
            <dt>Valid until</dt>
            <dd>{displayDate(quotation.quote.validUntil)}</dd>
          </div>
          <div>
            <dt>Issued at</dt>
            <dd>{displayDate(quotation.issuedAt)}</dd>
          </div>
          <div>
            <dt>Accepted at</dt>
            <dd>{displayDate(quotation.acceptedAt)}</dd>
          </div>
          <div>
            <dt>Total ({quotation.currency})</dt>
            <dd>{decimal(quotation.quote.total)}</dd>
          </div>
        </dl>
      </section>
      <section className="card">
        <h2>Captured service breakdown</h2>
        {quotation.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Cost group</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Rate ({quotation.currency})</th>
                  <th scope="col">Amount ({quotation.currency})</th>
                  <th scope="col">Pricing status</th>
                  <th scope="col">Blockers</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((line, index) => (
                  <tr key={`${line.code}-${index}`}>
                    <td>
                      {line.description}
                      <small className="muted">{line.code}</small>
                    </td>
                    <td>{line.costGroup}</td>
                    <td>{line.unit}</td>
                    <td>{decimal(line.quantity)}</td>
                    <td>{decimal(line.unitRate)}</td>
                    <td>{decimal(line.amount)}</td>
                    <td>{lineLabels[line.pricingStatus]}</td>
                    <td>{line.blockers.length ? line.blockers.join(', ') : 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No captured service lines.</p>
        )}
      </section>
      <section className="card quotation-terms">
        <h2>Terms</h2>
        <p>Terms version: {quotation.termsVersion}</p>
        <p>{quotation.terms}</p>
        <h3>Cancellation terms</h3>
        <p>{quotation.cancellationTerms}</p>
      </section>
      <section className="card">
        <h2>Payment schedule</h2>
        <p>
          This is the captured schedule. It does not show payment receipts or confirm that money was
          received.
        </p>
        {quotation.paymentSchedule.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Sequence</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Amount due ({quotation.currency})</th>
                  <th scope="col">Due at</th>
                </tr>
              </thead>
              <tbody>
                {quotation.paymentSchedule.map((stage) => (
                  <tr key={stage.sequenceNo}>
                    <td>{stage.sequenceNo}</td>
                    <td>{stage.paymentStage}</td>
                    <td>{stage.amountDue}</td>
                    <td>{displayDate(stage.dueAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No payment schedule recorded.</p>
        )}
      </section>
      <section className="card">
        <h2>Quotation blockers</h2>
        {quotation.blockers.length ? (
          <ul>
            {quotation.blockers.map((blocker, i) => (
              <li key={i}>{blocker}</li>
            ))}
          </ul>
        ) : (
          <p>No quotation blockers reported.</p>
        )}
      </section>
    </>
  );
}

export function QuotationDetailPage() {
  const params = useParams();
  const orderId = Number(params.id);
  const quoteId = Number(params.quoteId);
  const session = useSession();
  const query = useQuotation(orderId, quoteId);
  if (!session) return null;
  if (!canReadQuotations(session.role))
    return <Notice>You do not have access to quotations.</Notice>;
  if (!idSchema.safeParse(orderId).success || !idSchema.safeParse(quoteId).success)
    return <Notice>This quotation is unavailable.</Notice>;
  const parent = quotationParent(session.role, orderId);
  // Hide cached data after revocation errors, including a Coordinator's ended assignment.
  const hidden =
    session.role === 'CUSTOMER' &&
    query.data &&
    (!customerVisible(query.data.quote) || query.data.issuedAt === null);
  return (
    <>
      <QuotationHeading title="Quotation details">
        <Link to={`${parent}/quotes`}>Back to quotations</Link>
      </QuotationHeading>
      {query.error ? (
        <QuotationError error={query.error} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : hidden ? (
        <Notice>This quotation is unavailable to your account.</Notice>
      ) : (
        <QuotationDetail quotation={query.data} />
      )}
    </>
  );
}
