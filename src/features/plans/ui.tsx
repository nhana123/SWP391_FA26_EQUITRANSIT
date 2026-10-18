import { Field } from '../../shared/ui/common';

export const dateHint = 'ISO date with offset, e.g. 2027-02-01T08:00:00+07:00.';

export function TextInput({
  label,
  value,
  onChange,
  error,
  hint,
  max,
  area,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max: number;
  area?: boolean;
  inputMode?: 'decimal' | 'numeric';
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) =>
        area ? (
          <textarea
            id={id}
            maxLength={max}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            maxLength={max}
            inputMode={inputMode}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

/** A select with no default: the user must state the value explicitly. */
export function Choice<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  error,
}: {
  label: string;
  value: T | '';
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (v: T) => void;
  error?: string;
}) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          <option value="" disabled>
            Choose…
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {labels?.[o] ?? o}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
