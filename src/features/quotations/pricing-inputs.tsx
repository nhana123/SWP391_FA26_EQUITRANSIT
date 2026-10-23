import { StatusBadge } from '../../components/ui/StatusBadge';
import { QUOTATION_CURRENCY, type QuoteResponse } from './contracts';
import '../workflow/workflow.css';

/**
 * The three inputs a quotation is priced from, each owned by one role. A
 * blocker code is attributed by its name; anything unrecognised stays with
 * the Manager's tariffs so it is never hidden.
 */
const inputs = [
  {
    key: 'assessment',
    title: 'Quarantine & veterinary assessment',
    owner: 'Specialist · F04',
    match: /QUARANTINE|VETERINARY|AUTHORITY_ASSESSMENT/,
  },
  {
    key: 'itinerary',
    title: 'Itinerary & airfare',
    owner: 'Coordinator · F10',
    match: /ITINERARY|AIRFARE|FIT_POLICY|AIR_STALL/,
  },
  { key: 'tariffs', title: 'Tariffs & supplier prices', owner: 'Manager', match: /.*/ },
] as const;

/** Every open pricing item on the quotation, from header blockers and line states. */
export function pricingBlockers(q: QuoteResponse) {
  const codes = [
    ...q.blockers,
    ...q.items.flatMap((line) =>
      line.blockers.length
        ? line.blockers
        : line.pricingStatus === 'PENDING'
          ? [`${line.code}_PENDING`]
          : [],
    ),
  ];
  return [...new Set(codes)];
}
export function inputFor(code: string) {
  return inputs.find((i) => i.match.test(code))!.key;
}
const readable = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replaceAll('_', ' ');

export function PricingInputs({ quotation }: { quotation: QuoteResponse }) {
  const open = pricingBlockers(quotation);
  const airfare = quotation.items.find((line) => line.code === 'AIRFARE');
  return (
    <section className="card" aria-labelledby="pricing-inputs-heading">
      <h2 id="pricing-inputs-heading">Pricing inputs</h2>
      <p className="muted">
        A quotation can be approved only when all three inputs are complete. Each one is completed
        by the role shown.
      </p>
      <ul className="gates-grid">
        {inputs.map((input) => {
          const mine = open.filter((code) => inputFor(code) === input.key);
          return (
            <li
              key={input.key}
              className={`gate-tile ${mine.length ? 'gate-blocked' : 'gate-pass'}`}
              aria-label={input.title}
            >
              <span>{input.title}</span>
              <StatusBadge status={mine.length ? 'PENDING' : 'PASS'}>
                {mine.length ? `Waiting for ${input.owner.split(' · ')[0]}` : 'Ready'}
              </StatusBadge>
              <small>{input.owner}</small>
              {mine.map((code) => (
                <small key={code} className="muted">
                  {readable(code)}
                </small>
              ))}
              {input.key === 'itinerary' && airfare?.amount && (
                <small>
                  Airfare from the route: {QUOTATION_CURRENCY} {airfare.amount}
                </small>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
