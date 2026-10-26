import { useState, type FormEvent } from 'react';
import { Icon } from '../../components/ui/Icons';
import { filesApi, type StoredFile } from '../../shared/api/files';
import { complianceApi } from './api';
import { phaseLabels, type Phase } from './contracts';
import { type Pinned } from './hooks';

/**
 * Specialist requests a new document template from the Customer:
 * Specialist enters the document name, uploads a sample blank PDF template,
 * and writes optional guidance for the customer.
 */
export function RequestFormTemplateCard({
  orderId,
  pinned,
  phase,
  onSuccess,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [templateFile, setTemplateFile] = useState<StoredFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFileChoose(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Vui lòng chọn file mẫu định dạng PDF (application/pdf).');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const stored = await filesApi.upload(file, 'documents');
      setTemplateFile(stored);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải file PDF lên.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError('Vui lòng nhập tên mẫu đơn hoặc giấy tờ yêu cầu.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const rawCode = name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 36);
      const docTypeCode = rawCode.length >= 2 ? rawCode : `DOC_${Date.now().toString(36).toUpperCase()}`;
      const ruleCode = `RUL_${docTypeCode.slice(0, 16)}_${Date.now().toString(36).toUpperCase()}`;

      let fullInstructions = instructions.trim();
      if (templateFile) {
        fullInstructions += ` [MẪU_ĐÍNH_KÈM: ${templateFile.fileName} | KEY:${templateFile.fileKey}]`;
      }

      const receipt = await complianceApi.rule(orderId, {
        phase,
        ruleCode,
        documentType: docTypeCode,
        displayName: name,
        transitCountryCode: null,
        sourceUrl: 'https://equitransit.com/compliance/templates',
        effectiveFrom: new Date().toISOString(),
        effectiveTo: null,
        instructions: fullInstructions || null,
        authorityRequired: false,
        recordVersion: pinned.version ?? '',
        operationId: crypto.randomUUID(),
      });

      if (templateFile) {
        try {
          await complianceApi.attachTemplateFile(docTypeCode, templateFile.fileKey);
        } catch {
          // Dynamic document type catalog row is handled in instructions
        }
      }

      setNotice(`Đã gửi yêu cầu mẫu đơn "${name}" tới khách hàng thành công!`);
      setDisplayName('');
      setInstructions('');
      setTemplateFile(null);
      setOpen(false);
      await pinned.written(receipt);
      await pinned.refreshAll();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi gửi yêu cầu mẫu đơn.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {notice && (
        <div className="notice" style={{ marginBottom: 12 }}>
          {notice}
        </div>
      )}
      {!open ? (
        <button
          type="button"
          className="specialist-template-trigger-btn"
          onClick={() => {
            setOpen(true);
            setNotice(null);
            setError(null);
          }}
        >
          <Icon name="plus" size={16} />
          <span>+ Yêu cầu mẫu đơn mới tới Khách hàng</span>
        </button>
      ) : (
        <form className="specialist-template-card" onSubmit={handleSubmit}>
          <h3>
            <Icon name="file" size={18} />
            <span>Yêu cầu biểu mẫu đơn mới ({phaseLabels[phase]})</span>
          </h3>
          <p className="muted" style={{ margin: '0 0 14px 0', fontSize: 13 }}>
            Chuyên viên nhập tên giấy tờ cần khách cung cấp, đính kèm file PDF mẫu trắng (nếu có) và hướng dẫn chuẩn bị.
          </p>

          {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Tên mẫu đơn / Giấy tờ yêu cầu <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Phiếu xét nghiệm Coggins / EIA, Bản cam kết kiểm dịch..."
                value={displayName}
                maxLength={200}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                File PDF mẫu đơn trắng (Đính kèm cho khách tải về xem & chuẩn bị)
              </label>
              {!templateFile ? (
                <div className="specialist-upload-box">
                  <input
                    type="file"
                    accept="application/pdf"
                    id="template-pdf-input"
                    style={{ display: 'none' }}
                    onChange={(e) => void handleFileChoose(e.target.files?.[0])}
                  />
                  <label htmlFor="template-pdf-input" style={{ cursor: 'pointer', display: 'block' }}>
                    <span style={{ fontSize: 24, display: 'block', marginBottom: 4 }}>📎</span>
                    <strong>{uploading ? 'Đang tải file PDF lên server...' : 'Chọn hoặc kéo thả file PDF mẫu đơn tại đây'}</strong>
                    <small style={{ display: 'block', color: '#64748b', marginTop: 2 }}>
                      Chỉ nhận định dạng PDF, tối đa 10 MB
                    </small>
                  </label>
                </div>
              ) : (
                <div className="specialist-upload-success">
                  <span>📄</span>
                  <div style={{ flex: 1 }}>
                    <strong>{templateFile.fileName}</strong>
                    <small style={{ display: 'block', color: '#15803d' }}>
                      {Math.max(1, Math.round(templateFile.fileSizeBytes / 1024))} KB · Đã tải lên sẵn sàng đính kèm
                    </small>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={() => setTemplateFile(null)}
                  >
                    Thay file khác
                  </button>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Lời dặn dò / Hướng dẫn khách hàng chuẩn bị (Tùy chọn)
              </label>
              <textarea
                placeholder="Ví dụ: Vui lòng tải mẫu đính kèm, in ra giấy A4 mang tới cơ quan thú y được chỉ định để lấy mẫu và đóng dấu trước ngày xuất phát..."
                value={instructions}
                maxLength={1500}
                rows={3}
                onChange={(e) => setInstructions(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                type="button"
                className="button secondary"
                disabled={submitting || uploading}
                onClick={() => setOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={submitting || uploading || !displayName.trim()}
              >
                {submitting ? 'Đang gửi...' : '🚀 Gửi yêu cầu tới Khách hàng'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
