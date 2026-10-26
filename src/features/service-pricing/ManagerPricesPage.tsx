import { StatusBadge } from '../../components/ui/StatusBadge';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { ManagerHeading } from '../assessment/layout';
import { tariffApi } from './api';
import { pricingKeys } from './keys';
import { PriceForm, type PriceTarget } from './PriceForm';
export { validUnitPrice } from './PriceForm';
import {
  modeLabels,
  productLabels,
  unitLabel,
  type ServiceProduct,
  type ServiceRate,
  type Tariff,
} from './contracts';
import './pricing.css';

export function schemaPending(error: unknown) {
  return error instanceof ApiError && error.status === 503;
}

function DeploymentNotice() {
  return (
    <Notice>
      Price management is not deployed on this server yet (database migration 006 is pending). Ask
      the project owner to deploy it; prices cannot be edited until then.
    </Notice>
  );
}

/** "ACTIVE" alone is not "in effect": read the actual dates. */
export function effectLabel(
  t: Pick<Tariff, 'status' | 'effectiveFrom' | 'effectiveTo'>,
  now = Date.now(),
) {
  if (t.status === 'INACTIVE') return 'Inactive';
  if (Date.parse(t.effectiveFrom) > now) return 'Scheduled';
  if (t.effectiveTo !== null && Date.parse(t.effectiveTo) <= now) return 'Ended';
  return 'In effect';
}

function rateText(r: ServiceRate) {
  if (r.pricingMode === 'INCLUDED') return 'Included';
  return r.unitRate === null ? 'No current price' : `${r.unitRate} ${r.currency}`;
}

const productIcons: Record<ServiceProduct, string> = {
  ROAD_TRANSPORT: '🚚',
  AIRFARE: '✈️',
  AIR_STALL: '📦',
  BASIC_CARE: '🐴',
  ENHANCED_CARE: '⭐',
  GROOMING: '🧼',
  BOARDING: '🏠',
  VETERINARY_EXAM: '🩺',
  VETERINARY_TEST: '🧪',
  VETERINARY_VACCINE: '💉',
  VETERINARY_CERTIFICATE: '📜',
  QUARANTINE_STANDARD: '🛡️',
  QUARANTINE_ENHANCED: '🏰',
  INSURANCE_MORTALITY: '📄',
  INSURANCE_COMBINED: '📑',
  DOCUMENT_COORDINATION: '🗂️',
  DOCUMENT_REVIEW: '🔍',
  AIRPORT_HANDLING: '🛫',
  TERMINAL_HANDLING: '🏢',
  CUSTOMS_DECLARATION: '🛂',
  GOVERNMENT_DUTY: '🏛️',
  WAITING: '⏳',
  ESCORT: '🧑‍✈️',
};

const categoryFilters = [
  { id: 'ALL', label: '🌟 Tất cả (All)' },
  { id: 'TRANSPORT', label: '🚚 Vận chuyển & Chuồng' },
  { id: 'CARE', label: '🐴 Chăm sóc ngựa' },
  { id: 'HEALTH', label: '🩺 Thú y & Kiểm dịch' },
  { id: 'COMPLIANCE', label: '📋 Thủ tục & Phí' },
] as const;

type CategoryId = (typeof categoryFilters)[number]['id'];

export function ManagerPricesPage() {
  const session = useSession()!;
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  const [target, setTarget] = useState<PriceTarget | null>(null);
  const [denied, setDenied] = useState<unknown>(null);
  const [receipt, setReceipt] = useState<Tariff | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const products = useQuery({
    queryKey: pricingKeys.products(session.generation),
    queryFn: ({ signal }) => tariffApi.products(signal),
    enabled: session.role === 'MANAGER',
    retry: false,
  });
  const history = useQuery({
    queryKey: pricingKeys.history(session.generation, page),
    queryFn: ({ signal }) => tariffApi.list(page, signal),
    placeholderData: keepPreviousData,
    enabled: session.role === 'MANAGER',
    retry: false,
  });

  async function published(next: Tariff) {
    setTarget(null);
    setReceipt(next);
    // The receipt may be an older replay: always re-read current versions.
    await queryClient.invalidateQueries({ queryKey: pricingKeys.all(session.generation) });
  }
  function open(next: PriceTarget) {
    setReceipt(null);
    setTarget(next);
  }
  if (session.role !== 'MANAGER')
    return <Notice>Only an active Manager can manage service prices.</Notice>;
  const accessError = [denied, products.error, history.error].find(
    (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
  );
  if (accessError) return <ErrorNotice error={accessError} />;
  const catalog = products.data?.find((p) => p.product === target?.product);

  const allProducts = products.data ?? [];
  const publishedCount = allProducts.filter((p) => p.unitRate !== null).length;
  const missingCount = allProducts.filter(
    (p) => p.pricingMode !== 'INCLUDED' && p.unitRate === null,
  ).length;
  const includedCount = allProducts.filter((p) => p.pricingMode === 'INCLUDED').length;

  const filteredProducts = allProducts.filter((r) => {
    if (
      selectedCategory === 'TRANSPORT' &&
      r.uiSection !== 'TRANSPORTATION' &&
      r.uiSection !== 'AIR_STALL'
    )
      return false;
    if (selectedCategory === 'CARE' && r.uiSection !== 'HORSE_CARE') return false;
    if (
      selectedCategory === 'HEALTH' &&
      r.uiSection !== 'VETERINARY' &&
      r.uiSection !== 'QUARANTINE'
    )
      return false;
    if (
      selectedCategory === 'COMPLIANCE' &&
      r.uiSection !== 'INSURANCE' &&
      r.uiSection !== 'ADDITIONAL_CHARGES'
    )
      return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (productLabels[r.product] ?? '').toLowerCase();
      const code = r.product.toLowerCase();
      return name.includes(q) || code.includes(q);
    }
    return true;
  });

  return (
    <>
      <ManagerHeading
        title="Service Prices"
        description="Bảng đơn giá niêm yết áp dụng khi khách hàng đặt chuyến. Mỗi lần thay đổi giá sẽ ban hành một phiên bản (Version) mới mà không ảnh hưởng báo giá cũ."
      />

      {/* Top Metric Overview */}
      <div className="pricing-kpi-grid">
        <div className="pricing-kpi-card all">
          <div className="pricing-kpi-icon">📦</div>
          <div className="pricing-kpi-body">
            <span className="pricing-kpi-val">{allProducts.length}</span>
            <span className="pricing-kpi-label">Tổng gói dịch vụ</span>
          </div>
        </div>
        <div className="pricing-kpi-card published">
          <div className="pricing-kpi-icon">🟢</div>
          <div className="pricing-kpi-body">
            <span className="pricing-kpi-val">{publishedCount}</span>
            <span className="pricing-kpi-label">Đã niêm yết giá</span>
          </div>
        </div>
        <div className="pricing-kpi-card missing">
          <div className="pricing-kpi-icon">⚠️</div>
          <div className="pricing-kpi-body">
            <span className="pricing-kpi-val">{missingCount}</span>
            <span className="pricing-kpi-label">Chưa có giá áp dụng</span>
          </div>
        </div>
        <div className="pricing-kpi-card included">
          <div className="pricing-kpi-icon">🎁</div>
          <div className="pricing-kpi-body">
            <span className="pricing-kpi-val">{includedCount}</span>
            <span className="pricing-kpi-label">Bao gồm trọn gói</span>
          </div>
        </div>
      </div>

      {receipt && (
        <Notice>
          Published {receipt.product ? productLabels[receipt.product] : 'price'} version{' '}
          {receipt.version}: {receipt.unitPrice} {receipt.currency}, in effect from{' '}
          {displayDate(receipt.effectiveFrom)}. Existing quotes are not changed.
        </Notice>
      )}

      {target && catalog && (
        <PriceForm
          key={JSON.stringify(target)}
          target={target}
          catalog={catalog}
          readError={products.error || history.error}
          onDenied={setDenied}
          onReloadRead={async () => {
            await Promise.all([
              products.refetch({ throwOnError: true }),
              history.refetch({ throwOnError: true }),
            ]);
          }}
          onDone={published}
          onCancel={() => setTarget(null)}
        />
      )}

      {/* Main Pricing Table Card */}
      <section className="card" aria-labelledby="catalog-heading">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <h2 id="catalog-heading" style={{ margin: 0 }}>
            Bảng giá niêm yết hiện hành
          </h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            Hiển thị {filteredProducts.length}/{allProducts.length} dịch vụ
          </span>
        </div>

        {/* Toolbar: Search & Category Filter */}
        <div className="pricing-toolbar">
          <div className="pricing-search-box">
            <span className="pricing-search-icon">🔍</span>
            <input
              type="search"
              placeholder="Tìm theo tên dịch vụ (VD: Grooming, Vaccine...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="pricing-category-tabs">
            {categoryFilters.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`pricing-cat-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {products.isPending ? (
          <Loading />
        ) : schemaPending(products.error) ? (
          <DeploymentNotice />
        ) : products.error ? (
          <ErrorNotice error={products.error}>
            <button type="button" onClick={() => void products.refetch()}>
              Try again
            </button>
          </ErrorNotice>
        ) : (
          <div className="table-scroll">
            <table aria-label="Service products">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Pricing</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Current price</th>
                  <th scope="col">Version</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((r) => {
                  const icon = productIcons[r.product] ?? '📦';
                  const isIncluded = r.pricingMode === 'INCLUDED';
                  const isMissing = !isIncluded && r.unitRate === null;
                  return (
                    <tr key={r.product}>
                      <td>
                        <div className="pricing-product-cell">
                          <span className="pricing-product-icon">{icon}</span>
                          <div className="pricing-product-info">
                            <strong>{productLabels[r.product]}</strong>
                            <span className="pricing-product-code">{r.product}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`pricing-mode-badge ${r.pricingMode.toLowerCase()}`}>
                          {modeLabels[r.pricingMode]}
                        </span>
                      </td>
                      <td>{unitLabel(r.unit)}</td>
                      <td>
                        <div className="pricing-price-box">
                          <span
                            className={`pricing-price-val ${
                              isIncluded ? 'included' : isMissing ? 'missing' : ''
                            }`}
                          >
                            {rateText(r)}
                          </span>
                          {!isIncluded && r.unitRate !== null && (
                            <span className="pricing-unit-sub">{unitLabel(r.unit)}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="pricing-version-pill">
                          {r.tariffVersion ? `v${r.tariffVersion}` : '—'}
                        </span>
                      </td>
                      <td>
                        {isIncluded ? (
                          <span className="muted">Not chargeable</span>
                        ) : r.tariffId === null ? (
                          <button
                            type="button"
                            className="pricing-btn-publish"
                            disabled={target !== null}
                            onClick={() => open({ mode: 'create', product: r.product })}
                          >
                            Publish price
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="pricing-btn-replace"
                            disabled={target !== null}
                            onClick={() =>
                              open({ mode: 'replace', product: r.product, tariffId: r.tariffId! })
                            }
                          >
                            Replace price
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Price History Collapsible Section */}
      <details className="pricing-history-details">
        <summary className="pricing-history-summary">
          <span>📜 Lịch sử thay đổi biểu giá (Price History)</span>
          <span className="pricing-version-pill">
            {history.data?.totalElements ? `${history.data.totalElements} bản ghi` : 'Chi tiết'}
          </span>
        </summary>
        <div className="pricing-history-body">
          <p className="muted" style={{ marginBottom: '14px' }}>
            Lưu vết toàn bộ các phiên bản giá cũ theo thời gian (mới nhất xếp trước). Các phiên bản
            quá khứ được bảo toàn để phục vụ đối soát hợp đồng cũ.
          </p>
          <h2 id="history-heading" style={{ display: 'none' }}>
            Price history
          </h2>
          {history.isPending ? (
            <Loading />
          ) : schemaPending(history.error) ? (
            <DeploymentNotice />
          ) : history.error ? (
            <ErrorNotice error={history.error} />
          ) : !history.data.items.length ? (
            <p>No prices have been published yet.</p>
          ) : (
            <div className="table-scroll" aria-busy={history.isPlaceholderData}>
              <table aria-label="Price history">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Version</th>
                    <th scope="col">Unit price</th>
                    <th scope="col">In effect</th>
                    <th scope="col">From</th>
                    <th scope="col">Until</th>
                    <th scope="col">Source (internal)</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((t) => (
                    <tr key={t.tariffId}>
                      <td>
                        {t.product ? productLabels[t.product] : 'Legacy (unrecognised product)'}
                      </td>
                      <td>{t.version}</td>
                      <td>
                        {t.unitPrice === null
                          ? 'Unsupported legacy rate — replace explicitly'
                          : `${t.unitPrice} ${t.currency}`}{' '}
                        <span className="muted">{unitLabel(t.unit)}</span>
                      </td>
                      <td>
                        <StatusBadge status={effectLabel(t)}>{effectLabel(t)}</StatusBadge>
                      </td>
                      <td>{displayDate(t.effectiveFrom)}</td>
                      <td>{t.effectiveTo ? displayDate(t.effectiveTo) : 'No planned end'}</td>
                      <td>
                        {t.sourceReference ?? 'Not recorded'}
                        {t.sourceReviewRequired && (
                          <span className="badge warn"> Source review required</span>
                        )}
                      </td>
                      <td>
                        {t.product &&
                          t.product !== 'BASIC_CARE' &&
                          t.product !== 'DOCUMENT_REVIEW' && (
                            <button
                              type="button"
                              disabled={target !== null}
                              onClick={() =>
                                open({ mode: 'replace', product: t.product!, tariffId: t.tariffId })
                              }
                            >
                              Replace
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {history.data && (history.data.totalPages > 1 || page > 0) && (
            <Pagination
              page={page}
              pages={history.data.totalPages}
              onChange={(next) => setParams({ page: String(next) })}
              pending={history.isFetching}
            />
          )}
        </div>
      </details>
    </>
  );
}
