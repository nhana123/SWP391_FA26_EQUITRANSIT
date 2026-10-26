import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lookupsApi, type Country, type Location } from '../../../shared/api/lookups';
import { useSession } from '../../../shared/api/session';
import { Icon } from '../../../components/ui/Icons';
import { SERVICE_TARIFF_DISCLOSURES } from '../landingData';

export function PricingPage() {
  const session = useSession();
  const navigate = useNavigate();

  // Dữ liệu thật từ BE
  const [countries, setCountries] = useState<Country[]>([]);
  const [originCountry, setOriginCountry] = useState<string>('VN');
  const [destCountry, setDestCountry] = useState<string>('US');
  const [originLocations, setOriginLocations] = useState<Location[]>([]);
  const [destLocations, setDestLocations] = useState<Location[]>([]);
  const [selectedOriginLoc, setSelectedOriginLoc] = useState<string>('');
  const [selectedDestLoc, setSelectedDestLoc] = useState<string>('');
  const [transportMode, setTransportMode] = useState<'AIR' | 'ROAD'>('AIR');
  const [horseCount, setHorseCount] = useState<number>(1);
  const [quarantineDays, setQuarantineDays] = useState<number>(14);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    lookupsApi
      .countries()
      .then((data) => {
        if (!active) return;
        setCountries(data);
        if (data.length > 0) {
          const vn = data.find((c) => c.countryCode === 'VN') ?? data[0];
          const us = data.find((c) => c.countryCode === 'US') ?? data[data.length - 1];
          setOriginCountry(vn.countryCode);
          setDestCountry(us.countryCode);
        }
      })
      .catch((err) => console.error('Lỗi nạp danh mục quốc gia:', err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!originCountry) return;
    let active = true;
    const type = transportMode === 'AIR' ? 'AIRPORT' : 'CITY';
    lookupsApi
      .locations(originCountry, type)
      .then((locs) => {
        if (locs.length === 0 && type === 'AIRPORT') {
          return lookupsApi.locations(originCountry, 'CITY');
        }
        return locs;
      })
      .then((locs) => {
        if (!active) return;
        setOriginLocations(locs);
        setSelectedOriginLoc(locs[0]?.locationName ?? '');
      });
    return () => {
      active = false;
    };
  }, [originCountry, transportMode]);

  useEffect(() => {
    if (!destCountry) return;
    let active = true;
    const type = transportMode === 'AIR' ? 'AIRPORT' : 'CITY';
    lookupsApi
      .locations(destCountry, type)
      .then((locs) => {
        if (locs.length === 0 && type === 'AIRPORT') {
          return lookupsApi.locations(destCountry, 'CITY');
        }
        return locs;
      })
      .then((locs) => {
        if (!active) return;
        setDestLocations(locs);
        setSelectedDestLoc(locs[0]?.locationName ?? '');
      });
    return () => {
      active = false;
    };
  }, [destCountry, transportMode]);

  // Tính toán ước tính cước dựa trên biểu phí thật
  const isIntercontinental = originCountry !== destCountry;
  const baseFreight = transportMode === 'AIR' ? 1500 * (isIntercontinental ? 2.5 : 1) : 450;
  const stallFee = transportMode === 'AIR' ? horseCount * 650 : horseCount * 180;
  const quarantineCost = quarantineDays * 50 * horseCount;
  const vetInspection = 60 * horseCount;
  const customsFee = isIntercontinental ? 80 : 40;
  const totalEstimated = baseFreight + stallFee + quarantineCost + vetInspection + customsFee;

  const handleStartBookingWithQuote = () => {
    const prefill = {
      pickupCountry: originCountry,
      pickupLocation: selectedOriginLoc,
      dropoffCountry: destCountry,
      dropoffLocation: selectedDestLoc,
      transportMode,
      totalHorses: horseCount,
      estimatedCost: totalEstimated,
    };
    if (!session) {
      navigate('/login', { state: { returnTo: '/customer/requests/new', prefill } });
    } else {
      navigate('/customer/requests/new', { state: prefill });
    }
  };

  return (
    <div className="landing-page-root" style={{ background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <section
        style={{
          background: 'linear-gradient(180deg, #072318 0%, #0d3d2c 100%)',
          color: '#ffffff',
          padding: '80px 24px 60px 24px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
        }}
      >
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="landing-hero-eyebrow" style={{ marginBottom: 16 }}>
            <Icon name="orders" size={15} />
            <span>Biểu Phí Minh Bạch &amp; Dự Toán Chi Phí</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, margin: '0 0 16px 0', color: '#fff' }}>
            Dự Toán Cước Phí Vận Tải Ngựa Quốc Tế
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.6, margin: '0 auto', maxWidth: 680 }}>
            Công thức tính cước minh bạch chuẩn IATA LAR và quy chế kiểm dịch FEI. Toàn bộ các dòng
            chi phí được bóc tách rõ ràng, không phát sinh chi phí ẩn.
          </p>
        </div>
      </section>

      {/* Interactive Calculator */}
      <section className="landing-section" style={{ marginTop: -40 }}>
        <div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.12)',
            padding: 36,
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 40,
          }}
        >
          {/* Controls */}
          <div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 20px 0' }}>
              1. Khai báo Lộ trình &amp; Quy cách Ngựa
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div className="estimator-field">
                <label>Quốc gia khởi hành</label>
                <select
                  value={originCountry}
                  onChange={(e) => setOriginCountry(e.target.value)}
                  disabled={loading}
                >
                  {countries.map((c) => (
                    <option key={c.countryCode} value={c.countryCode}>
                      {c.countryName} ({c.countryCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="estimator-field">
                <label>Địa điểm / Cảng xuất phát</label>
                <select
                  value={selectedOriginLoc}
                  onChange={(e) => setSelectedOriginLoc(e.target.value)}
                >
                  {originLocations.map((loc) => (
                    <option key={loc.locationId} value={loc.locationName}>
                      {loc.locationCode ? `[${loc.locationCode}] ` : ''}
                      {loc.locationName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div className="estimator-field">
                <label>Quốc gia đích đến</label>
                <select
                  value={destCountry}
                  onChange={(e) => setDestCountry(e.target.value)}
                  disabled={loading}
                >
                  {countries.map((c) => (
                    <option key={c.countryCode} value={c.countryCode}>
                      {c.countryName} ({c.countryCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="estimator-field">
                <label>Địa điểm / Cảng hạ cánh</label>
                <select
                  value={selectedDestLoc}
                  onChange={(e) => setSelectedDestLoc(e.target.value)}
                >
                  {destLocations.map((loc) => (
                    <option key={loc.locationId} value={loc.locationName}>
                      {loc.locationCode ? `[${loc.locationCode}] ` : ''}
                      {loc.locationName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div className="estimator-field">
                <label>Phương thức</label>
                <select
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as 'AIR' | 'ROAD')}
                >
                  <option value="AIR">Chuyên cơ hàng không</option>
                  <option value="ROAD">Đường bộ chuyên dụng</option>
                </select>
              </div>

              <div className="estimator-field">
                <label>Số lượng ngựa</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={horseCount}
                  onChange={(e) => setHorseCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="estimator-field">
                <label>Ngày cách ly (Dự kiến)</label>
                <select
                  value={quarantineDays}
                  onChange={(e) => setQuarantineDays(parseInt(e.target.value) || 14)}
                >
                  <option value={7}>7 ngày (Nội Á)</option>
                  <option value={14}>14 ngày (Mỹ / EU)</option>
                  <option value={21}>21 ngày (Australia)</option>
                </select>
              </div>
            </div>

            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
              <Icon name="check" size={16} /> <strong>Dữ liệu đối chiếu:</strong> Lộ trình kết nối thực tế từ{' '}
              <strong>{selectedOriginLoc || originCountry}</strong> đến{' '}
              <strong>{selectedDestLoc || destCountry}</strong> theo chuẩn an sinh động vật quốc tế.
            </div>
          </div>

          {/* Breakdown & Total */}
          <div
            style={{
              background: '#072318',
              border: '1px solid #134e3a',
              color: '#ffffff',
              borderRadius: 16,
              padding: 30,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ margin: 0, fontSize: 17, color: '#fff' }}>Bóc Tách Dự Toán (USD)</h4>
                <span className="step-pill-tag" style={{ background: '#f59e0b', color: '#0f172a' }}>
                  {transportMode === 'AIR' ? 'Air Charter' : 'Road Transport'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                  <span style={{ color: '#94a3b8' }}>Cước vận chuyển cơ bản:</span>
                  <span style={{ fontWeight: 700 }}>${baseFreight.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                  <span style={{ color: '#94a3b8' }}>Khoang chuồng ({horseCount} ngựa):</span>
                  <span style={{ fontWeight: 700 }}>${stallFee.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                  <span style={{ color: '#94a3b8' }}>Lưu chuồng cách ly ({quarantineDays} ngày):</span>
                  <span style={{ fontWeight: 700 }}>${quarantineCost.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                  <span style={{ color: '#94a3b8' }}>Thăm khám &amp; Chứng thư Thú y:</span>
                  <span style={{ fontWeight: 700 }}>${vetInspection.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                  <span style={{ color: '#94a3b8' }}>Khai báo Hải quan xuất nhập khẩu:</span>
                  <span style={{ fontWeight: 700 }}>${customsFee.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
                <span style={{ fontSize: 15, color: '#cbd5e1' }}>Tổng dự toán ước tính:</span>
                <span style={{ fontSize: 30, fontWeight: 800, color: '#fbbf24' }}>
                  ${totalEstimated.toLocaleString()}
                </span>
              </div>

              <button
                type="button"
                onClick={handleStartBookingWithQuote}
                className="landing-btn-gold"
                style={{ width: '100%', padding: '14px', fontSize: 15, justifyContent: 'center' }}
              >
                Khởi Tạo Đơn Với Báo Giá Này →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Official Master Tariff Table */}
      <section className="landing-section">
        <div className="landing-section-header">
          <h2>Biểu Phí Dịch Vụ Niêm Yết Chính Thức</h2>
          <p>
            Định mức đơn giá dịch vụ chính thức được đồng bộ từ cơ sở dữ liệu hệ thống EquiTransit. Áp dụng
            minh bạch cho toàn bộ hợp đồng vận chuyển nội địa và xuyên biên giới.
          </p>
        </div>

        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '16px 20px', color: '#334155', fontWeight: 700, width: '34%' }}>Hạng Mục Dịch Vụ Cung Ứng</th>
                <th style={{ padding: '16px 20px', color: '#334155', fontWeight: 700, width: '20%' }}>Phân Nhóm Chi Phí</th>
                <th style={{ padding: '16px 20px', color: '#334155', fontWeight: 700, width: '18%' }}>Quy Cách &amp; Đơn Vị Tính</th>
                <th style={{ padding: '16px 20px', color: '#334155', fontWeight: 700, width: '15%' }}>Đơn Giá Niêm Yết</th>
                <th style={{ padding: '16px 20px', color: '#334155', fontWeight: 700, width: '13%' }}>Quy Chuẩn Kỹ Thuật</th>
              </tr>
            </thead>
            <tbody>
              {SERVICE_TARIFF_DISCLOSURES.map((tariff) => (
                <tr key={tariff.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s ease' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15, marginBottom: 4 }}>
                      {tariff.serviceName}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
                      {tariff.desc}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        background: '#ecfdf5',
                        color: '#065f46',
                        border: '1px solid #a7f3d0',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {tariff.category}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>
                    {tariff.unit}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    {tariff.unitPriceUSD === 0 ? (
                      <span style={{ display: 'inline-block', padding: '4px 8px', background: '#f1f5f9', color: '#047857', fontWeight: 700, borderRadius: 6, fontSize: 13 }}>
                        Đã bao gồm trọn gói
                      </span>
                    ) : (
                      <div style={{ fontWeight: 800, color: '#059669', fontSize: 16 }}>
                        ${tariff.unitPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>USD</span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px 20px', color: '#64748b', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      <span>{tariff.standard}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
