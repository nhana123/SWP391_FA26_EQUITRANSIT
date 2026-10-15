import { Field } from '../../shared/ui/common';
import type { Preferences } from './contracts';
import { insurancePatch, textOrNull } from './form';
import { ChoiceGroup, type SectionProps } from './sections';

type Coverage = NonNullable<Preferences['insurance']>;
const coverages: Coverage[] = ['NONE', 'EXISTING', 'MORTALITY', 'COMBINED'];
const labels: Record<Coverage, string> = {
  NONE: 'No insurance through EquiTransit',
  EXISTING: 'I already have a policy that covers this journey',
  MORTALITY: 'Request new mortality cover',
  COMBINED: 'Request new combined cover',
};
const notes: Record<Coverage, string> = {
  NONE: 'No premium is added.',
  EXISTING:
    'Your policy must be verified before it counts. No new premium is added for an existing policy.',
  MORTALITY:
    'New cover depends on the insurer’s terms. It is not active, accepted or paid by choosing it here.',
  COMBINED:
    'New cover depends on the insurer’s terms. It is not active, accepted or paid by choosing it here.',
};

export function InsuranceSection(props: SectionProps) {
  const { disclosure, prefs, update, errors, disabled } = props;
  const offered = disclosure.sections.find((s) => s.code === 'INSURANCE')?.options ?? [];
  const options = coverages.filter((c) => offered.includes(c));
  const coverage = prefs.insurance;
  return (
    <>
      {/* One mutually exclusive choice: mortality and combined never stack. */}
      <ChoiceGroup
        legend="Insurance for this journey"
        name="insurance"
        options={options}
        value={coverage}
        labels={labels}
        onChange={(value) => update(insurancePatch(value))}
        disabled={disabled}
      />
      {coverage && <p className="muted">{notes[coverage]}</p>}
      {coverage && coverage !== 'NONE' && (
        <fieldset className="form-grid" disabled={disabled}>
          <legend>Policy details</legend>
          {coverage === 'EXISTING' && (
            <Field label="Existing policy reference" error={errors.existingPolicyReference}>
              {(id) => (
                <input
                  id={id}
                  maxLength={100}
                  value={prefs.existingPolicyReference ?? ''}
                  onChange={(e) => update({ existingPolicyReference: textOrNull(e.target.value) })}
                  aria-invalid={!!errors.existingPolicyReference}
                />
              )}
            </Field>
          )}
          <Field
            label={`Declared value of the horse (${disclosure.currency}, optional)`}
            hint="The value you declare for cover. It is not a premium or a price."
            error={errors.declaredValue}
          >
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                maxLength={19}
                value={prefs.declaredValue ?? ''}
                // Kept as typed text; never converted to a number.
                onChange={(e) => update({ declaredValue: textOrNull(e.target.value.trim()) })}
                aria-invalid={!!errors.declaredValue}
              />
            )}
          </Field>
        </fieldset>
      )}
    </>
  );
}
