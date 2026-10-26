# BẢN ĐẶC TẢ KIẾN TRÚC GIẢI PHÁP FRONTEND TOÀN HỆ THỐNG EQUITRANSIT
## (ENTERPRISE SOLUTION ARCHITECTURE SPECIFICATION FOR CLAUDE CODE)
> **Tác giả:** Principal Solution Architect  
> **Dự án:** EquiTransit — Cross-Border Racehorse Transport System  
> **Công nghệ Frontend:** React 19, TypeScript, Vite, TanStack Query 5, Custom Heritage CSS (`heritage.css`, `forms.css`)  
> **Backend:** Spring Boot 3.5.x, Java 21, SQL Server  
> **Mục tiêu:** Xóa bỏ hoàn toàn mã nguồn thô kiểu phục vụ Database (DB-centric UI). Tái lập trình toàn bộ 5 Actor thành hệ thống giao diện phục vụ con người (Human-First UX), mượt mà, sang trọng nhưng ánh xạ ngầm chính xác 100% vào mạng lưới API Backend.

---

# PHẦN 0: TUYÊN NGÔN KIẾN TRÚC (ARCHITECTURAL MANIFESTO)

### 1. Sự khác biệt giữa "UI phục vụ DB" và "UI phục vụ Con Người"
* **UI phục vụ DB (Sai lầm phổ biến của AI):**
  - Bắt người dùng nhập các trường kỹ thuật của cơ sở dữ liệu: `horseId: 104`, `originCountryCode: "VN"`, `status: 3`, `carrierId: 5`.
  - Hiển thị bảng biểu xám xịt như phpMyAdmin, nút bấm khô khan: "Insert", "Update", "Submit".
  - Người dùng phải tự nhớ xem con ngựa của mình ID mấy, nước Anh mã ISO là GB hay UK, giấy xét nghiệm Coggins phải nộp ở đâu. Đây là giao diện **chống lại con người**.
* **UI phục vụ Con Người (Chuẩn EquiTransit Heritage):**
  - **Giấu kín toàn bộ ID kỹ thuật:** Người dùng chọn con ngựa qua **Ảnh chân dung ngựa, tên ngựa, giống, màu lông**. Hệ thống ngầm tự lấy `horseId` gửi về BE.
  - **Combobox thông minh và phụ thuộc:** Người dùng chọn quốc gia bằng dropdown có Quốc kỳ và Tiếng Việt (`🇻🇳 Việt Nam`). Khi chọn xong, ô Sân bay tự động kích hoạt và chỉ hiển thị các sân bay của Việt Nam (`Tân Sơn Nhất`, `Nội Bài`).
  - **Trực quan hóa trạng thái:** Không hiện chữ trạng thái tiếng Anh trơ trọi. Thay bằng các **Huy hiệu hoàng gia (Badges)**: 🟢 Đã thông quan, 🟡 Đang thẩm định, 🔴 Cần bổ sung trước ngày bay.
  - **Giảm tải thao tác tối đa (Zero-Redundancy):** Nếu con ngựa đã có Hộ chiếu FEI lưu từ trước, khi làm thủ tục chuyến bay hệ thống phải cho phép bấm **"Chọn từ hồ sơ sẵn có"**, tuyệt đối không bắt người dùng phải scan và upload lại lần thứ hai.

### 2. Nguyên tắc Thiết kế Thị giác (Luxury Equestrian Design)
* **Gam màu chủ đạo:**
  * `--brand`: `#0f5132` (British Racing Green / Turf Emerald) — Xanh ngọc lục bảo sang trọng của trường đua quý tộc.
  * `--gold`: `#d97706` (Royal Amber Gold) — Vàng đồng hoàng gia cho các chứng chỉ FEI, huy hiệu VIP.
  * `--canvas`: `#f4f7f6` — Nền xám ngọc trai dịu mắt, sạch sẽ.
  * `--surface`: `#ffffff` — Khung thẻ viền mỏng bo góc 9px, đổ bóng mờ thanh lịch.
* **Quy tắc công nghệ:** Toàn bộ code viết bằng **React 19 + TypeScript**, sử dụng **TanStack Query 5** để quản lý cache server-state, giao diện thuần component nội bộ của EquiTransit. **TUYỆT ĐỐI KHÔNG** cài đặt thư viện Ant Design (`antd`).

---

# PHẦN 1: BẢN ĐẶC TẢ CHI TIẾT TỪNG Ô NHẬP LIỆU & HỆ THỐNG NGẦM (5 ACTORS)

---

## 🏛️ ACTOR 1: CUSTOMER (CHỦ NGỰA / KHÁCH HÀNG)

---

### MÀN HÌNH 1.1: QUẢN LÝ ĐÀN NGỰA (MY HORSES & HORSE PROFILE)
* **Vị trí file:** `src/features/horses/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Lưới danh sách ngựa (Horse Grid)** | Khách nhìn thấy đàn ngựa của mình dưới dạng các thẻ sang trọng (**Horse Cards**): Ảnh đại diện lớn, Tên ngựa in đậm, Giống ngựa, Tag giới tính (♂️ Ngựa đực giống / ♀️ Ngựa cái), Số vi mạch ISO. | Khi di chuột (hover) vào thẻ, thẻ hơi nổi lên, hiện 2 nút thao tác nhanh: **"Xem Hồ Sơ"** và **"Đặt Chuyến Đi"**. | Gọi `GET /api/horses`. Backend trả về mảng danh sách ngựa. FE map từng object vào card, hiển thị ảnh từ `/api/files/{photoKey}` hoặc ảnh placeholder ngựa đua. |
| **Nút "+ Thêm Ngựa Mới"** | Khách bấm nút xanh nổi bật ở góc trên bên phải. | Mở Modal trượt nhẹ từ phải sang: *"Đăng ký cá thể ngựa mới vào hệ thống"*. | Khởi tạo form trắng trong local state. |
| **Ô tải ảnh đại diện** | Khung tròn lớn có icon camera: *"Chọn ảnh đẹp nhất của ngựa"*. | Khi chọn ảnh: Xem trước (preview) ảnh ngay lập tức; hiển thị thanh tiến trình tải lên. | Gọi ngầm `POST /api/files/upload` (multipart) $\rightarrow$ BE lưu vào thư mục máy chủ, trả về `{ fileKey }`. State form lưu `photoFileKey`. |
| **Tên ngựa & Giống** | Ô nhập văn bản có placeholder: *"VD: Tia Chớp Đỏ (Red Flash)"*, dropdown chọn Giống (*Thoroughbred, Arabian, Warmblood...*). | Tự động viết hoa chữ cái đầu; nếu bỏ trống báo lỗi đỏ: *"Vui lòng nhập tên ngựa để định danh"*. | Lưu vào state form `name`, `breed`. |
| **Số vi mạch ISO 11784/11785** | Ô nhập số kèm gợi ý: *"Dãy 15 chữ số trên chip cấy dưới bờm ngựa"*. | Kiểm tra tức thời (regex validation 15 chữ số). Nếu gõ chữ cái báo vàng: *"Mã chip quốc tế chỉ gồm 15 chữ số"*. | Lưu `microchipNumber`. |
| **Giấy tờ gốc đính kèm** | Khung đính kèm: *"Tải lên Hộ chiếu FEI hoặc Giấy khai sinh gốc (PDF hoặc Ảnh chụp)"*. | Kéo thả file thành công hiện icon PDF màu đỏ + tên file + dung lượng. | Gọi `POST /api/files/upload` $\rightarrow$ nhận `fileKey`. |
| **Nút "Hoàn tất đăng ký"** | Nút bấm lớn màu xanh Emerald. | Khi bấm: Nút xoay loading; thành công hiện thông báo xanh (Toast): *"Đã lưu hồ sơ ngựa thành công!"*, đóng modal và tự động tải lại lưới ngựa. | Gửi `POST /api/horses` với payload: `{ name, breed, dateOfBirth, gender, microchipNumber, photoFileKey, documents: [{ typeCode: 'FEI_PASSPORT', fileKey }] }`. |

---

### MÀN HÌNH 1.2: ĐẶT ĐƠN VẬN CHUYỂN QUỐC TẾ (BOOKING WIZARD 4 BƯỚC)
* **Vị trí file:** `src/features/transport-orders/`

#### BƯỚC 1: THIẾT KẾ LỘ TRÌNH (JOURNEY DESIGN)
| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Combobox Nước đón (Origin Country)** | Dropdown sang trọng có cờ và tên nước: `🇻🇳 Việt Nam`, `🇬🇧 Vương quốc Anh`, `🇫🇷 Pháp`, `🇦🇪 UAE`... | Khách chọn nước nào, cờ nước đó hiện lên góc ô. | Gọi `GET /api/lookups/countries` để nạp danh sách nước. Khi chọn, lưu `originCountryCode` (ví dụ `"VN"`). |
| **Combobox Địa điểm đón / Sân bay đi** | Ban đầu ô này bị mờ (disabled). Ngay khi khách chọn xong nước đi, ô này sáng lên và đổi placeholder: *"Chọn sân bay xuất phát hoặc thành phố..."*. | Dropdown tự động bung ra danh sách địa điểm của nước đó: `Sân bay Tân Sơn Nhất (SGN)`, `Sân bay Nội Bài (HAN)`. | Ngay khi `originCountryCode` thay đổi, TanStack Query tự động trigger gọi: `GET /api/lookups/locations?country={code}&type=AIRPORT`. Lưu `originLocationCode`. |
| **Địa chỉ trang trại đón cụ thể** | Ô nhập địa chỉ chi tiết có icon chuồng ngựa: *"Nhập tên trang trại, số nhà đón ngựa..."*. | Gợi ý văn bản rõ ràng, không bắt buộc kinh độ vĩ độ. | Lưu `originAddress`. |
| **Tương tự cho Nước đến & Sân bay đến** | Dropdown Nước đến $\rightarrow$ kích hoạt lọc Dropdown Sân bay đến (VD chọn `🇬🇧 Vương quốc Anh` $\rightarrow$ hiện `London Heathrow (LHR)`). | Ngăn chặn logic: Nếu khách chọn Nước đến trùng Nước đi thì hiện thông báo nhẹ: *"EquiTransit chuyên tuyến quốc tế, vui lòng chọn tuyến xuyên biên giới"*. | Trigger `GET /api/lookups/locations?country={destCode}&type=AIRPORT`. Lưu `destinationCountryCode`, `destinationLocationCode`, `destinationAddress`. |
| **Bộ chọn Ngày khởi hành & Hạn chót** | Lịch chọn ngày bay mong muốn và Hạn chót ngựa phải có mặt tại trường đua đích. | Khách không thể chọn ngày trong quá khứ; ngày đến phải sau ngày đi tối thiểu 2 ngày (đủ thời gian kiểm dịch). | Lưu `preferredDepartureAt`, `deliveryDeadline`. |
| **Nút "Tiếp tục: Chọn Ngựa"** | Nút bấm chuyển sang Bước 2. | Kiểm tra: Nếu chưa chọn đủ nước và ngày thì rung nhẹ nút và đánh dấu đỏ ô còn thiếu. | Chuyển `currentStep = 2`. |

#### BƯỚC 2: CHỌN NGỰA VẬN CHUYỂN (HORSE SELECTION)
| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Thẻ danh sách ngựa sở hữu** | Hiện các thẻ ngựa của khách. | Khi khách click vào một con ngựa: Viền thẻ chuyển sang xanh Emerald dày 2px, góc trên xuất hiện icon tích xanh ✅. | Lưu `selectedHorseId = horse.horseId` vào form state. |
| **Hộp tóm tắt tình trạng ngựa** | Ngay dưới thẻ vừa chọn, hệ thống tự động hiển thị: *"Ngựa đực giống - Đã có Hộ chiếu FEI - Cần làm xét nghiệm Coggins cho tuyến Anh"*. | Khách cảm thấy an tâm vì hệ thống hiểu rõ con ngựa của mình. | Trích xuất thông tin giới tính và danh mục giấy tờ đã lưu từ object ngựa. |

#### BƯỚC 3: HẠNG CHUỒNG BAY & CHĂM SÓC (STALL & CARE PREFERENCES)
| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Bộ 3 Hộp chọn Hạng Chuồng (Air Stall Selector)** | Thiết kế 3 hộp lớn có hình vẽ minh họa khoang máy bay:<br>1. 🥉 **Chuồng Ghép (Shared Stall):** 3 ngựa/khoang - Tiết kiệm.<br>2. 🥈 **Chuồng Rưỡi (Wide Stall):** 2 ngựa/khoang - Rộng rãi.<br>3. 🥇 **Chuồng VIP Riêng (Private Stall):** 1 ngựa/khoang - Đẳng cấp, cách ly tuyệt đối. | Click vào hộp nào, hộp đó sáng viền vàng đồng `#d97706`. Tóm tắt quyền lợi hiển thị ngay bên dưới. | Map vào giá trị enum kỹ thuật: `SHARED`, `WIDE`, `PRIVATE`. |
| **Dịch vụ chăm sóc đặc biệt** | Các nút bật/tắt (Toggle switch):<br>• Bác sĩ thú y đi cùng chuyến bay 🩺<br>• Khẩu phần ăn chuyên biệt cho ngựa đua 🥕<br>• Cảm biến theo dõi nhịp tim/nhiệt độ 24/7 📈 | Bật/tắt mượt mà; ô ghi chú khẩu phần mở ra nếu bật tùy chọn ăn đặc biệt. | Lưu vào object `services: { needsEscort: boolean, dietNotes: string, monitoring: boolean }`. |

#### BƯỚC 4: RÀ SOÁT & GỬI YÊU CẦU (REVIEW & SUBMIT)
| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Bản tóm tắt hành trình hoàng gia (Passport Summary Card)** | Khung nền kem viền chỉ vàng tóm tắt: Tuyến bay `SGN ✈️ LHR`, Ngựa `Tia Chớp Đỏ`, Hạng chuồng `VIP Private`, Ngày bay dự kiến. | Khách xem lại lần cuối, có nút "Sửa" nhỏ ở từng phần nếu muốn đổi. | Gom toàn bộ dữ liệu từ Bước 1, 2, 3. |
| **Nút "GỬI YÊU CẦU VẬN CHUYỂN"** | Nút bấm lớn màu xanh Emerald, hiệu ứng tỏa sáng nhẹ. | Bấm nút $\rightarrow$ Hiện hiệu ứng máy bay cất cánh; hiện Popup thông báo chúc mừng: *"Yêu cầu của bạn đã được chuyển đến Trưởng phòng Vận hành. Chúng tôi sẽ thẩm định và phản hồi trong 24h!"*. | Gọi `POST /api/transport-orders` (hoặc submit draft) gửi toàn bộ JSON lên BE. Chuyển hướng sang trang Chi tiết Đơn hàng. |

---

### MÀN HÌNH 1.3: HỒ SƠ THÚ Y 2 TẦNG & BIỂU MẪU CHUẨN QUỐC TẾ (COMPLIANCE DOSSIER)
* **Vị trí file:** `src/features/compliance/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Tab 1: "Tủ Hồ Sơ Của Ngựa" 🐎** | Danh sách các giấy tờ dài hạn của ngựa (Hộ chiếu FEI, Khai sinh, Chip). | Khách kiểm tra thấy giấy nào sắp hết hạn thì bấm nộp bản mới cập nhật. | Gọi `GET /api/horses/{id}/documents`. |
| **Tab 2: "Checklist Kiểm Dịch Chuyến Bay" ✈️** | Danh sách giấy tờ do hệ thống tự sinh cho chuyến bay này (Cúm ngựa, Coggins EIA, Glanders CFT...). Mỗi dòng có Huy hiệu trạng thái: ⚪ Chưa nộp, 🟡 Đang chờ thẩm định, 🟢 Đạt chuẩn, 🔴 Bị từ chối. | Người dùng nhìn vào biết ngay mình còn thiếu loại giấy tờ nào trước giờ bay. | Gọi `GET /api/transport-orders/{orderId}/compliance/documents`. |
| **Nút "📄 Xem Biểu Mẫu Chuẩn" (Trên từng dòng)** | Bên cạnh mục *Xét nghiệm Coggins*, có nút màu vàng đồng: **"Xem Biểu Mẫu Chuẩn"**. | **Bật Modal Phôi Mẫu Quốc Tế (StandardFormTemplateModal):** Hiển thị văn bản chuẩn của WOAH / Viện Thú Y có quốc huy, mã hiệu form `AGID-EIA-TEST`, cơ quan cấp thẩm quyền và đoạn văn chứng nhận âm tính. | Nhận `typeCode` (vd `COGGINS_EIA`), ngầm gọi `GET /api/lookups/document-templates/{typeCode}` để lấy toàn bộ phôi văn bản từ DB. |
| **Nút "🖨️ In Mẫu Này" & "⬇️ Tải PDF Trắng" (Trong Modal Phôi)** | Khách có thể in ra giấy ngay lập tức để mang ra phòng khám thú y, hoặc tải file PDF phôi trắng chuẩn về máy. | Bấm in: Mở hộp thoại máy in trình duyệt (`window.print()`). Bấm tải: Trình duyệt tải ngay file PDF phôi chính thức. | Tải file trực tiếp từ `/api/files/{templateFileKey}` do Backend stream nội bộ. |
| **Nút "Nộp Giấy Tờ" (Submit Action)** | Khách bấm nộp giấy tờ cho một mục trong checklist. | **Mở Modal Nộp Thông Minh với 2 tùy chọn:**<br>1. 👉 **Chọn từ Tủ hồ sơ có sẵn của ngựa:** Dropdown hiện Hộ chiếu FEI đã lưu ở Tab 1 $\rightarrow$ Click chọn là xong ngay, KHÔNG CẦN SCAN LẠI!<br>2. 👉 **Tải file mới từ máy tính:** Khung kéo thả PDF/ảnh nếu là xét nghiệm mới làm. | • Nếu chọn cách 1: Gửi `{ "existingDocumentVersionId": 123 }`.<br>• Nếu chọn cách 2: Gọi `POST /api/files/upload` lấy `fileKey`, sau đó gửi `{ "fileKey": "uuid..." }`.<br>Gửi đến `POST /api/transport-orders/{order}/compliance/requirements/{id}/upload-and-submit`. Dòng checklist chuyển ngay sang màu vàng 🟡. |

---

### MÀN HÌNH 1.4: DUYỆT BÁO GIÁ & ĐẶT CỌC (QUOTATION & DEPOSIT PAYMENT)
* **Vị trí file:** `src/features/quotations/` & `src/features/payments/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Bảng chiết tính Báo giá chính thức** | Bảng chi phí rõ ràng từng khoản bằng tiền tệ chuẩn: Cước chặng bay hàng không, Xe chuyên dụng mặt đất, Chi phí kiểm dịch & chuồng cách ly, Bảo hiểm ngựa đua. | Hiển thị rõ: Tổng tiền, Số tiền cọc cần thanh toán trước (thường là 30%), Hạn hiệu lực của báo giá (đồng hồ đếm ngược). | Gọi `GET /api/transport-orders/{id}/quotes/current`. |
| **Nút "Chấp Thuận Báo Giá"** | Nút bấm màu xanh Emerald. | Khách bấm $\rightarrow$ Hiện modal xác nhận điều khoản dịch vụ; bấm Đồng ý $\rightarrow$ Chuyển thẳng sang Màn hình Thanh toán cọc. | Gọi `POST /api/transport-orders/{id}/quotes/accept`. Đơn hàng chuyển trạng thái sang `AwaitingDeposit`. |
| **Màn hình Thanh toán Cọc** | Hướng dẫn chuyển khoản ngân hàng công ty: Số tài khoản, Ngân hàng, Nội dung chuyển khoản chuẩn, Mã VietQR tự động điền sẵn số tiền cọc. | Khách quét mã trên ứng dụng ngân hàng cực kỳ tiện lợi. | Dữ liệu tài khoản công ty và mã thanh toán. |
| **Khung tải lên Bằng chứng chuyển khoản** | Ô tải ảnh chụp màn hình giao dịch chuyển khoản thành công hoặc ủy nhiệm chi. | Tải ảnh lên hiện ngay ảnh thu nhỏ (thumbnail) kèm dấu tích xanh: *"Đã tải biên lai thành công"*. | Gọi `POST /api/files/upload` lấy `fileKey`, sau đó gọi `POST /api/transport-orders/{id}/payments/deposit` gửi `{ paymentProofFileKey }`. |

---

### MÀN HÌNH 1.5: THEO DÕI HÀNH TRÌNH TRỰC TIẾP & KÝ NHẬN BÀN GIAO
* **Vị trí file:** `src/features/execution/` & `src/features/handover/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Dòng thời gian chuyến đi (Interactive Trip Timeline)** | Bản đồ và timeline trực quan từng chặng:<br>• Chặng 1: 🚚 Đón ngựa tại Ba Vì $\rightarrow$ Tân Sơn Nhất (Đã xong 🟢).<br>• Chặng 2: ✈️ Chuyến bay QR8952 đi Heathrow (Đang bay 🟡).<br>• Chặng 3: 🚚 Giao về trường đua Newmarket (Sắp tới ⚪). | Bấm vào từng chặng xem được: Biển số xe tải, Mã hiệu chuyến bay, Tên tài xế và số điện thoại liên hệ khẩn cấp. | Gọi `GET /api/transport-orders/{id}/tracking`. |
| **Nhật ký phúc lợi ngựa (Welfare Cards)** | Khách bấm xem sức khỏe ngựa: Xem biểu đồ nhiệt độ khoang xe, ảnh chụp ngựa ăn cỏ lúc nghỉ chân do tài xế tải lên. | Khách hoàn toàn an tâm về thể trạng chú ngựa cưng triệu đô của mình. | Gọi `GET /api/transport-orders/{id}/welfare-logs`. Hiển thị ảnh chụp từ `/api/files/{photoKey}`. |
| **Màn hình Ký nhận Bàn giao (Final Delivery Confirmation)** | Khi xe đến đích, khách kiểm tra ngựa thực tế. Màn hình hiện ảnh chụp ngựa tại chuồng đích do tài xế vừa chụp. | Khách chọn 1 trong 3 nút: **"Nhận đủ & Ngựa khỏe mạnh" ✅**, *"Nhận có ghi chú" ⚠️*, *"Có sự cố" ❌*. Có ô ký tên cảm ứng trực tiếp trên màn hình điện thoại. | Gọi `POST /api/transport-orders/{id}/delivery/confirm` với `{ outcome: "ACCEPTED_FULL", notes: "...", signatureFileKey }`. |

---

## 👔 ACTOR 2: LOGISTICS MANAGER (QUẢN LÝ VẬN HÀNH / TRƯỞNG PHÒNG)

---

### MÀN HÌNH 2.1: HÀNG ĐỢI ĐÁNH GIÁ ĐƠN & PHÂN CÔNG NHÂN SỰ
* **Vị trí file:** `src/features/assessment/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Bảng Hàng đợi đơn mới (Request Queue)** | Danh sách các đơn khách vừa gửi (`SUBMITTED`). Cột hiển thị: Mã đơn, Khách hàng, Tuyến đường (`SGN ➔ LHR`), Giống ngựa, Ngày mong muốn, Cờ ưu tiên. | Dòng nào gấp (dưới 7 ngày) tự động đánh dấu badge đỏ: `Khẩn cấp`. Bấm vào dòng mở Drawer chi tiết. | Gọi `GET /api/manager/transport-orders?state=SUBMITTED`. |
| **Drawer Đánh giá tính khả thi (Feasibility Assessment)** | Manager kiểm tra tuyến đường: Tuyến này hãng bay có nhận ngựa không? Nước đến có đang có dịch bệnh cấm nhập không? | Có 2 nút lớn: **"Duyệt Tiếp Nhận"** (Xanh) hoặc **"Từ Chối Tuyến"** (Đỏ kèm ô lý do). | Lưu đánh giá vào state. |
| **Modal Phân công 2 Nhân sự phụ trách (Assign Specialist & Coordinator)** | Khi bấm "Duyệt Tiếp Nhận", một popup trang trọng hiện lên yêu cầu Manager phân công trách nhiệm:<br>• **Chuyên viên Kiểm dịch (Specialist):** Dropdown danh sách chuyên viên hồ sơ.<br>• **Điều phối viên Vận chuyển (Coordinator):** Dropdown danh sách nhân viên hậu cần. | Chọn tên nhân viên nào, hiện avatar và số lượng ca đang xử lý của nhân viên đó (tránh quá tải). | Gọi `GET /api/manager/staff?roles=SPECIALIST,COORDINATOR` nạp vào 2 dropdown. |
| **Nút "Xác Nhận Duyệt & Giao Việc"** | Nút bấm xác nhận cuối cùng. | Đơn lập tức biến mất khỏi hàng đợi `SUBMITTED`, chuyển sang tab chuẩn bị. Toast xanh: *"Đã phân công thành công cho Specialist A và Coordinator B!"*. | Gọi `POST /api/manager/transport-orders/{id}/decisions` với payload: `{ decision: "APPROVED", specialistUserId: 12, coordinatorUserId: 15 }`. **Backend kích hoạt tự động sinh checklist giấy tờ kiểm dịch!** |

---

### MÀN HÌNH 2.2: DUYỆT BÁO GIÁ & ĐỐI SOÁT TÀI CHÍNH
* **Vị trí file:** `src/features/quotations/` & `src/features/settlement/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Hàng đợi Báo giá chờ duyệt (Quote Review Queue)** | Xem dự thảo báo giá do Coordinator trình lên. Manager xem cơ cấu giá gốc đối tác + phí quản lý công ty. | Có bảng so sánh biên lợi nhuận (Profit Margin %) trực quan. | Gọi `GET /api/manager/quotes?status=DRAFT_SUBMITTED`. |
| **Nút "Phát Hành Báo Giá Cho Khách"** | Manager duyệt phương án giá. | Hệ thống phát hành phiên bản báo giá chính thức gửi đến portal của Customer. | Gọi `POST /api/manager/quotes/{id}/issue`. |
| **Màn hình Đối soát Tiền Cọc (Payment Reconciliation)** | Màn hình hiển thị ảnh chụp biên lai chuyển khoản của khách bên cạnh thông tin đơn hàng và số tiền cọc cần thu. | Manager đối chiếu với tài khoản ngân hàng thực tế, bấm **"Xác Nhận Đã Nhận Đủ Cọc"**. | Gọi `POST /api/manager/payments/{id}/reconcile` gửi `{ status: "VERIFIED", receivedAmount }`. **Cổng Tài Chính (Financial Gate) tự động chuyển sang màu XANH 🟢!** |

---

### MÀN HÌNH 2.3: BẢNG KIỂM SOÁT 3 CỔNG SẴN SÀNG & CHO PHÉP XUẤT PHÁT
* **Vị trí file:** `src/features/workflow/GatesSummary.tsx` & `src/features/departure/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Widget 3 Cổng Kiểm Soát Xuất Phát (3 Gates Dashboard)** | Trung tâm điều hành chuyến bay hiển thị 3 ổ khóa/cổng đèn tín hiệu:<br>1. 💰 **CỔNG TÀI CHÍNH:** Đã nhận đủ tiền cọc.<br>2. 🩺 **CỔNG PHÁP LÝ:** Chuyên viên kiểm dịch đã cấp giấy thông quan (Clearance).<br>3. 🚛 **CỔNG VẬN HÀNH:** Đã khóa khoang bay và điều xe tải/tài xế. | Mỗi cổng hiển thị trạng thái Xanh 🟢 hoặc Đỏ 🔴 kèm tên người chịu trách nhiệm xác nhận cổng đó. | Gọi `GET /api/transport-orders/{id}/readiness`. Backend tổng hợp trạng thái từ 3 phân hệ. |
| **Nút "BẬT ĐÈN XANH CHO PHÉP XUẤT PHÁT" (Greenlight to Depart)** | Nút bấm tối thượng của Manager để kích hoạt chuyến đi thực tế. | **Logic an toàn tuyệt đối:** Nếu còn 1 trong 3 cổng màu Đỏ, nút này bị KHÓA (disabled) kèm chú thích: *"Chưa đủ điều kiện xuất phát: Cần hoàn tất Cổng Pháp Lý"*. Chỉ khi cả 3 cổng đều XANH, nút mới sáng rực màu xanh Emerald. | Khi bấm: Gọi `POST /api/manager/transport-orders/{id}/departure-greenlight`. Hệ thống phát lệnh điều động đến ứng dụng của Driver và gửi thông báo cho khách hàng! |

---

## 🩺 ACTOR 3: TRANSPORT SPECIALIST (CHUYÊN VIÊN KIỂM DỊCH & HỒ SƠ)

---

### MÀN HÌNH 3.1: BÀN LÀM VIỆC HỒ SƠ ĐƯỢC PHÂN CÔNG (ASSIGNED CASES DESK)
* **Vị trí file:** `src/features/specialist-desk/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Bảng danh sách Ca kiểm dịch (Assigned Cases)** | Specialist chỉ thấy các hồ sơ mà Manager đã gán đích danh cho mình. Lọc theo: Chờ thẩm định, Sắp đến ngày bay, Hồ sơ bị từ chối chờ nộp lại. | Có thanh tiến độ hồ sơ: Ví dụ `4/5 giấy tờ đã đạt`. Bấm vào ca để mở bàn làm việc chi tiết. | Gọi `GET /api/specialist/assigned-cases` (tự động lọc theo token của Specialist đang đăng nhập). |
| **Nút "+ Yêu Cầu Thêm Giấy Tờ Bổ Sung"** | Nếu phát hiện tuyến đường đặc biệt cần xét nghiệm riêng (ví dụ nước đích có dịch cúm mới bùng phát). | Mở modal chọn loại giấy tờ từ danh mục, ghi chú hướng dẫn cho khách và đặt hạn chót nộp. | Gọi `POST /api/transport-orders/{id}/compliance/requirements` để thêm yêu cầu vào checklist của khách. |

---

### MÀN HÌNH 3.2: SOI GIẤY TỜ SONG SONG & RA QUYẾT ĐỊNH (DOCUMENT REVIEW DESK)
* **Vị trí file:** `src/features/specialist-desk/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Giao diện Soi Hồ Sơ Chia Đôi Màn Hình (Split Screen Review)** | • **Bên trái:** Thông tin đối chiếu chuẩn (Tên ngựa, Số chip 15 số, Tên chủ ngựa, Yêu cầu pháp lý của nước đích).<br>• **Bên phải:** Trình xem file PDF/Ảnh trực tiếp cực nét, có công cụ zoom phóng to con dấu, xoay trang. | Specialist vừa nhìn thấy file khách nộp, vừa có sẵn thông số để đối soát, không phải mở tab khác. | Trình xem file nhúng `<iframe src="/api/files/{fileKey}">` lấy trực tiếp từ stream của Backend. |
| **Nút "Phê Duyệt Đạt" (Accept Document)** | Nút bấm màu xanh lá có icon huy hiệu ✅. | Bấm duyệt $\rightarrow$ Mục giấy tờ đó chuyển ngay sang trạng thái Đạt chuẩn màu xanh lá. | Gọi `POST /api/transport-orders/{order}/compliance/submissions/{id}/reviews` với body `{ decision: "ACCEPTED", comments: "Đối soát vi mạch và hạn tiêm trùng khớp." }`. |
| **Nút "Từ Chối & Yêu Cầu Nộp Lại" (Reject Document)** | Nút bấm màu đỏ cảnh báo ❌. | Mở popup bắt buộc chọn lý do từ chối mẫu (*Ảnh mờ không rõ số chip, Giấy xét nghiệm đã quá hạn 30 ngày, Thiếu chữ ký bác sĩ thú y...*) và ô hướng dẫn khách làm lại. | Gọi endpoint review với body `{ decision: "REJECTED", comments: "Phiếu xét nghiệm Coggins đã quá hạn 30 ngày tính đến ngày bay, yêu cầu lấy mẫu máu xét nghiệm lại." }`. Hệ thống bắn thông báo yêu cầu nộp lại cho khách! |
| **Nút "XÁC NHẬN ĐẠT CHUẨN THÔNG QUAN" (Grant Legal Clearance)** | Nút bấm kích hoạt cổng pháp lý. | Chỉ sáng lên khi 100% các mục trong checklist đều đã được duyệt "ACCEPTED". Specialist bấm nút để ký số giải phóng kiểm dịch. | Gọi `POST /api/transport-orders/{order}/compliance/clearances`. **Cổng Pháp Lý (Legal Gate) trên bảng Manager chuyển sang màu XANH 🟢!** |

---

## 🚛 ACTOR 4: FLEET & ROUTE COORDINATOR (ĐIỀU PHỐI VIÊN)

---

### MÀN HÌNH 4.1: STUDIO LẬP HÀNH TRÌNH ĐA PHƯƠNG THỨC (MULTI-LEG TRIP STUDIO)
* **Vị trí file:** `src/features/plans/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Sơ đồ Kéo Ghép Chặng (Multi-Leg Route Builder)** | Coordinator thiết kế chuỗi vận tải liên hoàn trực quan:<br>• **Chặng 1 (Đường bộ - ROAD):** Xe chuyên dụng đón từ Trang trại $\rightarrow$ Sân bay xuất phát.<br>• **Chặng 2 (Hàng không - AIR):** Chuyến bay vận tải ngựa xuyên lục địa.<br>• **Chặng 3 (Đường bộ - ROAD):** Xe chuyên dụng đón từ Sân bay đích $\rightarrow$ Trường đua đích. | Có thể thêm các bước đệm: "Trạm kiểm dịch cửa khẩu" hoặc "Khu cách ly thú y 48h" bằng nút bấm `+ Thêm chặng dừng`. | Gọi `POST /api/coordinator/orders/{id}/plan` lưu cấu trúc các chặng vào bảng `dbo.TripLeg`. |
| **Cấu hình Khoang Máy Bay (Air Stall Configurator)** | Coordinator chọn loại máy bay vận tải (Boeing 777F / 747-8F) và gán mã chuồng (Stall Box 12A - Hạng Private). | Đảm bảo vị trí khoang chuồng phù hợp với kích thước và tính khí của chú ngựa. | Lưu thông tin đặt chỗ bay vào `dbo.FlightReservation`. |

---

### MÀN HÌNH 4.2: TÍNH DỰ THẢO BÁO GIÁ & ĐIỀU ĐỘNG TÀI NGUYÊN (RESOURCES & QUOTE)
* **Vị trí file:** `src/features/resources/` & `src/features/quotations/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Bảng nhập chi phí đối tác (Supplier Cost Worksheet)** | Coordinator nhập chi phí thực tế nhận được từ các đối tác: Cước hãng bay Emirates SkyCargo, Phí xe tải nội địa, Phí handling sân bay. | Hệ thống tự động áp dụng tỷ lệ markup/phí quản lý của công ty và tự tính ra: Tổng tiền báo giá + Tiền cọc tối thiểu. | Tự động tính toán theo công thức trong local state. |
| **Nút "Trình Báo Giá Lên Manager Duyệt"** | Nút gửi nội bộ. | Báo giá chuyển sang hàng đợi của Manager để kiểm duyệt. | Gọi `POST /api/coordinator/orders/{id}/quote-draft`. |
| **Điều động Xe & Nhân sự (Asset & Crew Assignment)** | Bảng phân công cho từng chặng đường bộ:<br>• Dropdown chọn Xe tải chuyên dụng (hiện biển số, sức chứa, tình trạng bảo dưỡng).<br>• Dropdown chọn Tài xế (Driver) chính và phụ.<br>• Dropdown chọn Bác sĩ thú y / Chuyên viên áp tải (Escort). | Nếu chọn xe đang bận ở chuyến khác, hệ thống cảnh báo xung đột lịch ngay lập tức. | Gọi `POST /api/coordinator/trips/{id}/assign-resources`. **Sau khi phân bổ đủ xe và vé bay, Cổng Vận Hành (Operational Gate) chuyển sang XANH 🟢!** |

---

## 📱 ACTOR 5: DRIVER / GROOM ESCORT (TÀI XẾ XE CHUYÊN DỤNG & ÁP TẢI)

---

### MÀN HÌNH 5.1: BÀN TÁC NGHIỆP DI ĐỘNG (MY ASSIGNED LEGS)
* **Vị trí file:** `src/features/departure/` & `src/features/execution/`
* *Giao diện thiết kế tối ưu 100% cho điện thoại di động / máy tính bảng trên xe tải.*

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Thẻ chặng vận chuyển hôm nay (Today's Leg Card)** | Thẻ lớn nổi bật: Giờ đón ngựa, Địa chỉ trang trại kèm nút **"Mở Google Maps chỉ đường"**, Thông tin con ngựa (Ảnh, Tên, Mã chip, Tính khí cần chú ý). | Nút bấm lớn màu xanh: **"BẮT ĐẦU ĐÓN NGỰA"**. | Gọi `GET /api/driver/my-assigned-legs` lấy các chặng của tài xế. |
| **Biên bản kiểm tra lúc nhận ngựa (Pick-up Manifest & Chip Check)** | Tài xế đến trang trại, dùng máy quét chip cầm tay đối soát mã 15 số trên cổ ngựa với số hiển thị trên app. Có ô tích chọn: *"Đúng mã chip ISO"* ✅. | Chụp 1 tấm ảnh toàn thân ngựa trước khi lên xe để làm bằng chứng pháp lý (không trầy xước). | Gọi `POST /api/files/upload` tải ảnh thể trạng ban đầu. |
| **Nút "XÁC NHẬN NGỰA LÊN XE & BẮT ĐẦU CHẶNG"** | Nút trượt (Slide to start) tránh bấm nhầm. | Chặng đường bộ chính thức bắt đầu, đồng hồ hành trình kích hoạt, khách hàng nhận thông báo xe đã lăn bánh. | Gọi `POST /api/driver/legs/{id}/start` gửi kèm ảnh kiểm tra ban đầu. |

---

### MÀN HÌNH 5.2: NHẬT KÝ SỨC KHỎE NGỰA & BIÊN BẢN GIAO NHẬN TẠI ĐÍCH
* **Vị trí file:** `src/features/execution/` & `src/features/handover/`

| Thành phần UI | Trải nghiệm Con người (Human UX) | Phản ứng tức thì của Giao diện (Reactive UI State) | Hệ thống chạy ngầm (Backend Engine) |
| :--- | :--- | :--- | :--- |
| **Nút nhanh "+ Ghi Nhật Ký Phúc Lợi Ngựa" (Welfare Quick Log)** | Cứ mỗi 2-3 tiếng dừng chân hoặc kiểm tra khoang xe, tài xế/escort bấm nút này: Nhập nhiệt độ thùng xe (°C), tích chọn: Đã cho uống nước 💧, Đã cho ăn cỏ khô 🌾, Ngựa bình tĩnh/tỉnh táo 🐎. | Thao tác cực nhanh dưới 15 giây, có thể đính kèm ảnh chụp nhanh. | Gọi `POST /api/driver/legs/{id}/welfare-logs` gửi `{ ambientTempC, waterOffered: true, feedOffered: true, behaviorStatus: "CALM", notes: "..." }`. Dữ liệu lập tức hiện lên app của Khách! |
| **Nút khẩn cấp "BÁO CÁO SỰ CỐ" (Emergency Incident)** | Nút màu đỏ nổi bật nếu có vấn đề: Ngựa bị sốt, đau bụng (Colic), hoặc xe bị hỏng lốp/kẹt phà. | Chọn mức độ nghiêm trọng và chụp ảnh hiện trường. | Gọi `POST /api/driver/legs/{id}/incidents`. Toàn bộ hệ thống Manager và Coordinator nhận cảnh báo đỏ tức thì! |
| **Màn hình Bàn Giao Ngựa Tại Đích (Leg Handover)** | Xe đến chuồng đích: Tài xế dắt ngựa xuống an toàn. Bật màn hình bàn giao: Chụp ảnh ngựa khỏe mạnh tại chuồng mới. | Đưa điện thoại cho người nhận ngựa ký tên cảm ứng trực tiếp trên màn hình (Digital Signature Pad). | Gọi `POST /api/files/upload` lưu chữ ký và ảnh bàn giao, sau đó gọi `POST /api/driver/legs/{id}/handover`. Chặng hoàn tất 100%! |

---

# PHẦN 2: HƯỚNG DẪN THỰC THI CHO CLAUDE CODE TRONG REPO FE

Chào Claude Code, bạn hãy thực thi toàn bộ kiến trúc trên theo đúng 4 bước chuẩn hóa:

1. **Bước 1: Nâng cấp Network Layer & Lookups (`src/shared/api/`)**
   - Viết các hàm fetch chuẩn TypeScript cho: `lookups.ts` (countries, locations, document-templates), `files.ts` (upload multipart và stream preview URL).
2. **Bước 2: Thay thế toàn bộ Input thô bằng User-Centric Controls**
   - Sửa `src/features/transport-orders/`: Thay ô text country bằng Cascading Dropdown Nước $\rightarrow$ Sân bay. Thay chọn ngựa bằng Card chọn trực quan.
   - Sửa `src/features/compliance/`: Chia 2 Tab rõ rệt. Tạo component `StandardFormTemplateModal.tsx` gọi API lấy phôi chuẩn. Sửa modal nộp hồ sơ cho phép chọn giấy tờ cũ từ Tab 1.
3. **Bước 3: Hoàn thiện Bàn làm việc cho Manager, Specialist, Coordinator, Driver**
   - Lắp ráp Widget 3 Cổng ([GatesSummary.tsx](file:///D:/FPT-ki7/SWP/Cross-Border%20Racehorse%20Transport%20System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/workflow/GatesSummary.tsx)) chặn nút xuất phát khi chưa đủ 3 cổng xanh.
   - Tạo màn hình Split-screen cho Specialist soi file kiểm dịch.
   - Tạo giao diện di động cho Driver ghi nhật ký phúc lợi và ký nhận bàn giao.
4. **Bước 4: Kiểm thử toàn diện**
   - Chạy lệnh xác thực TypeScript và Build:
     ```bash
     npx tsc --noEmit
     npm run build
     ```
   - Đảm bảo 0 lỗi TypeScript, bản build thành công ra thư mục `dist`.
