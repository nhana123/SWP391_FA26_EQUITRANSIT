import { useState } from 'react';
import { displayDate } from '../../shared/lib/validation';
import type { Overview, ProofReceipt, Receipt } from './contracts';
import { PaymentActionForm, type ActionSpec } from './ActionForm';
import { PaymentLedger } from './Ledger';
import { reportAction, refundAction } from './customer-actions';
import type { EvidenceOption } from './Proof';

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
  const [panel, setPanel] = useState<'report' | 'refund' | null>(null);
  const [notice, setNotice] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
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

  function handleCopy(text: string, key: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
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

  const pendingReports = data.reports.filter((r) => r.status === 'SUBMITTED');
  const transferCode = `EQUITRANSIT ${orderId} COC`;

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
              <strong>Biên lai chuyển khoản đang được kế toán kiểm tra:</strong> Quý khách đã gửi
              thông tin chuyển khoản. Hệ thống đang tiến hành đối soát với ngân hàng Vietcombank. Quý
              khách không cần gửi trùng lặp.
            </p>
          ) : (
            <p>
              <strong>Yêu cầu thanh toán tiền cọc 30%:</strong> Quý khách vui lòng chuyển khoản đúng
              số tiền <strong>{remainingDue} {currency}</strong> với nội dung chuyển khoản được cấp
              dưới đây để hoàn tất thủ tục đặt chỗ.
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

        {/* Official Bank Account Details */}
        <div className="bank-account-box">
          <div className="bank-box-header">
            <div>
              <span className="bank-tag">Tài khoản Ngân hàng Doanh nghiệp Chính thức</span>
              <h4>Thông tin Chuyển khoản Vietcombank</h4>
            </div>
            <span className="bank-verified-badge">✔ Verified Treasury</span>
          </div>

          <div className="bank-grid">
            <div className="bank-row">
              <span className="bank-col-label">Ngân hàng thụ hưởng:</span>
              <div className="bank-col-value">
                <strong>Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)</strong>
                <span className="bank-sub">Chi nhánh TP. Hồ Chí Minh - Swift Code: BFTVVNVX</span>
              </div>
            </div>

            <div className="bank-row highlight-box">
              <span className="bank-col-label">Số tài khoản:</span>
              <div className="bank-col-value with-action">
                <span className="bank-acc-num">1048 8992 2888</span>
                <button
                  type="button"
                  className="button copy-btn"
                  onClick={() => handleCopy('104889922888', 'acc')}
                >
                  {copiedKey === 'acc' ? '✓ Đã chép' : '📋 Sao chép STK'}
                </button>
              </div>
            </div>

            <div className="bank-row">
              <span className="bank-col-label">Chủ tài khoản:</span>
              <div className="bank-col-value">
                <strong className="beneficiary-name">CÔNG TY CỔ PHẦN EQUITRANSIT VIỆT NAM</strong>
              </div>
            </div>

            <div className="bank-row highlight-box">
              <span className="bank-col-label">Nội dung chuyển khoản:</span>
              <div className="bank-col-value with-action">
                <code className="transfer-syntax">{transferCode}</code>
                <button
                  type="button"
                  className="button copy-btn"
                  onClick={() => handleCopy(transferCode, 'syntax')}
                >
                  {copiedKey === 'syntax' ? '✓ Đã chép' : '📋 Sao chép Cú pháp'}
                </button>
              </div>
              <small className="syntax-hint">
                * Vui lòng nhập chính xác cú pháp <strong>{transferCode}</strong> để bộ phận kế toán
                tự động nhận diện đơn hàng của quý khách.
              </small>
            </div>
          </div>

          {/* Quick Steps Guide */}
          <div className="transfer-quick-guide">
            <div className="guide-step">
              <span className="guide-num">1</span>
              <div>
                <strong>Chuyển khoản</strong>
                <p>Mở app ngân hàng, quét QR hoặc chuyển đúng STK và cú pháp trên.</p>
              </div>
            </div>
            <div className="guide-step">
              <span className="guide-num">2</span>
              <div>
                <strong>Lưu biên lai</strong>
                <p>Chụp ảnh màn hình giao dịch hoặc file UNC ngân hàng (PNG, JPG).</p>
              </div>
            </div>
            <div className="guide-step">
              <span className="guide-num">3</span>
              <div>
                <strong>Nộp chứng từ</strong>
                <p>Bấm nút <strong>Report a bank transfer</strong> dưới đây để tải ảnh lên.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="payment-action-toolbar">
          <div className="toolbar-desc">
            <h4>Hành động thanh toán</h4>
            <p>
              Sau khi chuyển khoản, quý khách hãy nộp biên lai để hệ thống ghi nhận. Quý khách cũng
              có thể yêu cầu hoàn trả nếu hủy dịch vụ theo điều khoản.
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
