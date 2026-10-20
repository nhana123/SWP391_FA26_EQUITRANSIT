import { localTimeInput } from './operational-time';
import { Field } from '../../shared/ui/common';
<<<<<<< HEAD

export const dateHint = 'Giờ điều hành GMT+07:00.';
=======
import { DateTimeInput } from '../../shared/ui/DateTimeInput';
>>>>>>> 55c74ec66bfa6adaadd524ea1817419075471b4a

export function TextInput({
  label,
  value,
  onChange,
  error,
  hint,
  max,
  area,
  inputMode,
  date,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max: number;
  area?: boolean;
  inputMode?: 'decimal' | 'numeric';
  date?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) =>
        date ? (
          <DateTimeInput id={id} value={value} onChange={onChange} />
        ) : area ? (
          <textarea
            id={id}
            maxLength={max}
            value={date ? localTimeInput(value) : value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            maxLength={max}
            type={date ? 'datetime-local' : 'text'}
            step={date ? 1 : undefined}
            inputMode={inputMode}
            value={date ? localTimeInput(value) : value}
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
