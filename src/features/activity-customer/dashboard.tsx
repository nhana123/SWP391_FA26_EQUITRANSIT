import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PortfolioMetrics } from '../../components/ui/PortfolioMetrics';
import { EmptyState } from '../../components/ui/Primitives';
import { RequestTable } from '../../components/ui/RequestTable';
import { Icon } from '../../components/ui/Icons';
import { Link, useNavigate } from 'react-router-dom';
import { Notice } from '../../shared/ui/common';
import { activityApi } from './api';
import type { Dashboard } from './contracts';
import { legalStatuses } from '../compliance/link';
import { horsesApi } from '../horses/api';
import type { Horse } from '../../shared/api/contracts';
import {
  ActivityHeading,
  ActivityPager,
  ActivityReadState,
  InvalidActivityPage,
  useActivityPage,
  useActivityQuery,
} from './shared';

function getSexLabel(sexCode: string | null | undefined): string {
  if (sexCode === 'GELDING') return 'Ngựa thiến (Gelding)';
  if (sexCode === 'STALLION') return 'Ngựa đực giống (Stallion)';
  if (sexCode === 'MARE') return 'Ngựa cái (Mare)';
  return 'Chưa rõ';
}

function HorseQuickModal({ horse, onClose }: { horse: Horse; onClose: () => void }) {
  const navigate = useNavigate();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="horse-quick-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          maxWidth: 600,
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          border: '1px solid #e2e8f0',
          padding: 28,
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng cửa sổ"
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          ✕
        </button>

        {/* Header modal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              flexShrink: 0,
            }}
          >
            🐴
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 id="horse-quick-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                {horse.name}
              </h3>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: horse.measurementsComplete ? '#ecfdf5' : '#fef3c7',
                  color: horse.measurementsComplete ? '#065f46' : '#92400e',
                  border: `1px solid ${horse.measurementsComplete ? '#a7f3d0' : '#fde68a'}`,
                }}
              >
                {horse.measurementsComplete ? 'Hồ sơ số đo hoàn tất' : 'Chưa hoàn tất số đo'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              {horse.breed || 'Chưa rõ giống'} · {getSexLabel(horse.sexCode)} · ID #{horse.horseId}
            </div>
          </div>
        </div>

        {/* Thông số kỹ thuật từ DB */}
        <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Mã Vi Chip ISO</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                {horse.microchipId || 'Chưa đăng ký'}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Hộ Chiếu Ngựa (Passport)</div>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                {horse.passportNumber || 'Chưa cấp'}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Cân Nặng / Chiều Cao</div>
              <div style={{ fontWeight: 600, color: '#334155', marginTop: 2 }}>
                {horse.weightKg ? `${horse.weightKg} kg` : '---'} / {horse.heightCm ? `${horse.heightCm} cm` : '---'}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Bề Rộng Thân / Khoang Phù Hợp</div>
              <div style={{ fontWeight: 600, color: '#334155', marginTop: 2 }}>
                {horse.bodyWidthCm ? `${horse.bodyWidthCm} cm` : '---'} {horse.stallPreferences ? `(${horse.stallPreferences})` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Yêu cầu dinh dưỡng & Thú y nếu có */}
        {(horse.feedWaterRequirements || horse.specialCareNotes || horse.veterinaryInstructions) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {horse.feedWaterRequirements && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#166534', marginBottom: 2 }}>🌾 Chế độ dinh dưỡng &amp; tiếp nước:</div>
                <div style={{ color: '#15803d' }}>{horse.feedWaterRequirements}</div>
              </div>
            )}
            {horse.specialCareNotes && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 2 }}>⚠️ Lưu ý chăm sóc đặc biệt:</div>
                <div style={{ color: '#b45309' }}>{horse.specialCareNotes}</div>
              </div>
            )}
            {horse.veterinaryInstructions && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 2 }}>🩺 Chỉ định thú y:</div>
                <div style={{ color: '#1d4ed8' }}>{horse.veterinaryInstructions}</div>
              </div>
            )}
          </div>
        )}

        {/* Nút hành động */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/customer/horses/${horse.horseId}/edit`);
            }}
            className="button"
            style={{ fontSize: 13 }}
          >
            Chỉnh sửa hồ sơ
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/customer/requests/new?horseId=${horse.horseId}`);
            }}
            className="button primary"
            style={{ fontSize: 13 }}
          >
            Khởi tạo chuyến vận chuyển →
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerHorsesShowcase() {
  const [selectedHorse, setSelectedHorse] = useState<Horse | null>(null);
  const horsesQuery = useQuery({
    queryKey: ['horses', 'dashboard-list'],
    queryFn: ({ signal }) => horsesApi.list(0, '', signal),
    retry: false,
  });

  const horses = horsesQuery.data?.items ?? [];
  const total = horsesQuery.data?.totalElements ?? horses.length;

  if (horsesQuery.isError) {
    return null;
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="horse" size={20} />
            Đàn Ngựa Của Bạn (My Horses)
            {total > 0 && (
              <span style={{ fontSize: 13, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: 9999, fontWeight: 700 }}>
                {total} cá thể
              </span>
            )}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Hồ sơ nhân trắc học, mã vi chip và yêu cầu an sinh được đồng bộ từ cơ sở dữ liệu.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/customer/horses/new" className="button" style={{ fontSize: 13, padding: '7px 14px' }}>
            <Icon name="plus" size={14} /> Thêm ngựa
          </Link>
          <Link to="/customer/horses" className="button primary" style={{ fontSize: 13, padding: '7px 14px' }}>
            Xem toàn bộ đàn ngựa →
          </Link>
        </div>
      </div>

      {horsesQuery.isPending ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          Đang tải dữ liệu hồ sơ ngựa...
        </div>
      ) : !horses.length ? (
        <div style={{ padding: '28px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🐴</div>
          <h3 style={{ margin: '0 0 6px 0', fontSize: 16, color: '#1e293b' }}>Chưa có hồ sơ ngựa nào được đăng ký</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>
            Đăng ký hồ sơ ngựa để chuẩn bị yêu cầu vận chuyển và theo dõi an sinh suốt hành trình.
          </p>
          <Link to="/customer/horses/new" className="button primary" style={{ fontSize: 13 }}>
            <Icon name="plus" size={14} /> Đăng ký hồ sơ ngựa đầu tiên
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {horses.slice(0, 6).map((h) => (
            <div
              key={h.horseId}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedHorse(h)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedHorse(h);
                }
              }}
              style={{
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: 14,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#10b981';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(16, 185, 129, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      🐴
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{h.name}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{h.breed || 'Chưa cập nhật giống'}</div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: h.measurementsComplete ? '#ecfdf5' : '#fef3c7',
                      color: h.measurementsComplete ? '#065f46' : '#92400e',
                      border: `1px solid ${h.measurementsComplete ? '#a7f3d0' : '#fde68a'}`,
                    }}
                  >
                    {h.measurementsComplete ? 'Đủ số đo' : 'Cần đo'}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Giới tính:</span>
                    <span style={{ fontWeight: 600 }}>{getSexLabel(h.sexCode)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Vi chip:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                      {h.microchipId || 'Chưa có'}
                    </span>
                  </div>
                  {h.weightKg && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Trọng lượng:</span>
                      <span style={{ fontWeight: 600 }}>{h.weightKg} kg</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
                  Xem nhanh hồ sơ →
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  ID #{h.horseId}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedHorse && (
        <HorseQuickModal horse={selectedHorse} onClose={() => setSelectedHorse(null)} />
      )}
    </section>
  );
}

/**
 * Requests whose legal file is open, each with a direct way to its documents.
 * Covers the requests on the current page only, like the table below.
 */
function LegalDocumentsBanner({ items }: { items: Dashboard['items'] }) {
  const open = items.filter((o) => legalStatuses.includes(o.status));
  if (!open.length) return null;

  return (
    <section
      className="card legal-banner"
      aria-labelledby="legal-banner-heading"
      style={{
        marginBottom: 24,
        borderLeft: '4px solid #f59e0b',
        background: '#ffffff',
        padding: '24px 28px',
        borderRadius: 14,
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 id="legal-banner-heading" style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            <Icon name="shield" size={18} /> Legal documents
          </h2>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginTop: 2 }}>
            Hồ sơ kiểm dịch &amp; thủ tục hải quan cần hoàn tất
          </div>
        </div>
        <span style={{ fontSize: 12, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: 9999, fontWeight: 700 }}>
          {open.length} đơn hàng cần xử lý hồ sơ
        </span>
      </div>

      <p style={{ color: '#475569', fontSize: 13.5, margin: '0 0 16px 0', lineHeight: 1.5 }}>
        Các chuyến vận chuyển dưới đây đang trong quy trình chuẩn bị xuất cảnh. Quý khách vui lòng nộp chứng thư thú y, giấy kiểm dịch hoặc hồ sơ hải quan để Chuyên viên kiểm duyệt.
      </p>

      {/* Structured compliance tasks list */}
      <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
          {open.map((o, idx) => {
            const shortCode = o.orderNumber.length > 18
              ? `${o.orderNumber.slice(0, 8)}…${o.orderNumber.slice(-4)}`
              : o.orderNumber;

            return (
              <li
                key={o.orderId}
                style={{
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: idx === open.length - 1 ? 'none' : '1px solid #e2e8f0',
                  gap: 16,
                  flexWrap: 'wrap',
                  background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#fef3c7',
                      color: '#b45309',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    📄
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Mã đơn:</span>
                      <span
                        title={o.orderNumber}
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: 13,
                          background: '#f1f5f9',
                          padding: '2px 8px',
                          borderRadius: 6,
                          color: '#0f172a',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        {shortCode}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Thủ tục: Chứng thư thú y xuất cảnh &amp; hồ sơ hải quan động vật sống
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: '#ecfdf5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                    }}
                  >
                    Cần nộp tài liệu
                  </span>

                  <Link
                    to={`/customer/requests/${o.orderId}/compliance`}
                    className="button primary"
                    aria-label={`${o.orderNumber}: Legal documents (submit / track review)`}
                    style={{
                      fontSize: 12.5,
                      padding: '6px 14px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span className="sr-only">
                      {o.orderNumber}: Legal documents (submit / track review)
                    </span>
                    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Nộp &amp; Theo dõi hồ sơ <Icon name="arrow" size={13} />
                    </span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function CustomerDashboardPage() {
  const paging = useActivityPage();
  const query = useActivityQuery(
    ['dashboard', paging.page],
    (signal) => activityApi.dashboard(paging.page, signal),
    ['CUSTOMER'],
    paging.valid,
  );
  if (!query.allowed) return <Notice>This dashboard is available to Customers only.</Notice>;
  if (!paging.valid) return <InvalidActivityPage reset={() => paging.setPage(0)} />;
  const data = query.data;
  return (
    <>
      <ActivityHeading title="My dashboard" />
      <section className="dashboard-hero">
        <div>
          <small className="eyebrow">YOUR HORSES. ONE CONNECTED JOURNEY.</small>
          <h2>Every journey, thoughtfully coordinated.</h2>
          <p>
            Follow your requests, review the next step and keep your horses moving with confidence.
          </p>
        </div>
        <Link className="button" to="/customer/requests/new">
          <Icon name="plus" size={17} />
          Request transport
          <Icon name="arrow" size={16} />
        </Link>
      </section>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {data && !query.error && (
        <>
          <LegalDocumentsBanner items={data.items} />
          <section className="portfolio-overview">
            <h2>Request status overview</h2>
            <p>Counts cover all your requests, including those outside this page.</p>
            {!data.counts.length ? (
              <EmptyState title="No request statuses to display." />
            ) : (
              <PortfolioMetrics counts={data.counts} />
            )}
          </section>
          <CustomerHorsesShowcase />
          <section className="card" style={{ marginTop: 24 }}>
            <h2>Your transport requests</h2>
            <RequestTable
              items={data.items}
              label="Dashboard requests"
              emptyMessage="No transport requests on this page."
              path={(order) => `/customer/requests/${order.orderId}`}
            />
            <ActivityPager {...data} page={paging.page} onPage={paging.setPage} />
          </section>
        </>
      )}
    </>
  );
}
