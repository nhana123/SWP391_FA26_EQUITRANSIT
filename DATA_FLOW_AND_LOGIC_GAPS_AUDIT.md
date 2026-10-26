# EquiTransit — Data Flow & Logic Gaps Forensic Audit

**Ngày audit:** 2026-10-22  
**BE audited:** branch `fix/finaldelivery`, HEAD `d22dc3d` (`fix final delivery`)  
**FE audited:** branch `feature/studio-supplier-pickers`, HEAD `5dac1a7` (ahead 5 commits)  
**Phạm vi:** source code hiện tại của [BE](../../SWP391_FA26_EQUITRANSIT_BE) và FE, đặc biệt các transition F02–F16, persistence JDBC, RBAC, route/UI và contract.

## Executive finding

Luồng lõi có code thật và nhiều guard concurrency, nhưng **data lineage chưa khép kín**. Những đứt gãy có bằng chứng trực tiếp:

1. Graph F10 lưu `PlanCheckpointNode.CountryCode`, thời gian và node metadata, nhưng F08 không đọc graph; Specialist vẫn nhập `transitCountryCodes` thủ công.
2. F04/F08 Specialist assessment được lưu và có facade readiness, nhưng quote/plan không nhận một snapshot rõ ràng của kết quả thẩm định; F05/F06 chỉ invalidate query và đọc lại các API riêng.
3. F07 reconcile tạo `PaymentTransaction`/`PaymentAllocation`, nhưng repository “bump” chỉ chạy `UPDATE OrderStatus=OrderStatus`; không có transition trực tiếp sang `IN_PREPARATION`.
4. F14 FE handover không gửi `recordVersion`/`operationId`; chính comment contract nói server không deduplicate retry. Đây là mất tính idempotency ở một transition có side effect.
5. F14 final delivery ghi `TripLeg=COMPLETED`, `TransportPlan=COMPLETED`, `TransportOrder=DELIVERED`; không có transition `DELIVERED -> CLOSED` trong final delivery/customer decision/actual-cost code được truy thấy.
6. F16 activity có lineage SQL khá rộng, nhưng driver không có order-detail route trong FE (`orderPath` trả `null`), nên driver activity/deep-link bị đứt.

---

## PHẦN 1 — Truy vết dòng chảy 12 bước F02 → F16

### Bảng tóm tắt transition

| # | Bước | Actor/UI/API thật | DB/state chính | Output kế tiếp | Kết luận |
|---|---|---|---|---|---|
| 1 | F02 Horse | CUSTOMER: `/customer/horses`; `HorseController` `/api/horses` | `Horse` insert/update | horse ID/version dùng trong draft | Có lineage; ownership được service kiểm tra |
| 2 | F03 Draft request | CUSTOMER: `/customer/requests/new`; `POST /api/transport-orders`, `PUT /{id}/draft` | `TransportOrder` `DRAFT`, payload draft, rowversion | request GET/list | Có thật; submit không nhận payload mới mà đọc draft đã lưu |
| 3 | F03 Submit | CUSTOMER: `POST /api/transport-orders/{id}/submit` | `OrderRevision`, `TransportOrder.OrderStatus=SUBMITTED`, `CurrentRevisionID` | Manager queue GET | Có thật; requires exact `recordVersion` + UUID |
| 4 | F04 Assign | MANAGER: `/manager/requests/:id`; `PUT /api/manager/transport-orders/{id}/assignments/{role}` hoặc decision | `OrderAssignment`, role `SPECIALIST/COORDINATOR`; decision; status `APPROVED` khi decide | staff queue GET | Có thật; Manager action, not Specialist/Coordinator |
| 5 | F04/F08 Specialist assessment | SPECIALIST: `/staff/cases/:id/compliance`; `/compliance/assessments` | `RevisionQuarantineAssessment`, veterinary assessment, invalidation/readiness | compliance overview/assessment; gates | Có write/read; không có graph/quote push event |
| 6 | F05/F06 Quote prepare | MANAGER/COORDINATOR UI quote prepare; `POST /quotes` mutation | quote snapshot/source/price, `QuoteStatus=DRAFT/APPROVED/ISSUED` | quote list/detail GET | Có thật; quote preparation đọc revision snapshot + source tables |
| 7 | F06 Customer decision | CUSTOMER quote detail action | `QuoteStatus=ACCEPTED/REJECTED`, accepted customer/time | payment request/plan confirm reads quote | Có thật; FE quotation read/mutation tách file |
| 8 | F07 Proof + reconcile | CUSTOMER proof upload; MANAGER payment reconcile | `PaymentProof`, `PaymentReport`, `PaymentTransaction`, `PaymentAllocation` | payment overview/gate readiness | Proof và reconcile có thật; không thấy direct order transition `IN_PREPARATION` |
| 9 | F08 ↔ F10 plan/legal | COORDINATOR graph compile; SPECIALIST checklist/clearance | `TransportPlan`, `TripLeg`, `PlanCheckpointNode`, `ComplianceChecklist/Clearance` | plan detail, compliance overview | **Đứt lineage transit route:** graph không feed F08 |
| 10 | F11 gates | COORDINATOR `evaluate`; MANAGER `authorize`; DRIVER `receipt/depart` | `TransportPlan.*GateStatus`, auth, `HorseReceipt`, plan/order `IN_TRANSIT` | departure readiness/execution GET | Gate policy dùng nhiều facades thật; role chain có guard |
| 11 | F12/F13 execution | DRIVER/COORDINATOR execution and incidents | `TripLeg`, milestone/welfare logs, incidents/adjustments; activity audit | customer execution/graph tracking | Customer đọc projection có public flags; không phải GPS realtime |
| 12 | F14/F16 close | Driver/coordinator final delivery; customer decision; coordinator actual cost; manager settlement | handover, leg/plan completed, order delivered, `ActualCost`, profitability | customer handover/activity/manager settlement | **Không truy thấy transition CLOSED** sau DELIVERED |

### Bước 1 — F02: Customer tạo Horse

**[A] Actor/màn hình/API/RBAC**

- FE routes: `/customer/horses`, `/customer/horses/new`, `/customer/horses/:id/edit` trong `src/app/router.tsx`.
- FE API: `src/features/horses/api.ts` gọi `GET/POST/PUT /api/horses`.
- BE: [HorseController.java](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/controller/HorseController.java) và [HorseService.java](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/HorseService.java); service có `@PreAuthorize("@domainAccessPolicy.isCustomer()")`.

**[B] Input**

- Horse fields (name, microchip/passport, dimensions, etc.) được nhập tại FE; order draft sau đó tham chiếu horse. Không thấy bước F03 tự động tạo horse nếu customer chưa có horse.

**[C] DB/state**

- `Horse` insert/update qua [HorseRepository.java](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/repository/HorseRepository.java). Update có record-version check; delete kiểm tra `TransportOrderDetail` usage.

**[D] Output**

- Horse ID và version đi vào order editor/draft; F03 đọc danh sách horse qua `horsesApi`.

**[E] Gap**

- Nếu horse identity bị sửa sau khi revision snapshot tạo, F11 dùng expected identity từ order snapshot/horse record; đây là đúng hướng nhưng tạo rủi ro stale snapshot cần re-check. Code đã có `recordVersion`, nhưng UI phải reload khi conflict.

### Bước 2 — F03: Customer tạo và lưu Transport Request ở DRAFT

**[A]**

- FE `/customer/requests/new`, `/customer/requests/:id`; API `POST /api/transport-orders`, `PUT /api/transport-orders/{id}/draft`.
- [TransportOrderService.java:54](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/TransportOrderService.java#L54) áp `@PreAuthorize` customer trên toàn service.

**[B]**

- `OrderDraftRequest` chứa route, horse, deadline, services/transport intent. `saveDraft` đọc toàn bộ draft từ FE và yêu cầu `recordVersion`.
- UI có thể đọc lại current request; bước submit không yêu cầu customer nhập lại toàn bộ thông tin.

**[C]**

- `TransportOrder` status `DRAFT`, draft payload và rowversion được ghi qua `OrderRepository`.
- `TransportOrderService.saveDraft` chỉ cho phép `DRAFT`, chưa committed và horse hợp lệ.

**[D]**

- `GET /api/transport-orders/{id}` và list trả request view cho customer; sau submit Manager queue đọc summary từ `AssessmentRepository`.

**[E]**

- Service selection preview/confirm là flow riêng (`BookingServicesService`), nên dữ liệu service customer chọn chỉ trở thành lineage chuẩn nếu confirm trước submit. UI cần chặn submit hoặc hiển thị rõ unconfirmed preference.

### Bước 3 — F03 Submit: DRAFT → SUBMITTED

**[A]**

- FE order status page gọi submit API; BE `TransportOrderController` → `TransportOrderService.submit`.
- Service customer-scoped, command có `recordVersion` + `operationId`.

**[B]**

- Submit đọc draft đã lưu bằng `json.readDraft(order.draftPayload())`; customer không gửi lại route/horse trong command.

**[C]**

- `append(..., "SUBMIT", ...)` tạo `OrderRevision`, thay `TransportOrder.OrderStatus` thành `SUBMITTED`, gắn `CurrentRevisionID`, bump version và audit event.
- `recordVersion` mismatch và retry hash được chặn.

**[D]**

- Manager queue `GET /api/manager/transport-orders?state=...`; FE `assessmentApi.queue` đọc case summary, revision ID, route/deadline/status.

**[E]**

- Bước sau không đọc raw draft; chỉ đọc immutable revision snapshot. Đây là đúng về auditability nhưng mọi field mới thêm vào draft phải được codec/snapshot map, nếu không sẽ “lưu được nhưng mất khỏi revision”.

### Bước 4 — F04 Assign: Manager phân Specialist/Coordinator

**[A]**

- FE Manager `/manager/requests/:id`, `assessmentApi.assign` gọi `PUT /api/manager/transport-orders/{id}/assignments/{role}`; approve decision gọi `/decisions`.
- BE [OrderAssessmentService.java:50](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/OrderAssessmentService.java#L50) có `@PreAuthorize("@domainAccessPolicy.isManager()")`.

**[B]**

- Manager chọn staff ID từ `GET /api/manager/transport-orders/staff?role=SPECIALIST|COORDINATOR`; due date, assignment note, recordVersion, operationId.
- Case screen hiển thị route/status/current assignments và assignment note.

**[C]**

- `AssessmentRepository.insertDecision` → `OrderDecision`.
- `AssessmentRepository.assign` → `OrderAssignment` với `AssignmentRole`, `StaffID`, `DueAt`, `AssignmentNote`.
- `decide(APPROVED)` kết thúc assignment cũ, tạo hai assignment và `transition(..., APPROVED)`.

**[D]**

- Specialist/Coordinator đọc `GET /api/staff/transport-orders` và `GET /api/staff/transport-orders/{id}`; `CaseAssignmentAccess` yêu cầu đúng active role + current assignment.

**[E]**

- Assignment note được lưu và hiển thị trong Manager case/assignment history, nhưng không thấy nó được feed thành task-specific input cho quote/plan; nó là note, không phải typed dependency.

### Bước 5 — F04/F08: Specialist thẩm định

**[A]**

- FE Specialist `/staff/cases/:id/compliance`, `complianceApi.assess`, `checklist`, `review`, `clear`.
- BE `ComplianceController` → [ComplianceService.java](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/ComplianceService.java). `CaseAssignmentAccess.lockLegalRevision` yêu cầu actor đúng `SPECIALIST`, active assignment và status trong `APPROVED, IN_PREPARATION, CONFIRMED, IN_TRANSIT, DELIVERED`.

**[B]**

- Specialist ReferenceSheet đọc assigned case revision snapshot và `GET /compliance/assessments`.
- Assessment input gồm applicability, required quarantine days, visits/tests/doses/certificates, source reference, validity.
- Checklist input gồm **thủ công** `transitCountryCodes`, source reference, validity.

**[C]**

- `RevisionQuarantineAssessment`, veterinary assessment và `ComplianceChecklist/DocumentRequirement/ComplianceClearance` được insert/update.
- `ComplianceService.assessment` gọi `commitments.invalidateLegalPricing(order)`, nên legal/assessment thay đổi có thể invalidate commercial readiness.

**[D]**

- F08 overview trả requirements + `readiness` + current record version.
- F05/F06 không nhận push event; FE `usePinnedVersion.refreshAll()` chỉ invalidate compliance, services, order và quotation query sau khi user write.
- Plan/gate đọc qua `ComplianceReadinessFacade`, không đọc trực tiếp UI state.

**[E] — lỗi lineage chính**

- `JourneyGraphService`/`JourneyGraphRepository` lưu `PlanCheckpointNode.CountryCode`, `NodeType`, planned times và metadata.
- `ComplianceService.checklist` lại đọc `TransportOrder.TransitAirportsJSON` và yêu cầu `body.transitCountryCodes()`. `SpecialistCompliancePage.tsx` có field `transitCountryCodes`.
- Không có call từ graph API sang compliance checklist, không có query F08 đọc `PlanCheckpointNode`, không có graph-to-checklist adapter. Vì vậy Coordinator vẽ `TRANSIT_HUB` qua các nước nhưng Specialist vẫn phải gõ lại; hai route có thể lệch nhau mà không có conflict code.

### Bước 6 — F05/F06: Manager/Coordinator chuẩn bị và phát hành quote

**[A]**

- FE quote routes: Manager `/manager/requests/:id/quotes/prepare`; Coordinator `/staff/cases/:id/quotes/prepare`.
- FE mutation trong `quotations/mutations.ts`; BE `QuotationController` → [QuotationService.java:58](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/QuotationService.java#L58).
- Service access yêu cầu actor là active assigned `MANAGER` hoặc `COORDINATOR` theo `CaseRole` logic.

**[B]**

- Quote prepare gửi revision ID, validity, line items/source-backed prices, service selections và command version/UUID.
- `QuotationService.prepare` đọc `orders.revision(id, revisionId).snapshot()` và `pricing.prepare(...)`; không đọc trực tiếp graph nodes.

**[C]**

- Quote snapshot/source rows được ghi trong `QuoteRepository`; quote state đi `DRAFT → APPROVED → ISSUED`.
- Quote prepare chỉ cho order `APPROVED`; assessment/legal pricing invalidation có thể làm quote stale.

**[D]**

- Customer/manager/coordinator quote list/detail qua `GET /api/transport-orders/{id}/quotes`.
- Customer chỉ thấy issued/non-superseded quote; supplier costs được redacted.

**[E]**

- Specialist assessment không được copy vào quote snapshot bằng một typed field rõ ràng; quote chỉ được re-read từ revision/source. Nếu assessment invalidate quote, Manager phải tự nhận biết qua blocker/error, không có explicit “assessment version consumed by quote” trên FE.

### Bước 7 — F06: Customer Accept/Reject quote

**[A]**

- FE Customer `/customer/requests/:id/quotes/:quoteId`, mutation action.
- BE `QuotationService` customer access; SecurityConfig cho `/api/transport-orders/*/quotes/**` CUSTOMER/MANAGER/COORDINATOR.

**[B]**

- Customer chọn action trên quote đã issue; command chứa recordVersion/operationId.

**[C]**

- `QuoteRepository` ghi `QuoteStatus=ACCEPTED/REJECTED`, accepted customer/time; immutable quote item không update.
- `QuotationService` kiểm tra revision parent và quote state.

**[D]**

- Payment request/overview đọc accepted quote; plan confirmation FE lọc accepted quote đúng `revisionId` trong [plans/forms.tsx:636-680](../../SWP391_FA26_EQUITRANSIT_FE/src/features/plans/forms.tsx#L636).

**[E]**

- Nếu customer accept rồi revision/order version thay đổi, payment/plan phải dùng quote đúng revision; đây là guard có thật, nhưng UX chủ yếu trả conflict và yêu cầu reload, không tự nối lại.

### Bước 8 — F07 Customer upload proof

**[A]**

- FE `/customer/requests/:id/payments`, `paymentsApi.uploadProof` → `POST /api/transport-orders/{id}/payments/proofs`.
- BE `PaymentProofService.upload`; SecurityConfig payments cho CUSTOMER/MANAGER.

**[B]**

- Proof là base64 PNG/JPEG; service sanitize MIME, decoded max 5 MiB, max 20 MP; command recordVersion/operationId.

**[C]**

- `PaymentProof` lưu bytes/key/order/user; `PaymentOperation` lưu idempotency receipt.
- Upload proof **không ghi nhận tiền và không đổi order status**, đúng comment service.

**[D]**

- Manager payment screen đọc proof qua opaque key; reconcile mutation phải tham chiếu proof.

**[E]**

- Proof file là evidence write-only cho tới khi Manager reconcile; UI cần thể hiện rõ proof “submitted” chưa phải “paid”.

### Bước 9 — F07 Manager reconcile và FinancialGate

**[A]**

- FE Manager `/manager/requests/:id/payments`; `POST /api/transport-orders/{id}/payments/reports` reconcile.
- BE [ManualPaymentController.java:100-116](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/controller/ManualPaymentController.java#L100) → `ManualPaymentService.reconcile`, manager context.

**[B]**

- Manager chọn payment request/proof, amount, bank reference, transfer time, currency, source/notes; service re-check accepted quote/payment schedule and proof ownership.

**[C]**

- `PaymentTransaction` insert với `Status='RECONCILED'`, `ReconciledAt`; `PaymentAllocation` insert.
- [PaymentRepository.java:292-294](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/repository/PaymentRepository.java#L292) “bump” chỉ là `UPDATE dbo.TransportOrder SET OrderStatus=OrderStatus`; không có direct status transition to `IN_PREPARATION`.
- Financial readiness là facade tính từ accepted quote + payment obligations/allocations, không phải một field được reconcile set ngay trong đoạn này.

**[D]**

- F11 `DepartureGateService.evaluateAllGates` gọi `QuotationCommitmentFacade.readiness(...)`; plan gate response trả `financialGate`.
- Manager/Coordinator phải evaluate gates để persist `TransportPlan.FinancialGateStatus`.

**[E]**

- Yêu cầu “reconcile → IN_PREPARATION” không được thực thi trực tiếp trong `ManualPaymentService/PaymentRepository`. Nếu hệ thống mong order status tự chuyển, đây là broken handoff/dead state; hiện status có thể vẫn `APPROVED` trong khi payment đã reconciled, cho tới một flow khác tạo plan/transition.

### Bước 10 — F08 ↔ F10: Compliance và Journey Studio

**[A]**

- F10 FE Coordinator `/staff/cases/:id/plans/:planId`, `graphApi.get/compile/positions`; BE `OperationalPlanController` → `JourneyGraphService`.
- F08 FE Specialist `/staff/cases/:id/compliance`, compliance API; BE `ComplianceController` → `ComplianceService`.

**[B]**

- F10 input: nodes, node country codes/types, planned arrival/departure, dwell, quarantine reservation ID, graph layout, wire mode/times/km.
- F08 checklist input: `transitCountryCodes` typed manually, source reference, validity.

**[C]**

- F10: `PlanCheckpointNode`, `TripLeg.FromNodeKey/ToNodeKey`, `TransportPlan.GraphLayoutJson`, generated plan/legs.
- F08: checklist snapshots, requirements, clearances. `ComplianceReadinessFacade` reads legal prerequisites for gate.

**[D]**

- Coordinator receives plan graph GET; Specialist receives compliance overview GET. Manager sees plan/gates and quote/assessment projections, not a unified lineage view.

**[E]**

- **No automatic F10 → F08 propagation.** `ComplianceRepository` route query uses order-level `TransitAirportsJSON`; graph node countries are not joined.
- **No automatic F08 → F10 node/blocker projection** beyond plan confirmation/departure readiness. F10 can contain a `QUARANTINE` node and reservation reference, but specialist clearance is a separate command.
- This allows route country/time/quarantine assumptions in F10 and F08 checklist to diverge.

### Bước 11 — F11: Evaluate → Authorize → Receipt → Depart

**[A]**

- FE departure routes are mounted for Manager/Coordinator/Driver; Customer can read readiness but cannot operate the workflow.
- `POST /api/transport-orders/{orderId}/departure/gates/evaluate`: Coordinator/Manager.
- `POST .../authorize`: Manager only.
- `POST .../horse-receipts`, `POST .../depart`: assigned Driver.
- Service methods are in [DepartureGateService.java](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/DepartureGateService.java).

**[B]**

- Evaluate/authorize use plan/order `recordVersion`, plan ID, operation UUID.
- Driver supplies observed microchip/passport, fit-to-travel, receipt evidence, then depart references latest receipt.

**[C]**

- `DepartureGatePolicy` computes blockers from financial/legal/operational gate views, authorization, horse receipt identity/status and overlap.
- `DepartureRepository.updateGates` updates `TransportPlan.FinancialGateStatus`, `DocGateStatus`, `OperationalGateStatus`, `GatesCheckedAt`.
- `authorizeDeparture` writes manager authorization.
- `departFirstLeg` updates `TripLeg` actual departure/status, `TransportPlan.PlanStatus='IN_TRANSIT'`, `TransportOrder.OrderStatus='IN_TRANSIT'`; activates assignment as shown in `DepartureRepository`.

**[D]**

- Execution GET returns current legs and order status; graph GET returns active plan/wire state; Customer gets redacted readiness.

**[E] — nguồn dữ liệu của 3 gate**

- **Financial:** `QuotationCommitmentFacade.readiness`, accepted quote/payment schedules/allocations.
- **Legal/Doc:** `ComplianceReadinessFacade.readiness`, F08 requirements/clearance; quarantine release is a separate order-level query for F14.
- **Operational:** plan status/legs, assignments/resources, plan confirmation and execution readiness via `ServiceAssessmentFacade`/plan repositories.
- Gate evaluation is live; persisted gate columns can become stale until evaluate, but authorize re-evaluates before writing.

### Bước 12 — F12/F13/F14/F16: Execution, incident, handover, close

**Execution/F12**

- FE customer/driver execution screen uses `GET /api/transport-orders/{orderId}/execution`; driver writes start/complete/milestone/welfare.
- `LegExecutionService.write` requires order and plan `IN_TRANSIT`, exact recordVersion, idempotency UUID, and driver active leg assignment.
- `LegExecutionRepository` reads/writes `TripLeg`; milestone/welfare tables store occurred time, source, coordinates, public note and `IsCustomerVisible`.
- `ActivityRepository` and `AuditWriter` provide F16 timeline/dashboard projections.
- Customer execution reads same `ExecutionOverview`, but public visibility is controlled by `IsCustomerVisible`; this is not a live push/GPS stream.

**F13**

- Incident APIs exist for driver/coordinator and adjustment approval for manager. They are separate from the standard execution transition; incident/adjustment state is not automatically rendered into the graph wire schedule.

**F14 intermediate handover**

- Driver/coordinator endpoint writes `TripHandover`; intermediate completion marks current leg complete and next leg confirmed through repository logic.
- Customer can list and decide handover via `/api/customer/transport-orders/{orderId}/handovers`.

**F14 final delivery**

- `FinalDeliveryValidator.validateFinalDelivery` requires `ComplianceRepository.quarantineReleasePassed(orderId)`, authorized receiver identity, signature key and photo key.
- `TripHandoverService.processFinalDelivery` calls validator, then `completeLeg`, `completePlan`, `deliverOrder`.
- DB result is `TripLeg.COMPLETED`, `TransportPlan.COMPLETED`, `TransportOrder.DELIVERED`.

**Settlement/CLOSED**

- Coordinator actual cost writes `ActualCost`; manager profitability reads aggregate actual cost.
- FE explicitly states actual cost/profitability is not payment or settlement status.
- No source path was found that changes `TransportOrder.OrderStatus` from `DELIVERED` to `CLOSED` after customer decision or actual-cost completion. This is a dead-end relative to the requested `CLOSED` lifecycle.

---

## PHẦN 2 — Ma trận dữ liệu mồ côi và nhập liệu lặp

### 2.1 Write-only / orphan data

| # | Dữ liệu | Writer | Bên sau không dùng/không dùng cùng lineage | Bằng chứng và tác động |
|---|---|---|---|---|
| 1 | F10 node country/type/time/dwell | Coordinator graph compile → `PlanCheckpointNode` | F08 checklist không đọc node countries/times | `JourneyGraphRepository` inserts node fields; `ComplianceService.checklist` nhận `transitCountryCodes` riêng |
| 2 | F10 node `details` metadata (facility/handler/insurer/contact/care notes) | Graph compile | Không thấy F08/quote/execution query dùng toàn bộ metadata | `JourneyGraphModels.GraphNodeInput.details`; graph view editor-only có thể redact toàn bộ cho non-editor |
| 3 | F04 `AssignmentNote` | Manager assignment | Không thành typed input cho Specialist/Coordinator work command | `AssessmentRepository.assign` lưu note; FE chỉ hiển thị note trong assignment/case |
| 4 | F04 decision reason | Manager decision | Quote/plan không hiển thị reason như blocker/context bắt buộc | `OrderDecision.Reason` lưu; quote prepare chỉ đọc revision snapshot |
| 5 | F08 checklist snapshot `transitCountryCodes/ruleIds/sourceReference` | Specialist | F10 graph không hiển thị checklist snapshot/country mismatch | `ComplianceService.checklist` lưu JSON snapshot; JourneyGraphService không query clearance/checklist |
| 6 | F08 veterinary/quarantine quantities | Specialist | Quote/plan chỉ nhận legal pricing invalidation/readiness, không nhận typed quantity snapshot | `ComplianceService.assessment` lưu tables; F05/F06 không copy assessment into quote payload |
| 7 | Payment proof bytes | Customer | Chỉ Manager reconcile dùng; execution/settlement không hiển thị evidence lineage | `PaymentProofService.upload`; no payment status transition in proof upload |
| 8 | `PaymentReport.Status='SUBMITTED'` | Customer report/proof | Reconcile creates a separate transaction; report lifecycle is not an order lifecycle event | `PaymentRepository` report/receipt SQL; no `IN_PREPARATION` update |
| 9 | Incident/adjustment details | Driver/Coordinator | Graph wire/time cascade and customer execution projection không tự incorporate adjustment | separate incident/adjustment repositories/controllers |
| 10 | ActualCost | Coordinator | Customer/settlement does not consume it to produce `CLOSED`; manager only profitability reads aggregate | `ActualCostRepository`, `ActualCostController`, FE handover copy explicitly says not settlement |
| 11 | Handover customer decision | Customer | No close transition; decision changes handover row only | `TripHandoverService.recordCustomerDecision` updates `CustomerDecision`, no order status update |

### 2.2 Redundant manual input

| # | Input lặp | Hiện đang nhập ở đâu | Dữ liệu đã có sẵn | Gap |
|---|---|---|---|---|
| 1 | `transitCountryCodes` | Specialist Compliance page field | F10 `PlanCheckpointNode.CountryCode`, order `TransitAirportsJSON` | Không có auto-suggest/consistency check |
| 2 | accepted quotation ID khi confirm plan | `ConfirmForm` chọn quote | Plan/order current revision và quote list | Có filter revision đúng, nhưng bắt Coordinator chọn lại ID thay vì backend derive accepted quote duy nhất |
| 3 | receiver name/authority | F14 handover form | Transport order receiver name/authority | BE validate sau khi nhập; FE không prefill receiver identity |
| 4 | signature/photo file keys | F14 handover form text input | Không có upload UI ở release; FE `keyHint` nói chỉ nhập stored file reference | Người dùng phải nhớ/nhập opaque key; đây là deliberate limitation nhưng UX broken |
| 5 | Driver/vehicle/stall selection | F10 resource picker | Plan leg, service preference, supplier/resource availability | Picker có probe nhưng final assignment là command riêng; không tự prefill từ order service intent |
| 6 | observed microchip/passport | Driver departure receipt | Horse record/order snapshot | Đây là kiểm tra vật lý nên không phải lỗi thiết kế; nhưng UI nên show expected redacted/scan context thay vì bắt nhớ/nhập |
| 7 | actual cost `legId/planId` | Coordinator actual cost form | Current plan and selected leg | Could derive current plan/leg context; manual ID selection increases wrong-leg risk |

---

## PHẦN 3 — RBAC và state deadlocks

### 3.1 Quyền và service phụ thuộc role khác

| Mức | Finding | Bằng chứng | Tác động |
|---|---|---|---|
| HIGH | Final delivery từng có nguy cơ gọi compliance qua actor-scoped service | [FinalDeliveryValidator.java:55-68](../../SWP391_FA26_EQUITRANSIT_BE/src/main/java/com/equitransit/backend/service/handover/FinalDeliveryValidator.java#L55); hiện dùng `ObjectProvider<ComplianceService>` và `ComplianceRepository.quarantineReleasePassed` order-level, không actor-scoped | Nhánh hiện tại đã né lỗi 403 cũ, nhưng coupling F14→F08 vẫn cần integration test cho Driver/Coordinator |
| HIGH | Security path cho `/api/coordinator/**` cho MANAGER + COORDINATOR, trong khi service coordinator path chỉ kiểm tra `staffId`, không luôn kiểm tra assignment | `SecurityConfig` lines 203–205; `TripHandoverService.recordIntermediateByCoordinator` chỉ check staff profile | Manager có thể dùng coordinator endpoint theo route security; đây có thể là chủ đích nhưng phải nhất quán với CaseAssignmentAccess |
| MEDIUM | Compliance endpoint SecurityConfig cho CUSTOMER/SPECIALIST, service `access(order,false)` gọi `lockLegalRevision` cho mọi non-customer | `SecurityConfig` lines 180–181; `ComplianceService.java:576-590`; `CaseAssignmentAccess.lockLegalRevision` yêu cầu SPECIALIST | Không thấy Driver/Coordinator được qua HTTP path, nhưng nếu path matcher thay đổi sẽ trả 404/403 thay vì explicit role message |
| MEDIUM | Execution endpoint cho CUSTOMER/MANAGER/COORDINATOR/DRIVER, nhưng write authorization nằm sâu trong `authorizeLeg` | SecurityConfig lines 192–200; `LegExecutionService.write` | UI có thể hiển thị action cho staff rộng hơn service cho phép; cần route-role matrix E2E |
| MEDIUM | Graph GET cho CUSTOMER/MANAGER/COORDINATOR/DRIVER, nhưng `authorizeRead` yêu cầu current plan status và driver assignment | `JourneyGraphService.authorizeRead` | Customer/driver có thể nhận `404 GRAPH_NOT_FOUND` trên plan tồn tại nhưng chưa current/assigned; UI phải giải thích visibility, không gọi “missing data” |

### 3.2 FE hiển thị/ẩn nút lệch BE

1. **F14 idempotency mismatch:** FE `handover/contracts.ts` comment nói writes không mang `operationId`/`recordVersion`; BE handover DTO cũng không có command guard. Nếu request timeout sau khi DB commit, FE retry có thể duplicate handover.
2. **Final delivery file UX:** FE final form yêu cầu nhập signature/photo file key, nhưng `panels.tsx` ghi “release has no upload for handover files”. BE bắt buộc keys. Người dùng có nút final delivery nhưng không có đường tạo artifact trong cùng UI.
3. **Driver activity deep link:** `activity-customer/shared.tsx:54` trả `null` cho Driver order path vì “No Driver detail route has been released”; backend activity scope có driver leg/order joins. Driver notification/task link không tới được order detail.
4. **Customer/Specialist departure:** FE departure tests ghi “not available to customers or specialists”; BE readiness service allows `CUSTOMER` at service class and SecurityConfig includes CUSTOMER. Customer read is intentional; Specialist is blocked. UI/BE should document read-only rather than generic unavailable.
5. **F10 Driver/Customer graph:** GET graph permits these roles, but non-editor view redacts vehicle/stall/driver fields. UI should not render assignment controls; current `JourneyStudio` mode logic mostly does this, but API contract still has nullable fields and needs role E2E.

### 3.3 Dead-end or cross-state inconsistencies

| State | Producer | Consumer/dead-end |
|---|---|---|
| `SUBMITTED` | order submit | F04 assessment consumes it; correct |
| `APPROVED` | Manager decision | quote prepare, compliance and plan flow consume it; correct |
| `IN_PREPARATION` | allowed by compliance/legal and plan domains | no direct payment reconcile transition; may require separate plan lifecycle action |
| `CONFIRMED` | plan confirmation | F11 authorization consumes; correct |
| `IN_TRANSIT` | first-leg departure | execution service requires both order and plan IN_TRANSIT; correct but strict |
| `COMPLETED` plan | final delivery | activity/settlement reads it; no order close transition |
| `DELIVERED` order | final delivery | F14 customer decision and actual cost do not advance it; **dead-end before CLOSED** |
| `QuoteStatus=ACCEPTED` | customer action | payment and plan confirm read accepted quote by revision; correct |
| `PaymentTransaction=RECONCILED` | manager reconcile | financial readiness reads it, but no explicit order `IN_PREPARATION`; ambiguous state ownership |
| `ComplianceClearance=PASS/CLEARED` | Specialist clear | F11 legal gate and F14 quarantine release read it; good adapter exists only at order-level release |

---

## PHẦN 4 — Top 10 logic gaps và cách nối lại

| # | Severity | Lỗ hổng | Đề xuất nối lại |
|---|---|---|---|
| 1 | CRITICAL | F10 graph route countries/times không feed F08; Specialist nhập transit countries lần nữa | Backend derive checklist candidate countries from `PlanCheckpointNode`, expose mismatch blockers, require explicit Specialist confirmation |
| 2 | CRITICAL | F14 final delivery kết thúc ở `DELIVERED`, không có `CLOSED` transition | Tạo explicit settlement/close command sau customer decision + payment/actual-cost checks, ghi audit và optimistic version |
| 3 | HIGH | F14 handover không có `recordVersion/operationId`, retry có thể duplicate side effect | Thêm command envelope và idempotency table/replay logic như F12/F08/F11 |
| 4 | HIGH | Payment reconcile không chuyển order/plan sang `IN_PREPARATION`; “reconciled money” và lifecycle tách rời | Xác định owner transition trong `ManualPaymentService` hoặc plan confirmation service; ghi state transition atomically sau full obligation |
| 5 | HIGH | Specialist assessment chỉ invalidates legal pricing/readiness, không có consumed assessment version trong quote/plan | Gắn `AssessmentRevisionID/AssessmentVersion` vào quote snapshot và plan; block stale quote/plan rõ ràng |
| 6 | HIGH | Final delivery phụ thuộc F08 release nhưng FE không có upload artifact workflow | Tích hợp file upload/key issuance vào handover UI hoặc pre-validate artifact availability trước khi render submit |
| 7 | HIGH | Coordinator/Manager coordinator endpoints có role scope rộng hơn assignment scope | Dùng một `CaseAssignmentAccess` policy cho every write, kể cả coordinator/manager handover and adjustment |
| 8 | MEDIUM | ActualCost/profitability không đóng settlement và UI tự nói “not payment/settlement” | Thiết kế settlement aggregate với payment allocation + actual cost + customer decision, rồi expose `CLOSED` receipt |
| 9 | MEDIUM | Driver activity có backend scope nhưng FE không có order detail deep link | Thêm Driver order/execution route và map activity entity/leg tới route hợp lệ |
| 10 | MEDIUM | Opaque IDs (receiver file keys, accepted quote, leg/plan IDs) phải nhập/chọn lại dù context đã có | Prefill/derive IDs từ current order/plan/leg; chỉ cho override khi có explicit ambiguity và hiển thị source lineage |

## Kết luận

Hệ thống hiện có nhiều boundary tốt: immutable order revision, row-version checks, operation UUID ở phần lớn command, assignment access cho Specialist, live gate re-evaluation và redaction cho Customer/Driver. Tuy nhiên, các boundary này **không được áp dụng đồng đều**:

- F08 và F10 là hai hệ thống dữ liệu song song cho route/legal planning, chưa có canonical handoff.
- F07 và order lifecycle chưa có một transition owner rõ ràng.
- F14 là vùng yếu nhất về idempotency và terminal state.
- F16 có dữ liệu activity nhưng FE không expose đầy đủ cho Driver.

Do đó, trạng thái forensic hiện tại là: **workflow có thể chạy từng feature riêng lẻ, nhưng chưa bảo đảm một lineage duy nhất từ Customer request tới CLOSED giữa cả năm role**.
