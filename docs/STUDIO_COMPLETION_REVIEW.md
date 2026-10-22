# Journey Studio completion review — 22 October 2026

## Delivered changes

- Manager supplier pickers use the existing paginated catalogue; assigned Coordinators retain the documented ID fallback because that catalogue is Manager-only. Carrier identity survives compile/fork and is used for stall-fit checks.
- Manager payment requests now select persisted installments from an accepted quotation. The companion backend exposes `paymentSchedule[].scheduleId` through a separate read projection; quotation input and approval snapshot comparison are unchanged.
- Missing/null installment IDs from older servers or historical receipts keep the action unavailable until a fresh quotation is loaded. No display sequence is substituted for an ID.
- The payment form retains the same command for uncertain retries, requires explicit reload after a version conflict, excludes known obligations and reloads the quotation before a subsequent installment.
- Confirmed quarantine reservations require reference, evidence and future expiry in both form labels and validation; held reservations preserve their optional fields.
- Customer/Driver graphs display recorded leg status instead of treating redacted vehicle/stall IDs as missing resources. Internal Manager/Coordinator views retain their resource readiness warnings, including confirmed read-only plans.
- Heritage forms, service option cards, role workspaces, lifecycle badges and the earlier global interface work are inherited from merged FE PR #110. This continuation also adds the In Transit loaded-page filter.

## Browser verification

The dedicated local **DEMO/SIMULATION** scenario uses order 10, plan 11, three checkpoints, ROAD leg 14 (40 km) and AIR leg 15 (1,100 km). Business facts were created through normal APIs/UI in `EquiTransit_Demo`.

1. Compile the graph in Studio, reload it, assign vehicle/Driver, AIR stall, flight reservation, quarantine and insurance.
2. Accept quote 12, create a payment request through Manager UI using its real installment ID, then record the clearly labelled simulation receipt and allocate the exact USD 2,630.00 through the existing APIs. Prepare the demonstration compliance prerequisites through the existing APIs.
3. Confirm the plan; evaluate Financial, Document and Operational gates (all PASS); authorize departure.
4. Driver UI records horse receipt, departure, public and staff-only milestones, shared welfare and ROAD completion. Coordinator UI records AIR start/completion with a simulation source. All actual timestamps are server/current facts, rather than inferred planned positions.
5. Customer UI reads both completed legs, actual departure/arrival, four visible milestones and one shared welfare entry. The unshared milestone is absent. Internal markers, costs and graph metadata do not leak; an explicit internal-plan request returns 403 and the Customer UI does not request that endpoint.

Authentication browser checks passed for all five roles: login, HttpOnly refresh cookie, refresh after reload, logout and protected-route denial afterwards. Browser storage retains the role hint, without access tokens. Final browser phases reported zero page errors or writes outside the dedicated order.

Local ignored evidence: `artifacts/studio-e2e-browser-{proof,state}.json`, `studio-e2e-payment-request-proof.json`, `auth-refresh-live-proof.json` and screenshots. Runner navigation/body-capture failures were recovered from persisted receipts without duplicate business writes; the final canonical phases pass and attempt history is retained.

## Validation and limits

- FE payment and quarantine checks: six RequestPayment tests, fourteen existing payment-page tests and six plan-validation tests passed across the relevant final runs. Lint, TypeScript and production build passed. The existing large bootstrap-bundle warning remains.
- Studio canvas/component checks: seventeen targeted tests passed for public resource redaction display and existing editing behavior.
- BE quotation/schema/pricing checks: twelve tests passed, including historical receipt decoding without an installment identity; test-compile and Checkstyle passed with zero violations. The packaged Demo was restarted and the new projection was exercised through the real browser payment request.
- A separate opt-in native payment fixture encountered pre-existing active tariff/version data before reaching its payment setup. Cleanup restored the exact TestDB baseline. This attempted fixture run is not counted as a PASS; the live Demo chain above independently exercises quotation identity, payment request and allocation.
- The earlier 730-test FE run and four native F11/F12 checks remain inherited evidence, not new full-suite executions.
- The new synthetic compliance rule is route-wide within Demo. Existing VN–SG checklists may require re-evaluation even though their order rows were not edited. No production database, migration, backup restore or dependency installation was used for this continuation.
- These are simulation facts, not genuine bank/carrier/authority confirmations. A single shared-stall allocation does not prove matching two orders. Final delivery/quarantine release and financial settlement are outside this tested chain.
- F14 financial settlement/close still has no implemented backend endpoint; the existing handover/actual-cost UI truthfully reports that limit. This work does not add that endpoint.

Changes are published for review on feature branches; merging into `dev` remains the owner's action.
