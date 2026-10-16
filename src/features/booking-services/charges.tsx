import { useState } from 'react';
import { displayDate } from '../../shared/lib/validation';
import type { Charge, Disclosure, SectionCode } from './contracts';
import { SectionRates } from './rates';
import type { SectionProps } from './sections';

const statusLabels: Record<string, string> = {
  ESTIMATED: 'Estimated',
  NOT_SELECTED: 'Not selected',
  NOT_REQUIRED: 'Not required',
  INCLUDED: 'Included',
  EXTERNAL_PROVIDER: 'Your own provider',
  EVENT_ONLY: 'Only if it happens',
  RATE_PENDING: 'Rate pending',
  QUANTITY_PENDING: 'Quantity pending',
  RATE_AND_QUANTITY_PENDING: 'Rate and quantity pending',
  AMOUNT_REVIEW_REQUIRED: 'Amount under review',
  SELECTION_REQUIRED: 'Choice needed',
  AIRFARE_PENDING: 'Airfare pending',
  INSURER_TERMS_PENDING: 'Insurer terms pending',
  AUTHORITY_ASSESSMENT_PENDING: 'Authority assessment pending',
  BUNDLE_REVIEW_REQUIRED: 'Bundle under review',
  SUPPLIER_CONFIRMATION_PENDING: 'Supplier confirmation pending',
};

const groupTitles: Record<SectionCode, string> = {
  TRANSPORTATION: 'Transportation',
  AIR_STALL: 'Air stall',
  HORSE_CARE: 'Horse care',
  VETERINARY: 'Veterinary',
  QUARANTINE: 'Quarantine',
  INSURANCE: 'Insurance',
  ADDITIONAL_CHARGES: 'Additional charges (documents, airport and customs)',
};

// Server strings shown as-is: no parsing, rounding or arithmetic in the client.
const shown = (value: string | null) => value ?? 'Pending';

export function ChargeRows({ charges, currency }: { charges: Charge[]; currency: string }) {
  return (
    <div className="table-scroll">
      <table className="charges">
        <thead>
          <tr>
            <th scope="col">Charge</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Unit</th>
            <th scope="col">Quantity</th>
            <th scope="col">Rate ({currency})</th>
            <th scope="col">Amount ({currency})</th>
            <th scope="col">How it is calculated</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((c) => (
            <tr key={`${c.uiSection}-${c.code}`}>
              <td>{c.label}</td>
              <td>{c.mandatory ? 'Required' : c.selected ? 'Optional, selected' : 'Optional'}</td>
              <td>
                {statusLabels[c.pricingStatus] ?? c.pricingStatus}
                {c.blockers.length > 0 && (
                  <small className="muted"> ({c.blockers.join(', ')})</small>
                )}
              </td>
              <td>{c.unit}</td>
              <td>{shown(c.quantity)}</td>
              <td>{shown(c.unitRate)}</td>
              <td>{shown(c.amount)}</td>
              <td>{c.formula}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChargeTotals({ disclosure }: { disclosure: Disclosure }) {
  return (
    <dl className="details charge-totals">
      <div>
        <dt>Known subtotal (priced items only)</dt>
        <dd>
          {disclosure.knownSubtotal} {disclosure.currency} — not a total and not payable.
        </dd>
      </div>
      <div>
        <dt>Estimated total</dt>
        <dd>
          {disclosure.totalEstimate === null
            ? 'Not available until pending items are priced.'
            : `${disclosure.totalEstimate} ${disclosure.currency} (estimate, not payable)`}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Additional Charges section with the read-only "Show all" breakdown. Never
 * hides mandatory charges; figures are for the last confirmed choices.
 */
export function AdditionalChargesSection({ disclosure }: SectionProps) {
  const [all, setAll] = useState(false);
  const extras = disclosure.charges.filter((c) => c.uiSection === 'ADDITIONAL_CHARGES');
  const groups = (Object.keys(groupTitles) as SectionCode[])
    .map((code) => [code, disclosure.charges.filter((c) => c.uiSection === code)] as const)
    .filter(([, rows]) => rows.length > 0);
  return (
    <>
      <p className="muted">
        Document coordination, airport and customs handling. Document processing is charged once and
        is not charged again when you submit documents.
      </p>
      <h4>Saved estimate for your last confirmed choices</h4>
      <ChargeRows charges={extras} currency={disclosure.currency} />
      <SectionRates
        section="ADDITIONAL_CHARGES"
        title="Current unit rates (today's catalog, not your quote)"
      />
      <button type="button" aria-expanded={all} onClick={() => setAll(!all)}>
        {all ? 'Hide full breakdown' : 'Show all charges'}
      </button>
      {all && (
        <div className="charges-all" aria-label="All charges">
          {groups.map(([code, rows]) => (
            <section key={code}>
              <h4>{groupTitles[code]}</h4>
              <ChargeRows charges={rows} currency={disclosure.currency} />
            </section>
          ))}
          <ChargeTotals disclosure={disclosure} />
          <p className="muted">
            Estimates as of {displayDate(disclosure.asOf)}.{' '}
            {disclosure.payable ? '' : 'Nothing here is payable; '}a quote is prepared separately.
          </p>
        </div>
      )}
    </>
  );
}
