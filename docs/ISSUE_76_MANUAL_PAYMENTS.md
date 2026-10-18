# Issue 76 — Manual bank payments

Branch: `feature/76-manual-bank-payments-reconciliation`.
Frontend base: `dev` commit `00669d851a3a62cb913759d04418bbcda03ae3c9`.
Backend contract checked at `563266a6d70d3691adbbba2478f71599460f43b1`
on 18 October 2026. The last BE change only reorganizes documentation.

This implements the available F07 frontend flows. **The complete issue DoD is
still blocked** by the missing accepted-schedule identifiers described below and
by outstanding real-backend/browser acceptance. Source availability does not prove
that migration 007 or the APIs are deployed on the target database/server.

## Entry points and roles

| Role                              | Entry point                                                  | Actions                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer                          | Request detail → Payments; `/customer/requests/:id/payments` | Read obligations/reports/allocations/refunds, upload/view evidence, report a transfer, request a refund                                                                      |
| Manager                           | Case detail → Payments; `/manager/requests/:id/payments`     | Read ledger, independently record a verified bank receipt, look up a known bank receipt, allocate, reject a report, request/review/complete a refund, record a full reversal |
| Specialist / Coordinator / Driver | No F07 payment entry point                                   | Routes reject access; no payment fetch                                                                                                                                       |

Backend ownership and active-role checks remain authoritative. Customer proof
access is limited by the backend to the authorized uploader/order. There is no
public proof URL, payment deletion, automatic bank transfer, or local PAID flag.

## Contract and accounting

All endpoints use `/api/transport-orders/{orderId}/payments`. Every POST carries
the nested `command: {recordVersion, operationId}` alongside its action fields.
Money stays decimal text on the wire; local comparisons use integer cents with
BigInt, including the DECIMAL(18,2) boundary. Dates require explicit offsets and
transfer/refund timestamps cannot be in the future.

- Overview contains four independently paginated collections using the same
  `page`/`size`. It has no total count or complete-ledger flag. Next is available
  when any collection fills the page; an empty next page still permits Previous.
- `paidAmount` is the server's net paid amount. A Customer report is a claim and
  never calls reconciliation/allocation or opens F11/F14 gates.
- Outstanding is calculated exactly for each returned obligation. Allocation
  compares the selected obligation's net outstanding and the bank receipt minus
  known gross allocations; the backend must check its global remaining balance.
  Refunded money is not added back to the original bank receipt's available funds.
- Requested, approved and completed refunds reserve allocation value; rejected
  refunds do not. Paged data can only provide a partial local bound: the backend
  enforces all reservations and concurrent changes transactionally.
- APPROVE/REJECT is available for REQUESTED refunds with completion fields null.
  COMPLETE requires APPROVED, bank refund reference, evidence and refund time.
  Approval time is not in RefundView, so the backend checks the lower time bound.
- Report rejection retains its original evidence/history. Reversal records a
  reason and proof for a full receipt reversal; there is no partial amount input.
  Pending/completed refund conflicts are resolved by the backend accounting rules.
- F11 requires net payment, all due installments paid, 100% for a single stage
  even if future, known due dates and no pending refunds. F14 requires all stages
  paid in full and no pending refunds. This screen does not derive either gate
  from a report or an incomplete page of ledger data.

The bank GET only returns ID, received amount, currency, state and posted time.
There is no bank-receipt list endpoint or global available-balance field. Lookup
uses IDs already present in allocation history, newly recorded receipt IDs in
the current session, or a known receipt reference; every lookup is authorized by
the BE. Received amount is explicitly not labelled as the available balance.

## Evidence and privacy

Proof upload sends JSON containing PNG/JPEG `mediaType` and raw `contentBase64`,
not multipart or a DataURL. FE checks type, signature and 1 byte–5 MiB; BE checks
decoding and at most 20 million pixels and rewrites the image. Upload has its own
operation UUID and does not create a report, bank receipt, allocation or refund.

Proof view performs an explicit authenticated JSON GET, validates fileKey/type/
size, creates a Blob URL and revokes it on close, replacement and unmount. Pending
GET is aborted on unmount; a late response from an old session cannot show an
image. Base64 is not put into query cache, persistent storage, logs or links.
The uploaded byte payload is retained in memory only for retry of that upload.

Customer DTOs are parsed through a safe field whitelist. Manager bank account,
bank verification source and internal notes remain in the Manager mutation form;
they are absent from the public ledger shape. Error messages do not reflect raw
bank fields or proof bytes. Query keys include account-session generation, role,
order and page; existing shared session cleanup handles logout/expiry/401.

## Mutation lifecycle

The form pins the loaded parent order version. A new action receives a fresh
UUID; uncertain network/5xx and `PAYMENT_LEDGER_BUSY` retries reuse the exact UUID,
version, target and payload. Input, proof replacement, cancel and paging are
locked during this uncertainty. Keep the payment page open to retry the action;
operation state is memory-only and is not a durable offline queue.

Definite 409 requires explicit GET/review before using the updated version and a
new operation. A successful mutation receipt is acknowledged before refreshing
the ledger. If that GET fails, the form offers GET-only recovery and never sends
the successful financial mutation again. A historical replay receipt is not used
as the current order version. Proof and financial commands have distinct UUIDs.

400 keeps inputs and renders safe field errors. 401 uses shared session cleanup;
403/404 remove action controls and provide a safe list link. 503 shows deployment
blocked and preserves an open form; it never becomes an empty-ledger result.

## Blocking BE read-contract gap: creating the first payment request

`POST /payments/requests` requires the real `quoteId` and `scheduleId`.
However, the current quote read DTO reuses `QuoteSchedule`, whose fields are
`sequenceNo`, `paymentStage`, `amountDue`, `dueAt`; it omits `scheduleId`.
PaymentOverview only exposes schedules after a PaymentRequest already exists.
Consequently, FE cannot select an unrequested accepted installment correctly.

Relevant BE sources at the checked commit:

- `src/main/java/com/equitransit/backend/dto/quote/QuoteSchedule.java`
- `src/main/java/com/equitransit/backend/dto/payment/PaymentRequestCommand.java`
- `src/main/java/com/equitransit/backend/service/PaymentReadService.java`
- `src/main/java/com/equitransit/backend/repository/PaymentRepository.java`
- `docs/manual-bank-payments-api.md`

The Manager screen shows a disabled Create payment request button and a link to
the quotation installments. The typed request adapter exists and is covered by
a wire-contract test, but the UI does not send a guessed ID. `sequenceNo` is not
the database `scheduleId`, and no database query or invented endpoint is used.

BE handoff: expose real immutable schedule IDs in an authorized read response for
an accepted quotation on the current revision. A separate schedule **read DTO**
can contain `scheduleId`, stage, amount, currency and due date under its quote ID
without adding database IDs to the quote preparation input DTO. Confirm the
actual route/JSON contract and access policy before FE adds the selector and
enables request creation. Also test stale/current quote and already-requested
schedule conflicts. This is a proposal, not an implemented BE contract.

## Verification and acceptance

Results on 18 October 2026 after integrating FE dev `00669d8`:

| Check                                                          | Result                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| TypeScript                                                     | Passed, including the final production build typecheck                                                                  |
| ESLint                                                         | Passed                                                                                                                  |
| Full unit/component suite                                      | 462 passed, 50 files                                                                                                    |
| Payment/route coverage                                         | 62 tests in six files included in the full suite                                                                        |
| Proof checks after final field-error accessibility update      | Six passed                                                                                                              |
| Vite production build                                          | Passed; reports the existing single-chunk size warning                                                                  |
| Formatting of new code and payment guide / git diff whitespace | Passed                                                                                                                  |
| Dedicated Playwright test discovery                            | Two scenarios discovered                                                                                                |
| Browser execution attempt                                      | Blocked before scenarios ran: webServer/plugin setup and teardown timed out at 45 seconds each; no screenshots produced |
| Read-only live OpenAPI probe                                   | Blocked: socket access to `127.0.0.1:8080` is forbidden in this environment                                             |
| Real BE/database acceptance                                    | Not performed; issue DoD remains open                                                                                   |

Tests use artificial fixtures only; they are not evidence of SQL Server or
live-backend acceptance. No migration or financial write was attempted against
a real database or bank service.

Run from this checkout:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --pool=threads --maxWorkers=2
npm.cmd run build
npm.cmd exec -- playwright install chromium
npm.cmd exec -- playwright test --config playwright.issue76.config.ts
```

Playwright includes two mocked scenarios: Customer mobile proof upload/report
without recognition of money, and Manager case navigation/bank lookup/allocation.
Only artificial form screenshots are requested by these tests; trace/video are
disabled to avoid storing authentication payloads. Screenshots exist only after
the scenarios actually execute. Do not claim evidence from test discovery alone.

For live acceptance, use a separate configured test database with approved test
accounts, the required base migrations and `007_manual_bank_payments.sql`. Do not
run fixtures/migrations on a real customer database. Test:

1. Owner Customer reports a transfer with uploaded evidence; paid amount/gates
   remain unchanged. Other Customer cannot read its order or proof.
2. Manager records independent bank evidence and allocates only reconciled USD
   funds. Check duplicate bank references, excess allocation, cross-order bank
   access, currency mismatch and concurrent updates.
3. Request/approve/reject/complete refunds, including reservation limits, proof,
   duplicate refund reference and refund time before approval. Reload net paid.
4. Reject a report and reverse a receipt with reason/proof; retained history and
   pending/completed-refund reversal blockers must match the backend.
5. Repeat every uncertain mutation with the same UUID and assert one stored
   outcome; after a known success plus GET failure, retry only GET.
6. Exercise field 400, expired/disabled 401, role/ownership 403/404, stale 409,
   migration-pending 503 and recovery without losing inputs.
7. After the BE schedule-read fix, create the first request from a real accepted
   installment and complete the full lifecycle without database-ID workarounds.

No database changes, commit, push, PR, merge or deployment are part of this change.
