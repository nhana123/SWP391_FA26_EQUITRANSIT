import type { ReactNode } from 'react';
import type { FieldErrors } from '../../shared/lib/validation';
import { Field } from '../../shared/ui/common';
import type { Disclosure, Preferences } from './contracts';
import { arrangementPatch, textOrNull, type Arrangement } from './form';

export type SectionProps = {
  disclosure: Disclosure;
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  errors: FieldErrors;
  disabled: boolean;
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
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T | null;
  labels: Record<T, ReactNode>;
  onChange: (value: T) => void;
  disabled: boolean;
  children?: ReactNode;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>{legend}</legend>
      {/* No option is pre-selected when the BE value is null. */}
      {options.map((option) => (
        <label key={option} className="horse-choice">
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>{labels[option]}</span>
        </label>
      ))}
      {children}
    </fieldset>
  );
}

/** Provider name/phone for a customer-arranged service. */
export function ProviderFields({
  kind,
  prefs,
  update,
  errors,
  disabled,
}: SectionProps & { kind: 'road' | 'veterinary' }) {
  const nameKey = kind === 'road' ? 'roadProviderName' : 'veterinaryProviderName';
  const contactKey = kind === 'road' ? 'roadProviderContact' : 'veterinaryProviderContact';
  return (
    <fieldset className="form-grid" disabled={disabled}>
      <legend>Your provider (optional)</legend>
      <Field label="Provider name" error={errors[nameKey]}>
        {(id) => (
          <input
            id={id}
            maxLength={200}
            value={prefs[nameKey] ?? ''}
            onChange={(e) => update({ [nameKey]: textOrNull(e.target.value) })}
            aria-invalid={!!errors[nameKey]}
          />
        )}
      </Field>
      <Field label="Provider phone" hint="Example: +84901234567" error={errors[contactKey]}>
        {(id) => (
          <input
            id={id}
            type="tel"
            maxLength={16}
            value={prefs[contactKey] ?? ''}
            onChange={(e) => update({ [contactKey]: textOrNull(e.target.value) })}
            aria-invalid={!!errors[contactKey]}
          />
        )}
      </Field>
    </fieldset>
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
        options={arrangementOptions(disclosure, 'TRANSPORTATION')}
        value={prefs.roadArrangement}
        labels={arrangementLabels}
        onChange={(value) => update(arrangementPatch('road', value))}
        disabled={disabled}
      />
      {prefs.roadArrangement === 'CUSTOMER' && <ProviderFields {...props} kind="road" />}
    </>
  );
}
