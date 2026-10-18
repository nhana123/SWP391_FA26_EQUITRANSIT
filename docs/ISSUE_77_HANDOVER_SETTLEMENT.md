# Issue 77 — Handover, actual costs and financial closure

**Status: BLOCKED BE F14. Preview routes only; not a complete implementation.**

Branch: `feature/77-handover-actual-cost-settlement`.
FE base: dev `5acc04256eb77b62648d81fbd4793f6c05d4c99a`.
BE checked: dev `563266a6d70d3691adbbba2478f71599460f43b1` on 18 October 2026.
Sources: [issue 77](https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_FE/issues/77)
and Task 04 of the provided FE1_COMMERCIAL_FINANCE_GUIDE.md.

The current BE source tree contains no F14 handover, actual-cost or settlement
Controller/DTO. No Method/Path, payload or role contract is confirmed. The issue
expressly permits a wireframe/route shell and requires waiting for BE before
integration. This change prepares those entry points without inventing APIs.

## Implemented preview scope

| Existing portal          | Entry point from request/case  | Preview route                      | Contents                                                                                             |
| ------------------------ | ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Customer                 | Delivery handover (preview)    | `/customer/requests/:id/handover`  | Evidence unavailable; three disabled decisions corresponding to ACCEPTED / EXCEPTION / NOT_DELIVERED |
| Manager                  | Financial settlement (preview) | `/manager/requests/:id/settlement` | Internal cost placeholder; unevaluated settlement; disabled evaluate and close actions               |
| Specialist / Coordinator | Actual costs (preview)         | `/staff/cases/:id/actual-costs`    | Internal cost placeholder; disabled record-cost action                                               |

These are **frontend routes**, not proposed BE endpoint paths. Existing portal
role guards protect the routes. Access to a noninteractive preview does not grant
F14 cost-write or settlement permissions. Actual assigned-staff roles and access
checks must be confirmed with the new BE contract before any financial data read
or write is introduced. Driver has no new route or link.

No record, customer identity, cost or financial balance is loaded for a supplied
order ID. The preview therefore does not establish ownership, assignment,
delivery or financial status. The Back link returns to the existing request/case
page, whose API enforces access. Customer preview renders no internal cost,
supplier, margin or private-note UI. No form values or evidence files are stored.

All new controls are disabled. There are no handlers, API adapters, request/response
DTOs, fabricated monetary values, fake evidence, local status updates, or F16
report requests used to simulate closure. Existing F01–F06 behavior is preserved.

This branch is independently based on dev. Unmerged work from the separate #76
branch is not copied into #77; integrate it through its own reviewed PR.

## Business boundary for the eventual implementation

- Customer handover offers the three decisions specified by the issue, with
  real delivery record/evidence and version/conflict handling once supported.
- ActualCost must have a traceable source. Its records, supplier costs, margins
  and private notes must never enter Customer response objects, caches or DOM.
- Operational delivery/completion does not imply financial CLOSED.
- Closure requires the BE settlement facade to confirm full net payment for
  every installment of the applicable quote, accounting for refunds/reversals,
  with no pending refund or outstanding obligation. A Customer transfer report
  is not received money. A page of F07 ledger data cannot prove settlement.
- FE cannot choose a CLOSED status or infer a successful gate locally.

## Required BE handoff before integration

Provide the released source/OpenAPI and update the issue's API table with:

| Area                              | Required confirmation                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handover read and decision        | Methods/paths, real delivery/evidence identifiers, response visibility, decision enum, required explanation/evidence per decision, allowable lifecycle states                   |
| Actual costs                      | Methods/paths, immutable source references, exact fields, currency/decimal precision, visibility, eligible assigned staff roles, Manager permissions, review/edit/history rules |
| Settlement evaluation and closure | Methods/paths, applicable quote/installments, authoritative net-payment/refund/reversal rules, structured blockers, state transitions and closure receipt                       |
| Evidence                          | Authorized upload/read contract, allowed formats/size, link ownership, retention rules; explicitly confirm whether F07 proof can be reused                                      |
| Concurrency                       | Authoritative recordVersion, command placement, operationId/idempotency namespace, replay semantics and post-write GET/version behavior                                         |
| Access and failures               | Owner/active-assignment/Manager enforcement, 400 field shape, 401/403/404, 409 codes, business blockers/422 if used, schema/deployment 503                                      |
| Deployment                        | Required migrations, deployment version and isolated test DB/accounts/fixtures                                                                                                  |

These are handoff questions, not invented DTOs or assumed endpoints. Do not
reuse F07 evidence or F16 financial reports as F14 writes without BE confirmation.

## Validation and remaining DoD

Checks on 18 October 2026:

| Check                                                 | Result                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| Typecheck                                             | Passed                                                               |
| ESLint                                                | Passed                                                               |
| Focused preview and existing portal route tests       | 31 passed in two files (17 preview checks, 14 existing route checks) |
| Production build                                      | Passed; Vite reports the existing large-chunk warning                |
| Changed code/guide formatting and git diff whitespace | Passed                                                               |
| F14 API/database integration                          | Blocked; no published contract                                       |
| Real BE E2E / screenshots / video                     | Not performed; required before issue closure                         |

The preview checks assert role-separated routes, Customer privacy, disabled
financial controls, invalid-ID handling, sign-in protection and **zero network
requests** for these screens. They do not establish backend access enforcement or
prove the financial workflow.

Commands from this checkout:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/features/settlement src/features/assessment/routes.test.tsx --pool=threads --maxWorkers=2
npm.cmd run build
npm.cmd run dev
```

Open a request/case as the relevant actor and select its preview link. No new
environment variable or package is required.

Before issue closure, all of the following remain open:

1. Released F14 Controller/DTO and documented actual API contract.
2. Real evidence/record reads and writes with ownership/assignment checks.
3. Customer decisions, sourced actual costs and authoritative settlement/closure.
4. Correct field errors, stale-version review and identical-UUID uncertain retry.
5. Real BE E2E: success, missing evidence, financial blockers, unauthorized/IDOR,
   409/replay, migration-pending and Customer privacy.
6. Screenshots/video by role and recorded acceptance against an isolated test DB.

Do not close #77 based on this preview or mock-only tests. No backend/database
changes, commit, push, PR or deployment are included.
