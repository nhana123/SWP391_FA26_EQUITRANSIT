import { useState, type FormEvent } from 'react';
import type { AddressSuggestion } from '../../shared/api/contracts';
import { HubAddressPicker } from './HubAddressPicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CodeChip, EmptyState } from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { flag } from '../../shared/api/lookups';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import { coordinatorApi, type CoordinatorLocation, type CoordinatorLocationRequest } from './api';
import { WORLD_COUNTRIES } from '../../shared/lib/countries';
import { routesApi } from '../transport-orders/route-api';

export function CoordinatorHubsPage() {
  const queryClient = useQueryClient();
  const [filterCountry, setFilterCountry] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ['coordinator', 'hubs'],
    queryFn: ({ signal }) => coordinatorApi.listLocations('HUB', undefined, signal),
  });

  const hubs = (query.data ?? []).filter((h) => {
    if (filterCountry !== 'ALL' && h.countryCode !== filterCountry) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = h.locationName.toLowerCase().includes(q);
      const matchCode = (h.locationCode ?? '').toLowerCase().includes(q);
      const matchAddress = (h.address ?? '').toLowerCase().includes(q);
      return matchName || matchCode || matchAddress;
    }
    return true;
  });

  // Unique country codes from data
  const countries = Array.from(new Set((query.data ?? []).map((h) => h.countryCode))).sort();

  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">TERMINALS & INFRASTRUCTURE · MANAGER</small>
          <h1>Company Hubs & Quarantine Barns</h1>
          <p>
            Official operational headquarters, quarantine staging stables, and domestic feeder rates
            ($/km).
          </p>
        </div>
        <button type="button" className="button primary" onClick={() => setIsModalOpen(true)}>
          + Add Company Hub
        </button>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search by hub name, code, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 260,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--line)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`button ${filterCountry === 'ALL' ? 'primary' : 'secondary'}`}
              style={{ padding: '6px 12px', fontSize: 13 }}
              onClick={() => setFilterCountry('ALL')}
            >
              All Countries ({query.data?.length ?? 0})
            </button>
            {countries.map((c) => (
              <button
                key={c}
                type="button"
                className={`button ${filterCountry === c ? 'primary' : 'secondary'}`}
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => setFilterCountry(c)}
              >
                {flag(c)} {c}
              </button>
            ))}
          </div>
        </div>
      </section>

      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error}>
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </ErrorNotice>
      ) : hubs.length === 0 ? (
        <EmptyState
          title="No company hubs found"
          description="Register a primary terminal or adjust your country filter."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 16,
          }}
        >
          {hubs.map((hub) => (
            <HubCard
              key={hub.locationId}
              hub={hub}
              onDeactivated={() =>
                void queryClient.invalidateQueries({ queryKey: ['coordinator', 'hubs'] })
              }
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <CreateHubModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['coordinator', 'hubs'] });
          }}
        />
      )}
    </>
  );
}

function HubCard({ hub, onDeactivated }: { hub: CoordinatorLocation; onDeactivated: () => void }) {
  const deactivateMutation = useMutation({
    mutationFn: () => coordinatorApi.deleteLocation(hub.locationId),
    onSuccess: () => onDeactivated(),
  });

  return (
    <article
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderLeft: hub.isPrimaryHub ? '4px solid var(--brand)' : '4px solid #94a3b8',
        padding: 18,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 20 }}>{flag(hub.countryCode)}</span>
            <CodeChip value={hub.locationCode ?? `HUB-${hub.countryCode}`} />
            {hub.isPrimaryHub && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: '#dcfce7',
                  color: '#15803d',
                  letterSpacing: '0.04em',
                }}
              >
                PRIMARY TERMINAL
              </span>
            )}
          </div>
          <StatusBadge status="COMPLIANT" />
        </div>

        <h3 style={{ margin: '8px 0 4px', fontSize: 16, fontWeight: 700 }}>{hub.locationName}</h3>

        <p style={{ margin: '6px 0', fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
          📍 {hub.address || 'Address on file'}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            padding: '8px 12px',
            background: '#f8fafc',
            borderRadius: 6,
            fontSize: 12,
            marginTop: 12,
          }}
        >
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>GPS Coordinates:</span>
            <strong>
              {hub.latitude != null && hub.longitude != null
                ? `${hub.latitude.toFixed(4)}°, ${hub.longitude.toFixed(4)}°`
                : 'Pending GPS'}
            </strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Domestic Transfer Policy:</span>
            <strong style={{ color: '#0f766e' }}>≤100 km FREE · &gt;100 km: $2.00 / km</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button
          type="button"
          className="button secondary"
          style={{ padding: '4px 10px', fontSize: 12 }}
          disabled={deactivateMutation.isPending}
          onClick={() => deactivateMutation.mutate()}
        >
          {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate Hub'}
        </button>
      </div>
    </article>
  );
}

function CreateHubModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [country, setCountry] = useState('VN');
  const [selectedCity, setSelectedCity] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<AddressSuggestion | null>(null);
  const [rate, setRate] = useState('2.00');
  const [isPrimary, setIsPrimary] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const citiesQuery = useQuery({
    queryKey: ['hub-cities', country],
    queryFn: async ({ signal }) => {
      try {
        const list = await routesApi.locations(country, 'CITY', signal);
        if (list && list.length > 0) {
          return list.map((l) => l.locationName);
        }
      } catch {
        // fallback
      }
      return [];
    },
    enabled: Boolean(country && country.length === 2),
    staleTime: 300_000,
  });

  const cityOptions = citiesQuery.data || [];

  const mutation = useMutation({
    mutationFn: (body: CoordinatorLocationRequest) => coordinatorApi.createLocation(body),
    onSuccess: () => onSuccess(),
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to register hub');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedAddress || selectedAddress.countryCode.toUpperCase() !== country.toUpperCase()) {
      setError('Find and select the hub address before saving.');
      return;
    }

    const body: CoordinatorLocationRequest = {
      countryCode: country.toUpperCase(),
      locationCode: code.trim() || `HUB-${country.toUpperCase()}`,
      locationName: name.trim(),
      locationType: 'HUB',
      address: address.trim() || null,
      latitude: selectedAddress.latitude,
      longitude: selectedAddress.longitude,
      domesticRatePerKm: Number(rate) || 1.2,
      isPrimaryHub: isPrimary,
      isActive: true,
    };

    mutation.mutate(body);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Register Company Hub / Stable</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {error && <Notice>{error}</Notice>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label
              style={{
                flex: 1,
                minWidth: 200,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Country Code *
              <select
                required
                aria-label="Country Code"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value.toUpperCase());
                  setSelectedCity('');
                  setSelectedAddress(null);
                }}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)', backgroundColor: '#ffffff' }}
              >
                {WORLD_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </label>

            <label
              style={{
                flex: 1,
                minWidth: 200,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Thành phố (City)
              <select
                aria-label="City"
                value={selectedCity}
                disabled={citiesQuery.isPending}
                onChange={async (e) => {
                  const c = e.target.value;
                  setSelectedCity(c);
                  if (c) {
                    setAddress(c);
                    try {
                      const res = await routesApi.searchAddress(c, country, 1);
                      if (res.length > 0) {
                        setSelectedAddress(res[0]);
                      }
                    } catch {
                      // fallback
                    }
                  }
                }}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)', backgroundColor: '#ffffff' }}
              >
                <option value="">
                  {citiesQuery.isPending
                    ? 'Đang tải thành phố từ bản đồ...'
                    : cityOptions.length > 0
                      ? `-- Chọn thành phố (${cityOptions.length} thành phố) --`
                      : '-- Nhập địa chỉ thủ công bên dưới --'}
                </option>
                {cityOptions.map((cityName) => (
                  <option key={cityName} value={cityName}>
                    {cityName}
                  </option>
                ))}
              </select>
            </label>

            <label
              style={{
                width: 140,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Hub Identifier Code
              <input
                placeholder="HUB-VN-SGN"
                maxLength={10}
                pattern="[A-Za-z0-9_-]{1,10}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
          </div>

          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Hub Name *
            <input
              required
              placeholder="e.g. Trụ sở EquiTransit TP.HCM (Củ Chi Quarantine Stable)"
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
            />
          </label>

          <HubAddressPicker
            key={country}
            country={country}
            value={address}
            selected={selectedAddress}
            onChange={(next, match) => {
              setAddress(next);
              setSelectedAddress(match);
            }}
          />

          <div style={{ display: 'grid', gap: 12 }}>
            {' '}
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Domestic Rate ($/km)
              <input
                type="number"
                step="any"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            <strong>Set as Primary National Terminal</strong> (Used for automatic 3-leg distance
            calculation)
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={mutation.isPending || !selectedAddress}
            >
              {mutation.isPending ? 'Registering...' : 'Save Company Hub'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
