import { PortfolioMetrics } from '../../components/ui/PortfolioMetrics';
import { EmptyState } from '../../components/ui/Primitives';
import { RequestTable } from '../../components/ui/RequestTable';
import { Icon } from '../../components/ui/Icons';
import { Link } from 'react-router-dom';
import { Notice } from '../../shared/ui/common';
import { activityApi } from './api';
import type { Dashboard } from './contracts';
import { legalStatuses } from '../compliance/link';
import {
  ActivityHeading,
  ActivityPager,
  ActivityReadState,
  InvalidActivityPage,
  useActivityPage,
  useActivityQuery,
} from './shared';

/**
 * Requests that have been approved by Manager and are awaiting 30% deposit payment.
 */
function PendingDepositBanner({ items }: { items: Dashboard['items'] }) {
  const pendingDeposit = items.filter((o) => o.status === 'APPROVED');
  if (!pendingDeposit.length) return null;

  return (
    <section
      className="card deposit-reminder-banner"
      aria-label="Pending deposit requests"
      style={{
        marginBottom: 24,
        borderLeft: '4px solid #0284c7',
        background: '#ffffff',
        padding: '24px 28px',
        borderRadius: 14,
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            💳 Đặt cọc giữ chỗ chuyến vận chuyển
          </h2>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginTop: 2 }}>
            Báo giá đã được phê duyệt — Vui lòng hoàn tất thanh toán cọc 30% để kích hoạt điều phối
          </div>
        </div>
        <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 9999, fontWeight: 700 }}>
          {pendingDeposit.length} đơn hàng chờ thanh toán cọc
        </span>
      </div>

      <p style={{ color: '#475569', fontSize: 13.5, margin: '0 0 16px 0', lineHeight: 1.5 }}>
        Sau khi quý khách hoàn tất đặt cọc 30%, hệ thống sẽ phân công Chuyên viên thủ tục (Specialist) chuẩn bị danh mục kiểm dịch &amp; Điều phối viên (Coordinator) sắp xếp phương tiện. Quý khách chưa cần nộp giấy tờ ở bước này.
      </p>

      <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
          {pendingDeposit.map((o, idx) => {
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
                  borderBottom: idx === pendingDeposit.length - 1 ? 'none' : '1px solid #e2e8f0',
                  gap: 16,
                  flexWrap: 'wrap',
                  background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    💰
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
                      Trạng thái: Báo giá đã duyệt · Chờ đặt cọc 30% để tiến hành
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
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                    }}
                  >
                    Chờ thanh toán cọc
                  </span>

                  <Link
                    to={`/customer/requests/${o.orderId}/payments`}
                    className="button primary"
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
                    <span>Thanh toán Cọc (VNPAY / Chuyển khoản) →</span>
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
          <PendingDepositBanner items={data.items} />
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
