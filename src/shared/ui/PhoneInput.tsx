import { useState } from 'react';
import './phone-input.css';

/** Calling codes offered in the picker (ITU E.164). Order: region of the business first. */
export const countryCodes = [
  { iso: 'VN', flag: '🇻🇳', name: 'Vietnam', dial: '84' },
  { iso: 'SG', flag: '🇸🇬', name: 'Singapore', dial: '65' },
  { iso: 'TH', flag: '🇹🇭', name: 'Thailand', dial: '66' },
  { iso: 'MY', flag: '🇲🇾', name: 'Malaysia', dial: '60' },
  { iso: 'ID', flag: '🇮🇩', name: 'Indonesia', dial: '62' },
  { iso: 'PH', flag: '🇵🇭', name: 'Philippines', dial: '63' },
  { iso: 'KH', flag: '🇰🇭', name: 'Cambodia', dial: '855' },
  { iso: 'LA', flag: '🇱🇦', name: 'Laos', dial: '856' },
  { iso: 'CN', flag: '🇨🇳', name: 'China', dial: '86' },
  { iso: 'HK', flag: '🇭🇰', name: 'Hong Kong', dial: '852' },
  { iso: 'JP', flag: '🇯🇵', name: 'Japan', dial: '81' },
  { iso: 'KR', flag: '🇰🇷', name: 'South Korea', dial: '82' },
  { iso: 'IN', flag: '🇮🇳', name: 'India', dial: '91' },
  { iso: 'AU', flag: '🇦🇺', name: 'Australia', dial: '61' },
  { iso: 'NZ', flag: '🇳🇿', name: 'New Zealand', dial: '64' },
  { iso: 'AE', flag: '🇦🇪', name: 'United Arab Emirates', dial: '971' },
  { iso: 'SA', flag: '🇸🇦', name: 'Saudi Arabia', dial: '966' },
  { iso: 'QA', flag: '🇶🇦', name: 'Qatar', dial: '974' },
  { iso: 'GB', flag: '🇬🇧', name: 'United Kingdom', dial: '44' },
  { iso: 'IE', flag: '🇮🇪', name: 'Ireland', dial: '353' },
  { iso: 'FR', flag: '🇫🇷', name: 'France', dial: '33' },
  { iso: 'DE', flag: '🇩🇪', name: 'Germany', dial: '49' },
  { iso: 'NL', flag: '🇳🇱', name: 'Netherlands', dial: '31' },
  { iso: 'BE', flag: '🇧🇪', name: 'Belgium', dial: '32' },
  { iso: 'IT', flag: '🇮🇹', name: 'Italy', dial: '39' },
  { iso: 'ES', flag: '🇪🇸', name: 'Spain', dial: '34' },
  { iso: 'CH', flag: '🇨🇭', name: 'Switzerland', dial: '41' },
  { iso: 'US', flag: '🇺🇸', name: 'United States / Canada', dial: '1' },
  { iso: 'BR', flag: '🇧🇷', name: 'Brazil', dial: '55' },
  { iso: 'AR', flag: '🇦🇷', name: 'Argentina', dial: '54' },
] as const;
const DEFAULT_ISO = 'VN';
const byIso = (iso: string) => countryCodes.find((c) => c.iso === iso) ?? countryCodes[0];

/**
 * Builds the E.164 string the BE validates (+<country><number>). A pasted
 * "+…" number wins over the picker; spaces/dashes and one national leading 0
 * are dropped. Anything else is returned as typed so validation can flag it.
 */
export function composePhone(dial: string, national: string) {
  const typed = national.trim();
  if (!typed) return '';
  const compact = typed.replace(/[\s\-().]/g, '');
  if (compact.startsWith('+')) return compact;
  if (!/^\d+$/.test(compact)) return typed;
  return `+${dial}${compact.replace(/^0/, '')}`;
}
/** Splits a stored E.164 value into picker country and national number. */
export function splitPhone(value: string | null | undefined): { iso: string; national: string } {
  const v = (value ?? '').trim();
  if (!v.startsWith('+')) return { iso: DEFAULT_ISO, national: v };
  const digits = v.slice(1);
  // Longest calling code first, so +852 is Hong Kong rather than +85…
  const match = [...countryCodes]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial));
  return match
    ? { iso: match.iso, national: digits.slice(match.dial.length) }
    : { iso: DEFAULT_ISO, national: v };
}

/**
 * Country calling-code picker + number. `id` labels the number input, so an
 * existing <label htmlFor> keeps working; the picker has its own label.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  disabled = false,
  maxLength = 20,
}: {
  id: string;
  value: string | null;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const [state, setState] = useState(() => splitPhone(value));
  const [seen, setSeen] = useState(value);
  // Follow an outside change (e.g. form reload) without fighting the user's typing.
  if (value !== seen) {
    setSeen(value);
    if ((value ?? '') !== composePhone(byIso(state.iso).dial, state.national))
      setState(splitPhone(value));
  }
  const country = byIso(state.iso);
  function update(next: { iso: string; national: string }) {
    setState(next);
    onChange(composePhone(byIso(next.iso).dial, next.national));
  }
  return (
    <span className="phone-input">
      <select
        aria-label="Country code"
        value={state.iso}
        disabled={disabled}
        onChange={(e) => update({ ...state, iso: e.target.value })}
      >
        {countryCodes.map((c) => (
          <option key={c.iso} value={c.iso}>
            {c.flag} +{c.dial} {c.name}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={country.iso === 'VN' ? '901 234 567' : 'Phone number'}
        maxLength={maxLength}
        value={state.national}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => update({ ...state, national: e.target.value })}
      />
    </span>
  );
}
