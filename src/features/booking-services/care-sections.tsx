import { arrangementPatch } from './form';
import { RateTag, SectionRates } from './rates';
import { ChoiceGroup, ProviderFields, type SectionProps } from './sections';

const offered = (props: SectionProps, code: string) =>
  props.disclosure.sections.find((s) => s.code === code)?.options ?? [];

/** The duration is chosen explicitly; saved nonstandard durations remain available. */
function CountField({
  label,
  hint,
  field,
  props,
  product,
}: {
  label: string;
  hint: string;
  field: 'groomingDays' | 'boardingNights';
  props: SectionProps;
  product: 'GROOMING' | 'BOARDING';
}) {
  const value = props.prefs[field];
  const active = value !== null && value > 0;
  const unit = field === 'groomingDays' ? 'day' : 'night';
  const durations = [...new Set([1, 2, 3, 5, 7, 14, 30, ...(active ? [value] : [])])].sort(
    (a, b) => a - b,
  );
  return (
    <div className="care-package">
      <label className="package-heading">
        <span>
          <strong>{label}</strong>
          <small>{hint}</small>
        </span>
        <input
          type="checkbox"
          aria-label={label}
          checked={active}
          onChange={(e) => props.update({ [field]: e.target.checked ? 1 : null })}
        />
      </label>
      <p className="package-description">
        {active ? 'Choose your duration' : `Starts with 1 ${unit}`}
      </p>
      {active && (
        <fieldset className="duration-options">
          <legend>{label} duration</legend>
          {durations.map((count) => (
            <label key={count}>
              <input
                type="radio"
                name={field}
                checked={value === count}
                onChange={() => props.update({ [field]: count })}
              />
              <span>
                {count} {unit}
                {count === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {props.errors[field] && (
        <p className="field-error" role="alert">
          {props.errors[field]}
        </p>
      )}
      <RateTag product={product} selected={active} />
    </div>
  );
}

export function HorseCareSection(props: SectionProps) {
  const { prefs, update, errors, disabled } = props;
  const options = offered(props, 'HORSE_CARE');
  return (
    <>
      <p className="notice" role="note">
        Basic care during the journey is included and is not charged again.
      </p>
      <fieldset className="care-packages" disabled={disabled}>
        <legend>Additional care</legend>
        {options.includes('ENHANCED') && (
          <div className="care-package">
            <label className="package-heading">
              <span>
                <strong>Enhanced care</strong>
                <small>Additional attention throughout the journey</small>
              </span>
              <input
                type="checkbox"
                checked={prefs.enhancedCare === true}
                onChange={(e) => update({ enhancedCare: e.target.checked })}
              />
            </label>
            <p className="package-description">Optional care upgrade</p>
            <RateTag product="ENHANCED_CARE" selected={prefs.enhancedCare === true} />
          </div>
        )}
        {options.includes('GROOMING') && (
          <CountField
            label="Grooming days"
            hint="Daily grooming and routine care"
            field="groomingDays"
            product="GROOMING"
            props={props}
          />
        )}
        {options.includes('BOARDING') && (
          <CountField
            label="Extra boarding nights"
            hint="Outside quarantine; quarantine days are counted separately."
            field="boardingNights"
            product="BOARDING"
            props={props}
          />
        )}
        {options.includes('ESCORT') && (
          <div className="care-package">
            <label className="package-heading">
              <span>
                <strong>Escort support</strong>
                <small>Request dedicated journey support</small>
              </span>
              <input
                type="checkbox"
                aria-label="Escort support"
                checked={!!prefs.escortNotes?.trim()}
                onChange={(e) =>
                  update({
                    escortNotes: e.target.checked
                      ? (prefs.escortNotes ?? 'Escort support requested')
                      : null,
                  })
                }
              />
            </label>
            <p className="package-description">Scope subject to team confirmation</p>
            {prefs.escortNotes && prefs.escortNotes !== 'Escort support requested' && (
              <p className="saved-service-note">{prefs.escortNotes}</p>
            )}
            {errors.escortNotes && (
              <p role="alert" className="field-error">
                {errors.escortNotes}
              </p>
            )}
            <RateTag product="ESCORT" selected={!!prefs.escortNotes?.trim()} />
          </div>
        )}
      </fieldset>
    </>
  );
}

export function VeterinarySection(props: SectionProps) {
  const { prefs, update, disabled } = props;
  const options = (['EQUITRANSIT', 'CUSTOMER'] as const).filter((o) =>
    offered(props, 'VETERINARY').includes(o),
  );
  return (
    <>
      <p className="muted">
        Required checks, tests and certificates are set by the route assessment. Choosing your own
        veterinarian does not reduce them or mean your documents are reviewed.
      </p>
      <ChoiceGroup
        legend="Who arranges veterinary services?"
        name="veterinaryArrangement"
        error={props.errors.veterinaryArrangement}
        options={options}
        value={prefs.veterinaryArrangement}
        labels={{
          EQUITRANSIT: 'Arranged by EquiTransit',
          CUSTOMER: 'I will arrange my own veterinarian',
        }}
        notes={{
          CUSTOMER: (
            <small className="rate-tag">Your veterinarian; not charged by EquiTransit</small>
          ),
        }}
        onChange={(value) => update(arrangementPatch('veterinary', value))}
        disabled={disabled}
      />
      {prefs.veterinaryArrangement === 'CUSTOMER' && (
        <ProviderFields {...props} kind="veterinary" />
      )}
      <SectionRates
        section="VETERINARY"
        selected={prefs.veterinaryArrangement === 'EQUITRANSIT'}
        title="Current veterinary unit rates (required counts are set by assessment)"
      />
    </>
  );
}

const packageLabels = { STANDARD: 'Standard package', ENHANCED: 'Enhanced package' };

export function QuarantineSection(props: SectionProps) {
  const { disclosure, prefs, update, errors, disabled } = props;
  const q = disclosure.quarantine;
  const packages = (['STANDARD', 'ENHANCED'] as const).filter((o) =>
    offered(props, 'QUARANTINE').includes(o),
  );
  return (
    <>
      {q.applicability === 'REQUIRED' && (
        <p className="notice" role="note">
          Quarantine is required for this route.{' '}
          {q.requiredDays !== null
            ? `Required days: ${q.requiredDays} (set by Specialist assessment; cannot be reduced).`
            : 'The number of days is pending assessment.'}
        </p>
      )}
      {q.applicability === 'UNKNOWN' && (
        <p className="notice" role="note">
          Whether quarantine is required is still pending assessment. This is not an exemption.
        </p>
      )}
      {q.applicability === 'NOT_REQUIRED' ? (
        <>
          <p>The route assessment shows quarantine is not required, so no package is needed.</p>
          {prefs.quarantinePackage !== null && (
            <p className="field-error" role="alert">
              {errors.quarantinePackage}{' '}
              <button type="button" onClick={() => update({ quarantinePackage: null })}>
                Remove package
              </button>
            </p>
          )}
        </>
      ) : (
        <ChoiceGroup
          legend="Quarantine package preference"
          name="quarantinePackage"
          error={errors.quarantinePackage}
          options={packages}
          value={prefs.quarantinePackage}
          labels={packageLabels}
          notes={{
            STANDARD: <RateTag product="QUARANTINE_STANDARD" />,
            ENHANCED: <RateTag product="QUARANTINE_ENHANCED" />,
          }}
          onChange={(value) => update({ quarantinePackage: value })}
          disabled={disabled}
        >
          {prefs.quarantinePackage !== null && (
            <button type="button" onClick={() => update({ quarantinePackage: null })}>
              No package preference yet
            </button>
          )}
        </ChoiceGroup>
      )}
    </>
  );
}
