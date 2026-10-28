import { useEffect, useRef, useState } from 'react';
import type { AddressSuggestion } from '../../shared/api/contracts';
import { routesApi } from '../transport-orders/route-api';

interface Props {
  country: string;
  value: string;
  selected: AddressSuggestion | null;
  onChange: (address: string, selected: AddressSuggestion | null) => void;
}

/** Explicit search avoids keystroke requests to the public geocoder. */
export function HubAddressPicker({ country, value, selected, onChange }: Props) {
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  function edit(address: string) {
    pending.current?.abort();
    setSearching(false);
    setResults([]);
    setMessage('');
    onChange(address, null);
  }

  async function search() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setSearching(true);
    setResults([]);
    setMessage('');
    try {
      const matches = await routesApi.searchAddress(value.trim(), country, 5, controller.signal);
      if (controller.signal.aborted) return;
      const valid = matches.filter(
        (item) =>
          item.countryCode.toUpperCase() === country.toUpperCase() &&
          Number.isFinite(item.latitude) &&
          Math.abs(item.latitude) <= 90 &&
          Number.isFinite(item.longitude) &&
          Math.abs(item.longitude) <= 180,
      );
      setResults(valid);
      if (!valid.length)
        setMessage(
          `No address found in ${country.toUpperCase()}. Check the country code or enter an address in this country.`,
        );
    } catch {
      if (!controller.signal.aborted) {
        setMessage('Address search is unavailable. Please try again shortly.');
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label htmlFor="hub-physical-address" style={{ fontSize: 13, fontWeight: 600 }}>
        Physical Address *
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id="hub-physical-address"
          required
          value={value}
          placeholder="Street, district, city"
          onChange={(event) => edit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!searching && value.trim().length >= 2 && /^[A-Z]{2}$/i.test(country)) {
                void search();
              }
            }
          }}
          style={{ flex: '1 1 240px', minWidth: 0 }}
          aria-describedby="hub-address-status"
        />
        <button
          type="button"
          className="button secondary"
          disabled={searching || value.trim().length < 2 || !/^[A-Z]{2}$/i.test(country)}
          onClick={() => void search()}
        >
          {searching ? 'Searching…' : 'Find address'}
        </button>
      </div>
      {results.length > 0 && (
        <ul
          aria-label="Matching addresses"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}
        >
          {results.map((item, index) => (
            <li key={`${item.latitude}:${item.longitude}:${index}`}>
              <button
                type="button"
                className="button secondary"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  whiteSpace: 'normal',
                  justifyContent: 'flex-start',
                }}
                onClick={() => {
                  onChange(item.displayName, item);
                  setResults([]);
                  setMessage('');
                }}
              >
                {item.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      <small
        id="hub-address-status"
        role="status"
        style={{ color: selected ? 'var(--brand)' : 'var(--muted)' }}
      >
        {message ||
          (selected
            ? 'Location selected · coordinates filled automatically'
            : `Search is limited to ${country.toUpperCase()}. Select an address in this country to fill coordinates.`)}
      </small>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          Latitude
          <input readOnly value={selected?.latitude ?? ''} placeholder="Automatic" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          Longitude
          <input readOnly value={selected?.longitude ?? ''} placeholder="Automatic" />
        </label>
      </div>
    </div>
  );
}
