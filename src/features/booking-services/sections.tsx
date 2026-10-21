import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '../../shared/api/contracts';
import type { FieldErrors } from '../../shared/lib/validation';
import type { Disclosure, Preferences, StallFit } from './contracts';
import { arrangementPatch, type Arrangement } from './form';
import { RateTag, SectionRates } from './rates';
import { recommendsWide } from './stall-options';

export type SectionProps = {
  order: Order;
  disclosure: Disclosure;
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  errors: FieldErrors;
  disabled: boolean;
  airStallPriceVisible?: boolean;
};

const arrangementLabels: Record<Arrangement, string> = {
  EQUITRANSIT: 'Arranged by EquiTransit',
  CUSTOMER: 'I will arrange my own provider',
};

export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  labels,
  onChange,
  disabled,
  children,
  notes,
  error,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T | null;
  labels: Record<T, ReactNode>;
  onChange: (value: T) => void;
  disabled: boolean;
  children?: ReactNode;
  // Shown beside an option, outside its label text (e.g. the current unit rate).
  notes?: Partial<Record<T, ReactNode>>;
  error?: string;
}) {
  return (
    <fieldset className="service-choice-grid" disabled={disabled}>
      <legend>{legend}</legend>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {/* No option is pre-selected when the BE value is null. */}
      {options.map((option) => (
        <div key={option} className="choice-row">
          <label className="horse-choice">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span className="choice-name">{labels[option]}</span>
          </label>
          {value === option && notes?.[option]}
        </div>
      ))}
      {children}
    </fieldset>
  );
}

/** Provider name/phone for a customer-arranged service. */
export function ProviderFields({ kind, prefs }: SectionProps & { kind: 'road' | 'veterinary' }) {
  const nameKey = kind === 'road' ? 'roadProviderName' : 'veterinaryProviderName';
  const contactKey = kind === 'road' ? 'roadProviderContact' : 'veterinaryProviderContact';
  return (
    <div className="saved-provider">
      <strong>Your own provider</strong>
      {prefs[nameKey] && <span>{prefs[nameKey]}</span>}
      {prefs[contactKey] && <span>{prefs[contactKey]}</span>}
    </div>
  );
}

function arrangementOptions(disclosure: Disclosure, code: 'TRANSPORTATION' | 'VETERINARY') {
  const offered = disclosure.sections.find((s) => s.code === code)?.options ?? [];
  return (['EQUITRANSIT', 'CUSTOMER'] as const).filter((o) => offered.includes(o));
}

export function TransportationSection(props: SectionProps) {
  const { disclosure, prefs, update, disabled } = props;
  return (
    <>
      <p className="muted">
        Road transport to and from the airports. Flight space is booked separately and is never
        confirmed here.
      </p>
      <ChoiceGroup
        legend="Who arranges road transport?"
        name="roadArrangement"
        error={props.errors.roadArrangement}
        options={arrangementOptions(disclosure, 'TRANSPORTATION')}
        value={prefs.roadArrangement}
        labels={arrangementLabels}
        notes={{
          EQUITRANSIT: <RateTag product="ROAD_TRANSPORT" />,
          CUSTOMER: <small className="rate-tag">Your provider; not charged by EquiTransit</small>,
        }}
        onChange={(value) => update(arrangementPatch('road', value))}
        disabled={disabled}
      />
      {prefs.roadArrangement === 'CUSTOMER' && <ProviderFields {...props} kind="road" />}
      <SectionRates section="TRANSPORTATION" selected={prefs.roadArrangement === 'EQUITRANSIT'} />
    </>
  );
}

type StallOption = StallFit['option'];
const stallNames: Record<StallOption, string> = {
  SHARED_ONE: 'Shared stall (1 slot)',
  WIDE: 'Wide stall (1.5 slots)',
  PRIVATE: 'Private stall (whole 3-slot stall)',
};
const reasonText: Record<string, string> = {
  FIT_POLICY_PENDING: 'No approved carrier policy is available yet for this option.',
  FIT_POLICY_AMBIGUOUS: 'Approved carrier policies disagree; our team must review them.',
  FIT_POLICY_CONFIGURATION_INVALID: 'The carrier policy for this option needs review.',
  HORSE_MEASUREMENTS_REQUIRED: "Your horse's weight, height and body width must be recorded.",
  HORSE_EXCEEDS_APPROVED_LIMITS: 'Your horse exceeds the approved limits for this option.',
  STALLION_COMPATIBILITY_REVIEW_REQUIRED:
    'Stallion compatibility needs Coordinator review before any sharing can be confirmed.',
};

/** Only what the BE allows: never an unsuitable option or an unconfirmed one-slot. */
export function visibleStalls(stalls: StallFit[]) {
  return stalls.filter(
    (s) => s.status !== 'UNSUITABLE' && (s.option !== 'SHARED_ONE' || s.status === 'ELIGIBLE'),
  );
}

export function AirStallSection({
  order,
  disclosure,
  prefs,
  update,
  errors,
  disabled,
  airStallPriceVisible = true,
}: SectionProps) {
  const offered =
    disclosure.sections.find((section) => section.code === 'AIR_STALL')?.options ?? [];
  const options = visibleStalls(disclosure.airStalls).filter((stall) =>
    offered.includes(stall.option),
  );
  const wideRecommended = recommendsWide(disclosure);
  const savedMissing = prefs.airStall !== null && !options.some((o) => o.option === prefs.airStall);
  const needsMeasurements = disclosure.airStalls.some((s) =>
    s.reasons.includes('HORSE_MEASUREMENTS_REQUIRED'),
  );
  const horseId = order.draft.horseId;
  return (
    <>
      <p className="notice" role="note">
        Slot size is a configuration you request. Airline space is{' '}
        {disclosure.carrierConfirmation === 'NOT_CONFIRMED' ? 'not confirmed' : 'not shown here'}{' '}
        until our team books it with the carrier.
      </p>
      <p>
        Shared and Wide are Request Share preferences. Matching, flight assignment and physical
        slots require Coordinator confirmation.
      </p>
      {wideRecommended && (
        <p className="booking-dirty">
          WIDE recommended: the server rules out one slot for this horse. This recommendation is not
          saved until you confirm service choices; any saved preference is kept.
        </p>
      )}
      {savedMissing && (
        <p className="field-error" role="alert">
          Your saved choice ({stallNames[prefs.airStall!]}) is not available for this horse now.
          Choose another option or no preference.
        </p>
      )}
      {errors.airStall && (
        <p className="field-error" role="alert">
          {errors.airStall}
        </p>
      )}
      <fieldset className="stall-packages" disabled={disabled}>
        <legend>Air stall preference</legend>
        <label className="horse-choice">
          <input
            type="radio"
            name="airStall"
            checked={prefs.airStall === null}
            onChange={() => update({ airStall: null })}
          />
          <span>No air stall preference yet</span>
        </label>
        {options.map((s) => (
          <label key={s.option} className="horse-choice stall-choice">
            <input
              type="radio"
              name="airStall"
              checked={prefs.airStall === s.option}
              onClick={() => {
                if (prefs.airStall === s.option) update({ airStall: s.option });
              }}
              onChange={() => update({ airStall: s.option })}
            />
            <span>
              <strong>{stallNames[s.option]}</strong>
              <small>
                {s.slots} slots ·{' '}
                {s.option === 'PRIVATE'
                  ? 'Private configuration requested'
                  : 'Request Share — not matched or booked'}
              </small>
              <RateTag
                product="AIR_STALL"
                selected={airStallPriceVisible && prefs.airStall === s.option}
              />
              <small>
                {s.status === 'ELIGIBLE'
                  ? "Fits the approved limits for your horse's recorded measurements."
                  : 'Requested — pending assessment. Not confirmed as suitable.'}
              </small>
              {s.reasons.length > 0 && (
                <ul className="stall-reasons">
                  {s.reasons.map((r) => (
                    <li key={r}>{reasonText[r] ?? r}</li>
                  ))}
                </ul>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {options.length === 0 && <p>No air stall option can be offered yet for this horse.</p>}
      {needsMeasurements && horseId !== null && (
        <p>
          <Link to={`/customer/horses/${horseId}/edit`}>Record your horse&apos;s measurements</Link>
          . Missing measurements are never treated as zero.
        </p>
      )}
    </>
  );
}
