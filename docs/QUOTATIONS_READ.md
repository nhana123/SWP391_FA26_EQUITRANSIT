# F06 quotation reads — issue 56

Frontend base: `dev` at `751a74865a2f894ee9d934ffcb820c07ff17ac54`.
Contract source: [BE quotation API at 5b8b369](https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_BE/blob/5b8b369/docs/quotation-api.md)
and its QuotePage, QuoteSummary, QuoteResponse, QuoteLine, QuoteSchedule and
QuoteStatus Java DTOs. No backend/database changes are included.

## Entry points and access

| Role        | List                            | Detail                                   |
| ----------- | ------------------------------- | ---------------------------------------- |
| Customer    | `/customer/requests/:id/quotes` | `/customer/requests/:id/quotes/:quoteId` |
| Manager     | `/manager/requests/:id/quotes`  | `/manager/requests/:id/quotes/:quoteId`  |
| Coordinator | `/staff/cases/:id/quotes`       | `/staff/cases/:id/quotes/:quoteId`       |

Each existing request/case detail has a Quotations link. Specialist case pages
do not show that link. The staff quotation routes have a Coordinator-only guard
inside the existing shared Specialist/Coordinator case layout. Driver has no
quotation workspace. Backend ownership and current assignment remain authoritative;
403/404 errors hide previously cached quotation content.

## Shared module for Dev2 and issues 60/61

`src/features/quotations/index.ts` exports the read adapter, schemas, types,
hooks, query keys and read-only detail component:

- `quotationsApi.list(orderId, page, size, signal)` and
  `quotationsApi.get(orderId, quoteId, signal)`.
- `useQuotations(orderId, page, size)` and `useQuotation(orderId, quoteId)`.
- `quotationKeys.all(generation)`, `order(generation, role, orderId)`,
  `list(generation, role, orderId, page, size)` and
  `detail(generation, role, orderId, quoteId)`.
- `QuoteSummary`, `QuotePage`, `QuoteResponse`, `QuoteLine`, `QuoteSchedule`,
  `QuotationStatus`, the corresponding schemas, and `QuotationDetail`.

Add mutation adapters in this module using the shared contracts rather than
creating another DTO family. Reads do not introduce any mutation endpoints.
After a future mutation, invalidate the quotation order prefix and the relevant
current-order/case caches, then read current state. A receipt can be historical.
`QuoteResponse.recordVersion` belongs to the parent TransportOrder;
`quote.version` is the quotation's business version. Future mutation commands
must preserve UUID/version/body/path when retrying an uncertain action.

## Display and cache behavior

- QuotePage has `items`, `page`, `size`, `totalElements`; no `totalPages`.
  Page counts are derived from counts only. Rows do not fetch individual detail.
- Totals are read from `quote.total`. Money/rates remain decimal strings with
  up to two fractional digits and quantities up to three. No price arithmetic,
  catalogue re-pricing or zero substitution is performed.
- Detail shows captured lines, all seven pricing states, terms/cancellation,
  issued/accepted dates, payment schedule and blockers. Text is rendered through
  React; no raw HTML or evidence-file URLs are opened.
- The current BE currency contract is USD. Unknown DTO fields are stripped by
  Zod before caching. No supplier purchase, margin or internal source endpoints
  are requested. The backend remains responsible for excluding private fields
  from the response sent to a Customer.
- Customer UI additionally refuses DRAFT/APPROVED/SUPERSEDED headers and detail
  without IssuedAt. Historical public versions are not confused with the current
  revision, nor is a live estimate treated as an issued quotation.
- An ISSUED quote is shown as expired at ValidUntil using a deadline timer and
  focus/visibility refresh; this does not mutate server status. Accepted versions
  retain their accepted label after the previous validity deadline.
- Query keys include session generation, role, order and pagination/quote ID.
  There is no previous-order placeholder. Reads consume cancellation signals,
  stale account responses are discarded by the HTTP client, and logout/account
  switch clears scoped caches through the existing session cleanup.
- QUOTE_SCHEMA_PENDING has an explicit deployment message and no automatic
  retry. Refresh is intentional; the frontend never migrates or seeds a database.

## Validation and remaining acceptance

| Check                             | Result                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| TypeScript                        | Passed                                                                                            |
| ESLint                            | Passed                                                                                            |
| Vitest                            | 161 tests passed in 24 files, including 45 quotation tests                                        |
| Production build                  | Passed; existing large-chunk warning remains                                                      |
| Playwright                        | Added 3 quotation UI flows; execution blocked by localhost socket permissions in this environment |
| Live BE OpenAPI / SQL integration | Unavailable locally; not claimed as passed                                                        |

Tests cover list bounds/pagination, null and zero values, decimal precision,
all quotation statuses, historical acceptance, time-based expiry, safe text,
ownership errors, deployment errors, stale account/order responses, revoked
Coordinator access, and navigation through the real router from each actor's
request/case screen. Fixtures are confined to tests and have no runtime fallback.

The project-only instructions at `D:/FPT-ki7/SWP/AI` and `API_openAI.md` were
not accessible here. Their contents are not copied into the repository.
Compare the DTO schemas with `/v3/api-docs` on the intended running BE before
acceptance. Its database needs an approved migration 005 deployment; migration
006 is not introduced by this read feature.

Run locally with the existing scripts:

```text
npm.cmd ci
npm.cmd run dev -- --host localhost
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

For live acceptance, use authorized Customer/Manager/Coordinator test accounts,
an owned or assigned order and published/priced/pending/historical quotations.
Check both list and direct detail access, 403/404 after assignment changes,
expiry without a backend status transition, large/null totals, logout/account
switch and the QUOTE_SCHEMA_PENDING deployment state. ACCEPTED indicates a
commercial commitment, not financial receipt, flight space or departure approval.

The feature branch is `feature/56-quotation-list-version-detail`. Its local Git
identity is `Haaju000 <haunpse183421@fpt.edu.vn>`. Publishing must use the
authenticated `Haaju000` GitHub account and a pull request into `dev`.
