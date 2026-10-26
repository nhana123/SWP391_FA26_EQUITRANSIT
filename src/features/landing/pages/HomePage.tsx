import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { lookupsApi, type Country, type Location } from '../../../shared/api/lookups';
import { useSession } from '../../../shared/api/session';
import { Icon } from '../../../components/ui/Icons';
import {
  HOW_IT_WORKS_STEPS,
  RIDE_CATEGORIES,
  DESTINATION_CARDS,
  type DestinationHighlight,
} from '../landingData';

export function HomePage() {
  const session = useSession();
  const navigate = useNavigate();

  // Dữ liệu thật từ BE: Danh mục Quốc gia & Điểm đến
  const [countries, setCountries] = useState<Country[]>([]);
  const [originCountry, setOriginCountry] = useState<string>('');
  const [destCountry, setDestCountry] = useState<string>('');
  const [originLocations, setOriginLocations] = useState<Location[]>([]);
  const [destLocations, setDestLocations] = useState<Location[]>([]);
  const [selectedOriginLoc, setSelectedOriginLoc] = useState<string>('');
  const [selectedDestLoc, setSelectedDestLoc] = useState<string>('');
  const [horseCount, setHorseCount] = useState<number>(1);
  const [loadingLookups, setLoadingLookups] = useState<boolean>(true);

  // Tab lọc điểm đến
  const [destinationFilter, setDestinationFilter] = useState<'All' | 'Winter' | 'Racing' | 'Auction'>('All');

  useEffect(() => {
    let active = true;
    lookupsApi
      .countries()
      .then((data) => {
        if (!active) return;
        setCountries(data);
        if (data.length > 0) {
          // Gán mặc định VN -> US hoặc SG
          const vn = data.find((c) => c.countryCode === 'VN') ?? data[0];
          const us = data.find((c) => c.countryCode === 'US') ?? data[data.length - 1];
          setOriginCountry(vn.countryCode);
          setDestCountry(us.countryCode);
        }
      })
      .catch((err) => console.error('Không thể nạp danh mục quốc gia từ BE:', err))
      .finally(() => {
        if (active) setLoadingLookups(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Nạp địa điểm xuất phát thật từ BE
  useEffect(() => {
    if (!originCountry) return;
    let active = true;
    lookupsApi
      .locations(originCountry, 'AIRPORT')
      .then((airports) => {
        if (airports.length === 0) {
          return lookupsApi.locations(originCountry, 'CITY');
        }
        return airports;
      })
      .then((locs) => {
        if (!active) return;
        setOriginLocations(locs);
        setSelectedOriginLoc(locs[0]?.locationName ?? '');
      })
      .catch((err) => console.error('Lỗi nạp điểm đi:', err));
    return () => {
      active = false;
    };
  }, [originCountry]);

  // Nạp địa điểm đến thật từ BE
  useEffect(() => {
    if (!destCountry) return;
    let active = true;
    lookupsApi
      .locations(destCountry, 'AIRPORT')
      .then((airports) => {
        if (airports.length === 0) {
          return lookupsApi.locations(destCountry, 'CITY');
        }
        return airports;
      })
      .then((locs) => {
        if (!active) return;
        setDestLocations(locs);
        setSelectedDestLoc(locs[0]?.locationName ?? '');
      })
      .catch((err) => console.error('Lỗi nạp điểm đến:', err));
    return () => {
      active = false;
    };
  }, [destCountry]);

  const handleQuickEstimateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const state = {
      pickupCountry: originCountry,
      pickupLocation: selectedOriginLoc,
      dropoffCountry: destCountry,
      dropoffLocation: selectedDestLoc,
      horseCount,
    };
    if (!session) {
      navigate('/login', { state: { returnTo: '/customer/requests/new', prefill: state } });
    } else {
      navigate('/customer/requests/new', { state });
    }
  };

  const filteredDestinations = DESTINATION_CARDS.filter((d: DestinationHighlight) => {
    if (destinationFilter === 'All') return true;
    return d.tag === destinationFilter;
  });

  return (
    <div className="landing-page-root">
      {/* 1. HERO SECTION */}
      <section
        className="landing-hero"
        style={{ backgroundImage: `url('/images/landing/hero/hero-bg.jpg')` }}
      >
        <div className="landing-hero-content">
          <div className="landing-hero-eyebrow">
            <Icon name="shield" size={15} />
            <span>Cross-Border Equine Logistics &amp; Welfare</span>
          </div>

          <h1>
            Hành Trình Vận Tải Ngựa Đua
            <br />
            An Toàn &amp; Đẳng Cấp Quốc Tế
          </h1>

          <p className="landing-hero-subtitle">
            Hệ thống điều phối chuyên cơ hàng không và đoàn xe đường bộ chuyên dụng. Kiểm soát khí
            áp suất, tiêu chuẩn an sinh động vật IATA LAR và số hóa hồ sơ kiểm dịch quốc tế.
          </p>

          {/* Quick Route Estimator - Connected to Live Backend Data */}
          <div className="landing-quick-estimator">
            <form onSubmit={handleQuickEstimateSubmit}>
              <div className="estimator-grid">
                <div className="estimator-field">
                  <label htmlFor="origin-country">Quốc gia đi</label>
                  <select
                    id="origin-country"
                    value={originCountry}
                    onChange={(e) => setOriginCountry(e.target.value)}
                    disabled={loadingLookups}
                  >
                    {countries.map((c) => (
                      <option key={c.countryCode} value={c.countryCode}>
                        {c.countryName} ({c.countryCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="estimator-field">
                  <label htmlFor="origin-loc">Sân bay / Cảng đi</label>
                  <select
                    id="origin-loc"
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

                <div className="estimator-field">
                  <label htmlFor="dest-country">Quốc gia đến</label>
                  <select
                    id="dest-country"
                    value={destCountry}
                    onChange={(e) => setDestCountry(e.target.value)}
                    disabled={loadingLookups}
                  >
                    {countries.map((c) => (
                      <option key={c.countryCode} value={c.countryCode}>
                        {c.countryName} ({c.countryCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="estimator-field">
                  <label htmlFor="dest-loc">Sân bay / Chuồng đích</label>
                  <select
                    id="dest-loc"
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

                <div className="estimator-field" style={{ maxWidth: 120 }}>
                  <label htmlFor="horse-count">Số ngựa</label>
                  <input
                    id="horse-count"
                    type="number"
                    min={1}
                    max={12}
                    value={horseCount}
                    onChange={(e) => setHorseCount(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>

                <button type="submit" className="landing-btn-gold" style={{ height: 44 }}>
                  <span>Nhận Báo Giá →</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS SECTION */}
      <section className="landing-section">
        <div className="landing-section-header">
          <h2>Quy Trình Vận Tải 3 Bước Khép Kín</h2>
          <p>
            Minh bạch chi phí, chuẩn hóa pháp lý và kiểm soát an sinh động vật chuẩn quốc tế theo từng
            dặm di chuyển.
          </p>
        </div>

        <div className="landing-steps-grid">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div key={step.step} className="step-card">
              <img src={step.image} alt={step.title} className="step-card-image" loading="lazy" />
              <div className="step-card-body">
                <div className="step-card-meta">
                  <div className="step-number-badge">{step.step}</div>
                  <span className="step-pill-tag" style={{ color: step.badgeColor }}>
                    {step.badge}
                  </span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. VEHICLE & FLEET SHOWCASE */}
      <section className="landing-section" style={{ backgroundColor: '#062319', color: '#fff', maxWidth: '100%', padding: '90px 32px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div className="landing-section-header" style={{ color: '#fff' }}>
            <h2 style={{ color: '#fff' }}>Hạng Mục Phương Tiện &amp; Chuồng Chuyên Dụng</h2>
            <p style={{ color: '#a7f3d0' }}>
              Từ xe van rơ-moóc cá nhân cơ động đến chuyên cơ vận tải quy mô lớn phục vụ thi đấu quốc tế.
            </p>
          </div>

          <div className="rides-grid">
            {RIDE_CATEGORIES.map((ride) => (
              <div key={ride.id} className="ride-card">
                <div className="ride-card-img-wrap">
                  <img src={ride.image} alt={ride.title} className="ride-card-img" loading="lazy" />
                  <div className="ride-badge">{ride.badge}</div>
                </div>
                <div className="ride-card-body">
                  <h4>{ride.title}</h4>
                  <p>{ride.desc}</p>
                  <div className="ride-specs">
                    <span>Sức chứa: <strong>{ride.capacity}</strong></span>
                    <span>Khí hậu: <strong>{ride.climate}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <Link to="/transport" className="landing-btn-outline" style={{ borderColor: 'rgba(255,255,255,0.3)', padding: '12px 28px' }}>
              Xem toàn bộ thông số kỹ thuật xe &amp; máy bay →
            </Link>
          </div>

          {/* 4. VALUE PROPOSITION 4-BOX GRID */}
          <div className="value-prop-grid">
            <div className="value-card-gold">
              <div>
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Tiện ích khép kín
                </span>
                <h3>Door-to-door, simplified.</h3>
                <p>
                  Đón ngựa từ chuồng nhà, chuyển giao xe van ra sân bay và bay thẳng đến sàn đấu trường
                  quốc tế với cam kết an sinh tuyệt đối.
                </p>
              </div>
              <Link to="/pricing" className="landing-btn-outline" style={{ background: '#051a12', color: '#fff', border: '1px solid #134e3a' }}>
                Đối chiếu bảng cước phí →
              </Link>
            </div>

            <div className="value-card-dark">
              <div className="value-card-icon">
                <Icon name="shield" size={22} />
              </div>
              <h4>Đội Ngũ Thẩm Định Chuyên Sâu</h4>
              <p>
                100% tài xế và chuyên viên hộ tống có chứng chỉ kiểm dịch thú y, bảo hiểm trách nhiệm
                nghề nghiệp và kinh nghiệm xử lý tâm lý ngựa thi đấu.
              </p>
            </div>

            <div className="value-card-dark">
              <div className="value-card-icon">
                <Icon name="check" size={22} />
              </div>
              <h4>Đối Chiếu Báo Giá Minh Bạch</h4>
              <p>
                Bóc tách chi tiết từng dòng cước: quãng đường km, slot chuồng bay, phí cách ly kiểm
                dịch và lệ phí hải quan. Không phát sinh chi phí ẩn.
              </p>
            </div>

            <div className="value-card-dark">
              <div className="value-card-icon">
                <Icon name="file" size={22} />
              </div>
              <h4>Số Hóa Hồ Sơ &amp; Giấy Tờ FEI</h4>
              <p>
                Quản lý tập trung hộ chiếu ngựa, chứng thư tiêm phòng dịch tễ, giấy phép xuất nhập cảnh
                và biên bản bàn giao điện tử với chữ ký pháp lý.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. POPULAR ROUTES & DESTINATIONS */}
      <section className="landing-section">
        <div className="landing-section-header">
          <h2>Các Tuyến Vận Chuyển Ngựa Quốc Tế Sôi Động Nhất</h2>
          <p>
            Kết nối các trung tâm đua ngựa, trang trại nhân giống và lễ hội cưỡi ngựa thể thao hàng đầu
            thế giới.
          </p>
        </div>

        <div className="filter-chips-row">
          {(['All', 'Winter', 'Racing', 'Auction'] as const).map((tag) => (
            <button
              key={tag}
              type="button"
              className={`filter-chip ${destinationFilter === tag ? 'active' : ''}`}
              onClick={() => setDestinationFilter(tag)}
            >
              {tag === 'All' ? 'Tất cả điểm đến' : tag}
            </button>
          ))}
        </div>

        <div className="destinations-grid">
          {filteredDestinations.map((dest) => (
            <div key={dest.id} className="dest-card">
              <img src={dest.image} alt={dest.title} className="dest-card-img" loading="lazy" />
              <div className="dest-card-body">
                <h4>{dest.title}</h4>
                <p>{dest.desc}</p>
                <div className="dest-card-footer">
                  <span className="dest-route-info">{dest.routes}</span>
                  <Link to="/pricing" className="dest-action-link">
                    Đặt tuyến →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. PARTNER CTA BANNER */}
      <div className="landing-cta-banner">
        <div>
          <h3>Bạn là đơn vị vận tải hoặc chủ trang trại ngựa?</h3>
          <p>
            Gia nhập mạng lưới vận tải EquiTransit để tiếp cận nguồn đơn vận chuyển quốc tế liên tục,
            được bảo đảm thanh toán và hỗ trợ nghiệp vụ hải quan.
          </p>
        </div>
        <Link to="/register" className="landing-btn-gold" style={{ padding: '14px 28px', fontSize: 15 }}>
          Đăng ký đối tác vận chuyển →
        </Link>
      </div>
    </div>
  );
}
