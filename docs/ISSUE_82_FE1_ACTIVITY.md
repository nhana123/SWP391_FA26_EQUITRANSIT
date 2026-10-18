# Issue 82 — FE1 / Part A: Customer activity and Manager reports

Branch: `feature/82-customer-activity-notifications-manager-reports`.
FE base: `dev` at `5acc04256eb77b62648d81fbd4793f6c05d4c99a`.
BE contract verified at `563266a6d70d3691adbbba2478f71599460f43b1`
on 18 October 2026, against ActivityController, activity DTOs, ActivityService,
ActivityRepository and `docs/activity-api.md`.

This implements **Part A assigned to Haaju000** in
[issue 82](https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_FE/issues/82)
and Task 09 of the supplied FE1_COMMERCIAL_FINANCE_GUIDE.md. Part B (staff task
queues and order timeline) belongs to AIVIETNAM-AIO-felixdoit and is not replaced,
simulated or declared complete here. Both parts and real BE acceptance are needed
before closing the overall issue.

## Routes and entry points

| Actor                   | Route                                | Entry point                                              |
| ----------------------- | ------------------------------------ | -------------------------------------------------------- |
| Customer                | `/customer/dashboard`                | Customer navigation → Dashboard                          |
| Any authenticated actor | `/notifications`                     | Header Notifications button → View all notifications     |
| Customer                | `/customer/notification-preferences` | Customer navigation or Notifications → Email preferences |
| Manager                 | `/manager/reports/financial`         | Manager navigation → Financial Report                    |
| Manager                 | `/manager/audit-events`              | Manager navigation → Audit Events                        |

The bell is available in Customer, Manager, assigned-case and signed-in public
headers, including the current Driver landing page. It loads only when opened;
closed headers do not issue background requests. Escape closes the panel and
returns focus to its button. Opening or following a notification never silently
marks it read. Driver notifications have no fabricated order-detail link: FE2
must supply its supported Driver destination before such navigation is added.

Existing login/workspace defaults are preserved. The new dashboard is reached
through the Customer menu; it does not replace the horse or request editor flows.

## API contracts used

| Method / path                                    | Behavior                                                |
| ------------------------------------------------ | ------------------------------------------------------- |
| GET `/api/dashboard?page=&size=20`               | Customer-scoped orders, status counts and totalElements |
| GET `/api/notifications?page=&size=`             | Current recipient only; list size 20, bell size 5       |
| PUT `/api/notifications/{id}/read`               | Bodyless, no command/UUID; returns NotificationView     |
| GET `/api/customers/me/notification-preferences` | Explicit boolean enabled                                |
| PUT same path                                    | Exactly `{ "enabled": true/false }`; no command/UUID    |
| GET `/api/manager/reports/financial`             | Manager-only FinancialReport                            |
| GET `/api/manager/audit-events?page=&size=20`    | Manager-only redacted audit page                        |

All requests reuse the existing bearer HTTP client and memory session. Caller
user/customer/recipient/staff IDs are never sent to select a recipient. Role,
ownership and live assignment authorization remain the BE's responsibility.
These read/write APIs do not accept a rowversion or operationId; F07's nested
financial command envelope must not be added to these PUTs.

Dashboard status counts come directly from the full authorized server scope,
not from counting current-page rows. A status is not synthesized into timeline
events or interpreted as a new financial gate. Pagination uses totalElements,
page and size without inventing a totalPages response property. Invalid/negative/
out-of-int-range pages are rejected before fetching. An empty later page retains
Previous navigation. API counts and IDs must be safe JS integers; unsafe values
fail contract parsing instead of losing precision.

The notification API has no global unread count or unread-only filter. The bell
therefore labels its count **Unread on this page**, calculated only over its five
returned records. It does not label all notifications or a partial page as the
global unread total. Refresh is explicit in the full list; normal query staleness
and window-focus refetch apply. There is no push-delivery or live-total claim.

## Financial report: seven independent measures

| JSON field                   | Display / meaning                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| quotedValue                  | Latest issued/accepted current-revision quote per order; not cash                                          |
| reportedTransfers            | Submitted, unverified Customer claims; not bank receipts                                                   |
| netBankReceipts              | Reconciled bank receipts less completed refunds, reversed receipts excluded; may include unallocated funds |
| netAllocated                 | Actual reconciled allocations less completed refunds, reversed transactions excluded                       |
| actualCost                   | Recorded USD ActualCost for current plans; historical/unlinked plans excluded                              |
| operationallyCompletedOrders | Persisted DELIVERED/COMPLETED/CLOSED order count                                                           |
| closedOrders                 | Explicit persisted CLOSED count, separate from delivery completion                                         |

Currency is the response's confirmed USD. Existing quotation decimal validation
is reused; money is displayed as the returned decimal **string**, never converted
to Number/float, recomputed, added into revenue, or used to derive margin or
authorize closure. Aggregate strings may exceed the single-payment precision
limit. Counts remain distinct integer measures. No unsupported date/currency
filters, currency conversion, financial mutations or F14 closure are introduced.

Audit events are paged, read-only and newest-first as returned by BE. Their
already-redacted snapshot is rendered as escaped text in a details/pre element;
it is not inserted as HTML, interpreted as executable content or exposed to
Customer UI. There are no append/edit/delete controls or public audit writers.

## Mutation recovery and account isolation

Mark-read sends one explicit recipient-owned ID; the backend preserves the first
ReadAt on repeated PUT. Successful responses update matching IDs in all cached
notification pages, including the bell. The returned ID and non-null ReadAt must
match the acknowledgement. Concurrent reads are canceled before committing the
authoritative cache value. Uncertain network/5xx results lock other read actions
and paging and retain the same target for manual retry. No payment status or
other business resource is modified by marking a notification read.

The email form pins the user's choice during background GETs. A failed GET/503
preserves unsaved choice and requires explicit reload/review. An uncertain PUT
locks the checkbox and retries the identical boolean, including false. A valid
PUT response is authoritative, so no follow-up GET failure can cause the app to
replay a known successful save. The API has no preference CAS/version contract;
no cross-device concurrency guarantee is invented. Security verification/recovery
mail and in-app notifications are not disabled by this ordinary-email preference.

Every query key includes session generation and role. Existing session cleanup
cancels queries and clears caches on logout, expiry and 401. Late mutation results
check generation again after asynchronous cancellation before writing cache.
Customer dashboard/notification DTO whitelists strip unknown bank, supplier,
actual-cost and internal-note object fields. Manager reports use separate types
and APIs in `features/activity-reports/`; only authorized Manager pages fetch them.
Titles/messages/snapshots render as text. The backend must continue to use its
safe notification templates; no FE field parser can sanitize a private value
embedded in an otherwise legitimate message string.

400 shows safe field errors without reflecting raw backend text. Definite 409
requires GET/review before another write. 403/404 hide cached actionable content
and provide a safe workspace link. 503 displays deployment blocked rather than
an empty inbox, false opt-out or zero financial report. Inputs are retained when
access is still valid. Unknown service errors do not echo potential private data.

## Ownership and merge handoff

- FE1: `features/activity-customer/`, `features/activity-reports/`, related tests,
  new route/menu registration and the notification button in existing shells.
- FE2: `features/activity-operations/` or its agreed module, task queues and
  OrderTimeline. No `/api/dashboard/tasks` or order-timeline call is added here.
- FE2 should hand off actual route/component exports and required destinations
  for menu integration. No dependency import or placeholder route is guessed.
- Shared API client, session, contracts and auth redirects are unchanged. The
  only existing app files changed are router, Manager layout and assigned-case
  header for menu/bell integration. No package/lock or environment changes.
- This branch starts from dev independently; unmerged #76/#77 branches are not
  copied into this issue. Their work stays in their own commits/PRs.

## Validation and live acceptance

Results on 18 October 2026:

| Check                                                   | Result                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Typecheck                                               | Passed                                                                                                               |
| ESLint                                                  | Passed                                                                                                               |
| New activity / report / role-route checks               | 76 passed in five files                                                                                              |
| Full regression suite                                   | 476 passed in 49 files                                                                                               |
| Production build                                        | Passed; existing large-chunk warning remains                                                                         |
| Changed code / guide formatting and git diff whitespace | Passed                                                                                                               |
| Dedicated Playwright discovery                          | Two mocked scenarios discovered                                                                                      |
| Browser execution attempt                               | Blocked before scenarios ran: server/plugin setup and teardown each timed out at 45 seconds; no screenshots produced |
| Read-only live OpenAPI probe                            | Socket access to `127.0.0.1:8080` forbidden by the environment                                                       |
| Real BE / SQL / recipient IDOR acceptance               | Not performed; required before closing the issue                                                                     |

Unit/component tests cover wire bodies/headers, field whitelists, exact amounts,
actor gates, recipient-cache updates, account switching, retry targets and form
preservation. Test fixtures are artificial and are never imported by runtime UI.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --pool=threads --maxWorkers=2
npm.cmd run build
npm.cmd exec -- playwright install chromium
npm.cmd exec -- playwright test --config playwright.issue82.config.ts
npm.cmd run dev
```

Two mocked browser scenarios are included: Customer mobile dashboard → bell →
explicit mark-read → ordinary-email opt-in, and Manager report → read-only audit.
Only artificial page screenshots are requested; traces/video and automatic error
screenshots are disabled. Discovery is not execution evidence. No screenshot or
real BE pass may be claimed unless its scenario actually runs.

Real acceptance requires a separately authorized test DB and deployment with
the reviewed base schema, payment migration 007 and activity migration 008 plus
trusted constraints/indexes. Source code existence does not prove deployment.
No database restore, migration, seed, real mail or financial write is run here.

Using approved isolated fixtures, verify:

1. Two Customers see only their own dashboard and recipient messages; another
   recipient's notification ID cannot be read or marked. Revoked staff/Driver
   assignment also removes order notification access.
2. Bodyless mark-read retry preserves the first ReadAt. Paging and bell caching
   stay consistent without asserting a global unread count.
3. Explicit true/false preference persists; security mail and in-app delivery
   remain independent. Check 400 fields, interrupted PUT and reload failures.
4. Manager sees all seven independent report measures; reconcile fixture quotes,
   submitted reports, bank receipts, allocations, completed refunds, reversals,
   current-plan costs and persisted operational/CLOSED states against BE results.
5. Customer and all non-Manager roles are rejected from reports/audit. Verify no
   private values reach Customer response/DOM/cache and audit redaction holds.
6. Exercise 401 cleanup, 403/404 revocation, definite 409, interrupted retry and
   migration-pending 503. Capture role screenshots without credentials/tokens.
7. Integrate FE2 Part B through its separate PR and verify the complete shared
   issue with real active tasks and evidence-backed timeline milestones.

The full #82 DoD remains open until both owners' work and live acceptance pass.
No commit, push, PR, merge or deployment is included in this coding handoff.
