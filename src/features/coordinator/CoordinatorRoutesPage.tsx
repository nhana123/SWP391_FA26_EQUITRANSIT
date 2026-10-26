import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CodeChip, EmptyState } from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { flag } from '../../shared/api/lookups';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import {
  coordinatorApi,
  type RouteTemplate,
  type RouteTemplateRequest,
  type RouteTransportMode,
} from './api';

export function CoordinatorRoutesPage() {
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<'ALL' | 'ROAD' | 'AIR'>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ['coordinator', 'routes'],
    queryFn: ({ signal }) => coordinatorApi.listRouteTemplates(true, signal),
  });

  const routes = (query.data ?? []).filter((r) => {
    if (filterMode !== 'ALL' && r.transportMode !== filterMode) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = r.routeName.toLowerCase().includes(q);
      const matchCode = r.routeCode.toLowerCase().includes(q);
      const matchCountry =
        r.originCountryCode.toLowerCase().includes(q) ||
        r.destinationCountryCode.toLowerCase().includes(q);
      return matchName || matchCode || matchCountry;
    }
    return true;
  });

  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">NETWORK & CORRIDORS · COORDINATOR</small>
          <h1>Predefined Routes</h1>
          <p>
            Standard cross-border transit corridors, border crossings, mileage, and baseline tariffs.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => setIsModalOpen(true)}
        >
          + Add Predefined Route
        </button>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search by code, country, or route name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 260, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--line)' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ALL', 'ROAD', 'AIR'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`button ${filterMode === mode ? 'primary' : 'secondary'}`}
                style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setFilterMode(mode)}
              >
                {mode === 'ALL' ? 'All Modes' : mode === 'ROAD' ? '🚛 Road' : '✈️ Air'}
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
      ) : routes.length === 0 ? (
        <EmptyState
          title="No route templates found"
          description="Create your first predefined corridor or adjust search filters."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {routes.map((route) => (
            <RouteCard key={route.routeTemplateId} route={route} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['coordinator', 'routes'] })} />
          ))}
        </div>
      )}

      {isModalOpen && (
        <CreateRouteModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['coordinator', 'routes'] });
          }}
        />
      )}
    </>
  );
}

function RouteCard({ route, onRefresh }: { route: RouteTemplate; onRefresh: () => void }) {
  const hideMutation = useMutation({
    mutationFn: () => coordinatorApi.hideRouteTemplate(route.routeTemplateId),
    onSuccess: () => onRefresh(),
  });

  return (
    <article
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderLeft: route.isActive ? '4px solid var(--brand)' : '4px solid #cbd5e1',
        padding: 18,
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <CodeChip value={route.routeCode} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: route.transportMode === 'ROAD' ? '#e0f2fe' : '#fef3c7',
                color: route.transportMode === 'ROAD' ? '#0369a1' : '#b45309',
              }}
            >
              {route.transportMode === 'ROAD' ? '🚛 ROAD' : '✈️ AIR'}
            </span>
          </div>
          <StatusBadge status={route.isActive ? 'COMPLIANT' : 'PENDING'} />
        </div>

        <h3 style={{ margin: '8px 0 4px', fontSize: 16, fontWeight: 700 }}>{route.routeName}</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', fontSize: 14 }}>
          <strong>
            {flag(route.originCountryCode)} {route.originCountryCode}
            {route.originAirportCode ? ` (${route.originAirportCode})` : route.originCity ? ` (${route.originCity})` : ''}
          </strong>
          <span style={{ color: '#94a3b8' }}>➔</span>
          <strong>
            {flag(route.destinationCountryCode)} {route.destinationCountryCode}
            {route.destinationAirportCode ? ` (${route.destinationAirportCode})` : route.destinationCity ? ` (${route.destinationCity})` : ''}
          </strong>
        </div>

        <p style={{ margin: '8px 0', fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
          {route.routeSummary}
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
            <span style={{ color: '#64748b', display: 'block' }}>Distance:</span>
            <strong>
              {route.transportMode === 'ROAD'
                ? `${route.estimatedRoadKm?.toLocaleString() ?? 0} km`
                : `${route.estimatedAirKm?.toLocaleString() ?? 0} km`}
            </strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Est. Transit Time:</span>
            <strong>{route.estimatedHours} hours</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Base Rate:</span>
            <strong>
              {route.transportMode === 'ROAD'
                ? `$${route.baseRoadRate.toFixed(2)}/km`
                : `$${route.baseAirRate.toFixed(2)}`}
            </strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Status:</span>
            <strong style={{ color: route.isActive ? '#15803d' : '#94a3b8' }}>
              {route.isActive ? 'Active in Catalog' : 'Hidden'}
            </strong>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {route.isActive && (
          <button
            type="button"
            className="button secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            disabled={hideMutation.isPending}
            onClick={() => void hideMutation.mutate()}
          >
            {hideMutation.isPending ? 'Hiding...' : 'Hide Route'}
          </button>
        )}
      </div>
    </article>
  );
}

function CreateRouteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<RouteTransportMode>('ROAD');
  const [routeCode, setRouteCode] = useState('');
  const [routeName, setRouteName] = useState('');
  const [originCountry, setOriginCountry] = useState('VN');
  const [destCountry, setDestCountry] = useState('CN');
  const [originCity, setOriginCity] = useState('');
  const [destCity, setDestCity] = useState('');
  const [originAirport, setOriginAirport] = useState('');
  const [destAirport, setDestAirport] = useState('');
  const [roadKm, setRoadKm] = useState('1800');
  const [airKm, setAirKm] = useState('0');
  const [hours, setHours] = useState('32.0');
  const [summary, setSummary] = useState('');
  const [baseRoadRate, setBaseRoadRate] = useState('1.00');
  const [baseAirRate, setBaseAirRate] = useState('0.00');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: RouteTemplateRequest) => coordinatorApi.createRouteTemplate(body),
    onSuccess: () => onSuccess(),
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to create route template');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const body: RouteTemplateRequest = {
      routeCode: routeCode.trim(),
      routeName: routeName.trim(),
      originCountryCode: originCountry.toUpperCase(),
      originCity: originCity.trim() || null,
      originAirportCode: mode === 'AIR' ? originAirport.toUpperCase() : null,
      destinationCountryCode: destCountry.toUpperCase(),
      destinationCity: destCity.trim() || null,
      destinationAirportCode: mode === 'AIR' ? destAirport.toUpperCase() : null,
      transportMode: mode,
      estimatedRoadKm: Number(roadKm) || 0,
      estimatedAirKm: Number(airKm) || 0,
      estimatedHours: Number(hours) || 1,
      routeSummary: summary.trim(),
      baseRoadRate: Number(baseRoadRate) || 1,
      baseAirRate: Number(baseAirRate) || 0,
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Create Predefined Route Template</h2>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {error && <Notice>{error}</Notice>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Route Code *
              <input
                required
                placeholder="ROUTE-VN-CN-ROAD"
                value={routeCode}
                onChange={(e) => setRouteCode(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
            <label style={{ width: 140, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Mode *
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as RouteTransportMode)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              >
                <option value="ROAD">🚛 Road</option>
                <option value="AIR">✈️ Air</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Route Display Name *
            <input
              required
              placeholder="e.g. Việt Nam - Nam Ninh (Đường bộ)"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Origin Country Code *
              <input
                required
                maxLength={2}
                placeholder="VN"
                value={originCountry}
                onChange={(e) => setOriginCountry(e.target.value.toUpperCase())}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Destination Country Code *
              <input
                required
                maxLength={2}
                placeholder="CN"
                value={destCountry}
                onChange={(e) => setDestCountry(e.target.value.toUpperCase())}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
          </div>

          {mode === 'ROAD' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Origin Hub / City
                <input
                  placeholder="TP. Hồ Chí Minh"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Destination Hub / City
                <input
                  placeholder="Nam Ninh"
                  value={destCity}
                  onChange={(e) => setDestCity(e.target.value)}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
                />
              </label>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Origin Airport (IATA)
                <input
                  maxLength={3}
                  placeholder="HAN / SGN"
                  value={originAirport}
                  onChange={(e) => setOriginAirport(e.target.value.toUpperCase())}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Dest Airport (IATA)
                <input
                  maxLength={3}
                  placeholder="CDG / CAN"
                  value={destAirport}
                  onChange={(e) => setDestAirport(e.target.value.toUpperCase())}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
                />
              </label>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Distance ({mode === 'ROAD' ? 'Road km' : 'Air km'}) *
              <input
                type="number"
                step="any"
                required
                value={mode === 'ROAD' ? roadKm : airKm}
                onChange={(e) => mode === 'ROAD' ? setRoadKm(e.target.value) : setAirKm(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Estimated Hours *
              <input
                type="number"
                step="any"
                required
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Base Rate ($) *
              <input
                type="number"
                step="any"
                required
                value={mode === 'ROAD' ? baseRoadRate : baseAirRate}
                onChange={(e) => mode === 'ROAD' ? setBaseRoadRate(e.target.value) : setBaseAirRate(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Waypoints & Route Summary *
            <textarea
              required
              rows={3}
              placeholder="e.g. TP.HCM/Miền Nam ➔ Quốc lộ 1A ➔ Hữu Nghị Quan ➔ Bằng Tường ➔ Nam Ninh"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving Route...' : 'Create Route Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
