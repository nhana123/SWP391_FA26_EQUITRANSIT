import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lookupsApi, type Country } from '../../../shared/api/lookups';
import { Icon } from '../../../components/ui/Icons';
import { RIDE_CATEGORIES } from '../landingData';

export function TransportPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    lookupsApi
      .countries()
      .then((data) => {
        if (!active) return;
        setCountries(data);
      })
      .catch((err) => console.error('Lỗi tải quốc gia:', err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="landing-page-root" style={{ background: '#f8fafc', paddingBottom: 80 }}>
      {/* Hero Header */}
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
            <Icon name="truck" size={15} />
            <span>Hạng Mục Xe &amp; Chuyên Cơ Vận Tải Ngựa</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, margin: '0 0 16px 0', color: '#fff' }}>
            Hạ Tầng Vận Chuyển Chuyên Dụng Đạt Chuẩn FEI &amp; IATA LAR
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.6, margin: '0 auto 28px auto', maxWidth: 680 }}>
            Mỗi chuyến đi của ngựa đua được bảo đảm an toàn bằng các phương tiện kiểm soát khí hậu,
            hệ thống treo bóng hơi giảm chấn động và khoang chuồng bay áp suất đạt chuẩn quốc tế.
          </p>
          <Link to="/pricing" className="landing-btn-gold">
            Tra cứu cước phí vận chuyển →
          </Link>
        </div>
      </section>

      {/* Categories Detailed Cards */}
      <section className="landing-section">
        <div className="landing-section-header">
          <h2>5 Hạng Mục Phương Tiện Vận Tải Chủ Lực</h2>
          <p>Thiết kế riêng biệt cho từng thể trạng, độ tuổi và cự ly di chuyển của ngựa đua.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {RIDE_CATEGORIES.map((cat, idx) => (
            <div
              key={cat.id}
              id={cat.id}
              style={{
                display: 'grid',
                gridTemplateColumns: idx % 2 === 0 ? '1.1fr 1fr' : '1fr 1.1fr',
                gap: 32,
                background: '#ffffff',
                borderRadius: 20,
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                boxShadow: '0 6px 20px rgba(0,0,0,0.04)',
                alignItems: 'center',
              }}
            >
              <div style={{ order: idx % 2 === 0 ? 1 : 2 }}>
                <img
                  src={cat.image}
                  alt={cat.title}
                  style={{ width: '100%', height: 360, objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
              </div>
              <div style={{ padding: '32px 36px', order: idx % 2 === 0 ? 2 : 1 }}>
                <span className="step-pill-tag" style={{ background: '#fef3c7', color: '#b45309', marginBottom: 12, display: 'inline-block' }}>
                  {cat.badge}
                </span>
                <h3 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0' }}>
                  {cat.title}
                </h3>
                <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px 0' }}>
                  {cat.desc}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f8fafc', padding: '16px 20px', borderRadius: 12, marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Sức chứa tối đa</div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>{cat.capacity}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Kiểm soát khí hậu</div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>{cat.climate}</div>
                  </div>
                </div>
                <Link to="/pricing" className="landing-btn-outline" style={{ color: '#0f172a', borderColor: '#cbd5e1' }}>
                  Dự toán chi phí phương tiện này →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live Country Capabilities Matrix - Real Backend Data */}
      <section className="landing-section" style={{ background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 40 }}>
        <div className="landing-section-header" style={{ marginBottom: 30 }}>
          <h2>Mạng Lưới Tuyến Vận Tải Theo Quốc Gia</h2>
          <p>
            Dữ liệu kết nối thời gian thực từ cơ sở dữ liệu EquiTransit về khả năng hỗ trợ đường bộ và
            hàng không.
          </p>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>Đang nạp năng lực vận tải quốc gia từ hệ thống...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', color: '#475569' }}>Mã QG</th>
                  <th style={{ padding: '12px 16px', color: '#475569' }}>Tên Quốc Gia</th>
                  <th style={{ padding: '12px 16px', color: '#475569' }}>Vận Tải Đường Bộ (Road)</th>
                  <th style={{ padding: '12px 16px', color: '#475569' }}>Chuyên Cơ Hàng Không (Air)</th>
                  <th style={{ padding: '12px 16px', color: '#475569' }}>Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.countryCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                      <span style={{ padding: '3px 8px', background: '#e2e8f0', borderRadius: 6, fontSize: 12 }}>
                        {c.countryCode}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1e293b' }}>
                      {c.countryName}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {c.supportsRoad ? (
                        <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="check" size={16} /> Hỗ trợ đường bộ
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Không khả dụng</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {c.supportsAir ? (
                        <span style={{ color: '#2563eb', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="check" size={16} /> Cảng hàng không IATA
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Chưa mở đường bay</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <Link to="/pricing" style={{ color: '#d97706', fontWeight: 700, textDecoration: 'none' }}>
                        Xem cước →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
