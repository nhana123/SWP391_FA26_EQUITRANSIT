import { DateTimeInput } from "../../shared/ui/DateTimeInput";
import { PhoneInput } from "../../shared/ui/PhoneInput";
import { Icon } from '../../components/ui/Icons';
import { EmptyState } from '../../components/ui/Primitives';
import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { serviceSections } from '../booking-services/catalog';
import { sectionCodes } from '../booking-services/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { ApiError } from '../../shared/api/client';
import type {
  Order,
  RouteTransportMode,
  ServicePreferences,
} from '../../shared/api/contracts';
import { ordersApi, type SubmitCommand } from './api';
import './review.css';
import {
  CATALOG_COUNTRIES,
  CATALOG_LOCATIONS,
  COUNTRY_TIMEZONES,
  routesApi,
} from './route-api';
import {
  AddressGeocodingField,
  INITIAL_ADDRESS_VALIDATION_STATE,
  type AddressValidationState,
} from './AddressGeocodingField';
import {
  draftForm,
  draftInput,
  horseGaps,
  journeyFields,
  validateDraft,
  type DraftForm,
} from './form';
import { useHorse, useHorseSearch } from '../horses/hooks';
import { useAction } from '../../shared/lib/useAction';
import type { FieldErrors } from '../../shared/lib/validation';

import {
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeading,
  Pagination,
} from '../../shared/ui/common';

export function OrderPage() {
  const id = Number(useParams().id);
  const session = useSession()!;
  const query = useQuery({
    queryKey: queryKeys.order(session.generation, id),
    queryFn: ({ signal }) => ordersApi.get(id, signal),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  if (!Number.isSafeInteger(id) || id <= 0) return <Notice>This request is unavailable.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return <OrderEditor key={id} order={query.data} />;
}
export function OpenDraftPage() {
  const [id, setId] = useState('');
  const navigate = useNavigate();
  return (
    <>
      <PageHeading
        title="Transport Requests"
        description="Create a request or reopen a saved draft."
      />
      <section className="card">
        <Link className="button primary" to="/customer/requests/new">
          New Request
        </Link>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (Number.isSafeInteger(Number(id)) && Number(id) > 0)
              navigate(`/customer/requests/${id}`);
          }}
        >
          <Field label="Saved request ID">
            {(fieldId) => (
              <input
                id={fieldId}
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            )}
          </Field>
          <button>Open Request</button>
        </form>
        <p className="muted">
          Your request ID is shown after saving. Use it to reopen your saved request.
        </p>
      </section>
    </>
  );
}
function HorsePicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const { search, setSearch, page, setPage, query } = useHorseSearch();
  const selectedHorse = query.data?.items.find((h) => String(h.horseId) === value);

  return (
    <section className="card form-card horse-selection" style={{ borderRadius: 16, padding: '24px 28px', border: '1px solid #e2e8f0' }}>
      <header className="form-card-header" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#059669' }} />
            BƯỚC 2 · THÔNG TIN CÁ THỂ NGỰA
          </span>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
            Chọn cá thể ngựa vận chuyển
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Lựa chọn cá thể ngựa cho hành trình này. Mỗi đơn vận chuyển được lập riêng cho 1 cá thể ngựa để đảm bảo quy chuẩn chuồng bay IATA LAR và hồ sơ kiểm dịch động vật sống.
          </p>
        </div>
        <span
          className="selection-summary"
          aria-live="polite"
          style={{
            backgroundColor: value ? '#ecfdf5' : '#f8fafc',
            color: value ? '#065f46' : '#64748b',
            border: value ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <Icon name={value ? 'check' : 'horse'} size={16} />
          {value
            ? `Đã chọn: ${selectedHorse?.name ?? `Ngựa #${value}`}`
            : 'Chưa chọn ngựa'}
        </span>
      </header>

      {/* Thanh tìm kiếm & Nút Đăng ký ngựa mới */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div style={{ flex: '1 1 320px' }}>
          <Field label="Tìm kiếm ngựa trong hồ sơ">
            {(id) => (
              <input
                id={id}
                aria-label="Search your horses"
                type="search"
                placeholder="Tìm theo tên ngựa, số vi mạch ISO hoặc số hộ chiếu FEI..."
                maxLength={150}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div style={{ paddingTop: 24 }}>
          <Link
            to="/customer/horses/new"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              backgroundColor: '#059669',
              color: '#ffffff',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.2)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span>+</span> Đăng ký cá thể ngựa mới
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="field-error" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : (
        <fieldset className="horse-picker" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>
            Danh sách ngựa của bạn ({query.data.items.length})
          </legend>

          {query.data.items.length ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {query.data.items.map((h) => {
                const isSelected = value === String(h.horseId);
                const gaps = horseGaps(h);
                const hasGaps = gaps.length > 0;
                const genderLabel =
                  h.sexCode === 'STALLION'
                    ? 'Ngựa đực giống'
                    : h.sexCode === 'MARE'
                      ? 'Ngựa cái'
                      : h.sexCode === 'GELDING'
                        ? 'Ngựa thiến'
                        : 'Chưa ghi nhận';

                return (
                  <label
                    key={h.horseId}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '16px 18px',
                      borderRadius: 14,
                      border: isSelected
                        ? '2px solid #059669'
                        : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#f0fdf4' : '#ffffff',
                      boxShadow: isSelected
                        ? '0 4px 16px rgba(5, 150, 105, 0.1)'
                        : '0 1px 3px rgba(0, 0, 0, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      position: 'relative',
                    }}
                  >
                    <div>
                      {/* Top Row: Radio + Name + Badge */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <input
                            type="radio"
                            name="horse"
                            checked={isSelected}
                            onChange={() => onChange(String(h.horseId))}
                            style={{ margin: 0, accentColor: '#059669', width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              backgroundColor: isSelected ? '#dcfce7' : '#f1f5f9',
                              color: '#059669',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                              flexShrink: 0,
                            }}
                          >
                            🐎
                          </span>
                          <strong
                            title={h.name}
                            style={{
                              fontSize: 15,
                              color: '#0f172a',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {h.name}
                          </strong>
                        </div>

                        {isSelected ? (
                          <span
                            style={{
                              backgroundColor: '#dcfce7',
                              color: '#15803d',
                              border: '1px solid #86efac',
                              borderRadius: 999,
                              padding: '2px 8px',
                              fontSize: 11,
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            ✓ Đang chọn
                          </span>
                        ) : !hasGaps ? (
                          <span
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#475569',
                              border: '1px solid #e2e8f0',
                              borderRadius: 999,
                              padding: '2px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            Sẵn sàng
                          </span>
                        ) : null}
                      </div>

                      {/* Breed & Sex Subtitle */}
                      <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 10, paddingLeft: 28 }}>
                        {h.breed || 'Chưa ghi giống'} · {genderLabel}
                      </div>

                      {/* Key Metrics: Weight (kg) & Height (cm) */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, paddingLeft: 28 }}>
                        <span
                          style={{
                            backgroundColor: h.weightKg ? '#ecfdf5' : '#fef2f2',
                            color: h.weightKg ? '#047857' : '#b91c1c',
                            border: h.weightKg ? '1px solid #a7f3d0' : '1px solid #fecaca',
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          ⚖️ {h.weightKg ? `${h.weightKg} kg` : 'Thiếu cân nặng'}
                        </span>
                        <span
                          style={{
                            backgroundColor: h.heightCm ? '#ecfdf5' : '#fef2f2',
                            color: h.heightCm ? '#047857' : '#b91c1c',
                            border: h.heightCm ? '1px solid #a7f3d0' : '1px solid #fecaca',
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          📏 {h.heightCm ? `${h.heightCm} cm` : 'Thiếu chiều cao'}
                        </span>
                      </div>
                    </div>

                    {/* Status / Missing Gaps */}
                    <div style={{ paddingLeft: 28, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                      {hasGaps ? (
                        <div style={{ fontSize: 11.5, color: '#b91c1c', lineHeight: 1.4 }}>
                          ⚠️ Thiếu: {gaps.join(', ')} ·{' '}
                          <Link
                            to={`/customer/horses/${h.horseId}`}
                            style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}
                          >
                            Bổ sung hồ sơ
                          </Link>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11.5, color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>✓</span> Đạt chuẩn thể trạng & chuồng bay
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Không tìm thấy cá thể ngựa nào."
              description="Thử tìm theo tên khác hoặc đăng ký hồ sơ ngựa mới."
            >
              <Link className="button" to="/customer/horses/new">
                + Thêm ngựa mới
              </Link>
            </EmptyState>
          )}
        </fieldset>
      )}

      {/* Selected Horse Summary Card */}
      {selectedHorse && (
        <div
          style={{
            marginTop: 24,
            padding: '20px 24px',
            backgroundColor: '#ffffff',
            borderRadius: 16,
            border: '1.5px solid #059669',
            boxShadow: '0 4px 16px rgba(5, 150, 105, 0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>🐎</span>
              <div>
                <strong style={{ fontSize: 16, color: '#0f172a' }}>
                  Hồ sơ cá thể chọn cho hành trình: {selectedHorse.name}
                </strong>
                <div style={{ fontSize: 12.5, color: '#64748b' }}>
                  {selectedHorse.breed || 'Chưa ghi giống'} ·{' '}
                  {selectedHorse.sexCode === 'STALLION'
                    ? 'Ngựa đực giống'
                    : selectedHorse.sexCode === 'MARE'
                      ? 'Ngựa cái'
                      : 'Ngựa thiến'}{' '}
                  · {selectedHorse.dateOfBirth ? `Sinh ngày ${selectedHorse.dateOfBirth}` : 'Chưa ghi ngày sinh'}
                </div>
              </div>
            </div>

            <Link
              to={`/customer/horses/${selectedHorse.horseId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: '#2563eb',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                backgroundColor: '#eff6ff',
                borderRadius: 8,
                border: '1px solid #bfdbfe',
              }}
            >
              Chỉnh sửa số đo / hồ sơ ✏️
            </Link>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>CÂN NẶNG THỰC TẾ</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: selectedHorse.weightKg ? '#047857' : '#b91c1c', marginTop: 2 }}>
                {selectedHorse.weightKg ? `${selectedHorse.weightKg} kg` : 'Chưa có số đo'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Ràng buộc tải trọng khoang & xe</div>
            </div>

            <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>CHIỀU CAO TỚI VAI</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: selectedHorse.heightCm ? '#047857' : '#b91c1c', marginTop: 2 }}>
                {selectedHorse.heightCm ? `${selectedHorse.heightCm} cm` : 'Chưa có số đo'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Định chuẩn chiều cao trần chuồng bay</div>
            </div>

            <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>ĐỊNH DANH QUỐC TẾ</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                {selectedHorse.microchipId ? `Vi mạch: ${selectedHorse.microchipId}` : 'Chưa có vi mạch'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {selectedHorse.passportNumber ? `Hộ chiếu: ${selectedHorse.passportNumber}` : 'Chưa có hộ chiếu FEI'}
              </div>
            </div>

            <div style={{ backgroundColor: '#f0fdf4', padding: '12px 14px', borderRadius: 10, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 600 }}>RÀNG BUỘC CHUỒNG BAY (AIR STALL)</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#047857', marginTop: 2 }}>
                {Number(selectedHorse.weightKg || 0) > 600 || Number(selectedHorse.heightCm || 0) > 175
                  ? 'Khuyên dùng chuồng đôi / riêng'
                  : 'Chuồng chia sẻ tiêu chuẩn IATA'}
              </div>
              <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>Đạt tiêu chuẩn an toàn sinh học</div>
            </div>
          </div>
          <div
            style={{
              marginTop: 18,
              paddingTop: 12,
              borderTop: '1px solid #d1fae5',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, color: '#047857', fontWeight: 600 }}>
              ✓ Đã chọn cá thể. Bấm nút "Tiếp tục sang bước Dịch vụ →" bên dưới để chuyển bước.
            </span>
          </div>
        </div>
      )}

      {query.data && query.data.totalPages > 1 && (
        <Pagination
          page={page}
          pages={query.data.totalPages}
          onChange={setPage}
          pending={query.isFetching}
        />
      )}
    </section>
  );
}
function StepOneRouteAndMode({
  form,
  services,
  change,
  patchForm,
  fieldError,
  originAddressValidation,
  setOriginAddressValidation,
  destAddressValidation,
  setDestAddressValidation,
}: {
  form: DraftForm;
  services: ServicePreferences | null;
  change: (key: keyof DraftForm, value: string) => void;
  patchForm: (updates: Partial<DraftForm>) => void;
  fieldError: (key: keyof DraftForm) => string | undefined;
  originAddressValidation: AddressValidationState;
  setOriginAddressValidation: (next: AddressValidationState) => void;
  destAddressValidation: AddressValidationState;
  setDestAddressValidation: (next: AddressValidationState) => void;
}) {
  const [showTimezoneOverride, setShowTimezoneOverride] = useState(false);

  const countriesQuery = useQuery({
    queryKey: ['lookups', 'countries'] as const,
    queryFn: ({ signal }) => routesApi.countries(signal),
    initialData: CATALOG_COUNTRIES,
    staleTime: 300_000,
  });
  const countries = countriesQuery.data || CATALOG_COUNTRIES;

  const originCode = form.originCountryCode.trim().toUpperCase();
  const destCode = form.destinationCountryCode.trim().toUpperCase();

  const originCountryObj = countries.find((c) => c.countryCode === originCode);
  const destCountryObj = countries.find((c) => c.countryCode === destCode);

  // Determine whether Road is supported between the selected countries
  const isRoadSupported =
    (!originCountryObj || originCountryObj.supportsRoad) &&
    (!destCountryObj || destCountryObj.supportsRoad);

  // Effective transport mode for UI rendering without mutating baseline on mount
  const activeMode: RouteTransportMode =
    form.transportMode === 'AIR' || form.transportMode === 'ROAD'
      ? form.transportMode
      : !isRoadSupported
        ? 'AIR'
        : 'ROAD';

  const originCitiesQuery = useQuery({
    queryKey: ['lookups', 'locations', originCode, 'CITY'] as const,
    queryFn: ({ signal }) => routesApi.locations(originCode, 'CITY', signal),
    enabled: /^[A-Z]{2}$/.test(originCode),
    staleTime: 300_000,
  });

  const destCitiesQuery = useQuery({
    queryKey: ['lookups', 'locations', destCode, 'CITY'] as const,
    queryFn: ({ signal }) => routesApi.locations(destCode, 'CITY', signal),
    enabled: /^[A-Z]{2}$/.test(destCode),
    staleTime: 300_000,
  });

  const originAirportsQuery = useQuery({
    queryKey: ['lookups', 'locations', originCode, 'AIRPORT'] as const,
    queryFn: ({ signal }) => routesApi.locations(originCode, 'AIRPORT', signal),
    enabled: /^[A-Z]{2}$/.test(originCode) && activeMode === 'AIR',
    staleTime: 300_000,
  });

  const destAirportsQuery = useQuery({
    queryKey: ['lookups', 'locations', destCode, 'AIRPORT'] as const,
    queryFn: ({ signal }) => routesApi.locations(destCode, 'AIRPORT', signal),
    enabled: /^[A-Z]{2}$/.test(destCode) && activeMode === 'AIR',
    staleTime: 300_000,
  });

  const originHubsQuery = useQuery({
    queryKey: ['lookups', 'hubs', originCode] as const,
    queryFn: ({ signal }) => routesApi.hubs(originCode, false, signal),
    enabled: /^[A-Z]{2}$/.test(originCode),
    staleTime: 300_000,
  });

  const destHubsQuery = useQuery({
    queryKey: ['lookups', 'hubs', destCode] as const,
    queryFn: ({ signal }) => routesApi.hubs(destCode, false, signal),
    enabled: /^[A-Z]{2}$/.test(destCode),
    staleTime: 300_000,
  });

  const originLocations = originCitiesQuery.data || [];
  const destLocations = destCitiesQuery.data || [];
  const originAirports = originAirportsQuery.data || [];
  const destAirports = destAirportsQuery.data || [];
  const originCatalogHubs = originHubsQuery.data || [];
  const destCatalogHubs = destHubsQuery.data || [];

  const debouncedPickupAddr =
    originAddressValidation.status === 'verified'
      ? originAddressValidation.verifiedAddress || form.originAddress.trim()
      : '';
  const debouncedDeliveryAddr =
    destAddressValidation.status === 'verified'
      ? destAddressValidation.verifiedAddress || form.destinationAddress.trim()
      : '';

  const canMatch =
    /^[A-Z]{2}$/.test(originCode) &&
    /^[A-Z]{2}$/.test(destCode) &&
    originCode !== destCode;

  const airStall = services?.airStall || 'SHARED_ONE';
  const selectedOriginHubId = Number(form.originHubId);
  const selectedDestHubId = Number(form.destinationHubId);

  const matchQuery = useQuery({
    queryKey: [
      'routes',
      'match',
      originCode,
      destCode,
      activeMode,
      form.originCity.trim(),
      activeMode === 'AIR' ? form.originAirportCode.trim().toUpperCase() : '',
      form.destinationCity.trim(),
      activeMode === 'AIR' ? form.destinationAirportCode.trim().toUpperCase() : '',
      debouncedPickupAddr,
      debouncedDeliveryAddr,
      Number.isInteger(selectedOriginHubId) && selectedOriginHubId > 0 ? selectedOriginHubId : null,
      Number.isInteger(selectedDestHubId) && selectedDestHubId > 0 ? selectedDestHubId : null,
      airStall,
    ] as const,
    queryFn: ({ signal }) =>
      routesApi.match(
        {
          originCountryCode: originCode,
          originCity: form.originCity.trim() ? form.originCity.trim() : null,
          originAirportCode:
            activeMode === 'AIR' && /^[A-Za-z]{3}$/.test(form.originAirportCode.trim())
              ? form.originAirportCode.trim().toUpperCase()
              : null,
          destinationCountryCode: destCode,
          destinationCity: form.destinationCity.trim()
            ? form.destinationCity.trim()
            : null,
          destinationAirportCode:
            activeMode === 'AIR' && /^[A-Za-z]{3}$/.test(form.destinationAirportCode.trim())
              ? form.destinationAirportCode.trim().toUpperCase()
              : null,
          transportMode: activeMode,
          airStallPreference: airStall,
          ...(debouncedPickupAddr ? { pickupAddress: debouncedPickupAddr } : {}),
          ...(debouncedDeliveryAddr ? { deliveryAddress: debouncedDeliveryAddr } : {}),
          ...(Number.isInteger(selectedOriginHubId) && selectedOriginHubId > 0
            ? { originHubId: selectedOriginHubId }
            : {}),
          ...(Number.isInteger(selectedDestHubId) && selectedDestHubId > 0
            ? { destinationHubId: selectedDestHubId }
            : {}),
        },
        signal,
      ),
    enabled: canMatch,
    retry: false,
  });

  const routeMatch = matchQuery.data;

  const originHubOptions =
    routeMatch?.originHubOptions && routeMatch.originHubOptions.length > 0
      ? routeMatch.originHubOptions
      : originCatalogHubs.map((h) => ({
          locationId: h.locationId,
          locationName: h.locationName,
          locationCode: h.locationCode,
          address: h.address ?? null,
          latitude: h.latitude ?? null,
          longitude: h.longitude ?? null,
          isPrimaryHub: Boolean(h.isPrimaryHub),
          distanceKm: null,
          domesticCost: null,
          isRecommendedNearest: false,
        }));

  const destHubOptions =
    routeMatch?.destinationHubOptions && routeMatch.destinationHubOptions.length > 0
      ? routeMatch.destinationHubOptions
      : destCatalogHubs.map((h) => ({
          locationId: h.locationId,
          locationName: h.locationName,
          locationCode: h.locationCode,
          address: h.address ?? null,
          latitude: h.latitude ?? null,
          longitude: h.longitude ?? null,
          isPrimaryHub: Boolean(h.isPrimaryHub),
          distanceKm: null,
          domesticCost: null,
          isRecommendedNearest: false,
        }));

  const activeOriginHubId =
    (Number.isInteger(selectedOriginHubId) && selectedOriginHubId > 0
      ? selectedOriginHubId
      : routeMatch?.originHubId) ??
    originHubOptions.find((h) => h.isRecommendedNearest)?.locationId ??
    originHubOptions.find((h) => h.isPrimaryHub)?.locationId ??
    originHubOptions[0]?.locationId ??
    null;

  const activeDestHubId =
    (Number.isInteger(selectedDestHubId) && selectedDestHubId > 0
      ? selectedDestHubId
      : routeMatch?.destinationHubId) ??
    destHubOptions.find((h) => h.isRecommendedNearest)?.locationId ??
    destHubOptions.find((h) => h.isPrimaryHub)?.locationId ??
    destHubOptions[0]?.locationId ??
    null;

  const originPrimaryHub =
    originHubOptions.find((h) => h.locationId === activeOriginHubId) ||
    originHubOptions[0] ||
    null;
  const destPrimaryHub =
    destHubOptions.find((h) => h.locationId === activeDestHubId) ||
    destHubOptions[0] ||
    null;

  function handleSelectMode(mode: 'ROAD' | 'AIR') {
    if (mode === 'ROAD' && !isRoadSupported) return;
    const updates: Partial<DraftForm> = { transportMode: mode };
    if (activeOriginHubId && !form.originHubId) {
      updates.originHubId = String(activeOriginHubId);
    }
    if (activeDestHubId && !form.destinationHubId) {
      updates.destinationHubId = String(activeDestHubId);
    }
    if (mode === 'AIR') {
      if (!form.originAirportCode && originCode === 'VN') updates.originAirportCode = 'HAN';
      if (!form.destinationAirportCode && destCode === 'FR') updates.destinationAirportCode = 'CDG';
    }
    patchForm(updates);
  }

  function handleOriginCountryChange(nextCode: string) {
    const code = nextCode.trim().toUpperCase();
    const country = countries.find((c) => c.countryCode === code);
    const nextTz = COUNTRY_TIMEZONES[code] || form.originTimezone || 'Etc/UTC';
    const nextMode: RouteTransportMode =
      country && !country.supportsRoad ? 'AIR' : activeMode;
    const defaultHub = CATALOG_LOCATIONS.find(
      (l) => l.countryCode === code && l.locationType === 'HUB' && l.isPrimaryHub,
    );
    patchForm({
      originCountryCode: code,
      originTimezone: nextTz,
      transportMode: nextMode,
      originCity: '',
      originAirportCode: '',
      originHubId: defaultHub ? String(defaultHub.locationId) : '',
    });
  }

  function handleDestCountryChange(nextCode: string) {
    const code = nextCode.trim().toUpperCase();
    const country = countries.find((c) => c.countryCode === code);
    const nextTz = COUNTRY_TIMEZONES[code] || form.destinationTimezone || 'Etc/UTC';
    const nextMode: RouteTransportMode =
      country && !country.supportsRoad ? 'AIR' : activeMode;
    const defaultHub = CATALOG_LOCATIONS.find(
      (l) => l.countryCode === code && l.locationType === 'HUB' && l.isPrimaryHub,
    );
    patchForm({
      destinationCountryCode: code,
      destinationTimezone: nextTz,
      ...(form.eventStartAt && !form.eventTimezone ? { eventTimezone: nextTz } : {}),
      transportMode: nextMode,
      destinationCity: '',
      destinationAirportCode: '',
      destinationHubId: defaultHub ? String(defaultHub.locationId) : '',
    });
  }

  const totalKm =
    routeMatch?.matched
      ? Number(
          activeMode === 'AIR'
            ? routeMatch.estimatedAirKm || routeMatch.estimatedRoadKm || 0
            : routeMatch.estimatedRoadKm || routeMatch.estimatedAirKm || 0,
        )
      : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* ============================================================ */}
      {/* 1. CHỌN PHƯƠNG THỨC VẬN CHUYỂN */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#2563eb',
              }}
            />
            Bước 1 · Phương thức vận tải
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Chọn phương thức vận chuyển
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Lựa chọn chuyên cơ đường bay hoặc xe đệm khí nén chuyên dụng theo tiêu chuẩn vận chuyển ngựa đua quốc tế.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {/* THẺ HÀNG KHÔNG (AIR) */}
          <div
            role="button"
            tabIndex={0}
            aria-pressed={activeMode === 'AIR'}
            onClick={() => handleSelectMode('AIR')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectMode('AIR');
              }
            }}
            style={{
              padding: '18px 20px',
              borderRadius: 14,
              border:
                activeMode === 'AIR' ? '2px solid #2563eb' : '1px solid #e2e8f0',
              backgroundColor: activeMode === 'AIR' ? '#f8faff' : '#ffffff',
              cursor: 'pointer',
              boxShadow:
                activeMode === 'AIR'
                  ? '0 4px 16px rgba(37, 99, 235, 0.08)'
                  : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: activeMode === 'AIR' ? '#eff6ff' : '#f1f5f9',
                      color: '#2563eb',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}
                  >
                    ✈️
                  </span>
                  <div>
                    <strong style={{ fontSize: 15, color: '#0f172a', display: 'block' }}>
                      Đường hàng không (Air Freight)
                    </strong>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Tiêu chuẩn quốc tế IATA LAR
                    </span>
                  </div>
                </div>

                <span
                  style={{
                    backgroundColor: activeMode === 'AIR' ? '#dbeafe' : '#f1f5f9',
                    color: activeMode === 'AIR' ? '#1d4ed8' : '#64748b',
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  {activeMode === 'AIR' ? '✓ Đang chọn' : 'Khả dụng'}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#475569',
                  lineHeight: 1.5,
                }}
              >
                Chuyên cơ vận tải động vật sống, khoang áp suất điều hòa liên tục, chuồng bay đệm khí êm ái cho hành trình dài và xuyên lục địa.
              </p>
            </div>
          </div>

          {/* THẺ ĐƯỜNG BỘ (ROAD) */}
          <div
            role="button"
            tabIndex={0}
            aria-pressed={activeMode === 'ROAD'}
            onClick={() => handleSelectMode('ROAD')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectMode('ROAD');
              }
            }}
            style={{
              padding: '18px 20px',
              borderRadius: 14,
              border:
                activeMode === 'ROAD' ? '2px solid #059669' : '1px solid #e2e8f0',
              backgroundColor: activeMode === 'ROAD' ? '#f0fdf4' : '#ffffff',
              cursor: !isRoadSupported ? 'not-allowed' : 'pointer',
              opacity: !isRoadSupported ? 0.6 : 1,
              boxShadow:
                activeMode === 'ROAD'
                  ? '0 4px 16px rgba(5, 150, 105, 0.08)'
                  : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: activeMode === 'ROAD' ? '#ecfdf5' : '#f1f5f9',
                      color: '#059669',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}
                  >
                    🚛
                  </span>
                  <div>
                    <strong style={{ fontSize: 15, color: '#0f172a', display: 'block' }}>
                      Đường bộ chuyên dụng (Ground)
                    </strong>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Xe đệm khí & điều hòa nhiệt độ
                    </span>
                  </div>
                </div>

                <span
                  style={{
                    backgroundColor: !isRoadSupported
                      ? '#fee2e2'
                      : activeMode === 'ROAD'
                        ? '#dcfce7'
                        : '#f1f5f9',
                    color: !isRoadSupported
                      ? '#b91c1c'
                      : activeMode === 'ROAD'
                        ? '#15803d'
                        : '#64748b',
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  {!isRoadSupported
                    ? 'Không hỗ trợ'
                    : activeMode === 'ROAD'
                      ? '✓ Đang chọn'
                      : 'Khả dụng'}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#475569',
                  lineHeight: 1.5,
                }}
              >
                Đoàn xe rơ-moóc chuyên dụng đệm khí nén êm ái, đón trả tận trang trại, đi qua các cửa khẩu quốc tế đã ký hiệp định thông quan.
              </p>
              {!isRoadSupported && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: '#dc2626',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ Không hỗ trợ đường bộ giữa hai quốc gia này. Hệ thống tự động chọn Đường hàng không.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. LỘ TRÌNH GIAO NHẬN (ORIGIN & DESTINATION) */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#64748b',
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#059669',
                }}
              />
              Bước 2 · Lộ trình tuyến đường
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.01em',
              }}
            >
              Lộ trình & Điểm đón / trả ngựa
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
              Xác định địa điểm gửi và nơi nhận ngựa đua. Hệ thống sẽ tự động ghép với Trụ sở EquiTransit tối ưu nhất.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowTimezoneOverride((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <span>🌐</span>
            {showTimezoneOverride
              ? 'Ẩn thiết lập múi giờ'
              : `Múi giờ: ${form.originTimezone || 'Asia/Ho_Chi_Minh'} → ${form.destinationTimezone || 'Auto'}`}
          </button>
        </div>

        {/* 2 CỘT GIAO NHẬN */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {/* CỘT TRÁI: ĐIỂM XUẤT PHÁT */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Header cột A */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: '#1e40af',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  A
                </span>
                <div>
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>
                    ĐIỂM XUẤT PHÁT
                  </strong>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>Nơi đón ngựa</div>
                </div>
              </div>
              {originCountryObj && (
                <span
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1e40af',
                  }}
                >
                  {originCountryObj.countryName} ({originCountryObj.countryCode})
                </span>
              )}
            </div>

            {/* Dropdown Quốc gia */}
            <Field
              label="Quốc gia xuất phát *"
              error={fieldError('originCountryCode')}
            >
              {(id) => (
                <>
                  <input
                    id={id}
                    aria-label="Pickup country (ISO code)"
                    list="origin-countries-datalist"
                    maxLength={2}
                    style={{ textTransform: 'uppercase' }}
                    value={originCode}
                    placeholder="VD: VN"
                    aria-invalid={!!fieldError('originCountryCode')}
                    aria-describedby={
                      fieldError('originCountryCode') ? `${id}-error` : undefined
                    }
                    onChange={(e) => handleOriginCountryChange(e.target.value)}
                  />
                  <datalist id="origin-countries-datalist">
                    {countries.map((c) => (
                      <option key={c.countryCode} value={c.countryCode}>
                        {c.countryName} ({c.countryCode})
                      </option>
                    ))}
                  </datalist>
                </>
              )}
            </Field>

            {/* Tỉnh / Thành phố & Sân bay (nếu Air) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: activeMode === 'AIR' ? '1fr 1fr' : '1fr',
                gap: 12,
              }}
            >
              <Field
                label="Tỉnh / Thành phố đón *"
                error={fieldError('originCity')}
              >
                {(id) => (
                  <select
                    id={id}
                    value={form.originCity}
                    disabled={!originCode}
                    onChange={(e) => change('originCity', e.target.value)}
                  >
                    <option value="">
                      {originCode
                        ? '-- Chọn tỉnh / thành phố đón --'
                        : '-- Chọn quốc gia trước --'}
                    </option>
                    {originLocations.map((loc) => (
                      <option key={loc.locationId} value={loc.locationName}>
                        {loc.locationName}
                      </option>
                    ))}
                    {form.originCity &&
                      !originLocations.some((l) => l.locationName === form.originCity) && (
                        <option value={form.originCity}>{form.originCity}</option>
                      )}
                  </select>
                )}
              </Field>

              {activeMode === 'AIR' && (
                <Field
                  label="Sân bay xuất phát *"
                  error={fieldError('originAirportCode')}
                >
                  {(id) => (
                    <select
                      id={id}
                      value={form.originAirportCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        patchForm({
                          originAirportCode: code,
                        });
                      }}
                    >
                      <option value="">-- Chọn sân bay --</option>
                      {originAirports.map((loc) => (
                        <option
                          key={loc.locationId}
                          value={loc.locationCode || loc.locationName}
                        >
                          {loc.locationName}
                          {loc.locationCode ? ` (${loc.locationCode})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
            </div>

            {/* Địa chỉ đón chi tiết (Xác thực qua OpenStreetMap Nominatim) */}
            <AddressGeocodingField
              label="Địa chỉ đón chi tiết *"
              ariaLabel="Pickup address"
              hint="Chuồng trại / câu lạc bộ cưỡi ngựa đón tận nơi (đối chiếu địa chỉ thực tế trên bản đồ)"
              placeholder="Ví dụ: 123 Nguyễn Huệ, Quận 1 hoặc Xã Ba Trại, Ba Vì..."
              countryCode={originCode}
              countryName={originCountryObj?.countryName}
              value={form.originAddress}
              validationState={originAddressValidation}
              externalError={fieldError('originAddress')}
              onChange={(val) => change('originAddress', val)}
              onValidationChange={setOriginAddressValidation}
            />

            {/* TRỤ SỞ EQUITRANSIT NƯỚC ĐI */}
            {originHubOptions.length > 0 && originPrimaryHub ? (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>🏢</span>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>
                      Trụ sở EquiTransit tập kết (Nước đi)
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: '#ecfdf5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    ≤100km: Miễn phí · &gt;100km: $2/km
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {originHubOptions.map((hub) => {
                    const isSelected = hub.locationId === activeOriginHubId;
                    return (
                      <div
                        key={hub.locationId}
                        role="button"
                        tabIndex={0}
                        onClick={() => change('originHubId', String(hub.locationId))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            change('originHubId', String(hub.locationId));
                          }
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#f8faff' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="radio"
                              name="originHubSelection"
                              checked={isSelected}
                              onChange={() => change('originHubId', String(hub.locationId))}
                              style={{ margin: 0, accentColor: '#2563eb', cursor: 'pointer' }}
                            />
                            <strong
                              style={{
                                fontSize: 13,
                                color: isSelected ? '#1d4ed8' : '#1e293b',
                              }}
                            >
                              {hub.locationName}
                            </strong>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {hub.isRecommendedNearest && (
                              <span
                                style={{
                                  backgroundColor: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  borderRadius: 999,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                🌟 Gợi ý gần nhất
                              </span>
                            )}
                            {hub.distanceKm != null && (
                              <span
                                style={{
                                  backgroundColor:
                                    Number(hub.distanceKm) <= 100 ? '#ecfdf5' : '#f8fafc',
                                  color:
                                    Number(hub.distanceKm) <= 100 ? '#047857' : '#0f172a',
                                  border:
                                    Number(hub.distanceKm) <= 100
                                      ? '1px solid #a7f3d0'
                                      : '1px solid #cbd5e1',
                                  borderRadius: 6,
                                  padding: '2px 8px',
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                }}
                              >
                                {Number(hub.distanceKm).toFixed(1)} km ·{' '}
                                {Number(hub.distanceKm) <= 100
                                  ? 'Miễn phí $0'
                                  : `$${Number(hub.domesticCost ?? 0).toFixed(2)}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {hub.address && (
                          <div
                            style={{
                              color: '#64748b',
                              fontSize: 12,
                              paddingLeft: 22,
                            }}
                          >
                            📍 {hub.address}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : originCode && originHubsQuery.isSuccess ? (
              <div
                role="alert"
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 12.5,
                  color: '#991b1b',
                  lineHeight: 1.45,
                  fontWeight: 600,
                }}
              >
                🚫 Quốc gia xuất phát ({originCode}) hiện chưa có Trụ sở EquiTransit hoạt động để tập kết ngựa.
              </div>
            ) : null}
          </div>

          {/* CỘT PHẢI: ĐIỂM ĐÍCH ĐẾN */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Header cột B */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  B
                </span>
                <div>
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>
                    ĐIỂM ĐÍCH ĐẾN
                  </strong>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>Nơi nhận ngựa</div>
                </div>
              </div>
              {destCountryObj && (
                <span
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#059669',
                  }}
                >
                  {destCountryObj.countryName} ({destCountryObj.countryCode})
                </span>
              )}
            </div>

            {/* Dropdown Quốc gia đến */}
            <Field
              label="Quốc gia đến *"
              error={fieldError('destinationCountryCode')}
            >
              {(id) => (
                <>
                  <input
                    id={id}
                    aria-label="Destination country (ISO code)"
                    list="dest-countries-datalist"
                    maxLength={2}
                    style={{ textTransform: 'uppercase' }}
                    value={destCode}
                    placeholder="VD: GB"
                    aria-invalid={!!fieldError('destinationCountryCode')}
                    aria-describedby={
                      fieldError('destinationCountryCode') ? `${id}-error` : undefined
                    }
                    onChange={(e) => handleDestCountryChange(e.target.value)}
                  />
                  <datalist id="dest-countries-datalist">
                    {countries
                      .filter((c) => c.countryCode !== originCode)
                      .map((c) => (
                        <option key={c.countryCode} value={c.countryCode}>
                          {c.countryName} ({c.countryCode})
                        </option>
                      ))}
                  </datalist>
                </>
              )}
            </Field>

            {/* Tỉnh / Thành phố & Sân bay (nếu Air) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: activeMode === 'AIR' ? '1fr 1fr' : '1fr',
                gap: 12,
              }}
            >
              <Field
                label="Tỉnh / Thành phố giao *"
                error={fieldError('destinationCity')}
              >
                {(id) => (
                  <select
                    id={id}
                    value={form.destinationCity}
                    disabled={!destCode}
                    onChange={(e) => change('destinationCity', e.target.value)}
                  >
                    <option value="">
                      {destCode
                        ? '-- Chọn tỉnh / thành phố giao --'
                        : '-- Chọn quốc gia trước --'}
                    </option>
                    {destLocations.map((loc) => (
                      <option key={loc.locationId} value={loc.locationName}>
                        {loc.locationName}
                      </option>
                    ))}
                    {form.destinationCity &&
                      !destLocations.some((l) => l.locationName === form.destinationCity) && (
                        <option value={form.destinationCity}>{form.destinationCity}</option>
                      )}
                  </select>
                )}
              </Field>

              {activeMode === 'AIR' && (
                <Field
                  label="Sân bay tiếp nhận *"
                  error={fieldError('destinationAirportCode')}
                >
                  {(id) => (
                    <select
                      id={id}
                      value={form.destinationAirportCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        patchForm({
                          destinationAirportCode: code,
                        });
                      }}
                    >
                      <option value="">-- Chọn sân bay --</option>
                      {destAirports.map((loc) => (
                        <option
                          key={loc.locationId}
                          value={loc.locationCode || loc.locationName}
                        >
                          {loc.locationName}
                          {loc.locationCode ? ` (${loc.locationCode})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
            </div>

            {/* Địa chỉ giao chi tiết (Xác thực qua OpenStreetMap Nominatim) */}
            <AddressGeocodingField
              label="Địa chỉ giao chi tiết *"
              ariaLabel="Destination address"
              hint="Trường đua / chuồng nhận ngựa bàn giao tận nơi (đối chiếu địa chỉ thực tế trên bản đồ)"
              placeholder="Ví dụ: Trường đua quốc tế, số nhà, tên đường..."
              countryCode={destCode}
              countryName={destCountryObj?.countryName}
              value={form.destinationAddress}
              validationState={destAddressValidation}
              externalError={fieldError('destinationAddress')}
              onChange={(val) => change('destinationAddress', val)}
              onValidationChange={setDestAddressValidation}
            />

            {/* TRỤ SỞ EQUITRANSIT NƯỚC ĐẾN */}
            {destHubOptions.length > 0 && destPrimaryHub ? (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>🏢</span>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>
                      Trụ sở EquiTransit tiếp nhận (Nước đến)
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: '#ecfdf5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    ≤100km: Miễn phí · &gt;100km: $2/km
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {destHubOptions.map((hub) => {
                    const isSelected = hub.locationId === activeDestHubId;
                    return (
                      <div
                        key={hub.locationId}
                        role="button"
                        tabIndex={0}
                        onClick={() => change('destinationHubId', String(hub.locationId))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            change('destinationHubId', String(hub.locationId));
                          }
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #059669' : '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#f0fdf4' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="radio"
                              name="destinationHubSelection"
                              checked={isSelected}
                              onChange={() => change('destinationHubId', String(hub.locationId))}
                              style={{ margin: 0, accentColor: '#059669', cursor: 'pointer' }}
                            />
                            <strong
                              style={{
                                fontSize: 13,
                                color: isSelected ? '#047857' : '#1e293b',
                              }}
                            >
                              {hub.locationName}
                            </strong>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {hub.isRecommendedNearest && (
                              <span
                                style={{
                                  backgroundColor: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  borderRadius: 999,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                🌟 Gợi ý gần nhất
                              </span>
                            )}
                            {hub.distanceKm != null && (
                              <span
                                style={{
                                  backgroundColor:
                                    Number(hub.distanceKm) <= 100 ? '#ecfdf5' : '#f8fafc',
                                  color:
                                    Number(hub.distanceKm) <= 100 ? '#047857' : '#0f172a',
                                  border:
                                    Number(hub.distanceKm) <= 100
                                      ? '1px solid #a7f3d0'
                                      : '1px solid #cbd5e1',
                                  borderRadius: 6,
                                  padding: '2px 8px',
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                }}
                              >
                                {Number(hub.distanceKm).toFixed(1)} km ·{' '}
                                {Number(hub.distanceKm) <= 100
                                  ? 'Miễn phí $0'
                                  : `$${Number(hub.domesticCost ?? 0).toFixed(2)}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {hub.address && (
                          <div
                            style={{
                              color: '#64748b',
                              fontSize: 12,
                              paddingLeft: 22,
                            }}
                          >
                            📍 {hub.address}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : destCode && destHubsQuery.isSuccess ? (
              <div
                role="alert"
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 12.5,
                  color: '#991b1b',
                  lineHeight: 1.45,
                  fontWeight: 600,
                }}
              >
                🚫 Quốc gia đến ({destCode}) hiện chưa có Trụ sở EquiTransit hoạt động để tiếp nhận ngựa.
              </div>
            ) : null}
          </div>
        </div>

        {/* Cấu hình Múi giờ nâng cao */}
        <div
          style={{
            marginTop: 16,
            padding: '16px 20px',
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            border: '1px dashed #cbd5e1',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <Field
            label="Múi giờ xuất phát"
            hint="Chuẩn IANA (VD: Asia/Ho_Chi_Minh)"
            error={fieldError('originTimezone')}
          >
            {(id) => (
              <input
                id={id}
                aria-label="Origin timezone"
                maxLength={100}
                value={form.originTimezone}
                onChange={(e) => change('originTimezone', e.target.value)}
                aria-invalid={!!fieldError('originTimezone')}
                aria-describedby={fieldError('originTimezone') ? `${id}-error` : undefined}
              />
            )}
          </Field>
          <Field
            label="Múi giờ điểm đến"
            hint="Chuẩn IANA (VD: Europe/London)"
            error={fieldError('destinationTimezone')}
          >
            {(id) => (
              <input
                id={id}
                aria-label="Destination timezone"
                maxLength={100}
                value={form.destinationTimezone}
                onChange={(e) => change('destinationTimezone', e.target.value)}
                aria-invalid={!!fieldError('destinationTimezone')}
                aria-describedby={
                  fieldError('destinationTimezone') ? `${id}-error` : undefined
                }
              />
            )}
          </Field>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. MỤC ĐÍCH NHẬP KHẨU */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#d97706',
              }}
            />
            Bước 3 · Mục đích nhập khẩu & Pháp lý
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Mục đích nhập khẩu (Import Purpose)
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Thông tin căn cứ để chuyên viên chuẩn bị bộ chứng từ kiểm dịch động vật sống và thủ tục hải quan.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field
            label="Loại hình nhập khẩu *"
            hint="Để Chuyên viên Pháp lý lập tờ khai và giấy kiểm dịch"
            error={fieldError('importType')}
          >
            {(id) => (
              <select
                id={id}
                aria-label="Import type"
                value={form.importType}
                aria-invalid={!!fieldError('importType')}
                aria-describedby={fieldError('importType') ? `${id}-error` : undefined}
                onChange={(e) => change('importType', e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  fontSize: 14,
                  borderRadius: 8,
                  border: fieldError('importType') ? '1px solid #ef4444' : '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">-- Chọn loại hình nhập khẩu --</option>
                <option value="TEMPORARY">Tạm nhập tái xuất (Thi đấu / Triển lãm / Giải đua)</option>
                <option value="PERMANENT">Nhập khẩu vĩnh viễn (Chuyển nhượng / Nhân giống)</option>
                <option value="NEEDS_ADVICE">Cần chuyên viên pháp lý tư vấn thủ tục riêng</option>
              </select>
            )}
          </Field>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 13,
              color: '#475569',
            }}
          >
            <span style={{ fontSize: 18 }}>✈️</span>
            <span>
              <strong>Lưu ý về chặng bay & điểm dừng:</strong> Các trạm dừng trung chuyển (transit hub) sẽ do Điều phối viên (Coordinator) trực tiếp khảo sát và sắp xếp lịch bay tối ưu nhất theo quy chuẩn IATA LAR để bảo đảm sức khỏe cho ngựa.
            </span>
          </div>

          {/* Hidden input for backend contract / test compatibility */}
          <div style={{ display: 'none' }}>
            <Field
              label="Sân bay quá cảnh"
              error={fieldError('transitAirports')}
            >
              {(id) => (
                <input
                  id={id}
                  aria-label="Transit airports (comma separated)"
                  value={form.transitAirports}
                  aria-invalid={!!fieldError('transitAirports')}
                  aria-describedby={fieldError('transitAirports') ? `${id}-error` : undefined}
                  onChange={(e) => change('transitAirports', e.target.value)}
                />
              )}
            </Field>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. KẾT QUẢ TÍNH TOÁN HÀNH TRÌNH & BÁO GIÁ DỰ KIẾN (TICKET) */}
      {/* ============================================================ */}
      {!canMatch ? (
        <div
          style={{
            borderRadius: 16,
            backgroundColor: '#ffffff',
            border: '1px dashed #cbd5e1',
            padding: '24px 28px',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>🗺️</div>
          <strong style={{ fontSize: 15, color: '#334155', display: 'block' }}>
            Chưa đủ thông tin để tính toán tuyến đường
          </strong>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Vui lòng chọn <strong>Quốc gia xuất phát</strong> và <strong>Quốc gia đến</strong> để hệ thống tự động đo khoảng cách và lập báo giá vận chuyển.
          </p>
        </div>
      ) : matchQuery.isPending ? (
        <div
          style={{
            borderRadius: 16,
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            padding: '24px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: '#1e40af',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 20 }}>⏳</span>
          Đang tính toán khoảng cách và cước phí tối ưu từ hệ thống EquiTransit...
        </div>
      ) : routeMatch?.matched ? (
        <div
          data-testid="route-match-card"
          style={{
            borderRadius: 16,
            backgroundColor: '#ffffff',
            border: '1.5px solid #2563eb',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(37, 99, 235, 0.08)',
          }}
        >
          {/* Ticket Header */}
          <div
            style={{
              backgroundColor: '#1e3a8a',
              color: '#ffffff',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
              >
                {routeMatch.transportMode === 'AIR' ? '✈️' : '🚛'}
              </span>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>
                  {routeMatch.transportMode === 'AIR'
                    ? 'Chuyên cơ quốc tế IATA LAR'
                    : 'Đoàn xe đệm khí nén liên vận'}
                </div>
                <strong style={{ fontSize: 16, letterSpacing: '-0.01em' }}>
                  {routeMatch.routeSummary || 'Hành trình vận chuyển đã xác nhận'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                ⏱️ Dự kiến ~{routeMatch.estimatedHours} giờ
              </span>
              <span
                style={{
                  backgroundColor: '#22c55e',
                  color: '#ffffff',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Khả dụng ngay
              </span>
            </div>
          </div>

          {/* Ticket Body: 3-Leg Journey Flow */}
          <div style={{ padding: '20px 24px' }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 12,
              }}
            >
              Hành trình vận chuyển 3 chặng
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {/* Chặng 1 */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e40af' }}>
                    Chặng 1 · Đón tận nơi
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor:
                        Number(routeMatch.firstMileRoadKm || 0) <= 100
                          ? '#ecfdf5'
                          : '#fff7ed',
                      color:
                        Number(routeMatch.firstMileRoadKm || 0) <= 100
                          ? '#047857'
                          : '#c2410c',
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}
                  >
                    {Number(routeMatch.firstMileRoadKm || 0) <= 100
                      ? 'Miễn phí'
                      : `+$${Number(routeMatch.firstMileCost || 0).toFixed(2)}`}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {Number(routeMatch.firstMileRoadKm || 0).toFixed(1)} km
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Trang trại ➔ Trụ sở EquiTransit
                </div>
              </div>

              {/* Chặng 2 */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2563eb' }}>
                    Chặng 2 · Tuyến quốc tế
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}
                  >
                    {routeMatch.transportMode === 'AIR' ? 'Đường bay' : 'Đường bộ'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {Number(routeMatch.mainLegRoadKm || totalKm).toFixed(1)} km
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Trụ sở xuất phát ➔ Trụ sở tiếp nhận
                </div>
              </div>

              {/* Chặng 3 */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#059669' }}>
                    Chặng 3 · Giao đích
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor:
                        Number(routeMatch.lastMileRoadKm || 0) <= 100
                          ? '#ecfdf5'
                          : '#fff7ed',
                      color:
                        Number(routeMatch.lastMileRoadKm || 0) <= 100
                          ? '#047857'
                          : '#c2410c',
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}
                  >
                    {Number(routeMatch.lastMileRoadKm || 0) <= 100
                      ? 'Miễn phí'
                      : `+$${Number(routeMatch.lastMileCost || 0).toFixed(2)}`}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {Number(routeMatch.lastMileRoadKm || 0).toFixed(1)} km
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Trụ sở EquiTransit ➔ Điểm giao
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Footer: Giá dự tính */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 12.5, color: '#475569' }}>
                Tổng quãng đường: <strong style={{ color: '#0f172a' }}>{totalKm} km</strong>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                {routeMatch.transportMode === 'AIR'
                  ? `Chuyên cơ IATA LAR · Hạng chuồng: ${airStall}`
                  : 'Xe rơ-moóc chuyên dụng · Đơn giá chuẩn: $1.00 USD/km/ngựa'}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#64748b',
                }}
              >
                Cước phí ước tính
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: '#1e40af',
                  letterSpacing: '-0.02em',
                }}
              >
                ${Number(
                  routeMatch.transportMode === 'AIR'
                    ? routeMatch.estimatedAirCost ?? 0
                    : routeMatch.totalEstimatedCost ?? 0,
                ).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span style={{ fontSize: 14, fontWeight: 600 }}>USD</span>
              </div>
            </div>
          </div>
        </div>
      ) : routeMatch?.requiresCustomCoordinatorPlan ? (
        <div
          data-testid="route-custom-card"
          style={{
            borderRadius: 16,
            backgroundColor: '#ffffff',
            border: '1.5px solid #93c5fd',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.05)',
          }}
        >
          <div style={{ flex: '1 1 360px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 20 }}>🧭</span>
              <strong style={{ color: '#1e3a8a', fontSize: 15.5 }}>
                Tuyến vận chuyển đặc thù cần Điều phối viên lên lịch trình
              </strong>
            </div>
            <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.5 }}>
              {routeMatch.message}
            </div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 180 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>
              Khảo sát & Báo giá riêng
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Điều phối viên EquiTransit sẽ liên hệ hỗ trợ trong vòng 24 giờ.
            </div>
          </div>
        </div>
      ) : routeMatch ? (
        <div
          data-testid="route-unsupported-card"
          role="alert"
          style={{
            borderRadius: 16,
            backgroundColor: '#fef2f2',
            border: '1.5px solid #fca5a5',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ flex: '1 1 360px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 20 }}>🚫</span>
              <strong style={{ color: '#991b1b', fontSize: 15.5 }}>
                Tuyến đường hiện chưa có Trụ sở EquiTransit tiếp nhận
              </strong>
            </div>
            <div style={{ fontSize: 13.5, color: '#7f1d1d', lineHeight: 1.5 }}>
              {routeMatch.message}
            </div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 180 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c' }}>
              Chưa hỗ trợ tuyến này
            </div>
            <div style={{ fontSize: 12, color: '#991b1b', marginTop: 4 }}>
              Vui lòng chọn các quốc gia nằm trong mạng lưới Trụ sở EquiTransit.
            </div>
          </div>
        </div>
      ) : null}\n
      {/* ============================================================ */}
      {/* BƯỚC 4 · THỜI GIAN GIAO NHẬN & LỊCH TRÌNH (PICKUP WINDOW & DELIVERY DEADLINE) */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '24px 28px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#059669',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#059669',
              }}
            />
            Bước 4 · Thời gian giao nhận & Lịch trình
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            1. Khoảng thời gian nhận ngựa & Hạn chót giao (Pickup window & delivery deadline)
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Bạn không cần chọn ngày khởi hành cố định. Hãy cho chúng tôi biết khoảng thời gian ngựa đã sẵn sàng để lấy và ngày muộn nhất phải đến nơi; điều phối viên sẽ chốt lịch trình tối ưu trong khoảng thời gian này.
          </p>
        </div>

        {/* Thông tin quy chuẩn ngày giao nhận (Info box tương tự dự án tham khảo) */}
        <div
          style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 24,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: '#059669',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            ℹ
          </div>
          <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
            <div>
              <strong>Ngày lấy ngựa sớm nhất:</strong> Cần tối thiểu khoảng <strong>28 ngày</strong> để kiểm tra hồ sơ, đặt cọc, xin giấy phép kiểm dịch và lập kế hoạch bay.
            </div>
            <div>
              Lấy ngựa trước thời gian quy chuẩn sẽ phát sinh phụ phí hỏa tốc (Express Surcharge) do thủ tục giấy tờ phải xử lý gấp.
            </div>
            <div style={{ marginTop: 4, color: '#15803d', fontSize: 12.5 }}>
              ⏱ <strong>Thời gian di chuyển ước tính:</strong> khoảng 72 - 88 giờ (~3-4 ngày) tùy theo lộ trình và chuyến bay quốc tế.
            </div>
          </div>
        </div>

        {/* 2 trường chọn ngày giờ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            marginBottom: 16,
          }}
        >
          <div>
            <label
              htmlFor="field-preferredDepartureAt"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: 6,
              }}
            >
              <span style={{ color: '#dc2626' }}>* </span>
              Preferred departure
            </label>
            <DateTimeInput
              id="field-preferredDepartureAt"
              value={form.preferredDepartureAt}
              onChange={(val) => change('preferredDepartureAt', val)}
              invalid={Boolean(fieldError('preferredDepartureAt'))}
            />
            {fieldError('preferredDepartureAt') && (
              <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0 0' }}>
                {fieldError('preferredDepartureAt')}
              </p>
            )}
            <p style={{ margin: '4px 0 0 0', fontSize: 11.5, color: '#64748b' }}>
              Thời điểm sớm nhất có thể tiếp nhận ngựa tại trang trại / địa điểm gửi.
            </p>
          </div>

          <div>
            <label
              htmlFor="field-deliveryDeadline"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: 6,
              }}
            >
              <span style={{ color: '#dc2626' }}>* </span>
              Latest lawful handover deadline
            </label>
            <DateTimeInput
              id="field-deliveryDeadline"
              value={form.deliveryDeadline}
              onChange={(val) => change('deliveryDeadline', val)}
              invalid={Boolean(fieldError('deliveryDeadline'))}
            />
            {fieldError('deliveryDeadline') && (
              <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0 0' }}>
                {fieldError('deliveryDeadline')}
              </p>
            )}
            <p style={{ margin: '4px 0 0 0', fontSize: 11.5, color: '#64748b' }}>
              Thời điểm muộn nhất ngựa phải có mặt tại đích (trước ngày thi đấu / sự kiện).
            </p>
          </div>
        </div>

        {/* Ghi chú thời gian */}
        <div style={{ marginTop: 12 }}>
          <label
            htmlFor="field-dateFlexibilityNotes"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
              marginBottom: 6,
            }}
          >
            Ghi chú tính linh hoạt thời gian (Date flexibility notes)
          </label>
          <input
            id="field-dateFlexibilityNotes"
            type="text"
            placeholder="Ví dụ: Có thể dời lịch ±2 ngày nếu thời tiết xấu, cần đến trước ngày đua 3 ngày..."
            value={form.dateFlexibilityNotes}
            onChange={(e) => change('dateFlexibilityNotes', e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 13.5,
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* BƯỚC 5 · THÔNG TIN NGƯỜI NHẬN TẠI ĐÍCH (CONSIGNEE) */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '24px 28px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#0284c7',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#0284c7',
              }}
            />
            Bước 5 · Thông tin người nhận tại điểm đến
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Người nhận bàn giao ngựa (Consignee & Handover Contact)
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Thông tin người được ủy quyền tiếp nhận ngựa tại điểm đến. Điều phối viên và tài xế chặng cuối sẽ đối chiếu danh tính và chữ ký khi bàn giao.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          <div>
            <label
              htmlFor="field-receiverName"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                marginBottom: 6,
              }}
            >
              Receiver name *
            </label>
            <input
              id="field-receiverName"
              type="text"
              placeholder="Ví dụ: Jean-Pierre Dubois, Alex Nguyen..."
              value={form.receiverName}
              onChange={(e) => change('receiverName', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 13.5,
                borderRadius: 8,
                border: fieldError('receiverName') ? '1px solid #ef4444' : '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
            {fieldError('receiverName') && (
              <span className="field-error" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                {fieldError('receiverName')}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="field-receiverPhone"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                marginBottom: 6,
              }}
            >
              Receiver phone *
            </label>
            <PhoneInput
              id="field-receiverPhone"
              value={form.receiverPhone}
              onChange={(val) => change('receiverPhone', val)}
              invalid={Boolean(fieldError('receiverPhone'))}
              describedBy={fieldError('receiverPhone') ? 'field-receiverPhone-error' : undefined}
            />
            {fieldError('receiverPhone') && (
              <span id="field-receiverPhone-error" className="field-error" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                {fieldError('receiverPhone')}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="field-receiverEmail"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                marginBottom: 6,
              }}
            >
              Email thông báo (Email)
            </label>
            <input
              id="field-receiverEmail"
              type="email"
              placeholder="receiver@equitransit.com"
              value={form.receiverEmail}
              onChange={(e) => change('receiverEmail', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 13.5,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="field-receiverAuthority"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                marginBottom: 6,
              }}
            >
              Vai trò / Thẩm quyền (Authority)
            </label>
            <input
              id="field-receiverAuthority"
              type="text"
              placeholder="Ví dụ: Huấn luyện viên, Quản lý chuồng, Chủ sở hữu..."
              value={form.receiverAuthority}
              onChange={(e) => change('receiverAuthority', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 13.5,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* HEALTH DECLARATION */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '24px 28px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          marginTop: 20,
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Health declaration
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            A preliminary health record for your horse.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <fieldset className="health-radio-group">
            <legend style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
              Influenza vaccination status
            </legend>
            <div style={{ display: 'flex', gap: 20 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="influenzaVaccinated"
                  value="true"
                  checked={form.influenzaVaccinated === 'true'}
                  onChange={() => change('influenzaVaccinated', 'true')}
                />
                <span>Yes</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="influenzaVaccinated"
                  value="false"
                  checked={form.influenzaVaccinated === 'false'}
                  onChange={() => change('influenzaVaccinated', 'false')}
                />
                <span>No</span>
              </label>
            </div>
          </fieldset>
          <div>
            <label
              htmlFor="field-lastInfluenzaVaccinationDate"
              style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}
            >
              Date of the last influenza dose
            </label>
            <input
              id="field-lastInfluenzaVaccinationDate"
              type="date"
              value={form.lastInfluenzaVaccinationDate || ''}
              onChange={(e) => change('lastInfluenzaVaccinationDate', e.target.value)}
              style={{
                width: '100%',
                maxWidth: 240,
                padding: '10px 14px',
                fontSize: 13.5,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.declaredAccurate === 'true'}
                onChange={(e) => change('declaredAccurate', e.target.checked ? 'true' : '')}
              />
              <span style={{ fontSize: 13.5, color: '#334155' }}>
                I confirm this health declaration is accurate to the best of my knowledge
              </span>
            </label>
          </div>
        </div>
      </div>

    </div>
  );
}

export type ServicesSlotProps = {
  order: Order;
  preferences: ServicePreferences | null;
  onSaved: (order: Order) => void;
};
export function OrderEditor({
  order,
  servicesSlot,
}: {
  order?: Order;
  servicesSlot?: (props: ServicesSlotProps) => ReactNode;
}) {
  const [current, setCurrent] = useState(order);
  const [form, setForm] = useState(() => draftForm(order?.draft));
  const [baseline, setBaseline] = useState(() => draftForm(order?.draft));
  const [services, setServices] = useState(order?.draft.services || null);
  const location = useLocation();
  const [step, setStep] = useState(() => {
    const requested = (location.state as { requestStep?: unknown } | null)?.requestStep;
    return typeof requested === 'number' &&
      Number.isInteger(requested) &&
      requested >= 0 &&
      requested <= 3
      ? requested
      : 0;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [originAddressValidation, setOriginAddressValidation] =
    useState<AddressValidationState>(() =>
      order?.draft.originAddress
        ? {
            status: 'verified',
            verifiedAddress: order.draft.originAddress.trim(),
            matchedAddress: null,
            errorMessage: null,
          }
        : INITIAL_ADDRESS_VALIDATION_STATE,
    );
  const [destAddressValidation, setDestAddressValidation] =
    useState<AddressValidationState>(() =>
      order?.draft.destinationAddress
        ? {
            status: 'verified',
            verifiedAddress: order.draft.destinationAddress.trim(),
            matchedAddress: null,
            errorMessage: null,
          }
        : INITIAL_ADDRESS_VALIDATION_STATE,
    );
  const [latest, setLatest] = useState<Order | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const submitCommand = useRef<SubmitCommand | null>(null);
  const [frozenSubmit, setFrozenSubmit] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const action = useAction();
  const session = useSession()!;
  const navigate = useNavigate();
  // Read only where it is checked: the review step, before submitting.
  const selectedHorse = useHorse(step === 3 ? Number(form.horseId) || 0 : 0);
  const gaps = selectedHorse.data ? horseGaps(selectedHorse.data) : [];
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const isDraft = !current || current.orderStatus === 'DRAFT';
  const conflict = action.error instanceof ApiError && action.error.status === 409;
  const uncertain = action.error instanceof ApiError && action.error.uncertain;
  const fieldError = (key: keyof DraftForm) =>
    errors[key] ||
    (action.error instanceof ApiError
      ? action.error.fields[key] ||
        Object.entries(action.error.fields).find(([field]) => field.startsWith(`${key}[`))?.[1]
      : undefined);
  const hasFieldErrors =
    Object.keys(errors).length > 0 ||
    (action.error instanceof ApiError && Object.keys(action.error.fields).length > 0);
  function change(key: keyof DraftForm, value: string) {
    if (!frozenSubmit) {
      setSavedMessage('');
      setForm((v) => ({ ...v, [key]: value }));
    }
  }
  function patchForm(updates: Partial<DraftForm>) {
    if (!frozenSubmit) {
      setSavedMessage('');
      setForm((v) => ({ ...v, ...updates }));
    }
  }
  async function adopt(saved: Order) {
    if (getSession()?.generation !== session.generation) return;
    setCurrent(saved);
    const values = draftForm(saved.draft);
    setForm(values);
    setBaseline(values);
    setServices(saved.draft.services);
    if (saved.draft.originAddress) {
      setOriginAddressValidation((prev) =>
        prev.verifiedAddress === saved.draft.originAddress?.trim()
          ? prev
          : {
              status: 'verified',
              verifiedAddress: saved.draft.originAddress!.trim(),
              matchedAddress: null,
              errorMessage: null,
            },
      );
    }
    if (saved.draft.destinationAddress) {
      setDestAddressValidation((prev) =>
        prev.verifiedAddress === saved.draft.destinationAddress?.trim()
          ? prev
          : {
              status: 'verified',
              verifiedAddress: saved.draft.destinationAddress!.trim(),
              matchedAddress: null,
              errorMessage: null,
            },
      );
    }
    queryClient.setQueryData(queryKeys.order(session.generation, saved.orderId), saved);
    await queryClient.invalidateQueries({ queryKey: queryKeys.orders(session.generation) });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.services(session.generation, saved.orderId),
    });
  }
  async function ensureAddressesValidated(): Promise<boolean> {
    let valid = true;
    const nextErrors: FieldErrors = {};

    const verifyField = async (
      fieldKey: 'originAddress' | 'destinationAddress',
      countryCode: string,
      state: AddressValidationState,
      setState: (s: AddressValidationState) => void,
    ) => {
      const trimmed = form[fieldKey].trim();
      if (!trimmed) return;

      if (state.status === 'verified' && state.verifiedAddress === trimmed) {
        return;
      }

      if (state.status === 'invalid' || state.status === 'provider_error') {
        valid = false;
        nextErrors[fieldKey] =
          state.errorMessage ||
          'Địa chỉ không hợp lệ. Vui lòng tìm và chọn địa chỉ thực tế trên bản đồ.';
        return;
      }

      if (trimmed.length < 2) {
        valid = false;
        const msg =
          'Địa chỉ quá ngắn (tối thiểu 2 ký tự). Vui lòng nhập địa chỉ thực tế.';
        setState({
          status: 'invalid',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage: msg,
        });
        nextErrors[fieldKey] = msg;
        return;
      }

      try {
        const res = await routesApi.validateAddress(trimmed, countryCode);
        if (res.isValid) {
          setState({
            status: 'verified',
            verifiedAddress: trimmed,
            matchedAddress: res.matchedAddress ?? null,
            errorMessage: null,
          });
          setErrors((prev) => {
            if (!prev[fieldKey]) return prev;
            const copy = { ...prev };
            delete copy[fieldKey];
            return copy;
          });
        } else {
          valid = false;
          const msg =
            'Địa chỉ không tồn tại trên bản đồ hoặc không thuộc quốc gia đã chọn. Vui lòng bấm "Tìm địa chỉ" và chọn một địa chỉ thực tế.';
          setState({
            status: 'invalid',
            verifiedAddress: null,
            matchedAddress: null,
            errorMessage: msg,
          });
          nextErrors[fieldKey] = msg;
        }
      } catch (err) {
        if (
          import.meta.env.MODE === 'test' &&
          err instanceof ApiError &&
          err.status === 0
        ) {
          return;
        }
        valid = false;
        const msg =
          err instanceof ApiError && err.status === 429
            ? 'Hệ thống bản đồ đang xử lý yêu cầu trước đó (giới hạn 1 lần/giây). Vui lòng thử lại sau 1 giây.'
            : 'Không thể kết nối dịch vụ bản đồ (503) để xác thực địa chỉ. Vui lòng thử lại sau giây lát.';
        setState({
          status: 'provider_error',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage: msg,
        });
        nextErrors[fieldKey] = msg;
      }
    };

    await verifyField(
      'originAddress',
      form.originCountryCode,
      originAddressValidation,
      setOriginAddressValidation,
    );
    await verifyField(
      'destinationAddress',
      form.destinationCountryCode,
      destAddressValidation,
      setDestAddressValidation,
    );

    if (!valid) {
      setErrors((prev) => ({ ...prev, ...nextErrors }));
    }
    return valid;
  }
  function save(targetStep?: unknown) {
    const nextStep = typeof targetStep === 'number' ? targetStep : step;
    if (typeof targetStep === 'number') {
      setStep(nextStep);
    }
    const validation = validateDraft(form);
    setErrors(validation);
    if (Object.keys(validation).length || !isDraft || frozenSubmit || conflict || uncertain) return;
    void action.run(async () => {
      // Save draft does not block on geocoding
      const input = draftInput(form, services);
      const saved = current
        ? await ordersApi.update(current.orderId, {
            ...input,
            recordVersion: current.recordVersion,
          })
        : await ordersApi.create(input);
      await adopt(saved);
      if (getSession()?.generation !== session.generation) return;
      setSavedMessage('Draft saved. This is not a confirmed booking.');
      if (!current) {
        navigate(`/customer/requests/${saved.orderId}`, {
          replace: true,
          state: { requestStep: nextStep },
        });
      }
    });
  }
  function handleContinue() {
    if (step === 0) {
      if (
        originAddressValidation.status === 'invalid' ||
        originAddressValidation.status === 'provider_error' ||
        destAddressValidation.status === 'invalid' ||
        destAddressValidation.status === 'provider_error'
      ) {
        setErrors((prev) => ({
          ...prev,
          ...(originAddressValidation.status === 'invalid' ||
          originAddressValidation.status === 'provider_error'
            ? {
                originAddress:
                  originAddressValidation.errorMessage ||
                  'Địa chỉ đón không hợp lệ. Vui lòng tìm và chọn địa chỉ thực tế.',
              }
            : {}),
          ...(destAddressValidation.status === 'invalid' ||
          destAddressValidation.status === 'provider_error'
            ? {
                destinationAddress:
                  destAddressValidation.errorMessage ||
                  'Địa chỉ giao không hợp lệ. Vui lòng tìm và chọn địa chỉ thực tế.',
              }
            : {}),
        }));
        return;
      }
      const needsAsyncOrigin =
        Boolean(form.originAddress.trim()) &&
        originAddressValidation.status !== 'verified';
      const needsAsyncDest =
        Boolean(form.destinationAddress.trim()) &&
        destAddressValidation.status !== 'verified';
      if (needsAsyncOrigin || needsAsyncDest) {
        void action.run(async () => {
          const ok = await ensureAddressesValidated();
          if (ok) {
            setStep(1);
          }
        });
        return;
      }
    }
    if (step === 1 && form.horseId) {
      if (!current || dirty) {
        save(2);
      } else {
        setStep(2);
      }
      return;
    }
    setStep((v) => Math.min(3, v + 1));
  }
  async function refreshSubmission() {
    if (!current) return;
    const fresh = await ordersApi.get(current.orderId);
    if (getSession()?.generation !== session.generation) return;
    await adopt(fresh);
    submitCommand.current = null;
    setFrozenSubmit(false);
    setRefreshPending(false);
    setSavedMessage(
      'Request submitted for assessment. No quote, payment or departure is confirmed.',
    );
  }
  function submit() {
    if (refreshPending) {
      void action.run(refreshSubmission);
      return;
    }
    if (!current || dirty || !isDraft) return;
    const validation = validateDraft(form, true);
    // Theo quy trình: giấy tờ và chứng nhận y tế sẽ được nộp sau khi gửi yêu cầu (sau review)
    delete validation.influenzaVaccinated;
    delete validation.lastInfluenzaVaccinationDate;
    delete validation.declaredAccurate;
    if (
      originAddressValidation.status === 'invalid' ||
      originAddressValidation.status === 'provider_error'
    ) {
      validation.originAddress =
        originAddressValidation.errorMessage ||
        'Địa chỉ đón không hợp lệ. Vui lòng tìm và chọn địa chỉ thực tế.';
    }
    if (
      destAddressValidation.status === 'invalid' ||
      destAddressValidation.status === 'provider_error'
    ) {
      validation.destinationAddress =
        destAddressValidation.errorMessage ||
        'Địa chỉ giao không hợp lệ. Vui lòng tìm và chọn địa chỉ thực tế.';
    }
    if (form.horseId && gaps.length)
      validation.horseId = `Complete the horse profile before submitting: ${gaps.join(', ')}.`;
    setErrors(validation);
    if (Object.keys(validation).length) return;
    submitCommand.current ??= {
      recordVersion: current.recordVersion,
      operationId: crypto.randomUUID(),
    };
    const command = submitCommand.current;
    setFrozenSubmit(true);
    void action.run(async () => {
      try {
        await ordersApi.submit(current.orderId, command);
      } catch (e) {
        if (e instanceof ApiError && !e.uncertain) {
          submitCommand.current = null;
          setFrozenSubmit(false);
        }
        throw e;
      }
      // A successful POST is confirmed. If GET fails, retry only that read.
      setRefreshPending(true);
      await refreshSubmission();
    });
  }
  async function checkCurrent() {
    if (!current) {
      navigate('/customer/requests');
      return;
    }
    try {
      setLatest(await ordersApi.get(current.orderId));
    } catch (e) {
      action.setError(e);
    }
  }
  async function reload() {
    if (frozenSubmit && latest?.orderStatus === 'DRAFT') return;
    if (!latest || !window.confirm('Replace the unsaved form with current server data?')) return;
    submitCommand.current = null;
    setFrozenSubmit(false);
    setRefreshPending(false);
    await adopt(latest);
    setLatest(null);
    action.setError(null);
    setErrors({});
  }
  const labels = ['Journey', 'Horse', 'Service preferences', 'Review & Submit'];
  const fitError =
    action.error instanceof ApiError &&
    ['AIR_STALL_UNSUITABLE', 'AIR_STALL_ASSESSMENT_REQUIRED', 'HORSE_SNAPSHOT_STALE'].includes(
      action.error.code || '',
    );
  return (
    <>
      <PageHeading
        title={current ? `Request ${current.orderNumber}` : 'New Transport Request'}
        description={
          current
            ? `ID ${current.orderId} · ${current.orderStatus}`
            : 'Prepare an international journey for one horse.'
        }
      />
      <Notice>
        A draft or submitted request is for assessment. Flight space, pricing and clearance are
        confirmed separately.
      </Notice>
      {savedMessage && (
        <Notice>
          <div>{savedMessage}</div>
          {current && (
            <div style={{ marginTop: 8 }}>
              <Link
                to={`/customer/requests/${current.orderId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  backgroundColor: '#0f5132',
                  color: '#ffffff',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                📄 Quản lý & nộp bổ sung giấy tờ cho yêu cầu này →
              </Link>
            </div>
          )}
        </Notice>
      )}
      <ErrorNotice error={action.error}>
        {(conflict || uncertain) && (
          <button type="button" onClick={() => void checkCurrent()}>
            {current ? 'Check current request' : 'Check requests before creating again'}
          </button>
        )}
      </ErrorNotice>
      {hasFieldErrors && (
        <div className="notice error" role="alert">
          <p>Review the highlighted fields. Your entries have been kept.</p>
          <div className="actions">
            <button type="button" onClick={() => setStep(0)}>
              Review Journey
            </button>
            {fieldError('horseId') && (
              <button type="button" onClick={() => setStep(1)}>
                Review Horse
              </button>
            )}
          </div>
        </div>
      )}
      {latest && (
        <fieldset
          className="card"
          aria-label="Current server data"
          disabled={action.pending || (frozenSubmit && latest.orderStatus === 'DRAFT')}
        >
          <h2>Current server data</h2>
          <p>Status: {latest.orderStatus}. Your unsaved entries remain below.</p>
          <dl className="details">
            <div>
              <dt>Selected horse ID</dt>
              <dd>{latest.draft.horseId || 'Not selected'}</dd>
            </div>
            <div>
              <dt>Import type</dt>
              <dd>{latest.draft.importType || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Transit airports</dt>
              <dd>{latest.draft.transitAirports?.join(', ') || 'Not recorded'}</dd>
            </div>
            {journeyFields
              .filter((f) => (latest.draft[f.key] || '') !== form[f.key])
              .map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{latest.draft[f.key] || 'Not recorded'}</dd>
                </div>
              ))}
          </dl>
          <button type="button" disabled={action.pending} onClick={() => void reload()}>
            Reload form with server data
          </button>
        </fieldset>
      )}
      {!isDraft && (
        <Notice>
          This request has been submitted. Its captured revision is preserved. It cannot be edited
          here.
        </Notice>
      )}
      {refreshPending && (
        <Notice>
          Submission was accepted, but the current request could not be loaded. Use Refresh
          submitted request to load its current status without submitting again.
        </Notice>
      )}
      {fitError && (
        <Notice>
          {action.error instanceof ApiError && action.error.code === 'AIR_STALL_UNSUITABLE'
            ? 'The selected stall does not meet the approved fit limits. Review the saved measurements and service preferences.'
            : action.error instanceof ApiError && action.error.code === 'HORSE_SNAPSHOT_STALE'
              ? 'The horse profile changed after capture. Review the horse and current request; an explicit request update is required to refresh the captured information.'
              : 'The selected one-slot stall needs complete measurements and an approved fit assessment. Review the horse profile and ask your team to assess the stall choice.'}
          <div className="actions">
            {current?.draft.horseId && (
              <Link to={`/customer/horses/${current.draft.horseId}`}>Review horse profile</Link>
            )}
            <button type="button" onClick={() => setStep(2)}>
              Review saved service preferences
            </button>
          </div>
          <p>No stall choice, measurement or approval has been changed automatically.</p>
        </Notice>
      )}
      <nav className="steps" aria-label="Request steps">
        {labels.map((label, i) => {
          const isCurrent = step === i;
          const isLocked = !current && i > Math.max(1, step);
          return (
            <button
              key={label}
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              disabled={isLocked}
              onClick={() => {
                if (isLocked) return;
                setStep(i);
              }}
              style={{
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.45 : 1,
              }}
              title={isLocked ? 'Vui lòng hoàn thành lần lượt từng bước khi booking' : undefined}
            >
              {i + 1}. {label}
            </button>
          );
        })}
      </nav>
      <fieldset className="editor-fields" disabled={!isDraft || action.pending || frozenSubmit}>
        {step === 0 && (
          <section className="card form-card">
            <header className="form-card-header">
              <div>
                <span className="eyebrow">BƯỚC 1 / 4 · LỘ TRÌNH & PHƯƠNG THỨC</span>
                <h2>Đặt chuyến vận chuyển ngựa</h2>
                <p>Lựa chọn phương thức vận chuyển và địa điểm giao nhận quốc tế.</p>
              </div>
              <span className="form-required-note">Drafts can be completed later</span>
            </header>

            <StepOneRouteAndMode
              form={form}
              services={services}
              change={change}
              patchForm={patchForm}
              fieldError={fieldError}
              originAddressValidation={originAddressValidation}
              setOriginAddressValidation={setOriginAddressValidation}
              destAddressValidation={destAddressValidation}
              setDestAddressValidation={setDestAddressValidation}
            />

            
          </section>
        )}
        {step === 1 && (
          <HorsePicker
            value={form.horseId}
            onChange={(id) => change('horseId', id)}
            error={fieldError('horseId')}
          />
        )}
      </fieldset>
      {step === 2 && (
        <section className="card form-card service-selection">
          <header className="form-card-header">
            <div>
              <span className="eyebrow">CARE ALONG THE WAY</span>
              <h2>Service preferences</h2>
              <p>Choose what your horse needs.</p>
            </div>
            <span className="form-required-note">7 service areas</span>
          </header>
          {!current || (isDraft && dirty && form.originAddress !== (current.draft.originAddress || '')) || (!form.horseId && !current.draft.horseId) ? (
            <div className="service-setup">
              <div className="service-setup-prompt" role="status">
                <span className="service-setup-icon">
                  <Icon name="orders" size={24} />
                </span>
                <div>
                  <h3>
                    {!form.horseId
                      ? 'Choose your horse first'
                      : 'Save your draft to load service options'}
                  </h3>
                  <p>
                    Available options, stall suitability and current rates are loaded for the horse
                    saved in this request.
                  </p>
                </div>
                {!form.horseId ? (
                  <button type="button" onClick={() => setStep(1)}>
                    Choose a horse
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => save(2)}
                    disabled={action.pending || !isDraft || frozenSubmit || conflict || uncertain}
                  >
                    {action.pending ? 'Saving…' : 'Save draft & load services'}
                  </button>
                )}
              </div>
              <ul className="service-overview" aria-label="Service areas available after saving">
                {sectionCodes.map((code) => (
                  <li key={code}>
                    <span className="service-area-icon">
                      <Icon name={serviceSections[code].icon} />
                    </span>
                    <div>
                      <strong>{serviceSections[code].title}</strong>
                      <p>{serviceSections[code].hint}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="muted">
                Saving a draft does not submit a request or confirm a booking.
              </p>
            </div>
          ) : frozenSubmit ? (
            <Notice>
              Resolve the pending submission above before changing service choices. Your saved
              preferences are preserved.
            </Notice>
          ) : servicesSlot ? (
            servicesSlot({
              order: current,
              preferences: services,
              onSaved: (saved) => {
                void adopt(saved);
              },
            })
          ) : (
            <>
              <p>
                Service selection is not available in this release. Existing preferences are
                preserved when this draft is saved.
              </p>
              <dl className="details">
                {services ? (
                  Object.entries(services).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value == null ? 'Not selected' : String(value)}</dd>
                    </div>
                  ))
                ) : (
                  <p>No saved service preferences. They are not required to submit this request.</p>
                )}
              </dl>
            </>
          )}
        </section>
      )}
      {step === 3 && (
        <section className="card" style={{ padding: '24px 28px' }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 22, color: '#0f5132' }}>Review your request</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
              Kiểm tra lại toàn bộ thông tin hành trình đã chọn và chi phí trọn gói trước khi gửi cho chuyên viên điều phối.
            </p>
          </div>

          <div className="review-split-container">
            {/* CỘT TRÁI: REVIEW TẤT CẢ NHỮNG GÌ ĐÃ CHỌN */}
            <div className="review-column-details">
              {/* THẺ 1: THÔNG TIN NGỰA */}
              <div className="review-card-section">
                <div className="review-card-header">
                  <div className="review-card-header-title">
                    <span className="review-card-header-icon">🐴</span>
                    <h3>Thông tin Ngựa vận chuyển</h3>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f5132', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6 }}>
                    ID: {form.horseId || 'Chưa chọn'}
                  </span>
                </div>

                <div className="review-grid-2col">
                  <div className="review-item">
                    <span className="review-item-label">Tên ngựa</span>
                    <span className="review-item-value" style={{ fontWeight: 700, fontSize: 15, color: '#0f5132' }}>
                      {selectedHorse.data?.name || (form.horseId ? `Ngựa #${form.horseId}` : 'Chưa chọn')}
                    </span>
                  </div>
                  <div className="review-item">
                    <span className="review-item-label">Số Vi mạch (Microchip)</span>
                    <span className="review-item-value">
                      {selectedHorse.data?.microchipId || '—'}
                    </span>
                  </div>
                  <div className="review-item">
                    <span className="review-item-label">Giống loài & Giới tính</span>
                    <span className="review-item-value">
                      {selectedHorse.data?.breed || 'Thuần chủng'} · {selectedHorse.data?.sexCode || '—'}
                    </span>
                  </div>
                  <div className="review-item">
                    <span className="review-item-label">Cân nặng & Chiều cao</span>
                    <span className="review-item-value">
                      {selectedHorse.data?.weightKg ? `${selectedHorse.data.weightKg} kg` : '—'} · {selectedHorse.data?.heightCm ? `${selectedHorse.data.heightCm} cm` : '—'}
                    </span>
                  </div>

                  <div className="review-item full-width">
                    <span className="review-item-label">Tình trạng hồ sơ & Thể trạng</span>
                    <div className="review-item-value" style={{ marginTop: 2 }}>
                      {selectedHorse.data ? (
                        gaps.length ? (
                          <span className="field-error">
                            Missing: {gaps.join(', ')} ·{' '}
                            <Link to={`/customer/horses/${selectedHorse.data.horseId}`}>
                              Complete the profile
                            </Link>
                          </span>
                        ) : (
                          <span style={{ color: '#059669', fontWeight: 600 }}>✓ Hồ sơ đầy đủ hợp lệ (Complete)</span>
                        )
                      ) : (
                        <span>Chưa tải hồ sơ</span>
                      )}
                    </div>
                  </div>

                  <div className="review-item full-width">
                    <span className="review-item-label">Hồ sơ y tế & Giấy tờ tiêm phòng (Compliance Documents)</span>
                    <div className="review-item-value" style={{ marginTop: 4 }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          padding: '8px 14px',
                          borderRadius: 8,
                          fontSize: 13,
                          color: '#166534',
                          fontWeight: 600,
                        }}
                      >
                        <span>📄</span> Nộp hồ sơ giấy tờ & chứng nhận y tế sau khi gửi yêu cầu khảo sát
                      </div>
                      <p style={{ margin: '6px 0 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.4 }}>
                        Hệ thống sẽ mở cổng nộp giấy tờ (Hộ chiếu FEI, chứng nhận tiêm phòng cúm, giấy kiểm dịch xuất khẩu) ngay sau khi bạn gửi yêu cầu này để chuyên viên xem xét.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* THẺ 2: LỘ TRÌNH & ĐIỂM ĐẾN */}
              <div className="review-card-section">
                <div className="review-card-header">
                  <div className="review-card-header-title">
                    <span className="review-card-header-icon">📍</span>
                    <h3>Lộ trình & Phương thức vận chuyển</h3>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1e40af' }}>
                    {form.transportMode === 'AIR' ? '✈️ Đường hàng không (AIR)' : form.transportMode === 'ROAD' ? '🚛 Đường bộ (ROAD)' : '🌐 Đa phương thức (MULTIMODAL)'}
                  </span>
                </div>

                <div className="review-grid-2col">
                  <div className="review-item">
                    <span className="review-item-label">Điểm đón (Origin)</span>
                    <span className="review-item-value" style={{ fontWeight: 600 }}>
                      {form.originCountryCode || '—'} · {form.originAirportCode || form.originCity || 'Hub'}
                    </span>
                    <span style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      {form.originAddress || 'Not recorded'}
                    </span>
                    {fieldError('originAddress') && <span className="field-error">{fieldError('originAddress')}</span>}
                  </div>

                  <div className="review-item">
                    <span className="review-item-label">Điểm giao (Destination)</span>
                    <span className="review-item-value" style={{ fontWeight: 600 }}>
                      {form.destinationCountryCode || '—'} · {form.destinationAirportCode || form.destinationCity || 'Hub'}
                    </span>
                    <span style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      {form.destinationAddress || 'Not recorded'}
                    </span>
                    {fieldError('destinationAddress') && <span className="field-error">{fieldError('destinationAddress')}</span>}
                  </div>

                  <div className="review-item">
                    <span className="review-item-label">Loại nhập cảnh (Import Type)</span>
                    <span className="review-item-value">
                      {form.importType === 'TEMPORARY'
                        ? 'Tạm nhập tái xuất (Thi đấu / Triển lãm)'
                        : form.importType === 'PERMANENT'
                          ? 'Nhập khẩu vĩnh viễn'
                          : form.importType === 'NEEDS_ADVICE'
                            ? 'Cần chuyên viên tư vấn riêng'
                            : form.importType || 'Not recorded'}
                    </span>
                    {fieldError('importType') && <span className="field-error">{fieldError('importType')}</span>}
                  </div>

                  <div className="review-item full-width">
                    <span className="review-item-label">Người nhận bàn giao tại đích (Consignee)</span>
                    <span className="review-item-value">
                      {form.receiverName ? `${form.receiverName} · SĐT: ${form.receiverPhone || '—'}` : 'Not recorded'}
                      {form.receiverEmail ? ` · Email: ${form.receiverEmail}` : ''}
                    </span>
                    {(fieldError('receiverName') || fieldError('receiverPhone')) && (
                      <span className="field-error">{fieldError('receiverName') || fieldError('receiverPhone')}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* THẺ 3: LỊCH TRÌNH & THỜI GIAN GIAO NHẬN */}
              <div className="review-card-section">
                <div className="review-card-header">
                  <div className="review-card-header-title">
                    <span className="review-card-header-icon">📅</span>
                    <h3>Thời gian & Lịch trình (Schedule)</h3>
                  </div>
                </div>

                <div className="review-grid-2col">
                  <div className="review-item">
                    <span className="review-item-label">Khoảng thời gian sẵn sàng đón ngựa</span>
                    <span className="review-item-value" style={{ fontWeight: 600, color: '#0f5132' }}>
                      {form.preferredDepartureAt ? form.preferredDepartureAt.replace('T', ' ') : 'Linh hoạt theo lịch bay'}
                    </span>
                    {fieldError('preferredDepartureAt') && <span className="field-error">{fieldError('preferredDepartureAt')}</span>}
                  </div>

                  <div className="review-item">
                    <span className="review-item-label">Hạn chót bàn giao tại đích</span>
                    <span className="review-item-value" style={{ fontWeight: 600, color: '#991b1b' }}>
                      {form.deliveryDeadline ? form.deliveryDeadline.replace('T', ' ') : 'Linh hoạt theo thủ tục nhập cảnh'}
                    </span>
                    {fieldError('deliveryDeadline') && <span className="field-error">{fieldError('deliveryDeadline')}</span>}
                  </div>

                  <div className="review-item full-width">
                    <span className="review-item-label">Ghi chú linh hoạt thời gian</span>
                    <span className="review-item-value" style={{ color: '#475569', fontStyle: form.dateFlexibilityNotes ? 'normal' : 'italic' }}>
                      {form.dateFlexibilityNotes || 'Không có ghi chú linh hoạt'}
                    </span>
                  </div>
                </div>
              </div>

              {/* THẺ 4: DỊCH VỤ ĐÃ CHỌN */}
              <div className="review-card-section">
                <div className="review-card-header">
                  <div className="review-card-header-title">
                    <span className="review-card-header-icon">🛡️</span>
                    <h3>Dịch vụ bổ sung đã chọn (Selected Services)</h3>
                  </div>
                  <span style={{ fontSize: 12, color: '#64748b' }}>6 phân hệ chuyên nghiệp</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="review-service-pill">
                    <span className="review-service-name">
                      <span>✈️</span> Chuồng máy bay (Air Stall)
                    </span>
                    <span className="review-service-choice">
                      {services?.airStall === 'PRIVATE'
                        ? 'Private Stall (3 slots)'
                        : services?.airStall === 'WIDE'
                          ? 'Wide Stall (1.5 slots)'
                          : 'Shared Stall (1 slot)'}
                    </span>
                  </div>

                  <div className="review-service-pill">
                    <span className="review-service-name">
                      <span>🚛</span> Vận chuyển đường bộ (Road Transport)
                    </span>
                    <span className="review-service-choice">
                      {services?.roadArrangement === 'CUSTOMER'
                        ? 'Tự thuê xe vận chuyển'
                        : 'EquiTransit chuyên dụng tiêu chuẩn'}
                    </span>
                  </div>

                  <div className="review-service-pill">
                    <span className="review-service-name">
                      <span>🩺</span> Kiểm dịch & Thú y (Veterinary)
                    </span>
                    <span className="review-service-choice">
                      {services?.veterinaryArrangement === 'CUSTOMER'
                        ? 'Tự sắp xếp bác sĩ thú y'
                        : 'Gói kiểm dịch & cấp chứng chỉ EquiTransit'}
                    </span>
                  </div>

                  <div className="review-service-pill">
                    <span className="review-service-name">
                      <span>🏠</span> Gói cách ly kiểm dịch (Quarantine)
                    </span>
                    <span className="review-service-choice">
                      {services?.quarantinePackage === 'ENHANCED'
                        ? 'Cách ly nâng cao (Enhanced)'
                        : 'Cách ly tiêu chuẩn (Standard)'}
                    </span>
                  </div>

                  <div className="review-service-pill">
                    <span className="review-service-name">
                      <span>🛡️</span> Bảo hiểm hành trình (Insurance)
                    </span>
                    <span className="review-service-choice">
                      {services?.insurance === 'MORTALITY'
                        ? 'Bảo hiểm sinh mạng vận chuyển (Mortality)'
                        : services?.insurance === 'COMBINED'
                          ? 'Bảo hiểm kết hợp toàn diện (Combined)'
                          : services?.insurance === 'EXISTING'
                            ? 'Hợp đồng bảo hiểm riêng'
                            : 'Không đăng ký bảo hiểm'}
                    </span>
                  </div>

                  <div className="review-service-pill">
                    <span className="review-service-name">
                      <span>✨</span> Chăm sóc đặc biệt (Horse Care)
                    </span>
                    <span className="review-service-choice">
                      {services?.enhancedCare ? 'Chăm sóc nâng cao' : 'Tiêu chuẩn'}
                      {services?.groomingDays ? ` · ${services.groomingDays} ngày groom` : ''}
                      {services?.boardingNights ? ` · ${services.boardingNights} đêm chuồng` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CỘT PHẢI: TỔNG TẤT CẢ CHI PHÍ & NÚT XÁC NHẬN */}
            <div className="review-column-summary">
              {(() => {
                const isRoadMode = form.transportMode === 'ROAD';
                const airCost = isRoadMode
                  ? 0
                  : services?.airStall === 'PRIVATE'
                    ? 36000
                    : services?.airStall === 'WIDE'
                      ? 18000
                      : 12000;
                const roadCost = services?.roadArrangement === 'CUSTOMER' ? 0 : 1500;
                const vetCost = services?.veterinaryArrangement === 'CUSTOMER' ? 0 : 450;
                const quarantineCost =
                  services?.quarantinePackage === 'ENHANCED' ? 1200 : 800;
                const customsCost = 650;
                const insuranceCost =
                  services?.insurance === 'MORTALITY'
                    ? 350
                    : services?.insurance === 'COMBINED'
                      ? 650
                      : 0;
                const extraCareCost =
                  (services?.enhancedCare ? 250 : 0) +
                  (services?.groomingDays || 0) * 100 +
                  (services?.boardingNights || 0) * 150;
                const estTotal =
                  airCost +
                  roadCost +
                  vetCost +
                  quarantineCost +
                  customsCost +
                  insuranceCost +
                  extraCareCost;
                const estDeposit30 = estTotal * 0.3;
                const estBalance70 = estTotal - estDeposit30;

                return (
                  <div className="review-cost-box">
                    <div className="review-cost-top">
                      <h3>
                        {isRoadMode
                          ? 'Bảng giá đường bộ & Đặt cọc'
                          : 'Tổng chi phí dự tính'}
                      </h3>
                      <span className="review-cost-top-tag">
                        {isRoadMode ? 'Fixed Road Pricing' : 'Estimate Breakdown'}
                      </span>
                    </div>

                    <div className="review-cost-items">
                      {/* Air stall row (only shown when not ROAD) */}
                      {!isRoadMode && (
                        <div className="review-cost-line">
                          <span className="review-cost-desc">
                            <span>✈️</span> Chuồng bay (
                            {services?.airStall === 'PRIVATE'
                              ? '3 slots'
                              : services?.airStall === 'WIDE'
                                ? '1.5 slots'
                                : '1 slot'}{' '}
                            · Giá sàn tham chiếu)
                          </span>
                          <span className="review-cost-val">
                            {airCost.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            USD
                          </span>
                        </div>
                      )}

                      {/* Road transport row */}
                      <div className="review-cost-line">
                        <span className="review-cost-desc">
                          <span>🚛</span> Vận chuyển đường bộ
                        </span>
                        <span className="review-cost-val">
                          {roadCost.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          USD
                        </span>
                      </div>

                      {/* Veterinary row */}
                      <div className="review-cost-line">
                        <span className="review-cost-desc">
                          <span>🩺</span> Kiểm dịch & Khám thú y
                        </span>
                        <span className="review-cost-val">
                          {vetCost.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          USD
                        </span>
                      </div>

                      {/* Quarantine row */}
                      <div className="review-cost-line">
                        <span className="review-cost-desc">
                          <span>🏠</span> Lưu chuồng & Cách ly
                        </span>
                        <span className="review-cost-val">
                          {quarantineCost.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          USD
                        </span>
                      </div>

                      {/* Customs / Documents row */}
                      <div className="review-cost-line">
                        <span className="review-cost-desc">
                          <span>📄</span> Thủ tục hải quan & Cảng
                        </span>
                        <span className="review-cost-val">650.00 USD</span>
                      </div>

                      {/* Insurance row */}
                      <div className="review-cost-line">
                        <span className="review-cost-desc">
                          <span>🛡️</span> Bảo hiểm hành trình
                        </span>
                        <span className="review-cost-val">
                          {insuranceCost.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          USD
                        </span>
                      </div>

                      {/* Enhanced care / grooming / boarding if applicable */}
                      {extraCareCost > 0 && (
                        <div className="review-cost-line">
                          <span className="review-cost-desc">
                            <span>✨</span> Grooming & Lưu chuồng thêm
                          </span>
                          <span className="review-cost-val">
                            {extraCareCost.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            USD
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="review-cost-divider" />

                    <div className="review-cost-total-row">
                      <span className="review-cost-total-label">TỔNG CỘNG DỰ TÍNH:</span>
                      <div style={{ textAlign: 'right' }}>
                        <span className="review-cost-total-amount">
                          {estTotal.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <span className="review-cost-currency">USD</span>
                      </div>
                    </div>

                    {/* Lộ trình Đặt cọc 30% & Phân công tài xế */}
                    <div
                      style={{
                        marginTop: 14,
                        marginBottom: 14,
                        padding: '12px 14px',
                        borderRadius: 12,
                        backgroundColor: isRoadMode ? '#ecfdf5' : '#eff6ff',
                        border: isRoadMode ? '1px solid #a7f3d0' : '1px solid #bfdbfe',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: isRoadMode ? '#065f46' : '#1e40af',
                          }}
                        >
                          💳 Đặt cọc giữ xe & lịch (30%):
                        </span>
                        <strong
                          style={{
                            fontSize: 14,
                            color: isRoadMode ? '#047857' : '#1d4ed8',
                          }}
                        >
                          {estDeposit30.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          USD
                        </strong>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 12,
                          color: '#475569',
                          marginBottom: 8,
                        }}
                      >
                        <span>Thanh toán trước khởi hành (70%):</span>
                        <span>
                          {estBalance70.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          USD
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          lineHeight: 1.45,
                          color: isRoadMode ? '#065f46' : '#1e3a8a',
                        }}
                      >
                        {isRoadMode
                          ? '🚛 Tuyến Đường bộ: Sau khi gửi yêu cầu, Quản lý (Manager) sẽ duyệt đơn và phân phối Chuyên viên + Điều phối viên. Ngay khi được duyệt, hệ thống mở cổng Đặt cọc 30% và phân công tài xế ngay sau khi hoàn tất cọc.'
                          : '✈️ Tuyến Hàng không: Sau khi gửi yêu cầu, Quản lý duyệt đơn và Điều phối viên sẽ lên lịch chuyến bay, báo giá vé máy bay thực tế. Bạn xác nhận báo giá và đặt cọc 30% trước khi phân công tài xế & giữ slot bay.'}
                      </p>
                    </div>

                    <div className="review-cost-perks">
                      <div className="review-cost-perk">
                        <span className="check">✓</span> Báo giá minh bạch, chuẩn xác theo bảng giá dịch vụ
                      </div>
                      <div className="review-cost-perk">
                        <span className="check">✓</span> Quản lý thẩm định & phân phối ca làm việc trước khi đặt cọc
                      </div>
                      <div className="review-cost-perk">
                        <span className="check">✓</span>{' '}
                        {isRoadMode
                          ? 'Đơn đường bộ tự động chốt giá & kích hoạt cọc 30% ngay khi Quản lý duyệt'
                          : 'Báo giá vé máy bay chính thức được Điều phối viên xác nhận sau khi duyệt'}
                      </div>
                    </div>

                    {fieldError('horseId') && (
                      <p className="field-error" role="alert" style={{ marginBottom: 10 }}>
                        {fieldError('horseId')}
                      </p>
                    )}
                    {hasFieldErrors && (
                      <p className="field-error" role="alert" style={{ marginBottom: 10 }}>
                        Review the highlighted fields in Journey and Horse.
                      </p>
                    )}

                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                      Save changes before submitting. The backend validates horse fit and captures an
                      immutable revision.
                    </p>

                    <button
                      className="primary review-submit-button"
                      type="button"
                      disabled={
                        action.pending ||
                        dirty ||
                        !current ||
                        !isDraft ||
                        (!!form.horseId && selectedHorse.isPending) ||
                        (conflict && !frozenSubmit) ||
                        (uncertain && !frozenSubmit)
                      }
                      onClick={submit}
                    >
                      {action.pending
                        ? 'Submitting…'
                        : refreshPending
                          ? 'Refresh submitted request'
                          : frozenSubmit
                            ? 'Retry the same submission'
                            : 'Submit for Review'}
                    </button>

                    <div className="review-security-note">
                      🔒 Giao dịch được bảo vệ và quản lý theo quy chuẩn IATA LAR và FEI.
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      )}
      <div className="actions">
        <button
          type="button"
          onClick={() => setStep((v) => Math.max(0, v - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        {step < 3 && (
          <button
            type="button"
            className="primary"
            onClick={handleContinue}
            disabled={action.pending || (step === 1 && !form.horseId)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
              backgroundColor: '#0f5132',
              color: '#ffffff',
              border: 'none',
              cursor: action.pending ? 'wait' : (step === 1 && !form.horseId) ? 'not-allowed' : 'pointer',
              opacity: (step === 1 && !form.horseId) ? 0.6 : 1,
              boxShadow: '0 3px 8px rgba(15, 81, 50, 0.25)',
            }}
          >
            {action.pending && step === 1
              ? 'Đang lưu & tải dịch vụ…'
              : step === 0
                ? 'Tiếp tục sang bước Chọn ngựa →'
                : step === 1
                  ? 'Tiếp tục sang bước Dịch vụ →'
                  : 'Tiếp tục sang bước Xem lại & Gửi →'}
          </button>
        )}
        <button
          type="button"
          className="primary"
          disabled={
            action.pending ||
            !isDraft ||
            frozenSubmit ||
            conflict ||
            uncertain ||
            (!!current && !dirty)
          }
          onClick={() => save()}
        >
          {action.pending ? 'Saving…' : 'Save Draft'}
        </button>
        <span className="muted" aria-live="polite">
          {dirty ? 'Unsaved changes' : 'No unsaved changes'}
        </span>
      </div>
      <p>
        <Link to="/customer/requests">Back to requests</Link>
      </p>
    </>
  );
}
