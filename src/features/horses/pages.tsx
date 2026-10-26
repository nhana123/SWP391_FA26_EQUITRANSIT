import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/ui/Icons';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useHorse, useHorseSearch } from './hooks';
import {
  HORSE_GENDERS,
  horseFields,
  horseForm,
  horseInput,
  POPULAR_BREEDS,
  validateHorse,
  type HorseForm,
} from './form';
import { horsesApi } from './api';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession, getSession } from '../../shared/api/session';
import { ApiError } from '../../shared/api/client';
import type { Horse } from '../../shared/api/contracts';
import {
  ErrorNotice,
  Field,
  Loading,
  Notice,
  Pagination,
} from '../../shared/ui/common';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { useAction } from '../../shared/lib/useAction';

// Quick care note tags to assist customers in 1 click
const CARE_SUGGESTIONS = [
  '🌾 Rơm lót chuồng dầy 15cm',
  '💧 Bổ sung nước & điện giải định kỳ',
  '❄️ Nhiệt độ khoang 16-19°C',
  '🐴 Yêu cầu vách chuồng riêng biệt',
  '🩺 Cho uống thuốc chống say xe trước bay 2h',
];

export function HorsesPage() {
  const { search, setSearch, page, setPage, query } = useHorseSearch();
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const items = query.data?.items ?? [];
  const totalCount = query.data?.totalElements ?? items.length;
  const completeCount = items.filter((h) => h.measurementsComplete).length;
  const incompleteCount = totalCount - completeCount;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Banner / Hero Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #072318 0%, #0f3d2a 100%)',
          borderRadius: 20,
          padding: '28px 32px',
          color: '#ffffff',
          marginBottom: 24,
          boxShadow: '0 10px 25px rgba(7, 35, 24, 0.12)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#34d399',
              marginBottom: 4,
            }}
          >
            EquiTransit Racing Registry
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#ffffff' }}>
            Hồ Sơ Cá Thể Ngựa (My Horses)
          </h1>
          <p style={{ margin: '6px 0 0 0', fontSize: 14, color: '#a7f3d0' }}>
            Quản lý thông tin định danh, số vi mạch, hộ chiếu FEI và lịch sử chăm sóc vận chuyển.
          </p>
        </div>

        <Link
          className="button"
          to="/customer/horses/new"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 12,
            padding: '12px 24px',
            fontWeight: 700,
            fontSize: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: 18 }}>+</span> Đăng Ký Ngựa Mới
        </Link>
      </div>

      {/* Metrics Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            🐎
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>TỔNG SỐ NGỰA</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{totalCount}</div>
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            ✓
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>ĐÃ ĐỦ SỐ ĐO</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{completeCount}</div>
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#fffbeb',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            ⏳
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>CHỜ BỔ SUNG SỐ ĐO</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>{incompleteCount}</div>
          </div>
        </div>
      </div>

      {/* Filter & View Switcher Bar */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          padding: '16px 20px',
          border: '1px solid #e2e8f0',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ flex: '1 1 320px', position: 'relative' }}>
          <input
            type="search"
            placeholder="🔍 Tìm kiếm cá thể ngựa theo tên..."
            maxLength={150}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b', marginRight: 4 }}>Hiển thị:</span>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: viewMode === 'cards' ? '1.5px solid #10b981' : '1px solid #e2e8f0',
              background: viewMode === 'cards' ? '#ecfdf5' : '#ffffff',
              color: viewMode === 'cards' ? '#065f46' : '#64748b',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Lưới thẻ (Cards)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: viewMode === 'table' ? '1.5px solid #10b981' : '1px solid #e2e8f0',
              background: viewMode === 'table' ? '#ecfdf5' : '#ffffff',
              color: viewMode === 'table' ? '#065f46' : '#64748b',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Bảng (Table)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error}>
          <button onClick={() => void query.refetch()}>Try again</button>
        </ErrorNotice>
      ) : !items.length ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '2px dashed #cbd5e1',
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 12 }}>🐎</div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 20, color: '#0f172a' }}>
            {search ? 'Không tìm thấy cá thể ngựa phù hợp' : 'Chưa có cá thể ngựa nào'}
          </h2>
          <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            {search
              ? 'Vui lòng kiểm tra lại từ khóa hoặc xóa bộ lọc để xem toàn bộ danh sách.'
              : 'Hãy thêm cá thể ngựa đua của bạn để bắt đầu lập hồ sơ kiểm dịch và yêu cầu vận chuyển.'}
          </p>
          <Link
            to="/customer/horses/new"
            className="button"
            style={{
              background: '#072318',
              color: '#ffffff',
              padding: '10px 22px',
              borderRadius: 10,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            + Đăng ký cá thể ngựa đầu tiên
          </Link>
        </div>
      ) : viewMode === 'cards' ? (
        /* Modern Card Grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
            marginBottom: 24,
          }}
        >
          {items.map((h) => (
            <div
              key={h.horseId}
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                padding: '22px 24px',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <div>
                {/* Header row: Avatar, Name, Gender Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      color: '#92400e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      flexShrink: 0,
                      boxShadow: '0 2px 6px rgba(217, 119, 6, 0.15)',
                    }}
                  >
                    🐴
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 17,
                        fontWeight: 800,
                        color: '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h.name}
                    </h3>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      {h.breed || 'Chưa rõ giống'} ·{' '}
                      <span style={{ fontWeight: 600, color: '#334155' }}>
                        {h.sexCode === 'STALLION'
                          ? 'Đực (Stallion)'
                          : h.sexCode === 'MARE'
                            ? 'Cái (Mare)'
                            : h.sexCode === 'GELDING'
                              ? 'Thiến (Gelding)'
                              : 'Chưa rõ giới tính'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Identification Badges */}
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#475569',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Microchip:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                      {h.microchipId || '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Passport FEI:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                      {h.passportNumber || '—'}
                    </span>
                  </div>
                </div>

                {/* Status indicator */}
                <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Thể trạng & Số đo:</span>
                  <StatusBadge status={h.measurementsComplete ? 'Recorded' : 'Incomplete'}>
                    {h.measurementsComplete ? 'Đã đủ số đo' : 'Chưa đo kích thước'}
                  </StatusBadge>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: 14,
                }}
              >
                <Link
                  to={`/customer/horses/${h.horseId}`}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#f1f5f9',
                    color: '#334155',
                    fontSize: 12.5,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Xem hồ sơ
                </Link>
                <Link
                  to={`/customer/horses/${h.horseId}/edit`}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#ecfdf5',
                    color: '#065f46',
                    border: '1px solid #a7f3d0',
                    fontSize: 12.5,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Chỉnh sửa
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Modern Table View */
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)',
            marginBottom: 24,
          }}
        >
          <div className="table-scroll">
            <table style={{ margin: 0 }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ padding: '14px 20px', color: '#475569', fontSize: 13 }}>Cá thể ngựa</th>
                  <th style={{ padding: '14px 20px', color: '#475569', fontSize: 13 }}>Giống</th>
                  <th style={{ padding: '14px 20px', color: '#475569', fontSize: 13 }}>Giới tính</th>
                  <th style={{ padding: '14px 20px', color: '#475569', fontSize: 13 }}>Số đo kích thước</th>
                  <th style={{ padding: '14px 20px', color: '#475569', fontSize: 13, textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((h) => (
                  <tr key={h.horseId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: '#fef3c7',
                            color: '#92400e',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                            flexShrink: 0,
                          }}
                        >
                          🐴
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                            {h.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            Chip: {h.microchipId || '—'} · Passport: {h.passportNumber || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13.5 }}>
                      <span
                        style={{
                          background: '#eff6ff',
                          color: '#1e40af',
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontWeight: 500,
                          fontSize: 12,
                        }}
                      >
                        {h.breed || 'Chưa xác định'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13 }}>
                      {h.sexCode === 'STALLION'
                        ? 'Stallion (Đực)'
                        : h.sexCode === 'MARE'
                          ? 'Mare (Cái)'
                          : h.sexCode === 'GELDING'
                            ? 'Gelding (Thiến)'
                            : 'Chưa ghi nhận'}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <StatusBadge status={h.measurementsComplete ? 'Recorded' : 'Incomplete'}>
                        {h.measurementsComplete ? 'Đã đủ số đo' : 'Chưa đo kích thước'}
                      </StatusBadge>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <Link
                          to={`/customer/horses/${h.horseId}`}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: '#059669',
                            textDecoration: 'none',
                            padding: '4px 8px',
                          }}
                        >
                          Chi tiết
                        </Link>
                        <Link
                          to={`/customer/horses/${h.horseId}/edit`}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: '#2563eb',
                            textDecoration: 'none',
                            padding: '4px 8px',
                          }}
                        >
                          Sửa
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {query.data && (
        <Pagination
          page={page}
          pages={query.data.totalPages}
          onChange={setPage}
          pending={query.isFetching}
        />
      )}
    </div>
  );
}

export function HorseDetailPage() {
  const id = Number(useParams().id);
  const query = useHorse(id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return <Notice>Hồ sơ cá thể ngựa này không tồn tại hoặc đã bị gỡ.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        <Link to="/customer/horses">Quay lại danh sách ngựa</Link>
      </ErrorNotice>
    );
  const horse = query.data;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header Profile Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #072318 0%, #0f3d2a 100%)',
          borderRadius: 20,
          padding: '28px 32px',
          color: '#ffffff',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 8px 25px rgba(7, 35, 24, 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#fef3c7',
              color: '#92400e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              boxShadow: '0 4px 12px rgba(217, 119, 6, 0.2)',
            }}
          >
            🐴
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Hồ Sơ Ngựa Đua
            </div>
            <h1 style={{ margin: '2px 0 0 0', fontSize: 26, fontWeight: 800, color: '#ffffff' }}>
              {horse.name}
            </h1>
            <div style={{ fontSize: 13.5, color: '#a7f3d0', marginTop: 4 }}>
              {horse.breed || 'Chưa rõ giống'} ·{' '}
              {horse.sexCode === 'STALLION'
                ? 'Đực (Stallion)'
                : horse.sexCode === 'MARE'
                  ? 'Cái (Mare)'
                  : horse.sexCode === 'GELDING'
                    ? 'Thiến (Gelding)'
                    : 'Chưa rõ giới tính'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            className="button"
            to={`/customer/horses/${id}/edit`}
            style={{
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Chỉnh Sửa Hồ Sơ
          </Link>
          <Link
            to="/customer/horses"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              borderRadius: 10,
              padding: '10px 18px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Danh sách
          </Link>
        </div>
      </div>

      <Notice>
        {horse.measurementsComplete
          ? 'Số đo thể trạng đã được ghi nhận đầy đủ.'
          : 'Một số thông số kích thước thể trạng chưa được ghi nhận.'}{' '}
        Kiểm định điều kiện bay và chuẩn bị khoang vận chuyển sẽ được đội ngũ chuyên viên thú y thẩm định riêng.
      </Notice>

      {/* Main Details Card */}
      <section className="card" style={{ borderRadius: 16, padding: '28px 32px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 20 }}>
          Chi tiết hồ sơ định danh & thể trạng
        </h2>
        <dl className="details" style={{ rowGap: 16 }}>
          {horseFields.map((f) => (
            <div key={f.key}>
              <dt style={{ color: '#64748b', fontSize: 13 }}>{f.label}</dt>
              <dd style={{ color: '#0f172a', fontWeight: 600, fontSize: 14 }}>
                {f.key === 'measuredAt'
                  ? displayDate(horse.measuredAt)
                  : horse[f.key] == null || horse[f.key] === ''
                    ? 'Chưa ghi nhận'
                    : String(horse[f.key])}
              </dd>
            </div>
          ))}
          <div>
            <dt style={{ color: '#64748b', fontSize: 13 }}>Sex (Giới tính)</dt>
            <dd style={{ color: '#0f172a', fontWeight: 600, fontSize: 14 }}>
              {horse.sexCode || 'Chưa ghi nhận'}
            </dd>
          </div>
        </dl>
      </section>

      <div style={{ marginTop: 24 }}>
        <Link to="/customer/horses" style={{ color: '#059669', fontWeight: 600, textDecoration: 'none' }}>
          ← Quay lại danh sách hồ sơ ngựa
        </Link>
      </div>
    </div>
  );
}

export function HorseEditPage() {
  const id = Number(useParams().id);
  const query = useHorse(id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return <Notice>Hồ sơ cá thể ngựa này không tồn tại hoặc đã bị gỡ.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return <HorseEditor key={id} horse={query.data} />;
}

export function HorseEditor({ horse }: { horse?: Horse }) {
  const [form, setForm] = useState<HorseForm>(() => horseForm(horse));
  const [baseline, setBaseline] = useState(() => horseForm(horse));
  const [version, setVersion] = useState(horse?.recordVersion);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [latest, setLatest] = useState<Horse | null>(null);

  // Check if any advanced fields are populated to auto-expand
  const hasAdvancedValues = Boolean(
    form.bodyWidthCm ||
      form.measuredAt ||
      form.handlingNotes ||
      form.feedWaterRequirements ||
      form.stallPreferences ||
      form.veterinaryInstructions ||
      form.veterinaryInstructionSource,
  );
  const [showAdvanced, setShowAdvanced] = useState(hasAdvancedValues);

  const action = useAction();
  const navigate = useNavigate();
  const session = useSession()!;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const conflict = action.error instanceof ApiError && action.error.status === 409;
  const uncertain = action.error instanceof ApiError && action.error.uncertain;

  function update(key: keyof HorseForm, value: string) {
    setForm((v) => ({ ...v, [key]: value }));
  }

  function appendCareNote(text: string) {
    setForm((v) => {
      const current = v.specialCareNotes.trim();
      const updated = current ? `${current}\n• ${text}` : `• ${text}`;
      return { ...v, specialCareNotes: updated };
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const validation = validateHorse(form, true);
    setErrors(validation);
    if (Object.keys(validation).length || conflict || uncertain) return;
    void action.run(async () => {
      const input = horseInput(form);
      const saved =
        horse && version
          ? await horsesApi.update(horse.horseId, { ...input, recordVersion: version })
          : await horsesApi.create(input);
      if (sessionGenerationChanged(session.generation)) return;
      queryClient.setQueryData(queryKeys.horse(session.generation, saved.horseId), saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.horses(session.generation) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.services(session.generation) });
      navigate(`/customer/horses/${saved.horseId}`, { replace: true });
    });
  }

  async function loadLatest() {
    if (!horse) {
      navigate('/customer/horses');
      return;
    }
    try {
      setLatest(await horsesApi.get(horse.horseId));
    } catch (e) {
      action.setError(e);
    }
  }

  function discard() {
    if (!latest || !window.confirm('Thay thế dữ liệu chưa lưu bằng dữ liệu mới nhất từ máy chủ?'))
      return;
    const values = horseForm(latest);
    setForm(values);
    setBaseline(values);
    setVersion(latest.recordVersion);
    setLatest(null);
    action.setError(null);
    setErrors({});
  }

  const secondaryMeasurementFields = horseFields.filter((f) =>
    ['bodyWidthCm', 'measuredAt'].includes(f.key),
  );
  const detailCareFields = horseFields.filter((f) =>
    [
      'handlingNotes',
      'feedWaterRequirements',
      'stallPreferences',
      'veterinaryInstructions',
      'veterinaryInstructionSource',
    ].includes(f.key),
  );

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', paddingBottom: 60 }}>
      {/* Top Header Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #072318 0%, #0f3d2a 100%)',
          borderRadius: 20,
          padding: '24px 30px',
          color: '#ffffff',
          marginBottom: 20,
          boxShadow: '0 8px 22px rgba(7, 35, 24, 0.12)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#34d399' }}>
            {horse ? 'Cập Nhật Hồ Sơ' : 'Đăng Ký Hồ Sơ Mới'}
          </div>
          <h1 style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 800, color: '#ffffff' }}>
            {horse ? `Chỉnh sửa: ${horse.name}` : 'Thêm Cá Thể Ngựa Đua Mới'}
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13.5, color: '#a7f3d0' }}>
            Tên ngựa, cân nặng và chiều cao là thông tin bắt buộc (*) để bảo đảm ràng buộc chuồng bay (Air Stall) và lập kế hoạch vận chuyển an toàn.
          </p>
        </div>

        <Link
          to="/customer/horses"
          style={{
            background: 'rgba(255, 255, 255, 0.12)',
            color: '#ffffff',
            borderRadius: 10,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← Danh sách ngựa
        </Link>
      </div>

      {/* Live Preview Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: '#fef3c7',
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {form.name.trim() ? form.name.trim()[0].toUpperCase() : '🐴'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>XEM TRƯỚC HỒ SƠ:</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
            {form.name.trim() || 'Chưa nhập tên ngựa...'}
          </div>
          <div style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>
            Giống: <span style={{ fontWeight: 600 }}>{form.breed || 'Chưa chọn'}</span> · Giới tính:{' '}
            <span style={{ fontWeight: 600 }}>
              {form.sexCode === 'STALLION'
                ? 'Stallion (Đực giống)'
                : form.sexCode === 'MARE'
                  ? 'Mare (Cái)'
                  : form.sexCode === 'GELDING'
                    ? 'Gelding (Thiến)'
                    : 'Chưa chọn'}
            </span>
          </div>
        </div>
      </div>

      <form className="profile-editor" onSubmit={submit}>
        <ErrorNotice error={action.error}>
          {(conflict || uncertain) && (
            <button type="button" onClick={() => void loadLatest()}>
              {horse
                ? 'Tải lại dữ liệu máy chủ để đối chiếu'
                : 'Kiểm tra danh sách trước khi tạo lại'}
            </button>
          )}
        </ErrorNotice>

        {latest && (
          <section className="card" style={{ marginBottom: 20 }}>
            <h2>Dữ liệu hiện tại trên máy chủ</h2>
            <p>Các trường bạn đã nhập vẫn được giữ ở biểu mẫu phía dưới.</p>
            <dl className="details">
              {horseFields
                .filter((f) => String(latest[f.key] ?? '') !== form[f.key])
                .map((f) => (
                  <div key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>{String(latest[f.key] ?? 'Chưa ghi nhận')}</dd>
                  </div>
                ))}
            </dl>
            <button type="button" onClick={discard}>
              Nạp lại biểu mẫu từ máy chủ
            </button>
          </section>
        )}

        {/* Form Container Card */}
        <section className="card form-card" style={{ borderRadius: 16, padding: '24px 28px', border: '1px solid #e2e8f0' }}>
          {/* Section 01: Identification & Mandatory Measurements */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                01
              </span>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                Định danh & Thể trạng bắt buộc (Identity & Mandatory Specs)
              </h2>
            </div>
            <p style={{ margin: '0 0 16px 38px', fontSize: 13, color: '#64748b' }}>
              Tên ngựa, cân nặng và chiều cao là thông tin bắt buộc (*) để bảo đảm ràng buộc chuồng bay (Air Stall) và lập kế hoạch vận tải.
            </p>

            <div className="form-grid" style={{ paddingLeft: 38 }}>
              {/* Horse Name */}
              <Field
                label="Horse name *"
                error={
                  errors.name ||
                  (action.error instanceof ApiError ? action.error.fields.name : undefined)
                }
                hint="Tên khai sinh hoặc tên thi đấu chính thức của ngựa."
              >
                {(id) => (
                  <input
                    id={id}
                    required
                    type="text"
                    maxLength={150}
                    placeholder="e.g. Midnight Gunner, Red Flash"
                    value={form.name}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? `${id}-error` : undefined}
                    onChange={(e) => update('name', e.target.value)}
                  />
                )}
              </Field>

              {/* Weight (kg) * (Mandatory for Air Stall Fit) */}
              <Field
                label="Weight (kg) *"
                error={
                  errors.weightKg ||
                  (action.error instanceof ApiError ? action.error.fields.weightKg : undefined)
                }
                hint="Bắt buộc: Cân nặng cá thể ngựa để tính toán ràng buộc hạng chuồng bay (Air Stall) & tải trọng xe."
              >
                {(id) => (
                  <input
                    id={id}
                    required
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 520 (kg)"
                    value={form.weightKg}
                    aria-invalid={!!errors.weightKg}
                    aria-describedby={errors.weightKg ? `${id}-error` : undefined}
                    onChange={(e) => update('weightKg', e.target.value)}
                  />
                )}
              </Field>

              {/* Height (cm) * (Mandatory for Air Stall Fit) */}
              <Field
                label="Height (cm) *"
                error={
                  errors.heightCm ||
                  (action.error instanceof ApiError ? action.error.fields.heightCm : undefined)
                }
                hint="Bắt buộc: Chiều cao tới vai (cm) để xác định kích thước chuồng bay theo chuẩn quốc tế IATA LAR."
              >
                {(id) => (
                  <input
                    id={id}
                    required
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 165 (cm)"
                    value={form.heightCm}
                    aria-invalid={!!errors.heightCm}
                    aria-describedby={errors.heightCm ? `${id}-error` : undefined}
                    onChange={(e) => update('heightCm', e.target.value)}
                  />
                )}
              </Field>

              {/* Breed with Combobox Datalist + Quick-select Chips */}
              <Field
                label="Breed (Giống ngựa)"
                error={
                  errors.breed ||
                  (action.error instanceof ApiError ? action.error.fields.breed : undefined)
                }
                hint="Chọn từ danh mục chuẩn quốc tế hoặc gõ giống riêng biệt."
              >
                {(id) => (
                  <div>
                    <input
                      id={id}
                      type="text"
                      list="popular-horse-breeds"
                      maxLength={100}
                      placeholder="e.g. Thoroughbred, Arabian or type custom..."
                      value={form.breed}
                      onChange={(e) => update('breed', e.target.value)}
                    />
                    <datalist id="popular-horse-breeds">
                      {POPULAR_BREEDS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </datalist>

                    {/* Quick selection chips for top breeds */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginTop: 8,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 11, color: '#64748b' }}>Gợi ý nhanh:</span>
                      {POPULAR_BREEDS.slice(0, 5).map((b) => (
                        <button
                          key={b.value}
                          type="button"
                          style={{
                            fontSize: 11,
                            padding: '3px 9px',
                            borderRadius: 9999,
                            border: form.breed === b.value ? '1px solid #10b981' : '1px solid #cbd5e1',
                            background: form.breed === b.value ? '#ecfdf5' : '#f8fafc',
                            color: form.breed === b.value ? '#065f46' : '#475569',
                            cursor: 'pointer',
                            fontWeight: form.breed === b.value ? 700 : 500,
                          }}
                          onClick={() => update('breed', b.value)}
                        >
                          {b.value}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Field>

              {/* Gender / Sex */}
              <Field label="Sex (Giới tính)">
                {(id) => (
                  <select
                    id={id}
                    value={form.sexCode}
                    onChange={(e) => update('sexCode', e.target.value)}
                  >
                    <option value="">Chưa ghi nhận (Not recorded)</option>
                    {HORSE_GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              {/* Date of Birth */}
              <Field
                label="Date of birth (Ngày sinh)"
                error={
                  errors.dateOfBirth ||
                  (action.error instanceof ApiError ? action.error.fields.dateOfBirth : undefined)
                }
              >
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={form.dateOfBirth}
                    aria-invalid={!!errors.dateOfBirth}
                    aria-describedby={errors.dateOfBirth ? `${id}-error` : undefined}
                    onChange={(e) => update('dateOfBirth', e.target.value)}
                  />
                )}
              </Field>

              {/* Microchip ID */}
              <Field
                label="Microchip ID (Số Vi Mạch)"
                error={
                  errors.microchipId ||
                  (action.error instanceof ApiError ? action.error.fields.microchipId : undefined)
                }
                hint="Chuẩn ISO 11784 (9–15 ký tự chữ số/gạch nối)."
              >
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    maxLength={15}
                    placeholder="e.g. 982000412345671"
                    value={form.microchipId}
                    aria-invalid={!!errors.microchipId}
                    aria-describedby={errors.microchipId ? `${id}-error` : undefined}
                    onChange={(e) => update('microchipId', e.target.value)}
                  />
                )}
              </Field>

              {/* Passport Number */}
              <Field
                label="Passport number (Số Hộ Chiếu FEI)"
                error={
                  errors.passportNumber ||
                  (action.error instanceof ApiError ? action.error.fields.passportNumber : undefined)
                }
                hint="Mã số UELN hoặc hộ chiếu đua quốc tế (5–20 ký tự)."
              >
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    maxLength={20}
                    placeholder="e.g. 704001000000001 hoặc FEI-10459921"
                    value={form.passportNumber}
                    aria-invalid={!!errors.passportNumber}
                    aria-describedby={errors.passportNumber ? `${id}-error` : undefined}
                    onChange={(e) => update('passportNumber', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '24px 0' }} />

          {/* Section 02: Care during transport */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                02
              </span>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                Yêu cầu chăm sóc khi vận chuyển (Care during transport)
              </h2>
            </div>
            <p style={{ margin: '0 0 16px 38px', fontSize: 13, color: '#64748b' }}>
              Rơm rạ lót chuồng, say xe, nhiệt độ khoang và lưu ý chăm sóc chính cho đội ngũ hộ tống.
            </p>

            <div style={{ paddingLeft: 38 }}>
              {/* Quick Care Suggestions Chips */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                  Gợi ý chèn nhanh:
                </span>
                {CARE_SUGGESTIONS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    style={{
                      fontSize: 11.5,
                      padding: '4px 10px',
                      borderRadius: 9999,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#334155',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => appendCareNote(tag)}
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <Field
                label="Special care notes"
                error={
                  errors.specialCareNotes ||
                  (action.error instanceof ApiError
                    ? action.error.fields.specialCareNotes
                    : undefined)
                }
              >
                {(id) => (
                  <textarea
                    id={id}
                    maxLength={1000}
                    rows={4}
                    placeholder="Nhập hoặc click các gợi ý ở trên để chèn nhanh yêu cầu chăm sóc, dinh dưỡng hoặc nhiệt độ khoang bay..."
                    value={form.specialCareNotes}
                    onChange={(e) => update('specialCareNotes', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>

          {/* Section 03: Optional Collapsible Section */}
          <div
            style={{
              padding: '16px 20px',
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                📐 Thông số kích thước phụ & Chỉ định thú y chi tiết (Tuỳ chọn)
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Chiều rộng thân, thời điểm đo hoặc chỉ dẫn bác sĩ thú y (có thể để trống và bổ sung sau).
              </div>
            </div>
            <button
              type="button"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '7px 16px',
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: 8,
                cursor: 'pointer',
                color: '#334155',
              }}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? '▲ Thu gọn chi tiết' : '▼ Bổ sung số đo phụ & thú y'}
            </button>
          </div>

          {showAdvanced && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 14 }}>
                1. Thông số thể trạng phụ (Secondary Measurements)
              </h3>
              <div className="form-grid">
                {secondaryMeasurementFields.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    error={
                      errors[f.key] ||
                      (action.error instanceof ApiError ? action.error.fields[f.key] : undefined)
                    }
                    hint={'hint' in f ? f.hint : undefined}
                  >
                    {(id) =>
                      'type' in f && f.type === 'datetime' ? (
                        <DateTimeInput
                          id={id}
                          value={form[f.key]}
                          invalid={!!errors[f.key]}
                          describedBy={errors[f.key] ? `${id}-error` : undefined}
                          onChange={(v) => update(f.key, v)}
                        />
                      ) : (
                        <input
                          id={id}
                          type="text"
                          inputMode="decimal"
                          value={form[f.key]}
                          aria-invalid={!!errors[f.key]}
                          aria-describedby={errors[f.key] ? `${id}-error` : undefined}
                          onChange={(e) => update(f.key, e.target.value)}
                        />
                      )
                    }
                  </Field>
                ))}
              </div>

              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginTop: 24, marginBottom: 14 }}>
                2. Chỉ định thú y & tập tính riêng biệt
              </h3>
              <div className="form-grid">
                {detailCareFields.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    error={
                      errors[f.key] ||
                      (action.error instanceof ApiError ? action.error.fields[f.key] : undefined)
                    }
                  >
                    {(id) => (
                      <textarea
                        id={id}
                        maxLength={'max' in f ? f.max : 1000}
                        rows={2}
                        value={form[f.key]}
                        onChange={(e) => update(f.key, e.target.value)}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Floating/Bottom Action Bar */}
        <div
          className="actions form-save-bar"
          style={{
            marginTop: 24,
            padding: '16px 24px',
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
          }}
        >
          <button
            className="primary"
            disabled={action.pending || conflict || uncertain || (!!horse && !dirty)}
            style={{
              padding: '12px 28px',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="check" size={17} />
            {action.pending ? 'Đang lưu hồ sơ…' : 'Lưu Hồ Sơ Ngựa (Save Horse)'}
          </button>
          <Link
            to="/customer/horses"
            style={{
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 600,
              color: '#475569',
              textDecoration: 'none',
              borderRadius: 10,
              background: '#f1f5f9',
            }}
          >
            Hủy bỏ
          </Link>
          <span className="muted" aria-live="polite" style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>
            {dirty ? '● Có thay đổi chưa lưu' : '✓ Đã đồng bộ với hệ thống'}
          </span>
        </div>
      </form>
    </div>
  );
}

function sessionGenerationChanged(generation: string) {
  return getSession()?.generation !== generation;
}
