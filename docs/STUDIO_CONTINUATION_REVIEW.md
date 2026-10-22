# Studio continuation — 21 October 2026

## 22 October completion

- The Studio → payment → confirmation/gates/authorization → Driver ROAD/welfare → Coordinator AIR → Customer tracking chain now passes in the dedicated Demo scenario. All five roles also passed login/refresh/logout checks.
- The missing F07 installment-identity contract and confirmed-quarantine form mismatch are fixed. Final results, source changes, local evidence and limitations are in [the completion review](STUDIO_COMPLETION_REVIEW.md).

The sections below describe the earlier 21 October snapshot, including its then-unfinished browser chain and unchanged-backend status.

Branch: `feature/studio-supplier-pickers`, based on `origin/dev` at `0acd7f2`. The earlier Heritage interface, tick-only service options and form redesign are already merged through PR #110 (`4b0e987`). This continuation does not merge into `dev`.

## Changes

- Studio supplier fields use the existing supplier catalogue for Manager: real names and IDs, bounded pagination, search on the current page, disabled inactive entries, retry and an explicit ID fallback.
- Coordinator uses the documented ID fallback. The existing catalogue is Manager-only; the frontend does not make a forbidden catalogue request or broaden permissions. The supplier DTO has no separate business code, so the picker shows name and `#ID`.
- Carrier supplier selection is now retained in the existing plan-leg `supplierId` compile contract. Forking an editable plan retrieves this value from the already-authorized internal plan detail. Customer/Driver graph payloads are unchanged.
- Stall availability checks use the leg's actual carrier instead of `null`, retaining carrier fit-policy checks.
- Both dashboard and request-queue filters now offer **In Transit**. Filtering still applies only to the loaded page and does not change server queries.
- ESLint ignores generated `artifacts/` and `coverage/`, alongside the existing build/browser output ignores. Source/test lint coverage remains enabled.

## Targeted verification

- Supplier picker, Studio and graph model: **21 tests passed in 3 files** using `--maxWorkers=1 --reporter=dot`.
- Shared interface filters/lifecycle: **5 tests passed** in `design-system.test.tsx`.
- `npm run lint`, TypeScript and `npm run build` passed. The existing large bootstrap bundle warning remains.
- Real browser smoke passed: Manager catalogue HTTP 200 and all four pickers can select an existing active ID locally; Coordinator fallback makes zero Manager catalogue requests. Graph fingerprints before/after reload are identical, with zero business write attempts and zero page errors. Local selection is not a verified carrier reservation or supplier-role approval.
- The earlier complete FE suite (**730 tests in 76 files**) is inherited evidence for the Heritage changes. It is not represented as a new complete run after the supplier changes.
- Backend source is unchanged. `test-compile checkstyle:check` passed with **0 violations**; no package/restart or database migration was needed.
- Four targeted native SQL/HTTP tests passed with **0 failures, errors or skips**: F11 gates/receipt/departure and F12 ordered ROAD/AIR execution, welfare corrections and Customer privacy. Fixtures ran only in the exact disposable Test databases and were cleaned up.
- Ten read-only Demo HTTP checks passed. Demo retained **6 users, 8 orders, 0 milestones and 0 welfare logs**. No Demo business writes, DDL, backup restore or production database changes were performed.

Backend evidence remains local under `.local/journey-studio/`: `resume-chain-native-targeted.log`, `resume-chain-compile-checkstyle.log`, `resume-chain-read-proof.json`, `resume-chain-db-read-proof.json`. These are test/readback evidence, not genuine carrier, bank, legal or clinical confirmations.

## F01–F16 wiring review

The narrow source audit found FE adapters and routed consumers for authentication/account, horse profiles, requests/revisions, assessment and assignments, service disclosure/rates/preview/confirmation, quotation actions, payment/proofs, compliance, resources, planning/graph, departure, execution, incidents/adjustments, handover/actual costs, staff/tariffs and activity/reports.

Refresh is initialized before mounting routes; access tokens remain in memory, with HttpOnly-cookie refresh, credentials included, single-flight/Web Locks and one 401 retry preserving the original request. Existing rowversion and operation-ID command protections are retained. No API or dependency changes were required.

F14 financial settlement/close has **no implemented backend endpoint**. The frontend explicitly reports that limitation. Existing handover and actual-cost APIs should not be mistaken for a financial close workflow.

## Historical browser limitations before the new fixture

- Demo **order 1 / plan 10** has an editable two-node graph and a planned ROAD leg. Live blockers include `ACCEPTED_QUOTE_MISSING`, `RULE_ASSESSMENT_PENDING`, `PLAN_NOT_CONFIRMED` and `QUARANTINE_NOT_CONFIRMED`. Actual departure has not been recorded.
- Demo **order 5 / plan 5** has three live gates passing and is ready for authorization, but still needs Manager authorization and physical horse receipt. It is a legacy plan with **zero graph nodes**. Executing it would not prove Studio graph tracking end to end.
- Consequently a complete Studio browser chain through genuine confirmations, departure, welfare and Customer tracking is **not established** by the current Demo dataset. Do not fabricate evidence, modify immutable confirmed plans or infer actual location from planned times to fill this gap.
- Customer draft graph denial and internal-plan denial, Driver internal-plan denial and published legacy graph reads were checked against the running Demo. Published graph actual-time/privacy behavior is additionally covered by the inherited graph tests and targeted F12 native tests.

The next full browser run needs a valid graph-backed published plan with the required quotation, route assessment and reservation confirmations. Keep migration 018 sandbox-only and never restore the old Demo backup whose manifest stops at migration 014.
