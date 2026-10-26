import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/ui/Icons';
import { HOW_IT_WORKS_STEPS } from '../landingData';

export function HowItWorksPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Ngựa có bị tiêm thuốc an thần khi đi máy bay không?',
      a: 'Tuyệt đối không. Theo quy định an sinh động vật quốc tế FEI và IATA LAR, việc tiêm thuốc an thần bị nghiêm cấm vì làm mất phản xạ thăng bằng của ngựa trong lúc bay và hạ cánh. Thuốc an thần chỉ được dùng khi xảy ra tình huống cấp cứu thú y khẩn cấp do bác sĩ thú y đi kèm quyết định.',
    },
    {
      q: 'Thời gian cách ly kiểm dịch (Quarantine) kéo dài bao lâu?',
      a: 'Tùy theo yêu cầu của quốc gia nhập cảnh. Thông thường các chặng nội vùng Châu Á kéo dài 7 ngày, chặng đến Hoa Kỳ/Châu Âu kéo dài 14 ngày, và các chặng tới Australia kéo dài tối thiểu 21 ngày.',
    },
    {
      q: 'Tôi có thể theo dõi vị trí và sức khỏe ngựa như thế nào?',
      a: 'Sau khi đơn vận chuyển được duyệt, chủ ngựa được cấp quyền truy cập cổng Customer Portal để theo dõi tiến độ check-in từng mốc của máy bay/xe tải, thông số nhiệt độ khoang 18°C và nhận nhật ký hình ảnh mỗi 4 giờ từ chuyên viên chăm sóc.',
    },
  ];

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
            <Icon name="check" size={15} />
            <span>Quy Trình Tiêu Chuẩn Quốc Tế</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, margin: '0 0 16px 0', color: '#fff' }}>
            Hành Trình Vận Chuyển Ngựa Đua Diễn Ra Thế Nào?
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.6, margin: '0 auto', maxWidth: 680 }}>
            Tìm hiểu chi tiết từng giai đoạn từ khâu tiếp nhận hồ sơ, xét nghiệm máu kiểm dịch, điều
            phối chuyên cơ đến lúc ngựa đua bước xuống sàn chuồng đích bình an.
          </p>
        </div>
      </section>

      {/* 3 Step Interactive Cards */}
      <section className="landing-section">
        <div className="landing-section-header">
          <h2>3 Giai Đoạn Vận Chuyển Khép Kín</h2>
          <p>Mỗi giai đoạn đều có chuyên viên giám sát và ký duyệt điện tử minh bạch.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {HOW_IT_WORKS_STEPS.map((step, idx) => (
            <div
              key={step.step}
              style={{
                display: 'grid',
                gridTemplateColumns: idx % 2 === 0 ? '1.1fr 1fr' : '1fr 1.1fr',
                gap: 36,
                background: '#ffffff',
                borderRadius: 20,
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
                alignItems: 'center',
              }}
            >
              <div style={{ order: idx % 2 === 0 ? 1 : 2 }}>
                <img
                  src={step.image}
                  alt={step.title}
                  style={{ width: '100%', height: 380, objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
              </div>

              <div style={{ padding: '40px', order: idx % 2 === 0 ? 2 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: '#0f172a',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 16,
                    }}
                  >
                    {step.step}
                  </div>
                  <span className="step-pill-tag" style={{ color: step.badgeColor }}>
                    {step.badge}
                  </span>
                </div>

                <h3 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0' }}>
                  {step.title}
                </h3>

                <p style={{ fontSize: 15.5, color: '#64748b', lineHeight: 1.7, margin: '0 0 24px 0' }}>
                  {step.desc}
                </p>

                <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                    Nghiệp vụ cốt lõi trong bước này:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 20, color: '#475569', fontSize: 13.5, lineHeight: 1.7 }}>
                    {step.step === 1 && (
                      <>
                        <li>Nhập mã vi chip 15 số và số hộ chiếu FEI của ngựa.</li>
                        <li>Kiểm tra tính tương thích của kích thước ngựa với chuồng bay (Stall-fit).</li>
                        <li>Xuất báo giá chi tiết gồm cước đường bộ, hàng không và bảo hiểm.</li>
                      </>
                    )}
                    {step.step === 2 && (
                      <>
                        <li>Xét nghiệm máu Coggins (Thiếu máu truyền nhiễm ngựa - EIA).</li>
                        <li>Đo thân nhiệt và cấp chứng thư kiểm dịch thú y xuất khẩu.</li>
                        <li>Nhật ký hành trình liên tục và camera theo dõi trên suốt chặng bay/đường bộ.</li>
                      </>
                    )}
                    {step.step === 3 && (
                      <>
                        <li>Hạ bửng nâng giảm chấn tại sân bay đích và chuyển sang xe van chuyên dụng.</li>
                        <li>Bác sĩ thú y kiểm tra lại thể trạng và đối chiếu vi chip khi giao ngựa.</li>
                        <li>Ký biên bản bàn giao điện tử (Digital Handover) hoàn tất hợp đồng.</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance Standard Paperwork */}
      <section className="landing-section" style={{ background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 40 }}>
        <div className="landing-section-header" style={{ marginBottom: 30 }}>
          <h2>4 Hồ Sơ Pháp Lý Bắt Buộc Trong Vận Tải Ngựa Quốc Tế</h2>
          <p>EquiTransit hỗ trợ kiểm tra và thẩm định toàn bộ giấy tờ trên hệ thống số hóa.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, background: '#f8fafc' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Hồ sơ 01</span>
            <h4 style={{ margin: '8px 0 8px 0', fontSize: 17, color: '#0f172a' }}>Hộ Chiếu Ngựa Đua (FEI Passport)</h4>
            <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.5 }}>
              Xác nhận danh tính, sơ đồ màu lông xoáy, mã chip RFID 15 chữ số và lịch sử tiêm phòng cúm ngựa bắt buộc.
            </p>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, background: '#f8fafc' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Hồ sơ 02</span>
            <h4 style={{ margin: '8px 0 8px 0', fontSize: 17, color: '#0f172a' }}>Chứng Nhận Coggins (EIA Test)</h4>
            <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.5 }}>
              Kết quả xét nghiệm âm tính với bệnh thiếu máu truyền nhiễm ngựa trong vòng 30 đến 180 ngày trước khi xuất cảnh.
            </p>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, background: '#f8fafc' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>Hồ sơ 03</span>
            <h4 style={{ margin: '8px 0 8px 0', fontSize: 17, color: '#0f172a' }}>Chứng Thư Kiểm Dịch Thú Y</h4>
            <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.5 }}>
              Do cơ quan thú y chính phủ nước xuất khẩu (VD: Cục Thú y, USDA APHIS) ký duyệt trong vòng 48 giờ trước bay.
            </p>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, background: '#f8fafc' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Hồ sơ 04</span>
            <h4 style={{ margin: '8px 0 8px 0', fontSize: 17, color: '#0f172a' }}>Giấy Phép Nhập Cảnh &amp; Chuồng Cách Ly</h4>
            <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.5 }}>
              Giấy phép nhập cảnh và hợp đồng giữ chỗ trạm cách ly được phê chuẩn bởi nước nhập khẩu trước ngày lên máy bay.
            </p>
          </div>
        </div>
      </section>

      {/* FAQs Section */}
      <section className="landing-section" style={{ maxWidth: 880 }}>
        <div className="landing-section-header">
          <h2>Câu Hỏi Thường Gặp</h2>
          <p>Giải đáp các thắc mắc phổ biến về quy trình vận chuyển ngựa thi đấu.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                background: '#ffffff',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                style={{
                  width: '100%',
                  padding: '18px 24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>{faq.q}</span>
                <span style={{ fontSize: 18, color: '#d97706' }}>{openFaq === idx ? '−' : '+'}</span>
              </button>
              {openFaq === idx && (
                <div style={{ padding: '0 24px 20px 24px', color: '#64748b', fontSize: 14.5, lineHeight: 1.6 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link to="/pricing" className="landing-btn-gold" style={{ padding: '14px 32px' }}>
            Bắt đầu yêu cầu vận chuyển ngay →
          </Link>
        </div>
      </section>
    </div>
  );
}
