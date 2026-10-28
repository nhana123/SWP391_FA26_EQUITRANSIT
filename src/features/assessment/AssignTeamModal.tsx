import { useState, type FormEvent } from 'react';
import { optional, type FieldErrors } from '../../shared/lib/validation';
import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { ErrorNotice, Loading } from '../../shared/ui/common';
import { assessmentApi } from './api';
import type { AssessmentReceipt, ManagerCase } from './contracts';
import { dueAtError, MAX_TEXT } from './decision';
import { useStaffDirectory } from './hooks';

export function AssignTeamModal({
  isOpen,
  onClose,
  current,
  onAssigned,
  onReload,
}: {
  isOpen: boolean;
  onClose: () => void;
  current: ManagerCase;
  onAssigned: (receipt: AssessmentReceipt) => Promise<void>;
  onReload: () => void;
}) {
  const activeCoord = current.assignments.find((a) => a.role === 'COORDINATOR' && !a.endedAt);
  const activeSpec = current.assignments.find((a) => a.role === 'SPECIALIST' && !a.endedAt);

  const [coordId, setCoordId] = useState<number | ''>(activeCoord?.staffId ?? '');
  const [specId, setSpecId] = useState<number | ''>(activeSpec?.staffId ?? '');
  const [dueAt, setDueAt] = useState(activeCoord?.dueAt ?? activeSpec?.dueAt ?? '');
  const [note, setNote] = useState(activeCoord?.assignmentNote ?? activeSpec?.assignmentNote ?? '');
  const [reason, setReason] = useState(
    current.orderStatus === 'APPROVED' ? 'Phân công / điều chỉnh nhân sự phụ trách' : '',
  );

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const coordQuery = useStaffDirectory('COORDINATOR', 0);
  const specQuery = useStaffDirectory('SPECIALIST', 0);

  if (!isOpen) return null;

  const isSubmitted = current.orderStatus === 'SUBMITTED';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: FieldErrors = {};

    if (!coordId) nextErrors.coordId = 'Vui lòng chọn Điều phối viên (Coordinator).';
    if (!specId) nextErrors.specId = 'Vui lòng chọn Chuyên viên thú y (Specialist).';

    const dueErr = dueAtError(dueAt);
    if (dueErr) nextErrors.dueAt = dueErr;

    if (note.trim().length > MAX_TEXT) {
      nextErrors.note = `Ghi chú tối đa ${MAX_TEXT} ký tự.`;
    }

    if (!isSubmitted && (activeCoord || activeSpec) && !reason.trim()) {
      nextErrors.reason = 'Vui lòng nhập lý do điều chỉnh nhân sự.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (isSubmitted) {
        if (!current.revision) throw new Error('Không có hồ sơ yêu cầu nộp.');
        const receipt = await assessmentApi.decide(current.orderId, {
          revisionId: current.revision.revisionId,
          recordVersion: current.recordVersion,
          operationId: crypto.randomUUID(),
          decision: 'APPROVED',
          reason: null,
          coordinatorId: Number(coordId),
          specialistId: Number(specId),
          dueAt: optional(dueAt),
          assignmentNote: optional(note),
        });
        await onAssigned(receipt);
        onClose();
      } else if (!activeCoord && !activeSpec) {
        // Initial post-deposit team assignment via dedicated /assign-team endpoint
        const receipt = await assessmentApi.assignTeam(current.orderId, {
          recordVersion: current.recordVersion,
          operationId: crypto.randomUUID(),
          specialistId: Number(specId),
          coordinatorId: Number(coordId),
          dueAt: optional(dueAt),
          assignmentNote: optional(note),
        });
        await onAssigned(receipt);
        onClose();
      } else {
        // Order is APPROVED with existing team, update assignments
        let lastReceipt: AssessmentReceipt | null = null;
        if (!activeCoord || activeCoord.staffId !== Number(coordId)) {
          lastReceipt = await assessmentApi.assign(current.orderId, 'COORDINATOR', {
            recordVersion: current.recordVersion,
            operationId: crypto.randomUUID(),
            staffId: Number(coordId),
            reason: reason.trim(),
            dueAt: optional(dueAt),
            assignmentNote: optional(note),
          });
        }
        if (!activeSpec || activeSpec.staffId !== Number(specId)) {
          lastReceipt = await assessmentApi.assign(current.orderId, 'SPECIALIST', {
            recordVersion: lastReceipt?.recordVersion ?? current.recordVersion,
            operationId: crypto.randomUUID(),
            staffId: Number(specId),
            reason: reason.trim(),
            dueAt: optional(dueAt),
            assignmentNote: optional(note),
          });
        }
        if (lastReceipt) {
          await onAssigned(lastReceipt);
        } else {
          onReload();
        }
        onClose();
      }
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-team-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxWidth: 580,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #f8fafc, #ffffff)',
          }}
        >
          <div>
            <h2 id="assign-team-title" style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
              👥 {isSubmitted ? 'Duyệt đơn & Phân công nhân sự' : 'Phân công / Thay đổi nhân sự'}
            </h2>
            <small style={{ color: '#64748b' }}>
              Chỉ định Coordinator và Specialist phụ trách đơn {current.orderNumber}
            </small>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: '#64748b',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {submitError ? <ErrorNotice error={submitError} /> : null}

          {/* Coordinator picker */}
          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="select-coord"
              style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
            >
              🚚 Điều phối viên (Coordinator) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            {coordQuery.isPending ? (
              <Loading />
            ) : (
              <select
                id="select-coord"
                value={coordId}
                onChange={(e) => setCoordId(e.target.value ? Number(e.target.value) : '')}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: errors.coordId ? '1px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: 14,
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">-- Chọn Điều phối viên --</option>
                {coordQuery.data?.items.map((s) => (
                  <option key={s.staffId} value={s.staffId}>
                    {s.fullName} (Mã: #{s.staffId}) — Đang xử lý: {s.activeCases} ca
                  </option>
                ))}
              </select>
            )}
            {errors.coordId && (
              <small style={{ color: '#ef4444', display: 'block', marginTop: 4 }}>
                {errors.coordId}
              </small>
            )}
          </div>

          {/* Specialist picker */}
          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="select-spec"
              style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
            >
              🩺 Chuyên viên thú y & pháp lý (Specialist) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            {specQuery.isPending ? (
              <Loading />
            ) : (
              <select
                id="select-spec"
                value={specId}
                onChange={(e) => setSpecId(e.target.value ? Number(e.target.value) : '')}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: errors.specId ? '1px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: 14,
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">-- Chọn Chuyên viên thú y --</option>
                {specQuery.data?.items.map((s) => (
                  <option key={s.staffId} value={s.staffId}>
                    {s.fullName} (Mã: #{s.staffId}) — Đang xử lý: {s.activeCases} ca
                  </option>
                ))}
              </select>
            )}
            {errors.specId && (
              <small style={{ color: '#ef4444', display: 'block', marginTop: 4 }}>
                {errors.specId}
              </small>
            )}
          </div>

          {/* Deadline */}
          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="assign-due-at"
              style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
            >
              📅 Hạn xử lý hoàn thành (Deadline)
            </label>
            <DateTimeInput
              id="assign-due-at"
              value={dueAt}
              onChange={setDueAt}
              aria-invalid={Boolean(errors.dueAt)}
            />
            {errors.dueAt && (
              <small style={{ color: '#ef4444', display: 'block', marginTop: 4 }}>
                {errors.dueAt}
              </small>
            )}
          </div>

          {/* Note */}
          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="assign-note"
              style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
            >
              📝 Ghi chú phân công
            </label>
            <input
              id="assign-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Ưu tiên chuẩn bị chuồng cách ly kiểm dịch sớm..."
              maxLength={MAX_TEXT}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: errors.note ? '1px solid #ef4444' : '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
            {errors.note && (
              <small style={{ color: '#ef4444', display: 'block', marginTop: 4 }}>
                {errors.note}
              </small>
            )}
          </div>

          {/* Audit reason if approved */}
          {!isSubmitted && (
            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="assign-reason"
                style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
              >
                📋 Lý do điều chỉnh nhân sự <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="assign-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Lý do thay đổi phân công..."
                maxLength={MAX_TEXT}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: errors.reason ? '1px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: 14,
                }}
              />
              {errors.reason && (
                <small style={{ color: '#ef4444', display: 'block', marginTop: 4 }}>
                  {errors.reason}
                </small>
              )}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {submitting ? 'Đang lưu...' : isSubmitted ? '✅ Xác nhận Duyệt & Phân công' : '💾 Lưu thay đổi nhân sự'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
