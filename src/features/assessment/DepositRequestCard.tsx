import { useState, type FormEvent } from 'react';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice } from '../../shared/ui/common';
import { assessmentApi } from './api';
import type { DepositRequested } from './contracts';

export function DepositRequestCard({
  orderId,
  orderStatus,
  recordVersion,
  snapshotCost,
  depositRequested,
  onDepositRequested,
}: {
  orderId: number;
  orderStatus: string;
  recordVersion: string;
  snapshotCost?: number | null;
  depositRequested?: DepositRequested | null;
  onDepositRequested: (newVersion: string, data: DepositRequested) => void;
}) {
  const initialTotal = depositRequested?.totalAmount ?? (snapshotCost && snapshotCost > 0 ? snapshotCost : 6500);
  const initialDeposit =
    depositRequested?.depositAmount ?? Math.round(initialTotal * 0.3 * 100) / 100;

  const [total, setTotal] = useState<number>(initialTotal);
  const [deposit, setDeposit] = useState<number>(initialDeposit);
  const [note, setNote] = useState<string>(
    depositRequested?.note ??
      'Vui lòng thanh toán tiền đặt cọc để EquiTransit bắt đầu triển khai thủ tục kiểm dịch và kế hoạch di chuyển.',
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync state if depositRequested or snapshotCost changes across renders
  const syncKey = `${depositRequested?.requestedAt ?? ''}_${depositRequested?.totalAmount ?? ''}_${snapshotCost ?? ''}`;
  const [prevSyncKey, setPrevSyncKey] = useState<string>(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    if (depositRequested) {
      setTotal(depositRequested.totalAmount);
      setDeposit(depositRequested.depositAmount);
      if (depositRequested.note) setNote(depositRequested.note);
    } else if (snapshotCost && snapshotCost > 0) {
      setTotal(snapshotCost);
      setDeposit(Math.round(snapshotCost * 0.3 * 100) / 100);
    }
  }

  function handleTotalChange(val: number) {
    setTotal(val);
    setDeposit(Math.round(val * 0.3 * 100) / 100);
  }

  function applyPercent(pct: number) {
    setDeposit(Math.round(total * (pct / 100) * 100) / 100);
  }

  async function handleSendDeposit(e: FormEvent) {
    e.preventDefault();
    if (total <= 0 || deposit <= 0) {
      setError(new Error('Tổng tiền và tiền đặt cọc phải lớn hơn 0.'));
      return;
    }
    if (deposit > total) {
      setError(new Error('Số tiền đặt cọc không được vượt quá tổng đơn giá.'));
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const receipt = await assessmentApi.requestDeposit(orderId, {
        totalAmount: Number(total.toFixed(2)),
        depositAmount: Number(deposit.toFixed(2)),
        currency: 'USD',
        note: note.trim() || null,
        recordVersion,
      });

      setSuccessMsg('Đã truyền thông tin yêu cầu đặt cọc qua cho khách hàng thành công!');
      if (receipt.depositRequested) {
        onDepositRequested(receipt.recordVersion, receipt.depositRequested);
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const isEligible = ['SUBMITTED', 'APPROVED'].includes(orderStatus);

  return (
    <section
      className="card manager-info-card"
      style={{
        borderRadius: 16,
        border: depositRequested ? '2px solid #10b981' : '2px solid #3b82f6',
        backgroundColor: '#ffffff',
        padding: '22px 24px',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
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
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 17, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💰</span> Đơn giá & Yêu cầu đặt cọc
        </h2>
        {depositRequested ? (
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: depositRequested.isPaid ? '#dcfce7' : '#fef3c7',
              color: depositRequested.isPaid ? '#15803d' : '#b45309',
            }}
          >
            {depositRequested.isPaid ? '✅ Đã hoàn tất cọc' : '⏳ Chờ khách hàng thanh toán cọc'}
          </span>
        ) : (
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
            }}
          >
            Chưa gửi yêu cầu cọc
          </span>
        )}
      </div>

      {successMsg && (
        <div
          role="status"
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontWeight: 600,
          }}
        >
          {successMsg}
        </div>
      )}

      {error ? <ErrorNotice error={error} /> : null}

      {/* When deposit is already requested */}
      {depositRequested && (
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 16,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div>
              <small style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>
                Tổng đơn giá dịch vụ:
              </small>
              <strong style={{ fontSize: 20, color: '#0f172a' }}>
                ${depositRequested.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
              </strong>
            </div>
            <div>
              <small style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>
                Số tiền đặt cọc yêu cầu:
              </small>
              <strong style={{ fontSize: 20, color: '#2563eb' }}>
                ${depositRequested.depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
              </strong>
              <small style={{ color: '#64748b', marginLeft: 6 }}>
                ({Math.round((depositRequested.depositAmount / depositRequested.totalAmount) * 100)}%)
              </small>
            </div>
            <div>
              <small style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>
                Thời gian gửi yêu cầu:
              </small>
              <span style={{ fontSize: 14, color: '#334155' }}>
                {displayDate(depositRequested.requestedAt ?? null)}
              </span>
            </div>
          </div>

          {depositRequested.note && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
              <small style={{ color: '#64748b' }}>Ghi chú gửi kèm:</small>
              <p style={{ margin: '4px 0 0', fontStyle: 'italic', color: '#475569', fontSize: 13 }}>
                "{depositRequested.note}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Deposit request form (shown if not requested yet or if eligible to re-issue) */}
      {!depositRequested && (
        <form onSubmit={handleSendDeposit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 16,
            }}
          >
            {/* Total estimated cost */}
            <div>
              <label
                htmlFor="input-total-amount"
                style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
              >
                Tổng đơn giá ước tính (USD) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="input-total-amount"
                type="number"
                step="0.01"
                min="1"
                value={total}
                onChange={(e) => handleTotalChange(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              />
              <small style={{ color: '#64748b', display: 'block', marginTop: 4 }}>
                {snapshotCost && snapshotCost > 0
                  ? 'Đã tự động liên kết cước tuyến đường từ hệ thống'
                  : 'Đơn giá tổng cộng cho hành trình và các dịch vụ'}
              </small>
            </div>

            {/* Deposit amount */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label htmlFor="input-deposit-amount" style={{ fontWeight: 600, fontSize: 14 }}>
                  Số tiền đặt cọc cần thu (USD) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[25, 30, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => applyPercent(pct)}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f1f5f9',
                        color: '#334155',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              <input
                id="input-deposit-amount"
                type="number"
                step="0.01"
                min="1"
                max={total}
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#2563eb',
                }}
              />
              <small style={{ color: '#64748b', display: 'block', marginTop: 4 }}>
                Hệ thống tự động tính 30% mặc định (bạn có thể bấm chọn tỷ lệ khác)
              </small>
            </div>
          </div>

          {/* Note to customer */}
          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="input-deposit-note"
              style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
            >
              Ghi chú gửi kèm cho khách hàng
            </label>
            <input
              id="input-deposit-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lời nhắn cho khách hàng về khoản thanh toán cọc..."
              maxLength={1000}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
          </div>

          {/* Send deposit button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting || !isEligible}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: isEligible ? '#2563eb' : '#94a3b8',
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 700,
                cursor: isEligible ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: isEligible ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
              }}
            >
              {submitting ? 'Đang gửi yêu cầu cọc...' : '💳 Gửi yêu cầu đặt cọc cho khách hàng'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
