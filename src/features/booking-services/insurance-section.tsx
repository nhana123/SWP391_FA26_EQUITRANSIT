import type { Preferences } from './contracts';
import { insurancePatch } from './form';
import { RateTag } from './rates';
import { ChoiceGroup, type SectionProps } from './sections';

type Coverage = NonNullable<Preferences['insurance']>;
const coverages: Coverage[] = ['NONE', 'MORTALITY', 'COMBINED'];
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
      {coverage === 'EXISTING' && (
        <aside className="saved-insurance">
          <strong>Previously recorded policy</strong>
          <p>{prefs.existingPolicyReference ?? 'Reference not recorded'}</p>
          <small>Kept with this request. Choose another option to replace it.</small>
        </aside>
      )}
      {/* One mutually exclusive choice: mortality and combined never stack. */}
      <ChoiceGroup
        legend="Insurance for this journey"
        name="insurance"
        options={options}
        value={coverage}
        labels={labels}
        notes={{
          NONE: <small className="rate-tag">No premium</small>,
          EXISTING: <small className="rate-tag">No new premium</small>,
          MORTALITY: <RateTag product="INSURANCE_MORTALITY" />,
          COMBINED: <RateTag product="INSURANCE_COMBINED" />,
        }}
        onChange={(value) => update(insurancePatch(value))}
        disabled={disabled}
      />
      {coverage && <p className="muted">{notes[coverage]}</p>}
      {coverage && coverage !== 'NONE' && prefs.declaredValue !== null && (
        <div className="saved-insurance">
          <strong>Recorded horse value</strong>
          <p>
            {prefs.declaredValue} {disclosure.currency}
          </p>
          <small>Declared value, not an insurance premium.</small>
        </div>
      )}
      {errors.existingPolicyReference && (
        <p className="field-error" role="alert">
          Choose a new coverage option; the saved policy reference needs review.
        </p>
      )}
      {errors.declaredValue && (
        <p className="field-error" role="alert">
          {errors.declaredValue}
        </p>
      )}
    </>
  );
}
