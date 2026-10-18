# Issue 74 — service preferences and bundle scope

Issue: <https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_FE/issues/74>.

Base FE `dev`: `9943d78adfccd66537b2d1252de265a8204dd6d2`.
Backend contract reviewed: `5c5b1675a525ecb2be5d9fdcdbb5358cd70a22d2`.
Branch: `feature/74-service-preferences-air-stall-bundle-scope`.

This extends the existing F05/F06 screens and adapters. No backend/database
changes, tariff publication, flight matching, payments or migration execution
are included. Existing closed F01–F06 issues are not reopened.

## Routes and review steps

Replace IDs with real orders/quotes owned by the signed-in actor.

| Actor                | Route                                    | Review                                                                                                                  |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Customer             | `/customer/requests/:id`                 | Select **3. Service preferences**, then expand the seven sections. An existing saved order and horse are required.      |
| Customer             | `/customer/requests/:id/quotes/:quoteId` | Read the issued retail snapshot, terms, schedule, null amounts and blockers. Existing acceptance/rejection is retained. |
| Manager              | `/manager/requests/:id/quotes/prepare`   | Record a supplier offer, choose bundle coverage and inclusions, then prepare a quotation for an approved revision.      |
| Assigned Coordinator | `/staff/cases/:id/quotes/prepare`        | Same source/prepare flow, subject to current active assignment.                                                         |
| Manager              | `/manager/requests/:id/quotes/:quoteId`  | Review a prepared version before approval/issue.                                                                        |

## Behavior

- Unit prices for unselected choices still come from `GET .../services/rates`.
  Current catalog prices are distinct from captured quotation amounts. `unit`
  and `pricingMode` are authoritative, including `SHIPMENT`; there is no fixed
  slots-times-km formula in the Air Stall UI. Veterinary rates remain visible
  even when a customer-arranged veterinarian is selected. Optional `allowedUnits`
  is retained by the response schema for compatibility with the new DTO.
- WIDE is recommended only when the server marks SHARED_ONE unsuitable, offers
  WIDE in the section and does not rule WIDE out. Pending WIDE remains labeled
  pending, not proven suitable. The initial view may suggest WIDE; the saved
  `OrderResponse.draft.services.airStall` wins if present. Choosing no preference
  is not silently undone when a section reopens or after confirmation.
- SHARED_ONE/WIDE mean **Request Share** at 1/1.5 slots; PRIVATE requests 3 slots.
  No sharing match, flight, physical stall or carrier space is confirmed here.
  `STALLION_COMPATIBILITY_REVIEW_REQUIRED` is visible even on ELIGIBLE fit results.
  Eligibility is not changed based on sex in the frontend.
- Preview sends every preference, order version and horse version. It contains
  no UUID, client rates, mandatory quantities, `autoWide` or `sharingCode`.
  Debounce, cancellation and preference/version/account query keys guard stale
  responses. Prices/quantities/formulas/blockers, including unchanged F06 lines,
  are rendered from the response. Null amounts never become zero.
- Confirm remains an explicit, separate UUID mutation with top-level versions
  and a reason for submitted requests. Background reads cannot silently advance
  an edited confirmation's version. Conflicts require explicit reload/review;
  input is retained. After a successful confirmation, the UI acknowledges the
  save and locks choices, previews and further confirmations until fresh order
  and service reads have matching versions. Network, 500, contract/502 and 503
  read failures retain this state. **Retry loading saved choices** only repeats
  GETs; it never creates another UUID/confirmation/revision. A successful retry
  adopts the saved preferences and versions, then permits a genuinely new edit.
- Supplier Offer sends `bundleCoverage` as `ENTIRE_ROUTE`, `PARTIAL_ROUTE` or
  `UNKNOWN`. The form defaults to UNKNOWN; legacy adapter callers may omit it.
  Only evidenced entire-route coverage can automatically waive a whole charge.
  Partial/unknown inclusions show review guidance. Actual INCLUDED amounts,
  uncovered scope and blockers remain backend decisions, not client arithmetic.
  The existing receipt contains only offer ID/version; the session summary shows
  the submitted coverage, not an invented server coverage response field.
- Purchase and retail prices remain separate. Purchase cost is cleared after
  recording and is absent from recorded-offer summaries/customer quote schemas.
  Quote actions keep their existing `{command,action}` shape; no reason field
  or in-place snapshot update is introduced.

## Errors and retry

| HTTP    | Behavior                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 400     | Keep inputs; render available service/offer/quote validation fields beside the corresponding controls.                                         |
| 401     | Shared request client clears the session and account query cache; protected routes require login.                                              |
| 403/404 | Hide inaccessible service/preparation data, prevent writes and offer a safe request-list return.                                               |
| 409     | Prevent another write until explicit current-data reload/review; keep input. No automatic new-version/new-UUID retry.                          |
| 422     | Keep the actual business blocker message; no success or fabricated state. This does not assert every endpoint returns 422.                     |
| 503     | Show deployment-blocked, preserve inputs and offer an explicit retry/read. An uncertain mutation retry retains the original UUID/version/body. |

Generic read failures may leave preferences editable while price text says
unavailable. Ownership/permission errors do not. No invented machine codes are
used for the new behavior.

## Verification commands

Run from this worktree with the dependencies in `package-lock.json`:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --pool=threads --maxWorkers=2
npm.cmd run build
npm.cmd exec -- playwright test --config playwright.issue74.config.ts
```

The issue-specific browser config starts this checkout on port **5184** with
`--strictPort` and `reuseExistingServer=false`, avoiding a different local FE.
It has three mocked API browser cases: Customer mobile, Manager and Coordinator.
Screenshots are saved under ignored `artifacts/issue74/browser/` only if those
tests actually reach the screens. Traces/video are disabled; the staff purchase
input is masked. Test IDs/prices/credentials occur only in test fixtures and
are not pricing logic or live backend evidence.

## Verification results — 18 October 2026

Results are recorded after execution; browser discovery is not a pass.

| Check                             | Result                                                                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit/component regression    | Passed after the recovery fix: 329 tests / 35 files (320 previous tests plus 9 additional recovery cases).                                                                                                |
| TypeScript                        | Passed on the final source.                                                                                                                                                                               |
| ESLint                            | Passed on the final source.                                                                                                                                                                               |
| Production build                  | Passed after the recovery fix; existing chunk-size warning remains (631.29 kB / 183.51 kB gzip for the main chunk).                                                                                       |
| Three browser cases / screenshots | Three cases discovered. Local execution retried after the recovery fix; timed out in plugin setup/teardown (45 seconds each), before running the cases. No new local browser pass or screenshots claimed. |
| Real backend integration          | **Blocked; 0 business scenarios executed.** Read-only `GET http://127.0.0.1:8080/v3/api-docs` failed with Windows socket access denied. No backend/SQL mutations were attempted.                          |

## Guide reconciliation and confirmation recovery - 18 October 2026

Read the supplied `FE1_COMMERCIAL_FINANCE_GUIDE.md` in full (1,533 lines),
including Task 01, shared integration rules and the DTO appendix. Rechecked
the current issue 74 against this guide; both describe the same F05/F06 scope.
The guide's backend snapshot is a source reference, not deployment evidence.

| Guide requirement                                                        | Frontend implementation / remaining evidence                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Seven sections, prices before selection, pending/null distinct from zero | Existing catalog-rate cards and server charge rendering retained; no client rate or total calculation added.                                                                                                                         |
| WIDE recommendation, saved choices, stallion review and Request Share    | Existing server-driven fit/options and warnings retained; no automatic confirmation or physical assignment.                                                                                                                          |
| Full read-only preview; explicit versioned confirmation                  | Existing request shapes retained. Added acknowledged-save recovery so a failed GET cannot initiate another confirmation.                                                                                                             |
| Entire/partial/unknown bundle coverage and private purchase cost         | Existing Supplier Offer field and internal form retained; INCLUDED/blocker decisions remain server-owned. Actual persistence and no-double-charge results still need live evidence.                                                  |
| Role routes, conflicts/retry and regression                              | Existing route/browser coverage retained. Recovery tests cover failures of either GET, repeated retries, reads in flight, version mismatch and a new edit after recovery. Real BE 403/IDOR/409/retry acceptance remains outstanding. |

The recovery regression was reproduced before the fix: after a successful POST,
a network or 500 GET failure left **Confirm service choices** enabled. The old
503-only test did not cover these failures. Recovery now depends on whether a
successful write still needs refreshing, independently of the error status.

## Outstanding acceptance evidence

### CI follow-up — commit 9136d6d

The [pull-request check run](https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_FE/actions/runs/39090385640)
passed dependency installation, lint, typecheck, 320 unit/component tests and
production build. Browser E2E ran 12 tests: 10 passed and two staff bundle tests
timed out waiting for the Supplier Offer form. This is distinct from the local
web-server startup restriction recorded above.

The new staff tests incorrectly expected login to honor `returnTo`. The actual
LoginPage sends staff to `/staff`, then their role workspace. Customer returnTo
behavior is unchanged. The fix follows the existing SPA links: role workspace,
Manager APPROVED queue / Coordinator assigned list, TEST-9 case, then Prepare
quotation. Queue/history fixtures and destination/form assertions now cover this
navigation; there is no hard reload that would discard the memory-only session.
The test file also disables raw traces/video under the default CI configuration.

The staff-navigation correction was committed as `25766e2`. Its
[pull-request check run](https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_FE/actions/runs/39090876406)
completed successfully, rechecked on 18 October 2026. This is mocked browser CI
evidence for that commit; it does not cover the subsequent local confirmation
recovery changes or prove integration with a real backend.

Issue 74 must not be marked fully accepted solely from mocked tests. On the
designated isolated test environment, provide a reachable matching BE release,
deployed required schema and authorized Customer/Manager/assigned Coordinator
test accounts/orders. Reuse shared test fixtures; do not seed or migrate a real
customer database to satisfy these tests.

Verify real read/preview leaves order version/revision/quotes unchanged; explicit
confirmation saves the chosen configuration with its UUID; all three offer
coverage values persist and prepare the expected blockers/INCLUDED lines without
double charging. Check stale preview replies, 403/409/503, multi-leg quantities,
null totals and immutability of issued/accepted retail snapshots after service or
tariff changes. Capture redacted screenshots/video and actual outcomes by role.
Those live results and successful browser screenshots remain **outstanding**.
