import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { filesApi } from '../../shared/api/files';
import { lookupsApi } from '../../shared/api/lookups';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ErrorNotice, Loading } from '../../shared/ui/common';

/** Emblem tokens stored with the template, shown as plain symbols. */
const emblems: Record<string, string> = {
  blood: '🩸',
  passport: '📘',
  syringe: '💉',
  vaccine: '💉',
  permit: '📜',
  stamp: '🛂',
  horse: '🐎',
};
const tones = ['blue', 'green', 'gold', 'red', 'volcano', 'purple', 'cyan'];

/**
 * The standard reference layout for one paper, from the BE catalogue. It is an
 * unsigned example to take to the vet or authority, never a certificate.
 */
export function StandardFormTemplate({
  typeCode,
  onClose,
}: {
  typeCode: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const session = useSession();
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);
  const template = useQuery({
    queryKey: [...queryKeys.session(session?.generation ?? ''), 'document-template', typeCode],
    queryFn: ({ signal }) => lookupsApi.documentTemplate(typeCode, signal),
    retry: false,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  async function download(fileKey: string, name: string) {
    setDownloadError(null);
    setDownloading(true);
    try {
      const url = URL.createObjectURL(await filesApi.read(fileKey));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e);
    } finally {
      setDownloading(false);
    }
  }
  const t = template.data;
  const tone = t?.badgeColor && tones.includes(t.badgeColor) ? t.badgeColor : 'gold';
  return (
    <div className="template-backdrop" onClick={onClose}>
      <section
        className="template-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {template.isPending ? (
          <Loading />
        ) : template.error ? (
          <>
            <h2 id={titleId}>Standard form</h2>
            {template.error instanceof ApiError && template.error.status === 404 ? (
              <p>No standard form is published for this paper yet.</p>
            ) : (
              <ErrorNotice error={template.error} />
            )}
          </>
        ) : (
          <>
            <header className="template-head">
              <span className="template-emblem" aria-hidden="true">
                {emblems[t!.emblemIcon ?? ''] ?? '📄'}
              </span>
              <div>
                <small>{t!.issuingAuthority ?? 'Issuing authority'}</small>
                {t!.subAuthority && <small>{t!.subAuthority}</small>}
                <h2 id={titleId}>{t!.displayName}</h2>
              </div>
              {t!.formCode && <span className={`template-code tone-${tone}`}>{t!.formCode}</span>}
            </header>
            {/* Plain text from the catalogue; never rendered as markup. */}
            <p className="template-text">{t!.certTextTemplate ?? 'No reference text recorded.'}</p>
            <p className="template-note">
              Unsigned reference layout for this project. It is not a certificate and does not prove
              any veterinary result; the issuing authority provides the official paper.
            </p>
            <ErrorNotice error={downloadError} />
            <div className="actions template-actions">
              <button type="button" onClick={() => window.print()}>
                🖨️ Print this form
              </button>
              {t!.hasTemplateFile && t!.templateFileKey && (
                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => void download(t!.templateFileKey!, t!.typeCode)}
                >
                  {downloading ? 'Downloading…' : '⬇️ Download blank PDF'}
                </button>
              )}
            </div>
          </>
        )}
        <button type="button" className="template-close" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  );
}
