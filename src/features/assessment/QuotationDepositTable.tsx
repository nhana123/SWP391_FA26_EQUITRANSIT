import { useState, useEffect, type FormEvent } from 'react';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading } from '../../shared/ui/common';
import { assessmentApi } from './api';
import type { DepositRequested, OrderSnapshot } from './contracts';
import { useQuotations, useQuotation } from '../quotations/hooks';

export function QuotationDepositTable({
  orderId,
  orderStatus,
  recordVersion,
  snapshot,
  depositRequested,
  onDepositRequested,
}: {
  orderId: number;
  orderStatus: string;
  recordVersion: string;
  snapshot: OrderSnapshot;
  depositRequested?: DepositRequested | null;
  onDepositRequested: (newVersion: string, data: DepositRequested) => void;
}) {
  // Query formal quotations from BE if any
  const quotesQuery = useQuotations(orderId, 0, 10);
  const activeQuoteId =
    depositRequested?.quoteId ?? quotesQuery.data?.items?.[0]?.quoteId ?? null;
  const quoteDetailQuery = useQuotation(orderId, activeQuoteId ?? 0);

  const isQuoteLoading = Boolean(activeQuoteId && quoteDetailQuery.isPending);
  const formalQuote = activeQuoteId ? quoteDetailQuery.data : null;

  // Build complete itemized breakdown from customer snapshot and formal prices
  const itemizedLines = (() => {
    const isCrossBorder =
      Boolean(snapshot.request.originCountryCode && snapshot.request.destinationCountryCode) &&
      snapshot.request.originCountryCode !== snapshot.request.destinationCountryCode;

    const lines: {
      code: string;
      name: string;
      group: string;
      unit: string;
      quantity: string;
      rate: number;
      amount: number;
      note: string;
    }[] = [];

    // 1. Road transport
    const roadIntent = snapshot.services.find((s) => s.serviceCode === 'ROAD_TRANSPORT');
    const isRoadCust = roadIntent?.arrangedBy === 'CUSTOMER';
    const manualRoadAmount = formalQuote?.items?.find((i) => i.code === 'ROAD_TRANSPORT')?.amount
      ? Number(formalQuote.items.find((i) => i.code === 'ROAD_TRANSPORT')?.amount)
      : null;

    const roadAmount = isRoadCust
      ? 0
      : manualRoadAmount !== null
        ? manualRoadAmount
        : Number(snapshot.routeMatch?.totalEstimatedCost) > 0
          ? Number(snapshot.routeMatch?.totalEstimatedCost)
          : Number(snapshot.routeMatch?.estimatedRoadKm) > 0
            ? Number(snapshot.routeMatch?.estimatedRoadKm) * 2.0
            : 4500.0;

    lines.push({
      code: 'ROAD_TRANSPORT',
      name: 'Vận chuyển đường bộ (Road Transport)',
      group: 'Vận chuyển (Transportation)',
      unit: snapshot.routeMatch?.estimatedRoadKm ? `${snapshot.routeMatch.estimatedRoadKm} KM` : 'Hành trình',
      quantity: '1',
      rate: roadAmount,
      amount: roadAmount,
      note: isRoadCust
        ? 'Khách tự thuê xe riêng'
        : manualRoadAmount !== null
          ? 'Đơn giá vận chuyển đã được Manager duyệt'
          : 'Xe chuyên dụng EquiTransit vận chuyển liên vận',
    });

    // 2. Air stall
    const airIntent = snapshot.services.find((s) => s.serviceCode === 'AIR_STALL');
    if (airIntent) {
      const mult = airIntent.optionCode === 'PRIVATE' ? 3 : airIntent.optionCode === 'WIDE' ? 1.5 : 1;
      const airAmount = mult * 1500;
      lines.push({
        code: 'AIR_STALL',
        name: `Chuồng bay chuyên dụng (${airIntent.optionCode || 'STANDARD'})`,
        group: 'Chuồng & Khoang bay',
        unit: 'SLOT',
        quantity: String(mult),
        rate: 1500,
        amount: airAmount,
        note: 'Chuồng bay đạt chuẩn hiệp hội vận tải hàng không IATA',
      });
    }

    // 3. Veterinary
    const vetIntent = snapshot.services.find((s) => s.serviceCode === 'VETERINARY');
    const isVetCust = vetIntent?.arrangedBy === 'CUSTOMER';
    const vetAmount = isVetCust ? 0 : 155;
    lines.push({
      code: 'VETERINARY',
      name: 'Khám & Kiểm định thú y (Veterinary Check)',
      group: 'Thú y (Veterinary)',
      unit: 'GÓI',
      quantity: '1',
      rate: vetAmount,
      amount: vetAmount,
      note: isVetCust ? 'Khách tự sắp xếp bác sĩ' : 'Khám lâm sàng, lấy mẫu test, cấp chứng thư',
    });

    // 4. Quarantine
    const quarIntent = snapshot.services.find((s) => s.serviceCode === 'QUARANTINE');
    if (quarIntent && quarIntent.optionCode !== 'NONE') {
      const days = isCrossBorder ? 14 : 7;
      const rate = quarIntent.optionCode === 'ENHANCED' ? 75 : 50;
      const quarAmount = days * rate;
      lines.push({
        code: 'QUARANTINE',
        name: `Lưu chuồng cách ly kiểm dịch (${quarIntent.optionCode || 'STANDARD'})`,
        group: 'Kiểm dịch (Quarantine)',
        unit: 'NGÀY',
        quantity: String(days),
        rate: rate,
        amount: quarAmount,
        note: `Cách ly ${days} ngày theo quy chuẩn thú y quốc tế`,
      });
    }

    // 5. Customs
    if (isCrossBorder) {
      lines.push({
        code: 'CUSTOMS_DECLARATION',
        name: 'Thủ tục hải quan & Điều phối chứng từ xuất/nhập',
        group: 'Hải quan & Giấy phép',
        unit: 'BỘ HỒ SƠ',
        quantity: '1',
        rate: 170,
        amount: 170,
        note: 'Tờ khai hải quan 2 đầu và chứng từ vận chuyển quốc tế',
      });
    }

    // 6. Insurance
    const insIntent = snapshot.services.find((s) => s.serviceCode === 'INSURANCE');
    if (insIntent && insIntent.optionCode !== 'NONE' && insIntent.optionCode !== 'EXISTING') {
      const rate = insIntent.optionCode === 'COMBINED' ? 150 : 100;
      lines.push({
        code: 'INSURANCE',
        name: `Bảo hiểm hành trình (${insIntent.optionCode})`,
        group: 'Bảo hiểm (Insurance)',
        unit: 'HỢP ĐỒNG',
        quantity: '1',
        rate: rate,
        amount: rate,
        note: 'Bảo hiểm sinh mạng và rủi ro sức khỏe cho ngựa',
      });
    }

    // 7. Grooming
    const groomIntent = snapshot.services.find((s) => s.serviceCode === 'GROOMING');
    if (groomIntent && groomIntent.optionCode !== 'NONE') {
      const days = Number((groomIntent as Record<string, any>).requestedInputs?.requestedDays) || 2;
      lines.push({
        code: 'GROOMING',
        name: 'Nhân viên chăm sóc chuyên nghiệp (Grooming)',
        group: 'Chăm sóc ngựa',
        unit: 'NGÀY',
        quantity: String(days),
        rate: 25,
        amount: days * 25,
        note: 'Chăm sóc ăn uống, vệ sinh và dắt ngựa vận động',
      });
    }

    // 8. Boarding
    const boardIntent = snapshot.services.find((s) => s.serviceCode === 'BOARDING');
    if (boardIntent && boardIntent.optionCode !== 'NONE') {
      const nights = Number((boardIntent as Record<string, any>).requestedInputs?.requestedNights) || 1;
      lines.push({
        code: 'BOARDING',
        name: 'Lưu chuồng tạm thời (Extra Boarding)',
        group: 'Lưu chuồng',
        unit: 'ĐÊM',
        quantity: String(nights),
        rate: 40,
        amount: nights * 40,
        note: 'Chuồng nghỉ tiện nghi trước giờ khởi hành',
      });
    }

    return lines;
  })();

  // Use detailed formalQuote items if BE provided rich multiple lines, otherwise use itemizedLines
  const hasRichFormalQuote = Boolean(
    formalQuote &&
      formalQuote.items.length > 1 &&
      !formalQuote.items.every((i) => i.description.includes('manual price')),
  );

  const displayLines = hasRichFormalQuote
    ? formalQuote!.items.map((line) => ({
        code: line.code,
        name: line.description,
        group: line.costGroup,
        unit: line.unit,
        quantity: line.quantity ?? '1',
        rate: Number(line.unitRate) || 0,
        amount: Number(line.amount) || 0,
        note: `Mã dịch vụ: ${line.code}`,
      }))
    : itemizedLines;

  const computedTotal = displayLines.reduce((acc, cur) => acc + cur.amount, 0);

  const initialTotal =
    depositRequested?.totalAmount ??
    (hasRichFormalQuote && formalQuote?.quote?.total ? Number(formalQuote.quote.total) : computedTotal);
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

  useEffect(() => {
    if (depositRequested) {
      setTotal(depositRequested.totalAmount);
      setDeposit(depositRequested.depositAmount);
      if (depositRequested.note) setNote(depositRequested.note);
    } else if (hasRichFormalQuote && formalQuote?.quote?.total) {
      const qTotal = Number(formalQuote.quote.total);
      setTotal(qTotal);
      setDeposit(Math.round(qTotal * 0.3 * 100) / 100);
    } else if (computedTotal > 0) {
      setTotal(computedTotal);
      setDeposit(Math.round(computedTotal * 0.3 * 100) / 100);
    }
  }, [depositRequested, formalQuote, computedTotal, hasRichFormalQuote]);

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

      setSuccessMsg('Đã truyền thông tin đơn báo giá và yêu cầu đặt cọc qua cho khách hàng thành công!');
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
  const balance = Math.max(0, total - deposit);

  return (
    <section
      className="card manager-info-card"
      style={{
        borderRadius: 16,
        border: depositRequested ? '2px solid #10b981' : '2px solid #3b82f6',
        backgroundColor: '#ffffff',
        padding: '24px 26px',
        marginBottom: 24,
        boxShadow: '0 4px 18px rgba(15, 23, 42, 0.06)',
      }}
    >
      {/* HEADER CỦA BẢNG BÁO GIÁ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: 14,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📋</span> Bảng báo giá chi tiết & Đặt cọc (Quotation Breakdown)
          </h2>
          <small style={{ color: '#64748b' }}>
            {hasRichFormalQuote
              ? `Hiển thị bảng giá chính thức #${formalQuote!.quote.quoteNumber} (Phiên bản ${formalQuote!.quote.version})`
              : 'Dự toán chi tiết tất cả các dịch vụ khách hàng đã chọn và biểu phí vận chuyển'}
          </small>
        </div>

        {depositRequested ? (
          <span
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: depositRequested.isPaid ? '#dcfce7' : '#fef3c7',
              color: depositRequested.isPaid ? '#15803d' : '#b45309',
            }}
          >
            {depositRequested.isPaid ? '✅ Khách đã hoàn tất cọc' : '⏳ Đã gửi yêu cầu cọc cho khách'}
          </span>
        ) : (
          <span
            style={{
              padding: '6px 14px',
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
            marginBottom: 18,
            fontWeight: 600,
          }}
        >
          {successMsg}
        </div>
      )}

      {error ? <ErrorNotice error={error} /> : null}

      {/* BẢNG CHI TIẾT TỪNG DÒNG DỊCH VỤ - Y HỆT BẢNG BÁO GIÁ CỦA CUSTOMER */}
      <div className="table-scroll" style={{ marginBottom: 20 }}>
        {isQuoteLoading ? (
          <Loading />
        ) : (
          <table aria-label="Bảng báo giá dịch vụ chi tiết">
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th scope="col" style={{ padding: '12px 14px' }}>Dịch vụ & Mô tả</th>
                <th scope="col" style={{ padding: '12px 14px' }}>Nhóm chi phí</th>
                <th scope="col" style={{ padding: '12px 14px' }}>Đơn vị</th>
                <th scope="col" style={{ padding: '12px 14px', textAlign: 'center' }}>Số lượng</th>
                <th scope="col" style={{ padding: '12px 14px', textAlign: 'right' }}>Đơn giá (USD)</th>
                <th scope="col" style={{ padding: '12px 14px', textAlign: 'right' }}>Thành tiền (USD)</th>
              </tr>
            </thead>
            <tbody>
              {displayLines.map((line, index) => (
                <tr key={`${line.code}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <strong style={{ color: '#0f172a' }}>{line.name}</strong>
                    <small style={{ display: 'block', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      {line.note}
                    </small>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#475569' }}>{line.group}</td>
                  <td style={{ padding: '12px 14px', color: '#475569' }}>{line.unit}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>{line.quantity}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    ${line.rate.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                    ${line.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* KHỐI TỔNG KẾT TÀI CHÍNH & TIỀN CỌC */}
      <div
        style={{
          borderRadius: 12,
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          padding: '18px 22px',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div>
            <span style={{ fontSize: 13, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Tổng chi phí toàn bộ chuyến đi:
            </span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
              ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </span>
          </div>

          <div>
            <span style={{ fontSize: 13, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Tiền đặt cọc cần thu ({Math.round((deposit / total) * 100)}%):
            </span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>
              ${deposit.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </span>
          </div>

          <div>
            <span style={{ fontSize: 13, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Số tiền còn lại sau khi giao ngựa:
            </span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>
              ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </span>
          </div>
        </div>
      </div>

      {/* THÔNG BÁO KHI ĐÃ GỬI YÊU CẦU CỌC */}
      {depositRequested ? (
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 12,
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong style={{ color: '#065f46', fontSize: 15 }}>
                Đơn báo giá và yêu cầu đặt cọc đã được truyền qua cho Customer:
              </strong>
              <div style={{ fontSize: 13, color: '#047857', marginTop: 4 }}>
                • Số tiền cọc yêu cầu: <strong>${depositRequested.depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>
                {' · '}Thời gian gửi: {displayDate(depositRequested.requestedAt ?? null)}
              </div>
              {depositRequested.note && (
                <div style={{ fontSize: 13, color: '#065f46', fontStyle: 'italic', marginTop: 4 }}>
                  Ghi chú cho khách: "{depositRequested.note}"
                </div>
              )}
            </div>

            <span
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                backgroundColor: depositRequested.isPaid ? '#10b981' : '#f59e0b',
                color: '#ffffff',
              }}
            >
              {depositRequested.isPaid ? 'ĐÃ THANH TOÁN TIỀN CỌC' : 'ĐANG CHỜ KHÁCH THANH TOÁN'}
            </span>
          </div>
        </div>
      ) : (
        /* FORM GỬI YÊU CẦU ĐẶT CỌC (CHO PHÉP CHỈNH SỬA / XÁC NHẬN) */
        <form onSubmit={handleSendDeposit}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#334155' }}>
              Điều chỉnh nhanh tỷ lệ đặt cọc:
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[25, 30, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyPercent(pct)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    backgroundColor: Math.round((deposit / total) * 100) === pct ? '#2563eb' : '#f1f5f9',
                    color: Math.round((deposit / total) * 100) === pct ? '#ffffff' : '#334155',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="deposit-note-input"
              style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
            >
              Lời nhắn / Ghi chú gửi kèm cho khách hàng:
            </label>
            <input
              id="deposit-note-input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú về việc đặt cọc và chuẩn bị chuyến đi..."
              maxLength={1000}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting || !isEligible}
              style={{
                padding: '12px 28px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: isEligible ? '#2563eb' : '#94a3b8',
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 700,
                cursor: isEligible ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: isEligible ? '0 4px 14px rgba(37, 99, 235, 0.3)' : 'none',
              }}
            >
              {submitting ? 'Đang truyền yêu cầu cọc...' : '💳 Gửi yêu cầu đặt cọc cho khách hàng'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
