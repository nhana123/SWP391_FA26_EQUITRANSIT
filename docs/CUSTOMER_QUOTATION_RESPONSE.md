# F06 customer quotation response — issue 60

Branch: `feature/60-customer-quotation-decision`, based on FE `dev`
`36a0cd02bb52012a52ffd2962e6d85b604741560`.
Contract checked against BE `dev` at
`54df4ff0b97062e501e70b2baa7ea4236f3b55e8`: quotation API documentation,
`QuoteActionRequest`, `QuoteCommand`, `QuoteResponse`, `QuotationController`
and `QuotationService` (including replay and access checks).

## Customer flow

The existing request → quotations → quotation detail navigation now reaches
`CustomerQuotationDetailPage` at `/customer/requests/:id/quotes/:quoteId`.
The shared snapshot still displays exact decimal prices, units, total,
validity, terms, cancellation terms and the captured payment schedule.
Customer actions are separate from the existing Manager and Coordinator views.

The page reads the authenticated Customer's order and quotation. New actions
require an approved order, the same current revision and parent recordVersion,
an issued snapshot, a future offset validity instant, a known total and no
pricing blockers. The backend remains authoritative for ownership, current
state and expiry under its parent-order lock; the local clock is only a UX guard.

Accept and Reject each open their own confirmation. The review checkbox starts
unchecked and is never inferred from visiting the page. Selecting or cancelling
a confirmation sends nothing. Customers cannot edit prices/terms or supply a
rejection reason: `QuoteActionRequest` has no reason field.

The feature reuses Dev 2's typed `quoteMutationsApi.act` adapter:

```json
{
  "command": {
    "recordVersion": "00000000000000a2",
    "operationId": "d86b4f63-5acc-4f20-8da3-e24323268814"
  },
  "action": "ACCEPT"
}
```

The URL is `POST /api/transport-orders/{orderId}/quotes/{quoteId}/actions`.
The version comes from the reviewed quotation's parent TransportOrder version,
not its quote version. A changed version in a background read invalidates an
open confirmation instead of substituting a new version in the POST.

## Retry, refresh and visibility

- Repeated clicks are blocked while a request is pending. A new decision gets a
  UUID. Network/5xx uncertainty freezes the original command; explicit retry
  sends the same UUID/version/action/path. There are no automatic POST retries.
- A deliberate state refresh during uncertainty preserves the frozen command.
  The reviewed confirmation context is retained separately from current GET data.
- A definite rejection, including 409, requires a successful explicit refresh
  and a new confirmation before another action. No automatic version repair or
  resubmission occurs. Deployment errors have a fixed safe message.
- Success/replay invalidates the order, service disclosure and quotation caches,
  then GETs current order and quotation. Historical receipts are never inserted
  as authoritative detail. Accepted status and acceptedAt are rendered from GET.
- 401/403/404 from the action or ownership/quotation reads hide cached details
  and the confirmation. Unissued/superseded details remain unavailable. API
  error text and internal notes are not echoed into the action panel.
- The operation component is keyed by session generation, order and quote.
  An old account/order completion cannot refresh or mark success in a new scope.
- Only quotation actions and reads are introduced. There are no payment,
  financial receipt, flight reservation, departure or notification calls.
  Acceptance is described as agreement to a quotation, not completion of F07.

`useCaseCommand.reset()` only clears a definite error after review. It cannot
discard a pending/frozen command; existing staff command behavior is preserved.

## Validation and live acceptance

The two new unit/component suites cover 45 cases, including explicit decisions,
replay receipts, exact mutation bodies without reason, rejected requests,
foreign ownership, role guards, expiry at the offset instant, unissued and
superseded versions, revision/version mismatch, duplicate clicks, uncertainty,
explicit review, stale confirmation versions and account switching.
The follow-up review added seven cases for revoked cached reads, another
session's acceptance, failed GET after a successful POST, switching orders,
retry after local expiry and changing the selected decision. acceptedAt is
asserted against the current GET response.
Two Playwright flows cover ACCEPT/REJECT and assert that the only business write
is the quotation action. API mocks match `/api/` at the start of the path, never
Vite's `/src/shared/api/` module paths.

Use the repository scripts:

```text
npm.cmd ci
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --maxWorkers=1 --pool=threads
npm.cmd run test:e2e
```

Completed checks: ESLint passed; TypeScript and production build passed;
The follow-up full Vitest run passed 250 tests in 32 files using two thread
workers, including all 45 customer-response tests.
The production build retains the existing large-chunk warning. Formatting and
`git diff --check` passed. Playwright discovery lists nine tests, including the
two new response flows; discovery is not browser execution.
The follow-up browser execution attempt did not complete web-server startup in
this environment and was stopped; neither browser flow is marked as passed.

Browser execution and live BE/SQL acceptance are not claimed as passed here.
The environment denies localhost socket connections, including the attempted
`http://127.0.0.1:8080/v3/api-docs` read. The project-specific instructions at
`D:/FPT-ki7/SWP/AI` and `D:/FPT-ki7/SWP/API_openAI.md` were also unavailable.
No private AI instructions, migrations or database writes are included.

Before accepting the issue, run the browser suite and use authorized test
accounts with a current approved order and an actually published quotation
(PREPARE/PUBLISH dependencies). Verify valid acceptance/rejection, server expiry,
foreign ownership, supersession, a concurrent revision/decision and identical
UUID replay after a dropped response. Verify acceptedAt from the server,
unchanged schedule row counts and absence of payment/booking writes. The test
database must already have an approved migration 005 deployment; this feature
never migrates or seeds it. A `QUOTE_SCHEMA_PENDING` deployment remains a blocker.

Git author configuration is `Haaju000 <haunpse183421@fpt.edu.vn>`.
This implementation does not close the issue on the strength of mock tests.

## Issue 60 acceptance review

| Criterion                                                                        | Frontend evidence                                                                      | Remaining live verification                   |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| Owning Customer, issued/unexpired/current approved revision; staff cannot accept | Role gate, owned-order GET, version/revision/expiry guards; 403/404 hide cached detail | Real accounts and foreign ownership           |
| Full prices/terms/schedule before a deliberate decision                          | Shared snapshot plus distinct confirmations; unchecked review acknowledgement          | Browser execution                             |
| Exact action contract, no rejection reason or quote editing                      | Existing typed action adapter; tests assert exact nested command and fields            | Live OpenAPI comparison                       |
| Current acceptedAt/status, separate from financial/operational completion        | GET after success/replay; explicit disclaimer and no payment/booking API calls         | Real acceptance and server timestamps         |
| Supersession, revision/stale/concurrent changes and expiry                       | Fixed 409 messages, explicit refresh, no automatic version substitution                | Real concurrent decision/revision             |
| Uncertain retry and safe scoped state                                            | Same UUID/version/body/path; pending-click guard, logout/order isolation, safe DTOs    | Dropped-response replay; schedule row counts  |
| Required tests and checks                                                        | API/component suites and lint/typecheck/build                                          | Browser suite and approved BE/SQL integration |

Frontend implementation and mock verification are ready for review. Full issue
acceptance remains pending the live checks above; no completion/closure action
has been performed on GitHub.
