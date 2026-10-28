import { displayDate } from '../../shared/lib/validation';
import { EmptyState } from '../../components/ui/Primitives';
import type { OrderSnapshot } from './contracts';

const show = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? 'Not recorded' : String(value);

export function JourneyHorseModal({
  isOpen,
  onClose,
  snapshot,
}: {
  isOpen: boolean;
  onClose: () => void;
  snapshot: OrderSnapshot;
}) {
  if (!isOpen) return null;

  const r = snapshot.request;
  const h = snapshot.horse;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="journey-horse-modal-title"
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
          maxWidth: 780,
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #f8fafc, #ffffff)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <div>
            <h2 id="journey-horse-modal-title" style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
              📍 Chi tiết Hành trình & Hồ sơ Ngựa
            </h2>
            <small style={{ color: '#64748b' }}>
              {show(r.originCountryCode)} ➔ {show(r.destinationCountryCode)} · Ngựa: {h?.name ?? 'Chưa đặt tên'}
            </small>
          </div>
          <button
            type="button"
            onClick={onClose}
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

        <div style={{ padding: '24px' }}>
          {/* SECTION 1: JOURNEY */}
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📍</span> Thông tin hành trình di chuyển (Journey Details)
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 14,
                backgroundColor: '#f8fafc',
                borderRadius: 12,
                padding: '16px 20px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Tuyến đường:</span>
                <strong style={{ fontSize: 15, color: '#0f172a' }}>{show(r.originCountryCode)} ➔ {show(r.destinationCountryCode)}</strong>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Hình thức nhập cảnh:</span>
                <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{show(r.importType)}</span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Địa chỉ nhận (Pickup):</span>
                <span style={{ fontSize: 14, color: '#334155' }}>{show(r.originAddress)}</span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Địa chỉ giao (Delivery):</span>
                <span style={{ fontSize: 14, color: '#334155' }}>{show(r.destinationAddress)}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Ngày khởi hành dự kiến:</span>
                <span style={{ fontSize: 14, color: '#0f172a' }}>{displayDate(r.preferredDepartureAt ?? null, r.originTimezone || undefined)}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Hạn giao hàng:</span>
                <span style={{ fontSize: 14, color: '#0f172a' }}>{displayDate(r.deliveryDeadline ?? null, r.destinationTimezone || undefined)}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Sân bay quá cảnh:</span>
                <span style={{ fontSize: 14, color: '#334155' }}>{r.transitAirports?.length ? r.transitAirports.join(', ') : 'Không có'}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Người nhận (Consignee):</span>
                <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{show(r.receiverName)} (SĐT: {show(r.receiverPhone)})</span>
              </div>
              {r.specialNeeds && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Yêu cầu đặc biệt:</span>
                  <span style={{ fontSize: 14, color: '#d97706', fontWeight: 600 }}>{show(r.specialNeeds)}</span>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 2: HORSE PROFILE */}
          <section>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🐎</span> Hồ sơ thông tin ngựa (Horse Profile)
            </h3>
            {h ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 14,
                  backgroundColor: '#f8fafc',
                  borderRadius: 12,
                  padding: '16px 20px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Tên ngựa:</span>
                  <strong style={{ fontSize: 15, color: '#0f172a' }}>{h.name}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Mã Microchip:</span>
                  <span style={{ fontSize: 14, color: '#334155', fontFamily: 'monospace' }}>{show(h.microchipId)}</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Hộ chiếu (Passport):</span>
                  <span style={{ fontSize: 14, color: '#334155', fontFamily: 'monospace' }}>{show(h.passportNumber)}</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Giới tính:</span>
                  <span style={{ fontSize: 14, color: '#334155' }}>{show(h.sexCode)}</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Cân nặng:</span>
                  <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{show(h.weightKg)} kg</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Chiều cao:</span>
                  <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{show(h.heightCm)} cm</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Bề rộng thân:</span>
                  <span style={{ fontSize: 14, color: '#0f172a' }}>{show(h.bodyWidthCm)} cm</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Thời điểm đo:</span>
                  <span style={{ fontSize: 14, color: '#64748b' }}>{displayDate(h.measuredAt ?? null)}</span>
                </div>
                {h.handlingNotes && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Ghi chú dắt / chăm sóc:</span>
                    <span style={{ fontSize: 14, color: '#475569' }}>{show(h.handlingNotes)}</span>
                  </div>
                )}
                {h.feedWaterRequirements && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Chế độ ăn & nước:</span>
                    <span style={{ fontSize: 14, color: '#475569' }}>{show(h.feedWaterRequirements)}</span>
                  </div>
                )}
                {h.veterinaryInstructions && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Chỉ dẫn thú y:</span>
                    <span style={{ fontSize: 14, color: '#475569' }}>{show(h.veterinaryInstructions)}</span>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="Không có thông tin ngựa trong bản nộp này." />
            )}
          </section>
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
