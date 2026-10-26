import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { BookingFlowStatus, Order } from '../../shared/api/contracts';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { orderStatusApi } from './status-api';

export const bookingFlowKeys = {
  status: (generation: string, orderId: number) =>
    [...queryKeys.order(generation, orderId), 'booking-flow-status'] as const,
};

function formatMoney(value: string | null | undefined, currency = 'USD'): string {
  if (!value) return 'Đang cập nhật';
  const num = Number(value);
  if (!Number.isFinite(num)) return `${value} ${currency}`;
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function getStepIndex(flow: BookingFlowStatus): number {
  if (flow.canAssignDriver) return 4;
  if (flow.isDepositSatisfied) return 3;
  if (flow.blockReason === 'DEPOSIT_REQUIRED' || flow.hasAcceptedQuote) return 2;
  if (
    flow.blockReason === 'QUOTE_ACCEPTANCE_REQUIRED' ||
    flow.blockReason === 'AWAITING_COORDINATOR_QUOTE'
  )
    return 1;
  return 0;
}

export function BookingFlowDepositPanel({ order }: { order: Order }) {
  const session = useSession()!;
  const query = useQuery({
    queryKey: bookingFlowKeys.status(session.generation, order.orderId),
    queryFn: ({ signal }) => orderStatusApi.bookingFlowStatus(order.orderId, signal),
    enabled: order.orderStatus !== 'DRAFT',
    retry: false,
  });

  if (order.orderStatus === 'DRAFT' || query.isPending || query.error || !query.data) {
    return null;
  }

  const flow = query.data;
  const currency = order.currency || 'USD';
  const mode =
    flow.transportMode ||
    order.draft.route?.transportMode ||
    'AIR';
  const isRoad = mode === 'ROAD';
  const stepIndex = getStepIndex(flow);

  const isAwaitingManager = flow.blockReason === 'AWAITING_MANAGER_APPROVAL';

  const steps = [
    {
      id: 1,
      title: '1. Gửi yêu cầu',
      sub: isRoad ? 'Tuyến đường bộ' : 'Tuyến hàng không',
      done: true,
    },
    {
      id: 2,
      title: '2. Thẩm định & Duyệt đơn',
      sub: isAwaitingManager
        ? 'Chờ Quản lý duyệt & giao ca'
        : 'Quản lý đã duyệt (Approved)',
      done: !isAwaitingManager,
    },
    {
      id: 3,
      title: isRoad ? '3. Bảng giá & Đặt cọc 30%' : '3. Báo giá vé bay & Cọc 30%',
      sub: flow.isDepositSatisfied
        ? 'Đã hoàn tất cọc 30%'
        : flow.blockReason === 'DEPOSIT_REQUIRED'
          ? `Cần cọc ${formatMoney(flow.depositAmount, currency)}`
          : flow.blockReason === 'QUOTE_ACCEPTANCE_REQUIRED'
            ? 'Chờ bạn xác nhận báo giá'
            : isAwaitingManager
              ? 'Mở sau khi Quản lý duyệt'
              : 'Chờ Coordinator báo giá',
      done: flow.isDepositSatisfied,
    },
    {
      id: 4,
      title: '4. Phân công Tài xế & Xe',
      sub: flow.canAssignDriver
        ? 'Đã mở khóa phân công'
        : flow.isDepositSatisfied
          ? 'Đang chờ điều phối'
          : 'Yêu cầu hoàn tất cọc 30%',
      done: flow.canAssignDriver,
    },
  ];

  const isActionRequired =
    flow.blockReason === 'DEPOSIT_REQUIRED' ||
    flow.blockReason === 'QUOTE_ACCEPTANCE_REQUIRED';

  const borderColor = flow.isDepositSatisfied
    ? '#10b981'
    : isActionRequired
      ? '#f59e0b'
      : '#3b82f6';

  const bgGradient = flow.isDepositSatisfied
    ? 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)'
    : isActionRequired
      ? 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)'
      : 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)';

  return (
    <section
      className="card"
      aria-label="Tiến độ báo giá, đặt cọc và phân công tài xế"
      style={{
        borderRadius: 16,
        border: `2px solid ${borderColor}`,
        background: bgGradient,
        padding: '22px 26px',
        marginBottom: 20,
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: isRoad ? '#dcfce7' : '#dbeafe',
              color: isRoad ? '#047857' : '#1d4ed8',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 21,
              fontWeight: 700,
            }}
          >
            {isRoad ? '🚛' : '✈️'}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                {isRoad
                  ? 'Luồng Đặt cọc & Điều phối Đường bộ (Road Transport)'
                  : 'Luồng Báo giá Hàng không, Đặt cọc & Điều phối (Air Transport)'}
              </h2>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  backgroundColor: isRoad ? '#d1fae5' : '#dbeafe',
                  color: isRoad ? '#065f46' : '#1e40af',
                }}
              >
                {isRoad ? 'ROAD · Báo giá cố định' : 'AIR · Cần báo giá vé bay'}
              </span>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: 13, color: '#475569' }}>
              {isRoad
                ? 'Đơn đường bộ cần Quản lý duyệt và phân phối ca, sau đó hệ thống mở lệnh đặt cọc 30% trước khi phân công tài xế.'
                : 'Đơn hàng không cần Quản lý duyệt và Điều phối viên lên lịch bay, báo giá vé máy bay thực tế trước khi đặt cọc 30% và phân công tài xế.'}
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div>
          {flow.isDepositSatisfied ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              ✓ Đã hoàn tất đặt cọc 30%
            </span>
          ) : flow.blockReason === 'AWAITING_MANAGER_APPROVAL' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                backgroundColor: '#fef3c7',
                color: '#92400e',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              ⏳ Chờ Quản lý duyệt & phân phối chuyên viên
            </span>
          ) : flow.blockReason === 'DEPOSIT_REQUIRED' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                backgroundColor: '#d97706',
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              💳 Chờ thanh toán cọc 30%
            </span>
          ) : flow.blockReason === 'QUOTE_ACCEPTANCE_REQUIRED' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              📋 Đã có báo giá · Chờ bạn xác nhận
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                backgroundColor: '#e0f2fe',
                color: '#0369a1',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              ⏳ Đang chờ Điều phối viên báo giá
            </span>
          )}
        </div>
      </div>

      {/* 4-Step Visual Progress Tracker */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 18,
        }}
      >
        {steps.map((s) => {
          const isCurrent = s.id === stepIndex + 1 && !s.done;
          return (
            <div
              key={s.id}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                backgroundColor: s.done ? '#f0fdf4' : isCurrent ? '#fffbeb' : '#f8fafc',
                border: s.done
                  ? '1.5px solid #86efac'
                  : isCurrent
                    ? '1.5px solid #fcd34d'
                    : '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong
                  style={{
                    fontSize: 13,
                    color: s.done ? '#065f46' : isCurrent ? '#92400e' : '#334155',
                  }}
                >
                  {s.title}
                </strong>
                <span style={{ fontSize: 13 }}>
                  {s.done ? '✅' : isCurrent ? '👉' : '⚪'}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: s.done ? '#047857' : isCurrent ? '#b45309' : '#64748b',
                  fontWeight: s.done || isCurrent ? 600 : 400,
                }}
              >
                {s.sub}
              </span>
            </div>
          );
        })}
      </div>

      {/* Financial Summary & Action Box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          padding: '16px 18px',
          borderRadius: 12,
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          <div>
            <span style={{ display: 'block', fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
              TỔNG GIÁ TRỊ BÁO GIÁ
            </span>
            <strong style={{ fontSize: 16, color: '#0f172a' }}>
              {flow.quoteTotal ? formatMoney(flow.quoteTotal, currency) : 'Chờ báo giá chính thức'}
            </strong>
          </div>

          {flow.depositRequired && (
            <>
              <div style={{ width: 1, height: 32, backgroundColor: '#e2e8f0' }} />
              <div>
                <span style={{ display: 'block', fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                  MỨC ĐẶT CỌC YÊU CẦU (30%)
                </span>
                <strong style={{ fontSize: 16, color: '#b45309' }}>
                  {flow.depositAmount ? formatMoney(flow.depositAmount, currency) : '30% tổng báo giá'}
                </strong>
              </div>

              <div style={{ width: 1, height: 32, backgroundColor: '#e2e8f0' }} />
              <div>
                <span style={{ display: 'block', fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                  ĐÃ THANH TOÁN CỌC
                </span>
                <strong
                  style={{
                    fontSize: 16,
                    color: flow.isDepositSatisfied ? '#059669' : '#475569',
                  }}
                >
                  {formatMoney(flow.depositPaid, currency)}
                </strong>
              </div>
            </>
          )}
        </div>

        {/* Contextual CTA Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {flow.blockReason === 'DEPOSIT_REQUIRED' && (
            <Link
              to={`/customer/requests/${order.orderId}/payments`}
              className="button primary"
              style={{
                backgroundColor: '#d97706',
                color: '#ffffff',
                fontWeight: 700,
                padding: '10px 20px',
                borderRadius: 10,
                textDecoration: 'none',
                boxShadow: '0 3px 10px rgba(217, 119, 6, 0.25)',
              }}
            >
              💳 Thanh toán tiền đặt cọc 30% ngay →
            </Link>
          )}

          {flow.blockReason === 'QUOTE_ACCEPTANCE_REQUIRED' && (
            <Link
              to={`/customer/requests/${order.orderId}/quotes`}
              className="button primary"
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                padding: '10px 20px',
                borderRadius: 10,
                textDecoration: 'none',
                boxShadow: '0 3px 10px rgba(37, 99, 235, 0.25)',
              }}
            >
              📋 Xem & Chấp nhận Báo giá để Đặt cọc →
            </Link>
          )}

          {flow.blockReason === 'AWAITING_MANAGER_APPROVAL' && (
            <span
              style={{
                fontSize: 13,
                color: '#92400e',
                fontWeight: 600,
                backgroundColor: '#fef3c7',
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #fcd34d',
              }}
            >
              ⏳ Đơn đã được nộp thành công. Quản lý đang thẩm định và phân phối Điều phối viên phụ trách. Cổng đặt cọc 30% sẽ mở ngay sau khi được duyệt.
            </span>
          )}

          {flow.blockReason === 'AWAITING_COORDINATOR_QUOTE' && (
            <span
              style={{
                fontSize: 13,
                color: '#1e40af',
                fontWeight: 600,
                backgroundColor: '#eff6ff',
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #bfdbfe',
              }}
            >
              {isRoad
                ? '⏳ Đơn có dịch vụ/khoảng cách cần thẩm định thêm — Chờ Điều phối viên gửi báo giá.'
                : '✈️ Điều phối viên đang lên lịch chuyến bay & báo giá vé máy bay thực tế cho bạn.'}
            </span>
          )}

          {flow.isDepositSatisfied && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 13,
                  color: '#065f46',
                  fontWeight: 700,
                  backgroundColor: '#d1fae5',
                  padding: '8px 14px',
                  borderRadius: 8,
                }}
              >
                {flow.canAssignDriver
                  ? '🚛 Đã mở khóa phân công Tài xế & Phương tiện'
                  : '⏳ Đã nhận cọc 30% — Đang chờ phê duyệt & sắp xếp Tài xế'}
              </span>
              <Link
                to={`/customer/requests/${order.orderId}/payments`}
                className="button"
                style={{ fontSize: 13, textDecoration: 'none' }}
              >
                Xem lịch thanh toán (70% còn lại)
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
