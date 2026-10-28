import { useState } from 'react';
import { ErrorNotice } from '../../shared/ui/common';
import { assessmentApi } from './api';
import type { AssessmentReceipt, ManagerCase } from './contracts';

export function ManagerCommentCard({
  current,
  onCommented,
}: {
  current: ManagerCase;
  onCommented: (receipt: AssessmentReceipt) => Promise<void>;
}) {
  const isChangesRequested = current.orderStatus === 'CHANGES_REQUESTED';
  const isRejected = current.orderStatus === 'REJECTED';
  const isSubmitted = current.orderStatus === 'SUBMITTED';

  // Chỉ cho phép nhập yêu cầu khi:
  // 1. Ở bước 1 (SUBMITTED) - khi manager xem xét từ chối đơn hoặc yêu cầu sửa
  // 2. Khi xem đơn đang ở trạng thái đã yêu cầu sửa (CHANGES_REQUESTED) hoặc từ chối (REJECTED) để cập nhật yêu cầu gửi lại khách
  const canEdit = isSubmitted || isChangesRequested || isRejected;

  const existingReason = current.decision?.reason ?? '';
  const [comment, setComment] = useState(existingReason);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSendComment(decisionType: 'CHANGES_REQUESTED' | 'REJECTED') {
    if (!comment.trim()) {
      setError(new Error('Vui lòng nhập nội dung yêu cầu / lý do trước khi gửi.'));
      return;
    }

    if (!current.revision) {
      setError(new Error('Không có hồ sơ yêu cầu nộp.'));
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const receipt = await assessmentApi.decide(current.orderId, {
        revisionId: current.revision.revisionId,
        recordVersion: current.recordVersion,
        operationId: crypto.randomUUID(),
        decision: decisionType,
        reason: comment.trim(),
        specialistId: null,
        coordinatorId: null,
        dueAt: null,
        assignmentNote: null,
      });

      await onCommented(receipt);
      setSuccess(
        decisionType === 'CHANGES_REQUESTED'
          ? 'Đã gửi yêu cầu chỉnh sửa cho khách hàng thành công. Sau khi khách sửa xong, đơn sẽ tự động về trạng thái Chờ duyệt (Bước 1).'
          : 'Đã từ chối đơn hàng kèm lý do thành công.',
      );
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // TRƯỜNG HỢP: ĐƠN ĐÃ ĐƯỢC DUYỆT (APPROVED, IN_PREPARATION, CONFIRMED, IN_TRANSIT, DELIVERED, CLOSED)
  // Xóa bỏ hoàn toàn, không hiển thị card này trên màn hình nữa!
  if (!canEdit) {
    return null;
  }

  // TRƯỜNG HỢP 2: ĐANG Ở BƯỚC 1 (SUBMITTED) HOẶC ĐANG XEM ĐƠN ĐÃ TỪ CHỐI / YÊU CẦU SỬA (CHANGES_REQUESTED, REJECTED)
  return (
    <section
      className="card manager-info-card"
      style={{
        borderRadius: 16,
        border: isChangesRequested ? '2px solid #f59e0b' : isRejected ? '2px solid #ef4444' : '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: '22px 24px',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💬</span> {isChangesRequested ? 'Yêu cầu chỉnh sửa đơn (Đã gửi khách)' : 'Yêu cầu chỉnh sửa & Từ chối đơn'}
        </h2>
        <small style={{ color: '#64748b' }}>
          {isChangesRequested
            ? 'Đơn đang chờ khách hàng cập nhật lại thông tin theo yêu cầu.'
            : isRejected
              ? 'Đơn đã bị từ chối. Bạn có thể cập nhật lại lý do / yêu cầu để khách sửa.'
              : 'Chỉ nhập mục này nếu bạn cần từ chối đơn hoặc yêu cầu khách hàng bổ sung, sửa lại đơn.'}
        </small>
      </div>

      {isChangesRequested && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            color: '#92400e',
            fontSize: 14,
          }}
        >
          <strong>ℹ️ Quy trình sửa đơn:</strong> Khách hàng đã nhận được yêu cầu này. Sau khi khách hàng chỉnh sửa và bấm nộp lại đơn, hệ thống sẽ <strong>tự động đưa đơn về lại Bước 1 (Submitted)</strong> để Quản lý duyệt lại.
        </div>
      )}

      {success && (
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
          {success}
        </div>
      )}

      {error ? <ErrorNotice error={error} /> : null}

      <div style={{ marginBottom: 14 }}>
        <label
          htmlFor="manager-comment-input"
          style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
        >
          {isChangesRequested
            ? 'Nội dung yêu cầu khách sửa (Có thể chỉnh sửa bổ sung):'
            : 'Lý do từ chối / Nội dung yêu cầu khách sửa lại:'}
        </label>
        <textarea
          id="manager-comment-input"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ví dụ: Vui lòng bổ sung giấy kiểm định thú y số 3 hoặc chọn lại ngày nhận ngựa lùi lại 2 ngày..."
          maxLength={1000}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <small style={{ color: '#94a3b8' }}>{comment.length} / 1000 ký tự</small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        {isSubmitted && (
          <button
            type="button"
            onClick={() => handleSendComment('REJECTED')}
            disabled={submitting || !comment.trim()}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid #fca5a5',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              fontWeight: 600,
              cursor: submitting || !comment.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            ❌ Từ chối đơn
          </button>
        )}

        <button
          type="button"
          onClick={() => handleSendComment('CHANGES_REQUESTED')}
          disabled={submitting || !comment.trim()}
          style={{
            padding: '10px 22px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: '#d97706',
            color: '#ffffff',
            fontWeight: 600,
            cursor: submitting || !comment.trim() ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {submitting
            ? 'Đang gửi...'
            : isChangesRequested
              ? '📝 Cập nhật & Gửi lại yêu cầu'
              : '↩️ Gửi yêu cầu khách sửa lại đơn'}
        </button>
      </div>
    </section>
  );
}
