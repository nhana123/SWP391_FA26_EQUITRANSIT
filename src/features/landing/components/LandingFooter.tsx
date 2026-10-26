import { Link } from 'react-router-dom';
import { Icon } from '../../../components/ui/Icons';

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="footer-top-grid">
        <div className="footer-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div className="landing-brand-logo" style={{ width: 32, height: 32 }}>
              <Icon name="shield" size={18} />
            </div>
            <h4 style={{ margin: 0 }}>EQUITRANSIT</h4>
          </div>
          <p>
            Hệ thống điều phối & giám sát vận tải ngựa đua quốc tế đa phương thức. Đảm bảo an sinh
            động vật, tiêu chuẩn chuồng bay áp suất IATA LAR và chứng thực hồ sơ kiểm dịch FEI.
          </p>
          <div className="footer-cert-pill">
            <Icon name="check" size={16} />
            <span>FEI & IATA LAR Certified</span>
          </div>
        </div>

        <div className="footer-col">
          <h5>Khám phá</h5>
          <ul className="footer-links">
            <li>
              <Link to="/how-it-works">Quy trình vận chuyển</Link>
            </li>
            <li>
              <Link to="/pricing">Báo giá & Cước phí</Link>
            </li>
            <li>
              <Link to="/transport">Phương tiện & Chuồng trại</Link>
            </li>
            <li>
              <Link to="/register">Đăng ký tài khoản</Link>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h5>Hạng mục vận tải</h5>
          <ul className="footer-links">
            <li>
              <Link to="/transport#short-haul">Short Haul Sprinter</Link>
            </li>
            <li>
              <Link to="/transport#commercial">Đoàn xe 6-9 ngựa Air-ride</Link>
            </li>
            <li>
              <Link to="/transport#air-charter">Chuyên cơ Equi-Stall</Link>
            </li>
            <li>
              <Link to="/transport#vet-ambulance">Xe cấp cứu Thú y ICU</Link>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h5>Điểm đến tiêu biểu</h5>
          <ul className="footer-links">
            <li>
              <Link to="/pricing">Wellington, FL (USA)</Link>
            </li>
            <li>
              <Link to="/pricing">Ocala & Lexington (USA)</Link>
            </li>
            <li>
              <Link to="/pricing">Changi SIN & Dubai DXB</Link>
            </li>
            <li>
              <Link to="/pricing">Tân Sơn Nhất & Nội Bài (VN)</Link>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h5>Hỗ trợ khẩn cấp 24/7</h5>
          <p style={{ margin: '0 0 6px 0', fontSize: 13 }}>Đường dây nóng điều phối thú y:</p>
          <div className="footer-hotline">1-800-EQUITRANSIT</div>
          <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
            Điều phối hành trình, bác sĩ thú y trực ban và hỗ trợ thủ tục hải quan cửa khẩu 24/7.
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <div>&copy; {new Date().getFullYear()} EquiTransit Platform. Bản quyền bảo lưu.</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="#terms" style={{ color: '#64748b', textDecoration: 'none' }}>
            Điều khoản dịch vụ
          </a>
          <a href="#privacy" style={{ color: '#64748b', textDecoration: 'none' }}>
            Chính sách bảo mật
          </a>
          <a href="#compliance" style={{ color: '#64748b', textDecoration: 'none' }}>
            Tuân thủ IATA LAR
          </a>
        </div>
      </div>
    </footer>
  );
}
