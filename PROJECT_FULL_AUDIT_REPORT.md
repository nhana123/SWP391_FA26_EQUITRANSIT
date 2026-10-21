# EquiTransit — Báo Cáo Kiểm Toán Kỹ Thuật Toàn Diện

**Ngày kiểm toán:** 2026-10-21  
**Phạm vi:** FE `feature/heritage-logistics-ui` và BE `feature/creative-journey-studio`  
**Nguyên tắc:** Chỉ kết luận dựa trên code, migration, test và wiring đang có; test unit/integration không được coi là bằng chứng production E2E nếu chưa có môi trường DB/API thật.

## Tóm tắt điều hành

| Hạng mục | Kết luận thực tế |
|---|---|
| BE Git | Sạch, commit mới nhất `0e61ea4` (`feat(plans): add sandbox-backed creative journey graph studio`). |
| FE Git | **Không sạch**: nhiều file modified và file untracked; đây là workspace chưa commit, không phải trạng thái release reproducible. |
| Migration | Có đủ `001` đến `018`, không thấy đứt quãng/trùng số. `018` tự ghi rõ **EXPERIMENTAL / Sandbox only**, nên F10 chưa production-ready. |
| BE test | `mvnw test`: pass (process exit code 0). |
| FE test | `vitest`: **76 files, 730 tests pass**. |
| FE build | Pass; Vite cảnh báo bundle chính khoảng 981 kB sau minify. |
| FE lint | Fail 61 lỗi trong các script `.mjs` ở `artifacts/`; đây là lỗi CI/release nếu lint chạy toàn workspace. |
| Mức sẵn sàng demo | Auth và nhiều CRUD/domain flow đã có nền tảng thật; chưa đủ bằng chứng để gọi bất kỳ F01–F16 nào là `PRODUCTION-READY` tuyệt đối theo tiêu chí yêu cầu. F10 đặc biệt bị chặn bởi migration sandbox và thiếu E2E FE↔BE thật. |

## PHẦN 1 — Kiểm toán Backend

### 1.1 Git, migration và persistence

- BE: [SWP391_FA26_EQUITRANSIT_BE](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE>) đang ở nhánh `feature/creative-journey-studio`, Git clean, commit mới nhất `0e61ea4b43f82b80a9663afdbe7fda1c7d0d1c9e`.
- FE: [SWP391_FA26_EQUITRANSIT_FE](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE>) đang ở nhánh `feature/heritage-logistics-ui`; có nhiều modified/untracked, bao gồm router/bootstrap, hầu hết feature pages, studio, tests và `src/components/`.
- Chuỗi migration tại [database/migrations/](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/database/migrations>) là:
  `001_authentication_token.sql`, `002_align_figma_without_organization.sql`, `003_order_assessment_assignments.sql`, `004_service_assessment_sources.sql`, `005_versioned_quotations.sql`, `006_service_tariff_management.sql`, `007_manual_bank_payments.sql`, `008_dashboards_notifications_audit.sql`, `009_compliance_legal_evidence.sql`, `010_resources_availability_fit.sql`, `011_multimodal_operational_plan.sql`, `012_departure_gates_horse_receipt.sql`, `013_staff_provisioning.sql`, `014_leg_execution_welfare_tracking.sql`, `015_incidents_controlled_operational_adjustments.sql`, `016_trip_handover_actual_costs.sql`, `017_refresh_token_rotation.sql`, `018_visual_journey_graph_nodes.sql`.
- Không có khoảng trống hoặc số trùng trong chuỗi `001–018`.
- [application.yml:15-20](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/src/main/resources/application.yml#L15>) đặt `spring.jpa.hibernate.ddl-auto: validate`, naming strategy chuẩn và timezone JDBC UTC.
- Phần domain nghiệp vụ chủ yếu dùng JDBC repository, ví dụ [JourneyGraphRepository.java](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/repository/JourneyGraphRepository.java>) và các repository trong `repository/`; Hibernate entity còn tồn tại cho phần account/auth. Đây là mô hình lai có chủ đích, nhưng `ddl-auto: validate` **không thay thế** việc chạy/verify toàn bộ JDBC migration.
- [018_visual_journey_graph_nodes.sql:1-7](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/database/migrations/018_visual_journey_graph_nodes.sql#L1>) ghi rõ migration chỉ sandbox và yêu cầu 001–017. Đây là rủi ro release trực tiếp: deploy app có graph code nhưng production DB chưa được phép nhận 018 sẽ khiến F10 trả lỗi schema.
- Migration 018 dùng `DATETIME2(0)` cho node times và ghi UTC; không thấy bằng chứng code đang map `ActualCost` bằng Hibernate `datetimeoffset`. Tuy nhiên, đây là kiến trúc JDBC + Hibernate lai, nên schema verification phải là gate bắt buộc trước deploy, không được suy luận từ `ddl-auto`.

### 1.2 Auth và refresh token

- Controller thật: [AuthController.java:87-145](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/controller/AuthController.java#L87>) có register/login/refresh/logout; verify email, resend, forgot/reset bắt đầu từ dòng 171.
- Service thật: [RefreshSessionService.java:78-177](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/RefreshSessionService.java#L78>) dùng opaque cookie, family lock, rotate, phát hiện reuse và revoke family.
- FE thật: [refresh.ts:19-53](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/shared/api/refresh.ts#L19>) dùng `credentials: 'include'`, `X-Expected-Role`, single-flight và Web Locks; [client.ts:45-69](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/shared/api/client.ts#L45>) retry một lần sau 401.
- Test BE có [RefreshRotationTest.java](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/src/test/java/com/equitransit/backend/RefreshRotationTest.java>); FE có session/client tests. Đây là flow mạnh nhất, nhưng vẫn chưa được nâng lên `PRODUCTION-READY` tuyệt đối vì chưa có browser E2E chạy với cookie thật và deployment config thật.

### 1.3 Bảng đánh giá BE F01–F16

| Luồng | Bằng chứng code/migration | Trạng thái audit |
|---|---|---|
| Auth / Refresh | `AuthController`, `AuthService`, `RefreshSessionService`, migration 001/017, test rotation | ⚠️ **HAS BUG / RISK** — code thật và test pass; thiếu bằng chứng production cookie/CORS/DB E2E. |
| F01 Transport Order | `TransportOrderController`, `TransportOrderService`, `OrderRepository`, migration 002+, `TransportOrderIntegrationTest` | ⚠️ **HAS BUG / RISK** — có đầy đủ lớp nhưng chưa chứng minh deployment schema + FE happy path thật. |
| F02 Quotation | `QuotationController`, `QuotationService`, `QuoteRepository`, migration 005, `QuotationIntegrationTest` | ⚠️ **HAS BUG / RISK** — snapshot/versioning có thật; chưa đủ bằng chứng E2E và contract mọi role. |
| F03 Booking/Service preference | `BookingServicesController:39-120`, `BookingServicesService`, migration 004/005, integration test | ⚠️ **HAS BUG / RISK** — có concurrency fields; cần verify payload FE/BE trên server thật. |
| F04 Assessment/assignment | `ManagerAssessmentController`, `CustomerAssessmentController`, assessment repositories, migration 003, integration/policy tests | ⚠️ **HAS BUG / RISK** — domain có thật; chưa đủ chứng cứ mọi assignment transition được UI dùng end-to-end. |
| F05 Service assessment/source | `ServiceAssessmentFacade`, source repositories, migration 004 | ⏳ **INCOMPLETE** — có backend contract/service nhưng FE không có một màn hình specialist hoàn chỉnh chứng minh toàn bộ lifecycle. |
| F06 Quotation acceptance/lifecycle | migration 005, quotation service/controller/tests và FE quotation pages | ⚠️ **HAS BUG / RISK** — có wiring rộng; acceptance thật phụ thuộc dữ liệu/role/gate. |
| F07 Manual payments | `ManualPaymentController`, `PaymentRepository`, migration 007, `PaymentIntegrationTest` | ⚠️ **HAS BUG / RISK** — có evidence/idempotency test; chưa production-ready theo tiêu chí không còn lỗi logic. |
| F08 Compliance/legal evidence | `ComplianceController:54-205`, `ComplianceService`, migration 009, integration/policy tests | ⚠️ **HAS BUG / RISK** — API và evidence flow có thật; upload/file storage và role E2E chưa được chứng minh. |
| F09 Resource availability | `ResourceAvailabilityController`, `ResourceRepository`, migration 010, `ResourceIntegrationTest` | ⚠️ **HAS BUG / RISK** — có re-check server-side; cần test DB thật cho overlap/locking. |
| F10 Operational plan | `OperationalPlanController:69-109`, `JourneyGraphService`, `JourneyGraphRepository`, migration 011/018, graph tests | ⚠️ **HAS BUG / RISK** — feature có thật nhưng 018 là sandbox-only, không thể gọi production-ready. |
| F11 Departure gates | `DepartureGateController:39-110`, `DepartureGateService`, migration 012, `DepartureGateIntegrationTest` | ⚠️ **HAS BUG / RISK** — gate/receipt/authorize có thật; chưa có proof deployment + browser E2E. |
| F12 Leg execution/welfare | `LegExecutionController:51-108`, `LegExecutionService`, migration 014, `LegExecutionIntegrationTest` | ⚠️ **HAS BUG / RISK** — có API/UI; cần xác nhận mọi milestone/welfare payload khớp runtime DTO. |
| F13 Incidents/adjustments | incident controllers, repositories, migration 015, incident integration/policy tests | ⚠️ **HAS BUG / RISK** — backend khá đầy đủ; customer consent và manager approval cần E2E role matrix. |
| F14 Handover/actual cost | handover controllers, `ActualCostRepository`, migration 016, handover tests | ⚠️ **HAS BUG / RISK** — code thật, nhưng UI/contract có nhiều role và chứng từ; chưa đủ để certify production. |
| F15 Staff administration | `StaffAdministrationController`, repository, migration 013, integration/policy tests | ⚠️ **HAS BUG / RISK** — FE có page/API; cần test thật về deactivation ảnh hưởng refresh/session. |
| F16 Activity/dashboard/audit | `ActivityController:57-148`, `ActivityRepository`, migration 008, `ActivityIntegrationTest` | ⚠️ **HAS BUG / RISK** — API/UI có thật; chưa có release-level observability/performance evidence. |

**Không có F nào được xếp `✅ PRODUCTION-READY`** theo tiêu chí người dùng đưa ra. Đây không phải phủ nhận code đã viết; đó là kết luận nghiêm ngặt vì thiếu bằng chứng E2E production và migration deployment verification.

## PHẦN 2 — Đối chiếu BE ↔ FE

### 2.1 Ma trận tới tay người dùng

| Luồng | Route/navigation | API wiring | Contract/concurrency | Verdict |
|---|---|---|---|---|
| Auth/refresh | Có login/register/reset pages và role routes | Có `/api/auth/*`; refresh cookie thật | `include`, retry, UUID/version ở các mutation | 🟡 **NỐI DỞ DANG / LỆCH DTO** — chưa có browser E2E cookie thật |
| F01 | Customer requests và manager/staff case routes trong [router.tsx:260-333](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/app/router.tsx#L260>) | `transport-orders/api.ts` gọi API thật | Có zod, nhưng không thể chứng minh 100% field từ static scan | 🟡 |
| F02/F06 | quotation routes cho customer/manager/coordinator | `quotations/*` gọi API thật | Có contracts và mutation UUID/version | 🟡 |
| F03 | booking services nằm trong request flow | `booking-services/api.ts:16-28` gọi preview/confirm | Có recordVersion/operationId theo service contract | 🟡 |
| F04/F05 | manager assessment và specialist compliance routes có mặt | assessment/compliance APIs thật | Có schemas; lifecycle specialist chưa hoàn chỉnh | 🟡 |
| F07 | customer/manager payment routes có mặt | payments API thật | Có proof/idempotent command tests | 🟡 |
| F08 | customer/specialist compliance routes có mặt | compliance API thật | Có evidence/version fields; upload E2E chưa chứng minh | 🟡 |
| F09 | manager/coordinator availability route có mặt | resources API thật | Có server probe; UI assignment là nhiều bước | 🟡 |
| F10 | coordinator/manager plan routes; Journey Studio được mount ở PlanDetail | graph GET/compile/PUT/driver candidates thật | [graphApi.ts:117-183](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/graphApi.ts#L117>) gửi `recordVersion` + UUID; layout compile contract cần BE E2E | 🟡 |
| F11 | manager/coordinator/driver departure routes | departure API và action thật | gate server-side, có pinned version | 🟡 |
| F12 | customer/driver execution route trong [router.tsx:331-353](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/app/router.tsx#L331>) | execution API thật; Journey Studio tracking mount | read-only driver/customer graph; no live GPS | 🟡 |
| F13 | incident UI/API tồn tại trong feature | API thật cho driver/coordinator/manager | role/action contract có; UI discoverability chưa đồng đều | 🟡 |
| F14 | customer handover và coordinator/driver cost/handover surfaces có | handover API thật | có version/operation command ở mutation | 🟡 |
| F15 | manager staff-administration routes/menu có | API thật | có status mutation; chưa E2E session invalidation | 🟡 |
| F16 | dashboard/notifications/reports/audit routes có | activity APIs thật, đã được test gọi endpoint | contract có zod; chưa benchmark/pagination E2E | 🟡 |

### 2.2 API BE mồ côi hoặc chưa chứng minh được consumer

Static search xác nhận các API activity có consumer FE, ví dụ [activity-customer/api.ts:12-26](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/activity-customer/api.ts#L12>) và [activity-reports/api.ts:37-39](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/activity-reports/api.ts#L37>). API **chắc chắn không được FE gọi trong source feature** là:

- `GET /api/health` — chỉ có [HealthController.java:28](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/controller/HealthController.java#L28>), không có consumer FE. Đây có thể là endpoint vận hành, nhưng không phải user flow.
- Các endpoint OpenAPI/test-only hoặc endpoint phụ dùng gián tiếp qua biến path không thể kết luận orphan chỉ bằng tên. Cần bật access log/trace trên BE trong một phiên browser để xác nhận; không nên gắn nhãn orphan cho API chỉ vì path được dựng động.

## PHẦN 3 — F10 Visual Graph Studio

### 3.1 Cơ chế hiện tại

Đây **không còn là form leg truyền thống thuần túy**:

- [JourneyStudioCanvas.tsx:64-90](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/JourneyStudioCanvas.tsx#L64>) chuyển tọa độ client sang world theo `getBoundingClientRect`, pan và zoom.
- [JourneyStudioCanvas.tsx:110-165](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/JourneyStudioCanvas.tsx#L110>) dùng Pointer Events để pan, kéo node và wire connection.
- [JourneyStudioCanvas.tsx:185-240](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/JourneyStudioCanvas.tsx#L185>) vẽ dây bằng SVG cubic Bézier `wireCurve`; node là HTML elements trên world layer.
- [model.ts:155-174](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/model.ts#L155>) bắt buộc một chuỗi acyclic từ ORIGIN đến DESTINATION, không fan-out/fan-in.
- Có node palette cho `ORIGIN`, `REST_STOP`, `AIRPORT_HANDOVER`, `TRANSIT_HUB`, `QUARANTINE`, `DESTINATION`, giới hạn 21 node trong [JourneyStudio.tsx:745-779](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/JourneyStudio.tsx#L745>).

### 3.2 Click wire, attributes và cascade

- Click wire mở inspector; có sửa mode ROAD/AIR, km, distance source, planned departure/arrival và flight number tại [JourneyStudio.tsx:888-959](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/JourneyStudio.tsx#L888>).
- Resource attachment có probe vehicle/stall và tìm driver tại [ResourceAttachment.tsx:40-105](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/ResourceAttachment.tsx#L40>). Có UI ghép chung chuồng `<= 3.0 slots`, nhưng assignment vẫn là command riêng, không phải một transaction duy nhất khi click wire.
- [model.ts:210-254](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/model.ts#L210>) có time cascade: giữ duration, đẩy departure/arrival phía sau theo dwell; quarantine explicit end được tôn trọng.
- Giới hạn: cascade là client-side trước khi compile; không có bằng chứng backend tự cascade lại toàn bộ chain khi node thay đổi. Server vẫn phải revalidate overlap/duration.
- Tọa độ được scale theo zoom và pan, nhưng SVG có canvas cố định `16000x12000`, không có viewport clipping/virtualization. Với graph lớn có nguy cơ hit-testing và render nặng.
- Pointer logic hiện dùng `onPointerUp` trên canvas; việc kéo wire ra ngoài canvas hoặc pointer capture không hoàn tất có thể để lại interaction state nếu browser mất pointer event. Cần browser regression test cho cancel/escape/outside release.

### 3.3 Lưu, F5, Driver và Customer

- Save compile gọi `POST /api/transport-orders/{orderId}/plans/graph-drafts`; layout-only gọi `PUT /api/transport-orders/{orderId}/plans/{planId}/graph` tại [JourneyStudio.tsx:529-549](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/JourneyStudio.tsx#L529>).
- Graph reload gọi GET tại [JourneyStudio.tsx:403](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/JourneyStudio.tsx#L403>). Node positions và `layout {zoom,panX,panY}` được backend lưu qua migration 018, nên **sau khi save thành công** F5 có thể khôi phục; bố cục unsaved sẽ mất, đúng với comment “local until compiled” trong [model.ts:1](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/model.ts#L1>).
- Driver và customer thực sự mount Journey Studio trong [ExecutionPage.tsx:657](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/execution/ExecutionPage.tsx#L657>) với mode read-only/tracking; Driver cũng mount ở departure [DeparturePage.tsx:400](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/departure/DeparturePage.tsx#L400>).
- Tracking hiện là trạng thái đã ghi nhận (`IN_TRANSIT`, `COMPLETED`, latest progress), không phải GPS/live position. Source tự ghi rõ “không phải GPS trực tiếp” trong inspector.

### 3.4 Đánh giá thẳng thắn F10

**Đang chạy tốt:** canvas thật, node/wire thật, pan/zoom, SVG Bézier, selection inspector, validation chain, optimistic local cascade, version pinning, operation UUID, compile/layout API, resource probe và role-safe read-only views.

**Chưa đủ/đang giả lập hoặc rủi ro:** migration 018 sandbox-only; chưa chứng minh production DB apply; chưa có browser E2E FE↔BE cho drag/connect/save/F5; assignment vehicle/driver/stall là command tách rời; không có backend time-cascade evidence; tracking không phải GPS; các smoke scripts trong `artifacts` không phải test gate sạch vì lint fail.

## PHẦN 4 — Top blockers và action plan

### 4.1 Backend cần sửa trước

1. **Chốt chiến lược deploy migration 018.** Bỏ trạng thái “sandbox only” hoặc feature-flag graph; thêm migration runner/verification rõ ràng và smoke test trên catalog production-like.
2. **Chạy schema readiness trên DB SQL Server thực tế**, không chỉ H2/test classpath; verify `ActualCost`, `TripLeg`, `TransportPlan`, refresh session và graph FK/check constraints.
3. **Thêm contract/E2E test bắt buộc** cho mỗi mutation có `recordVersion` 16-hex và `operationId` UUID, đặc biệt compile graph, resource assignment, departure, execution, handover.
4. **Định nghĩa server-side cascade/revalidation cho F10** để không tin schedule đã tính ở browser; trả lỗi field-level rõ ràng khi overlap/dwell/resource conflict.
5. **Kiểm tra production config:** `EQ_JWT_SECRET`, CORS, Secure/SameSite cookie, SMTP, DB credentials và default bind. `application.yml` đang để `refresh-cookie-secure` mặc định false; không được dùng default này trên HTTPS production.

### 4.2 Frontend bị đứt đoạn hoặc chưa thể chứng minh E2E

1. F10 mới có thể compile/layout nhưng chưa chứng minh FE gọi BE graph thật thành công trên schema đã deploy.
2. F13/F14/F15 có API/page nhưng action discoverability và role lifecycle chưa được browser-test xuyên suốt.
3. Customer/Driver xem được graph tracking nhưng chưa có realtime/GPS; phải ghi rõ đây là planned/recorded tracking trong demo.
4. `npm run lint` fail 61 lỗi do scripts `.mjs` trong `artifacts/`; cần loại artifacts khỏi lint hoặc cấu hình đúng globals, nếu không CI release vẫn đỏ dù app build pass.
5. FE workspace dirty/untracked làm mất reproducibility; phải commit/cherry-pick có kiểm soát trước demo, không audit trên working tree không xác định.

### 4.3 Các bước cụ thể để F10 và UI/UX sẵn sàng demo

1. Dùng một SQL Server disposable/demo catalog, apply 001–018 theo đúng thứ tự, chạy schema verify và seed dữ liệu tối thiểu có order/plan/legs/resources.
2. Viết Playwright flow thật: login cookie → mở plan → tạo node → nối wire → sửa ROAD/AIR → assign vehicle/driver/stall → compile → reload → assert vị trí/layout/recordVersion.
3. Thêm test cancel pointer drag ngoài canvas, Escape wire connection, zoom/pan ở nhiều viewport, wire hit-area khi label chồng nhau.
4. Tạo server contract fixture dùng cùng JSON với [graphApi.ts](<D:/FPT-ki7/SWP/Cross-Border Racehorse Transport System/FE/SWP391_FA26_EQUITRANSIT_FE/src/features/plans/studio/graphApi.ts>) và `JourneyGraphModels`, đặc biệt `planned*`, `distanceKm`, `recordVersion`, `operationId`, timezone.
5. Hiển thị rõ trạng thái `Unsaved / Saving / Saved / Schema unavailable`, không để người dùng tưởng compile thành công khi API chưa commit.
6. Tách bundle lớn bằng lazy route/chunking sau blocker correctness; đây là tối ưu sau, không phải thay thế validation.

## Kết luận cuối

EquiTransit **không phải dự án rỗng**: BE có migration liên tục, JDBC repositories, policy/service/controller và test coverage đáng kể; FE có route, zod contracts, API clients và Journey Studio thực sự. Nhưng theo tiêu chí “chỉ hoàn thành khi người dùng đi từ đầu đến cuối không lỗi”, trạng thái hiện tại là **integration/demo candidate, chưa phải production-ready**. Blocker lớn nhất là migration 018 bị khóa ở sandbox, thiếu browser E2E với BE/SQL Server thật, FE lint đang fail, và các flow F13–F15/F10 chưa có bằng chứng role-to-role hoàn chỉnh.
