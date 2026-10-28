import { OrderLifecycle } from '../../components/ui/OrderLifecycle';
import { EmptyState } from '../../components/ui/Primitives';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import { HISTORY_PAGE_SIZE } from './api';
import type { AssessmentReceipt, CaseDecision, DepositRequested, ManagerCase, OrderSnapshot } from './contracts';
import { AssignmentHistory } from './assignments';
import { assessmentKeys, useDecisionHistory, useManagerCase } from './hooks';
import { ManagerHeading } from './layout';
import { reviewStateLabels } from './pages';
import { OrderTimeline } from '../activity-operations/OrderTimeline';
import { AssignTeamModal } from './AssignTeamModal';
import { QuotationDepositTable } from './QuotationDepositTable';
import { JourneyHorseModal } from './JourneyHorseModal';
import { ManagerCommentCard } from './ManagerCommentCard';
import './assessment.css';

const outcomeLabels: Record<CaseDecision['decision'], string> = {
  APPROVED: reviewStateLabels.APPROVED,
  CHANGES_REQUESTED: reviewStateLabels.CHANGES_REQUESTED,
  REJECTED: reviewStateLabels.REJECTED,
};

export const show = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? 'Not recorded' : String(value);

export function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="details">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SnapshotView({ snapshot }: { snapshot: OrderSnapshot }) {
  const r = snapshot.request;
  const h = snapshot.horse;
  return (
    <>
      <section className="card manager-info-card">
        <h2>
          <span>📍</span> Thông tin chuyến đi (Journey)
        </h2>
        <Details
          rows={[
            ['Tuyến đường', `${show(r.originCountryCode)} → ${show(r.destinationCountryCode)}`],
            ['Điểm đón', show(r.originAddress)],
            ['Điểm giao', show(r.destinationAddress)],
            [
              'Ngày khởi hành dự kiến',
              displayDate(r.preferredDepartureAt ?? null, r.originTimezone || undefined),
            ],
            [
              'Hạn giao hàng',
              displayDate(r.deliveryDeadline ?? null, r.destinationTimezone || undefined),
            ],
            ['Linh hoạt ngày', show(r.dateFlexibilityNotes)],
            ['Loại hình nhập cảnh', show(r.importType)],
            ['Sân bay quá cảnh', r.transitAirports?.length ? r.transitAirports.join(', ') : 'Không có'],
            ['Người nhận', show(r.receiverName)],
            ['SĐT người nhận', show(r.receiverPhone)],
            ['Thẩm quyền nhận', show(r.receiverAuthority)],
            ['Sự kiện đích', show(r.eventName)],
            ['Thời gian sự kiện', displayDate(r.eventStartAt ?? null, r.eventTimezone || undefined)],
            ['Yêu cầu đặc biệt', show(r.specialNeeds)],
          ]}
        />
      </section>

      <section className="card manager-info-card">
        <h2>
          <span>🐎</span> Thông tin ngựa (Horse profile)
        </h2>
        {h ? (
          <Details
            rows={[
              ['Tên ngựa', h.name],
              ['Mã chip (Microchip)', show(h.microchipId)],
              ['Hộ chiếu (Passport)', show(h.passportNumber)],
              ['Giới tính', show(h.sexCode)],
              ['Cân nặng (kg)', show(h.weightKg)],
              ['Chiều cao (cm)', show(h.heightCm)],
              ['Bề rộng thân (cm)', show(h.bodyWidthCm)],
              ['Thời điểm đo', displayDate(h.measuredAt ?? null)],
              ['Ghi chú chăm sóc', show(h.handlingNotes)],
              ['Chế độ ăn & nước', show(h.feedWaterRequirements)],
              ['Chỉ dẫn thú y', show(h.veterinaryInstructions)],
            ]}
          />
        ) : (
          <EmptyState title="Không có thông tin ngựa trong hồ sơ này." />
        )}
      </section>


    </>
  );
}

function TeamCard({
  current,
  onOpenModal,
}: {
  current: ManagerCase;
  onOpenModal: () => void;
}) {
  const activeCoord = current.assignments.find((a) => a.role === 'COORDINATOR' && !a.endedAt);
  const activeSpec = current.assignments.find((a) => a.role === 'SPECIALIST' && !a.endedAt);
  const isSubmitted = current.orderStatus === 'SUBMITTED';

  return (
    <section className="card manager-info-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>👥</span> Nhân sự phụ trách (Case Team)
        </h2>
        <button
          type="button"
          onClick={onOpenModal}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: isSubmitted ? '#059669' : '#2563eb',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {isSubmitted ? '✅ Duyệt & Phân công' : '👥 Đổi nhân sự'}
        </button>
      </div>

      <Details
        rows={[
          [
            'Điều phối viên (Coordinator)',
            activeCoord ? (
              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                Staff ID #{activeCoord.staffId}
                {activeCoord.dueAt && <> · Hạn {displayDate(activeCoord.dueAt)}</>}
                {activeCoord.assignmentNote && (
                  <span className="muted"> · {activeCoord.assignmentNote}</span>
                )}
              </span>
            ) : (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Chưa phân công</span>
            ),
          ],
          [
            'Chuyên viên thú y (Specialist)',
            activeSpec ? (
              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                Staff ID #{activeSpec.staffId}
                {activeSpec.dueAt && <> · Hạn {displayDate(activeSpec.dueAt)}</>}
                {activeSpec.assignmentNote && (
                  <span className="muted"> · {activeSpec.assignmentNote}</span>
                )}
              </span>
            ) : (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Chưa phân công</span>
            ),
          ],
        ]}
      />
    </section>
  );
}

function DecisionHistory({ id }: { id: number }) {
  const [page, setPage] = useState(0);
  const query = useDecisionHistory(id, page);
  return (
    <section className="card manager-info-card">
      <h3>Lịch sử quyết định (Decision history)</h3>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : !query.data.length ? (
        <p>Chưa có quyết định nào được ghi nhận.</p>
      ) : (
        <div className="table-scroll" aria-busy={query.isPlaceholderData}>
          <table aria-label="Decision history, newest first">
            <thead>
              <tr>
                <th scope="col">Thời gian</th>
                <th scope="col">Phiên bản ID</th>
                <th scope="col">Quyết định</th>
                <th scope="col">Lý do</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((d) => (
                <tr key={d.decisionId}>
                  <td>{displayDate(d.decidedAt)}</td>
                  <td>{d.revisionId}</td>
                  <td>{outcomeLabels[d.decision]}</td>
                  <td>{show(d.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data && (page > 0 || query.data.length === HISTORY_PAGE_SIZE) && (
        <nav className="pagination" aria-label="Decision history pages">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Trang trước
          </button>
          <span>Trang {page + 1}</span>
          <button
            type="button"
            disabled={query.data.length < HISTORY_PAGE_SIZE || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </button>
        </nav>
      )}
    </section>
  );
}

export function ManagerCasePage() {
  const id = Number(useParams().id);
  const session = useSession()!;
  const query = useManagerCase(id);

  const [, setReceipt] = useState<AssessmentReceipt | null>(null);
  const [activeDeposit, setActiveDeposit] = useState<DepositRequested | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isJourneyModalOpen, setIsJourneyModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const valid = Number.isSafeInteger(id) && id > 0;

  const refreshAll = () =>
    queryClient.invalidateQueries({ queryKey: assessmentKeys.all(session.generation) });

  async function handleAssignDone(next: AssessmentReceipt) {
    setReceipt(next);
    setNotice(
      next.decision?.decision === 'APPROVED'
        ? 'Đã duyệt đơn và phân công nhân sự thành công!'
        : 'Đã cập nhật phân công nhân sự thành công!',
    );
    await refreshAll();
  }

  async function handleCommentDone(next: AssessmentReceipt) {
    setReceipt(next);
    await refreshAll();
  }

  function handleDepositRequested(_newVersion: string, data: DepositRequested) {
    setActiveDeposit(data);
    setNotice('Đã gửi yêu cầu đặt cọc sang cho khách hàng thành công!');
    void refreshAll();
  }

  function reload() {
    void queryClient.invalidateQueries({ queryKey: assessmentKeys.case(session.generation, id) });
  }

  if (!valid) return <Notice>Đơn hàng này không khả dụng.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        <div style={{ marginTop: 12 }}>
          <Link to="/manager/requests" className="btn-back-nav">
            <span aria-hidden="true">←</span>
            <span>Quay lại danh sách yêu cầu</span>
          </Link>
        </div>
      </ErrorNotice>
    );

  const current = query.data;
  const revision = current.revision;

  return (
    <>
      <ManagerHeading
        title={`Request ${current.orderNumber}`}
        description={
          revision
            ? `Yêu cầu vận chuyển nộp lúc ${displayDate(revision.submittedAt)} (Lần nộp #${revision.revisionNo})`
            : 'Chưa có thông tin nộp đơn'
        }
      >
        <Link to="/manager/requests" className="btn-back-nav">
          <span aria-hidden="true">←</span>
          <span>Quay lại danh sách yêu cầu</span>
        </Link>
      </ManagerHeading>

      {/* Hero Stepper: Clean Order Lifecycle - Bắt đầu trực tiếp từ Submitted cho Manager */}
      <OrderLifecycle status={current.orderStatus} forRole="MANAGER" />

      {notice && (
        <Notice>
          {notice}
        </Notice>
      )}

      {/* TÓM TẮT NHANH HÀNH TRÌNH & NGỰA + NÚT MỞ CHI TIẾT */}
      {revision && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '14px 20px',
            marginTop: 18,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Lộ trình
              </span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span>📍 {show(revision.snapshot.request.originCountryCode)}</span>
                <span style={{ color: '#94a3b8' }}>➔</span>
                <span>🏁 {show(revision.snapshot.request.destinationCountryCode)}</span>
              </div>
            </div>

            <div style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Ngựa vận chuyển
              </span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span>🐎 {revision.snapshot.horse ? revision.snapshot.horse.name : 'Chưa có hồ sơ ngựa'}</span>
                {revision.snapshot.horse?.weightKg && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>({revision.snapshot.horse.weightKg} kg)</span>
                )}
              </div>
            </div>

            <div style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Khởi hành dự kiến
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginTop: 2 }}>
                📅 {displayDate(revision.snapshot.request.preferredDepartureAt ?? null, revision.snapshot.request.originTimezone || undefined)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsJourneyModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              backgroundColor: '#1e3a8a',
              color: '#ffffff',
              border: '1.5px solid #1e3a8a',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(30, 58, 138, 0.25)',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#1d4ed8';
              e.currentTarget.style.borderColor = '#1d4ed8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#1e3a8a';
              e.currentTarget.style.borderColor = '#1e3a8a';
            }}
          >
            <span>👁️</span> Xem chi tiết hành trình & ngựa
          </button>
        </div>
      )}

      {/* KHÔNG GIAN LÀM VIỆC CHÍNH - BẢNG BÁO GIÁ LÀ TRỌNG TÂM HERO */}
      {revision ? (
        <div style={{ marginTop: 20 }}>
          {/* HERO FOCUS: BẢNG BÁO GIÁ ĐƠN HÀNG CHI TIẾT & NÚT YÊU CẦU ĐẶT CỌC */}
          <QuotationDepositTable
            orderId={current.orderId}
            orderStatus={current.orderStatus}
            recordVersion={current.recordVersion}
            snapshot={revision.snapshot}
            depositRequested={activeDeposit}
            onDepositRequested={handleDepositRequested}
          />

          {/* SECTION: PHÂN CÔNG NHÂN SỰ & (NẾU CẦN) GHI CHÚ/YÊU CẦU SỬA ĐƠN */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: ['SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED'].includes(current.orderStatus)
                ? 'repeat(auto-fit, minmax(360px, 1fr))'
                : '1fr',
              gap: 20,
              marginTop: 20,
            }}
          >
            {/* NHÂN SỰ PHỤ TRÁCH & NÚT PHÂN CÔNG / ĐỔI NHÂN SỰ */}
            <TeamCard
              current={current}
              onOpenModal={() => setIsAssignModalOpen(true)}
            />

            {/* GHI CHÚ & YÊU CẦU KHÁCH SỬA ĐƠN (CHỈ HIỆN KHI Ở BƯỚC 1 HOẶC ĐƠN BỊ TỪ CHỐI/SỬA) */}
            <ManagerCommentCard
              current={current}
              onCommented={handleCommentDone}
            />
          </div>

          {/* COLLAPSIBLE AUDIT LOGS - CHỈ HIỂN THỊ KHI CẦN TRA CỨU */}
          <details
            className="card manager-info-card"
            style={{
              cursor: 'pointer',
              backgroundColor: '#f8fafc',
              marginTop: 20,
            }}
          >
            <summary style={{ fontWeight: 700, fontSize: 14, color: '#475569' }}>
              📜 Xem lịch sử nhật ký & kiểm toán (Audit Logs)
            </summary>
            <div style={{ marginTop: 14, cursor: 'default' }}>
              <OrderTimeline orderId={current.orderId} />
              <DecisionHistory id={current.orderId} />
              <AssignmentHistory id={current.orderId} />
            </div>
          </details>
        </div>
      ) : (
        <Notice>Không có hồ sơ nộp nào cho yêu cầu này.</Notice>
      )}

      {/* POPUP MODAL CHO HÀNH TRÌNH VÀ HỒ SƠ NGỰA */}
      {revision && (
        <JourneyHorseModal
          isOpen={isJourneyModalOpen}
          onClose={() => setIsJourneyModalOpen(false)}
          snapshot={revision.snapshot}
        />
      )}

      {/* POPUP MODAL CHO PHÂN CÔNG NHÂN SỰ */}
      <AssignTeamModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        current={current}
        onAssigned={handleAssignDone}
        onReload={reload}
      />
    </>
  );
}
