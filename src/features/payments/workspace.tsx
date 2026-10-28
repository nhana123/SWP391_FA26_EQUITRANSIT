import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { displayDate } from '../../shared/lib/validation';
import type { Overview, ProofReceipt, Receipt } from './contracts';
import { PaymentActionForm, type ActionSpec } from './ActionForm';
import { PaymentLedger } from './Ledger';
import { reportAction, refundAction } from './customer-actions';
import type { EvidenceOption } from './Proof';
import { vnpayApi } from './vnpay-api';
import { ordersApi } from '../transport-orders/api';
import { useSession } from '../../shared/api/session';
import { queryKeys } from '../../shared/api/query';

export type WorkspaceProps = {
  orderId: number;
  data: Overview;
  readError: unknown;
  paging: boolean;
  backTo: string;
  page: number;
  onPage: (page: number) => void;
  refresh: () => Promise<Overview>;
};
export function useEvidence(data: Overview) {
  const [uploaded, setUploaded] = useState<EvidenceOption[]>([]);
  const options = [
    ...new Map(
      [
        ...data.reports.map((report) => ({
          fileKey: report.proofFileKey,
          label: `Evidence from report ${report.reportId}`,
        })),
        ...uploaded,
      ].map((option) => [option.fileKey, option]),
    ).values(),
  ];
  function add(proof: ProofReceipt) {
    setUploaded((items) =>
      items.some((item) => item.fileKey === proof.fileKey)
        ? items
        : [
            ...items,
            {
              fileKey: proof.fileKey,
              label: `Evidence uploaded in this session (${items.length + 1})`,
            },
          ],
    );
  }
  return { options, add };
}
export function LedgerPager({
  data,
  page,
  onPage,
  locked,
}: {
  data: Overview;
  page: number;
  onPage: (page: number) => void;
  locked: boolean;
}) {
  const mayHaveNext = [data.obligations, data.reports, data.allocations, data.refunds].some(
    (rows) => rows.length >= data.size,
  );
  return (
    <nav className="pagination" aria-label="Ledger pages">
      <button type="button" disabled={locked || page === 0} onClick={() => onPage(page - 1)}>
        Previous ledger page
      </button>
      <span>Ledger page {page + 1}</span>
      <button type="button" disabled={locked || !mayHaveNext} onClick={() => onPage(page + 1)}>
        Next ledger page
      </button>
    </nav>
  );
}
export function CustomerPayments(props: WorkspaceProps) {
  const { data, orderId, readError, paging, backTo, refresh } = props;
  const [params] = useSearchParams();
  const [panel, setPanel] = useState<'report' | 'refund' | null>(null);
  const [notice, setNotice] = useState('');
  const [vnpayLoading, setVnpayLoading] = useState(false);
  const [vnpayError, setVnpayError] = useState<string | null>(null);
  const [vnpayUrl, setVnpayUrl] = useState<string | null>(null);

  const session = useSession();
  const orderQuery = useQuery({
    queryKey: session ? queryKeys.order(session.generation, orderId) : ['order', orderId],
    queryFn: ({ signal }) => ordersApi.get(orderId, signal),
    enabled: !!orderId,
    retry: false,
  });
  const order = orderQuery.data;

  const vnpStatus = params.get('vnp_status');
  const vnpResponseCode = params.get('vnp_ResponseCode');

  useEffect(() => {
    if (vnpStatus === 'success' || vnpResponseCode === '00') {
      void refresh();
    }
  }, [vnpStatus, vnpResponseCode, refresh]);

  const evidence = useEvidence(data);
  const spec: ActionSpec | null =
    panel === 'report'
      ? reportAction(orderId, data)
      : panel === 'refund'
        ? refundAction(orderId, data.allocations, data.refunds)
        : null;
  const locked = !!readError || paging || panel !== null;

  function completed(receipt: Receipt) {
    setPanel(null);
    setNotice(
      `Action recorded, reference ${receipt.entityId}. The current payment ledger is shown below.`,
    );
  }

  const depositObligation =
    data.obligations.find((o) => o.paymentStage.toUpperCase().includes('DEPOSIT')) ||
    data.obligations[0];
  const totalDue = depositObligation ? depositObligation.amountDue : '0.00';
  const totalPaid = depositObligation ? depositObligation.paidAmount : '0.00';
  const currency = depositObligation ? depositObligation.currency : 'USD';
  const dueNum = Number(totalDue);
  const paidNum = Number(totalPaid);
  const isSettled =
    !Number.isNaN(dueNum) && !Number.isNaN(paidNum) && dueNum > 0 && paidNum >= dueNum;
  const remainingDue =
    !Number.isNaN(dueNum) && !Number.isNaN(paidNum)
      ? Math.max(0, dueNum - paidNum).toFixed(2)
      : totalDue;

  const depositAmountNum = Number(remainingDue !== '0.00' ? remainingDue : totalDue);
  const amountVnd = Math.round(depositAmountNum * 25400);

  const pendingReports = data.reports.filter((r) => r.status === 'SUBMITTED');

  async function handleVNPayCheckout() {
    if (isSettled || vnpayLoading) return;
    setVnpayLoading(true);
    setVnpayError(null);
    try {
      const res = await vnpayApi.checkout(orderId, depositAmountNum, 'DEPOSIT');
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        setVnpayError('Không nhận được liên kết thanh toán từ VNPAY.');
        setVnpayLoading(false);
      }
    } catch (err) {
      setVnpayError(
        err instanceof Error ? err.message : 'Lỗi kết nối cổng thanh toán VNPAY. Vui lòng thử lại.',
      );
      setVnpayLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!isSettled && depositAmountNum > 0) {
      vnpayApi
        .checkout(orderId, depositAmountNum, 'DEPOSIT')
        .then((res) => {
          if (!cancelled && res.paymentUrl) {
            setVnpayUrl(res.paymentUrl);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [orderId, depositAmountNum, isSettled]);

  return (
    <>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}

      {/* Modern Deposit Portal Card */}
      <section className="card customer-deposit-portal" aria-label="Deposit payment portal">
        <div className="deposit-portal-header">
          <div className="portal-title-block">
            <span className="portal-kicker">Cổng Thanh toán Đặt cọc / Deposit Portal</span>
            <h3>Thanh toán Tiền cọc Vận chuyển Đơn hàng #{orderId}</h3>
          </div>
          <div className="portal-status-pill">
            {isSettled ? (
              <span className="status-settled">✔ Đã hoàn tất đặt cọc</span>
            ) : pendingReports.length > 0 ? (
              <span className="status-reviewing">
                ⏳ Đang đối soát ({pendingReports.length} biên lai)
              </span>
            ) : (
              <span className="status-awaiting">⚠️ Chờ thanh toán cọc 30%</span>
            )}
          </div>
        </div>

        {/* VNPAY Callback Status Alert */}
        {vnpStatus === 'success' || vnpResponseCode === '00' ? (
          <div className="vnpay-alert vnpay-alert-success" role="status">
            <div className="vnpay-alert-icon">🎉</div>
            <div className="vnpay-alert-body">
              <strong>Thanh toán trực tuyến VNPAY thành công!</strong>
              <p>Hệ thống đã ghi nhận khoản tiền cọc 30% cho đơn hàng #{orderId}. Đơn hàng hiện đang sẵn sàng để quản lý phân công điều phối viên và chuyên viên thủ tục.</p>
            </div>
          </div>
        ) : vnpStatus === 'failed' || (vnpResponseCode && vnpResponseCode !== '00') ? (
          <div className="vnpay-alert vnpay-alert-error" role="alert">
            <div className="vnpay-alert-icon">⚠️</div>
            <div className="vnpay-alert-body">
              <strong>Giao dịch qua VNPAY không thành công hoặc đã bị hủy (Mã phản hồi: {vnpResponseCode || 'Error'}).</strong>
              <p>Quý khách có thể thử thanh toán lại bằng VNPAY hoặc chuyển khoản qua tài khoản ngân hàng chính thức bên dưới.</p>
            </div>
          </div>
        ) : null}

        {/* State Banner */}
        <div
          className={`deposit-status-callout ${
            isSettled ? 'success' : pendingReports.length > 0 ? 'info' : 'warning'
          }`}
        >
          {isSettled ? (
            <p>
              <strong>Tiền cọc đã được ghi nhận thành công!</strong> Đơn hàng #{orderId} đang được
              kích hoạt và điều phối trạm (Hub Coordinator). Các đợt thanh toán tiếp theo sẽ theo
              đúng tiến độ lộ trình.
            </p>
          ) : pendingReports.length > 0 ? (
            <p>
              <strong>Biên lai thanh toán đang được xử lý:</strong> Quý khách đã gửi
              thông tin. Hệ thống đang tiến hành đối soát. Quý
              khách không cần gửi trùng lặp.
            </p>
          ) : (
            <p>
              <strong>Yêu cầu thanh toán tiền cọc 30%:</strong> Quý khách vui lòng thanh toán
              khoản cọc <strong>{remainingDue} {currency}</strong> qua cổng thanh toán VNPAY dưới đây để hoàn tất thủ tục đặt chỗ.
            </p>
          )}
        </div>

        {/* Financial Stat Cards */}
        <div className="deposit-stats-grid">
          <div className="stat-card">
            <span className="stat-label">Tiền cọc quy định (30%)</span>
            <span className="stat-val primary">
              {totalDue} {currency}
            </span>
            <small className="stat-hint">{depositObligation?.paymentStage || 'DEPOSIT'}</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Số tiền đã ghi nhận</span>
            <span className="stat-val success">
              {totalPaid} {currency}
            </span>
            <small className="stat-hint">Xác nhận trên ledger</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Còn thiếu cần thanh toán</span>
            <span className="stat-val highlight">
              {remainingDue} {currency}
            </span>
            <small className="stat-hint">Số dư cần chuyển</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Hạn thanh toán cọc</span>
            <span className="stat-val date">
              {depositObligation?.dueAt
                ? displayDate(depositObligation.dueAt)
                : 'Theo thỏa thuận báo giá'}
            </span>
            <small className="stat-hint">Hạn chót giữ chỗ</small>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4. KẾT QUẢ TÍNH TOÁN HÀNH TRÌNH & BÁO GIÁ DỰ KIẾN (TICKET) */}
        {/* ============================================================ */}
        <div className="quotation-ticket-card" data-testid="payment-quotation-ticket">
          {/* Ticket Header */}
          <div className="ticket-header">
            <div className="ticket-header-main">
              <span className="ticket-mode-badge">
                {order?.draft.route?.transportMode === 'ROAD' ? '🚛' : '✈️'}
              </span>
              <div>
                <div className="ticket-kicker">
                  {order?.draft.route?.transportMode === 'ROAD'
                    ? 'ĐOÀN XE ĐỆM KHÍ NÉN LIÊN VẬN · BÁO GIÁ CHÍNH THỨC'
                    : 'CHUYÊN CƠ QUỐC TẾ IATA LAR · BÁO GIÁ CHÍNH THỨC'}
                </div>
                <h4 className="ticket-title">
                  Đơn Báo giá Vận chuyển &amp; Đặt cọc Đơn hàng #{order?.orderNumber || orderId}
                </h4>
              </div>
            </div>

            <div className="ticket-header-status">
              <span className="ticket-pill-hours">
                ⏱️ Tuyến vận chuyển quốc tế
              </span>
              <span className={`ticket-pill-status ${isSettled ? 'success' : 'pending'}`}>
                {isSettled ? '✓ Đã hoàn tất đặt cọc 30%' : '⏳ Chờ thanh toán cọc 30%'}
              </span>
            </div>
          </div>

          {/* Ticket Body */}
          <div className="ticket-body">
            <div className="ticket-route-meta">
              <div className="ticket-meta-col">
                <span className="meta-label">Ngựa vận chuyển:</span>
                <strong className="meta-val">
                  🐴 {order?.draft.horseId ? `Mã ngựa #${order.draft.horseId}` : 'Ngựa thuần chủng đăng ký'}
                </strong>
                <span className="meta-sub">
                  Đã kiểm tra hồ sơ lâm sàng &amp; kiểm dịch
                </span>
              </div>

              <div className="ticket-meta-col">
                <span className="meta-label">Tuyến đường vận chuyển:</span>
                <strong className="meta-val">
                  📍 {order?.draft.route?.originCity || order?.draft.originCountryCode || 'Điểm xuất phát'} ➔{' '}
                  {order?.draft.route?.destinationCity || order?.draft.destinationCountryCode || 'Điểm đến'}
                </strong>
                <span className="meta-sub">
                  Phương thức: {order?.draft.route?.transportMode === 'ROAD' ? 'Đoàn xe đệm khí nén liên vận' : 'Chuyên cơ quốc tế IATA LAR'}
                </span>
              </div>

              <div className="ticket-meta-col">
                <span className="meta-label">Tiêu chuẩn chăm sóc:</span>
                <strong className="meta-val">
                  🛡️ Tiêu chuẩn FEI &amp; Thú y Quốc tế
                </strong>
                <span className="meta-sub">Giám sát sức khỏe và dinh dưỡng 24/7</span>
              </div>
            </div>

            {/* 3-Leg Journey Flow */}
            <div className="ticket-journey-flow">
              <div className="journey-leg-card">
                <div className="journey-leg-top">
                  <span className="leg-label">Chặng 1 · Đón tận nơi</span>
                  <span className="leg-tag free">Đã bao gồm</span>
                </div>
                <div className="leg-km">Đón tại chuồng xuất phát</div>
                <div className="leg-sub">Trang trại ➔ Trụ sở EquiTransit</div>
              </div>

              <div className="journey-leg-card main-leg">
                <div className="journey-leg-top">
                  <span className="leg-label">Chặng 2 · Tuyến Quốc tế</span>
                  <span className="leg-tag primary">
                    {order?.draft.route?.transportMode === 'ROAD' ? 'Đường bộ' : 'Đường bay'}
                  </span>
                </div>
                <div className="leg-km">Vận chuyển chuyên dụng</div>
                <div className="leg-sub">Trụ sở xuất phát ➔ Trụ sở tiếp nhận</div>
              </div>

              <div className="journey-leg-card">
                <div className="journey-leg-top">
                  <span className="leg-label">Chặng 3 · Giao đích</span>
                  <span className="leg-tag free">Đã bao gồm</span>
                </div>
                <div className="leg-km">Bàn giao tại chuồng đích</div>
                <div className="leg-sub">Trụ sở đích ➔ Điểm giao an toàn</div>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="ticket-pricing-grid">
              <div className="pricing-meta">
                <div className="pricing-line">
                  <span>Tổng giá trị đơn báo giá trọn gói:</span>
                  <strong>
                    ${(depositObligation ? (Number(depositObligation.amountDue) / 0.3) : (depositAmountNum / 0.3)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                  </strong>
                </div>
                <div className="pricing-line highlight">
                  <span className="deposit-title">Khoản cọc giữ chỗ quy định (30%):</span>
                  <span className="deposit-usd">${depositAmountNum.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currency}</span>
                </div>
                <div className="pricing-line vnd">
                  <span>Quy đổi tương đương (Tỷ giá 25.400 VND/USD):</span>
                  <strong className="deposit-vnd">{amountVnd.toLocaleString('vi-VN')} VND</strong>
                </div>
              </div>
            </div>

            {/* VNPAY QR Code & Scan-to-Pay Payment Section */}
            {!isSettled ? (
              <div className="ticket-vnpay-payment-wrap">
                <div className="qr-payment-block">
                  <div className="qr-card">
                    {vnpayUrl ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(vnpayUrl)}`}
                        alt="Mã QR thanh toán cọc VNPAY"
                        className="vnpay-qr-code-img"
                        width={180}
                        height={180}
                      />
                    ) : (
                      <div className="qr-loading-box">
                        <span className="qr-loader-spin">⏳</span>
                        <span>Đang khởi tạo mã QR VNPAY...</span>
                      </div>
                    )}
                    <span className="qr-scan-badge">VNPAY-QR</span>
                  </div>

                  <div className="qr-guide-col">
                    <div className="qr-guide-header">
                      <span className="vnpay-pill">Cổng thanh toán VNPAY</span>
                      <h5>Quét mã QR để chuyển tiền cọc tức thì</h5>
                    </div>
                    <p className="qr-guide-text">
                      Quý khách mở <strong>ứng dụng Ngân hàng</strong> (Vietcombank, Techcombank, MBBank, BIDV, Agribank, ACB...) hoặc <strong>Ví VNPAY</strong>, chọn tính năng <strong>Quét mã QR</strong> để thanh toán số tiền <strong>{amountVnd.toLocaleString('vi-VN')} đ</strong>.
                    </p>

                    <div className="qr-actions-row">
                      <button
                        type="button"
                        className="button primary vnpay-cta-btn"
                        onClick={handleVNPayCheckout}
                        disabled={vnpayLoading}
                      >
                        {vnpayLoading ? (
                          <span>⏳ Đang kết nối tới VNPAY...</span>
                        ) : (
                          <span>💳 Hoặc bấm vào đây để thanh toán qua VNPAY ({amountVnd.toLocaleString('vi-VN')} đ) →</span>
                        )}
                      </button>
                    </div>

                    {vnpayError && (
                      <div className="vnpay-inline-error">
                        <span>⚠️ {vnpayError}</span>
                      </div>
                    )}

                    <div className="vnpay-security-note">
                      <span>🔒 Xác thực giao dịch tự động trong 3 giây · Bảo mật tiêu chuẩn quốc tế PCI-DSS</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ticket-settled-celebration">
                <span className="celebration-icon">🎉</span>
                <div>
                  <strong>Tiền cọc 30% đã được ghi nhận thành công!</strong>
                  <p>Hệ thống đã nhận đủ số tiền cọc cho đơn hàng #{orderId}. Chuyên viên và Điều phối viên đang tiến hành chuẩn bị lộ trình.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="payment-action-toolbar">
          <div className="toolbar-desc">
            <h4>Hành động bổ sung / Quản lý tài chính</h4>
            <p>
              Đối soát chứng từ thanh toán hoặc yêu cầu hoàn trả cọc nếu hủy dịch vụ theo điều khoản hợp đồng.
            </p>
          </div>
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={locked || !data.obligations.some((o) => o.currency === 'USD')}
              onClick={() => setPanel('report')}
            >
              Report a bank transfer
            </button>
            <button
              type="button"
              disabled={locked || !data.allocations.length}
              onClick={() => setPanel('refund')}
            >
              Request a refund
            </button>
          </div>
        </div>
      </section>

      {spec && (
        <PaymentActionForm
          key={spec.key}
          spec={spec}
          context={{
            orderId,
            overview: data,
            readError,
            backTo,
            refresh,
            evidence: evidence.options,
            onUploaded: evidence.add,
            onDone: completed,
            onCancel: () => setPanel(null),
          }}
        />
      )}
      <PaymentLedger data={data} orderId={orderId} />
      <LedgerPager {...props} locked={locked} />
    </>
  );
}
