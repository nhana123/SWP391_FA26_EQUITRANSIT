import { Field } from '../../shared/ui/common';
import type { Preferences } from './contracts';
import { arrangementPatch, textOrNull } from './form';
import { RateTag, SectionRates } from './rates';
import { ChoiceGroup, ProviderFields, type SectionProps } from './sections';

const offered = (props: SectionProps, code: string) =>
  props.disclosure.sections.find((s) => s.code === code)?.options ?? [];

/** Whole non-negative days/nights only; blank means "not requested" (null). */
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
  return (
    <div>
      <Field label={label} hint={hint} error={props.errors[field]}>
        {(id) => (
          <input
            id={id}
            inputMode="numeric"
            maxLength={3}
            value={value === null ? '' : String(value)}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (raw === '') props.update({ [field]: null } as Partial<Preferences>);
              else if (/^\d{1,3}$/.test(raw))
                props.update({ [field]: Number(raw) } as Partial<Preferences>);
            }}
          />
        )}
      </Field>
      <RateTag product={product} />
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
      <fieldset className="form-grid" disabled={disabled}>
        <legend>Additional care</legend>
        {options.includes('ENHANCED') && (
          <div className="choice-row">
            <label className="horse-choice">
              <input
                type="checkbox"
                checked={prefs.enhancedCare === true}
                onChange={(e) => update({ enhancedCare: e.target.checked })}
              />
              <span>Enhanced care (optional, charged separately)</span>
            </label>
            <RateTag product="ENHANCED_CARE" />
          </div>
        )}
        {options.includes('GROOMING') && (
          <CountField
            label="Grooming days"
            hint="Leave empty if not needed."
            field="groomingDays"
            product="GROOMING"
            props={props}
          />
        )}
        {options.includes('BOARDING') && (
          <CountField
            label="Extra boarding nights"
            hint="Nights outside quarantine only; quarantine days are counted separately."
            field="boardingNights"
            product="BOARDING"
            props={props}
          />
        )}
        {options.includes('ESCORT') && (
          <Field
            label="Escort support request (optional)"
            hint="Requested only; scope and provider are confirmed by our team."
            error={errors.escortNotes}
          >
            {(id) => (
              <textarea
                id={id}
                maxLength={1000}
                value={prefs.escortNotes ?? ''}
                onChange={(e) => update({ escortNotes: textOrNull(e.target.value) })}
              />
            )}
          </Field>
        )}
        {options.includes('ESCORT') && <RateTag product="ESCORT" />}
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
      {prefs.veterinaryArrangement !== 'CUSTOMER' && (
        <SectionRates
          section="VETERINARY"
          title="Current veterinary unit rates (required counts are set by assessment)"
        />
      )}
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
