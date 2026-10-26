# TÀI LIỆU BÀN GIAO FRONTEND (FE HANDOFF SPECIFICATION)
> **Dự án:** EquiTransit — Cross-Border Racehorse Transport System  
> **Phiên bản:** 2.0 (Data-Driven Architecture & 5 Actors Lifecycle)  
> **Ngày bàn giao:** 24/10/2026  
> **Thư mục FE:** `D:\FPT-ki7\SWP\Cross-Border Racehorse Transport System\FE\SWP391_FA26_EQUITRANSIT_FE`  
> **Công nghệ:** React 19, TypeScript, Vite, TanStack Query 5, Tailwind/CSS Custom (`heritage.css`)

---

## 1. MỤC TIÊU VÀ NGUYÊN TẮC THỰC HIỆN
1. **100% Data-Driven (Xóa bỏ MockData & Hardcode):**
   - Loại bỏ hoàn toàn mảng tĩnh danh sách nước, sân bay, loại giấy tờ trong FE. Mọi dữ liệu danh mục đều phải gọi từ các API `/api/lookups/*`.
2. **Loại bỏ Supabase / Dịch vụ ngoài:**
   - Thay thế việc tải/xem file bên ngoài bằng hệ thống lưu trữ tệp tin nội bộ của Spring Boot: `POST /api/files/upload` và stream inline qua `GET /api/files/{fileKey}`.
3. **Bảo tồn Bản sắc Thiết kế Độc quyền (Heritage Luxury Turf):**
   - Giữ nguyên bộ nhận diện thương hiệu trong `heritage.css`: British Racing Green (`#0f5132`), Royal Gold (`#d97706`), Canvas Slate (`#f4f7f6`).
   - Tuyệt đối không copy class Ant Design hay phong cách CRUD phổ thông của web tham khảo. Mọi modal, bảng biểu, dropdown đều dùng component và style thuần của EquiTransit.
4. **Vận hành Khép kín Chuỗi 5 Actor:**
   - Customer (Khách) $\rightarrow$ Logistics Manager (Quản lý) $\rightarrow$ Transport Specialist (Kiểm dịch/Pháp lý) $\rightarrow$ Fleet & Route Coordinator (Điều phối) $\rightarrow$ Driver / Escort (Tài xế/Áp tải).

---

## 2. BẢNG TỔNG HỢP API CONTRACTS MỚI CHO FE

### A. Tra cứu Danh mục Động (Lookups API)
* `GET /api/lookups/countries`: Trả về danh sách quốc gia hỗ trợ:
  ```json
  [
    { "countryCode": "VN", "countryName": "Việt Nam" },
    { "countryCode": "GB", "countryName": "Vương quốc Anh" },
    { "countryCode": "FR", "countryName": "Pháp" },
    { "countryCode": "AE", "countryName": "Các Tiểu vương quốc Ả Rập Thống nhất" }
  ]
  ```
* `GET /api/lookups/locations?country={code}&type={CITY|AIRPORT}`: Trả về danh sách địa điểm theo từng nước:
  ```json
  [
    { "locationId": 1, "countryCode": "VN", "locationType": "AIRPORT", "locationName": "Sân bay Tân Sơn Nhất", "locationCode": "SGN" },
    { "locationId": 2, "countryCode": "VN", "locationType": "CITY", "locationName": "TP. Hồ Chí Minh", "locationCode": null }
  ]
  ```
* `GET /api/lookups/document-templates`: Trả về toàn bộ biểu mẫu phôi văn bản chuẩn quốc tế:
  ```json
  [
    {
      "typeCode": "FEI_PASSPORT",
      "displayName": "Hộ chiếu ngựa quốc tế FEI",
      "formCode": "FEI FORM PASSPORT-ANNEX-IX",
      "issuingAuthority": "Fédération Equestre Internationale (Lausanne)",
      "certTextTemplate": "Xác nhận cá thể ngựa đã được đối soát vi mạch ISO 11784/11785...",
      "badgeColor": "blue",
      "emblemIcon": "passport",
      "templateFileKey": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "templateDownloadUrl": "/api/files/3fa85f64-5717-4562-b3fc-2c963f66afa6"
    }
  ]
  ```
* `GET /api/lookups/document-templates/{typeCode}`: Lấy chi tiết 1 mẫu phôi.

### B. Lưu trữ Tệp tin Nội bộ (Files API)
* `POST /api/files/upload`: Tải file PDF hoặc ảnh (PNG/JPEG) $\le$ 10MB (Header: `multipart/form-data`, param: `file`):
  ```json
  {
    "fileKey": "8a72b14c-4e89-4b61-9c12-32aef192b012",
    "fileName": "Coggins_Test_Report.pdf",
    "contentType": "application/pdf",
    "fileSizeBytes": 1048576,
    "fileHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "downloadUrl": "/api/files/8a72b14c-4e89-4b61-9c12-32aef192b012"
  }
  ```
* `GET /api/files/{fileKey}`: Stream trực tiếp file với `Content-Disposition: inline`. Dùng làm `src` cho thẻ `<iframe src="/api/files/{key}">` hoặc `<img src="/api/files/{key}">`.

### C. Hồ sơ Kiểm dịch 2 Tầng (Compliance & Vet Records API)
* `GET /api/transport-orders/{orderId}/compliance/documents`: Trả về checklist hồ sơ pháp lý tự sinh của đơn.
* `POST /api/transport-orders/{orderId}/compliance/requirements/{requirementId}/upload-and-submit`: Nộp hồ sơ. Hỗ trợ **2 trường hợp**:
  * **Trường hợp 1 - Upload file mới:**
    ```json
    { "fileKey": "8a72b14c-4e89-4b61-9c12-32aef192b012" }
    ```
  * **Trường hợp 2 - Tái sử dụng giấy tờ sẵn có từ hồ sơ ngựa (Tab 1):**
    ```json
    { "existingDocumentVersionId": 104 }
    ```
* `POST /api/transport-orders/{orderId}/compliance/submissions/{submissionId}/reviews`: Specialist thẩm định:
  ```json
  {
    "decision": "ACCEPTED", // hoặc "REJECTED"
    "comments": "Hộ chiếu còn hạn, đối soát vi mạch trùng khớp."
  }
  ```

---

## 3. CÁC MÀN HÌNH VÀ COMPONENT TRỌNG TÂM CẦN NÂNG CẤP

### 1. Form Đặt đơn vận chuyển (`src/features/transport-orders/pages.tsx` & `form.ts`)
* **Hiện tại:** Người dùng gõ text mã nước (`VN`, `GB`).
* **Nâng cấp mới:**
  * Đổi ô Nước đi (`originCountryCode`) và Nước đến (`destinationCountryCode`) thành **Select/Combobox** load từ `GET /api/lookups/countries`.
  * Thêm ô chọn Địa điểm/Sân bay (`originLocationId`, `destinationLocationId`) tự động kích hoạt gọi `GET /api/lookups/locations?country={code}&type=AIRPORT` ngay khi khách chọn xong nước.

### 2. Màn hình Hồ sơ Thú y & Checklist 2 Tầng (`src/features/compliance/`)
* **Tab 1: "Hồ sơ gốc của ngựa":** Hiển thị giấy tờ dài hạn gắn liền với ngựa (`/api/horses/{id}/documents`).
* **Tab 2: "Checklist kiểm dịch theo chuyến":**
  * Từng dòng yêu cầu có nút **"Xem phôi mẫu"** $\rightarrow$ mở `StandardFormTemplateModal`.
  * Khi bấm nộp giấy tờ, hiển thị 2 lựa chọn:
    1. *Tải file mới lên* (gọi `POST /api/files/upload`).
    2. *Chọn từ hồ sơ ngựa đã có* (dropdown các giấy tờ từ Tab 1).

### 3. Component Modal Mẫu phôi chuẩn (`StandardFormTemplateModal.tsx`)
* Nhận `typeCode`, tự động gọi `GET /api/lookups/document-templates/{typeCode}`.
* Vẽ khung văn bản chứng nhận trang trọng theo phong cách **Heritage EquiTransit**:
  * Viền chỉ vàng đồng (`#d97706`), nền kem giấy chứng chỉ sang trọng.
  * Quốc huy / Biểu tượng, Tên cơ quan cấp thẩm quyền (`issuingAuthority`), Mã số mẫu (`formCode`).
  * Đoạn văn pháp lý mẫu (`certTextTemplate`).
  * Nút **In chứng từ (`window.print()`)** và nút **Tải file PDF phôi trắng** (nếu có `templateDownloadUrl`).

### 4. Màn hình Duyệt của Specialist & Manager
* Modal xem tài liệu thẩm định: Sử dụng trực tiếp `GET /api/files/{fileKey}` trong iframe inline, hỗ trợ zoom, xoay và tải về.
* Bảng kiểm soát 3 Gate (`GatesSummary.tsx`): Hiển thị rõ trạng thái 3 cổng:
  * 🟢 **Tài chính:** Đã đối soát cọc thành công.
  * 🟢 **Pháp lý:** Specialist đã cấp `Clearance`.
  * 🟢 **Vận hành:** Coordinator đã chốt khoang bay và xe tải.
  $\rightarrow$ Nút **"Cho phép xuất phát" (Greenlight to Depart)** chỉ kích hoạt khi cả 3 cổng đều chuyển sang xanh.
