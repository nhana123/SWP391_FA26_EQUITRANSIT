# EquiTransit interface review — 21 October 2026

The Heritage redesign was published as `4b0e987` and is already on `dev` through [PR #110](https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_FE/pull/110). The next Studio continuation uses the separate branch `feature/studio-supplier-pickers`; see `STUDIO_CONTINUATION_REVIEW.md`. The continuation agent did not perform the earlier merge.

## Result

- Shared green, ivory and restrained gold theme across the Customer, Manager, Coordinator, Specialist and Driver workspaces.
- One reusable workspace shell with existing navigation destinations, inline SVG icons, breadcrumb, timezone, notification bell, role identity and responsive menu.
- Dashboard metrics use server counts. Request search and status filters explicitly apply to the loaded page. Request code links retain the full accessible name, with a separate copy button.
- Shared status badges, conservative request lifecycle, empty states and loading skeletons.
- Consistent inputs, labels, hints, error states, checkboxes, radio buttons, file selectors and focus styling. Horse profiles and journey forms have four clearly separated sections each. Joined date/offset and phone/country controls retain their existing parsing and validation.
- Horse selection uses responsive profile cards, a named selection summary and search. Pagination is omitted when there is only one page.

## Service visibility fix and simpler cards

The new-request editor previously displayed a release placeholder because the service editor requires a persisted order ID. Saved requests already supplied the service editor through `servicesSlot`.

The new-request service step now shows the seven service areas and an explicit **Save draft & load services** action. After saving, navigation keeps the customer on the service step, where the existing saved-request route loads the actual service disclosure. No order is created just by visiting a step. Unsaved changes to the horse or route must be saved before displaying service choices for that request. An unresolved submission blocks service changes until its outcome is resolved.

The seven service cards now contain only an icon, a short title and a choice/action label. They contain no catalogue price list. Inside the dialog, prices and explanatory option notes are shown for the selected choice. Optional care rates appear only after requesting the corresponding care, days or nights; clearing the request hides its rate again. A suggested Wide stall is distinguished from a customer-confirmed display choice. Prices remain exact server strings; missing rates stay pending. Required route charges and the explicit full breakdown remain available in Additional charges.

The user's final reference was a pricing-card layout, with EquiTransit green replacing its warm brown palette. `pricing.css` applies serif card headings, fine green borders, pale ivory surfaces, a visible selection tick, price dividers and responsive option grids. Exclusive choices remain semantic radio groups, styled with a square tick; optional care remains checkboxes.

All service dialogs now use selection controls rather than free text. Grooming and boarding expose preset durations of 1, 2, 3, 5, 7, 14 and 30 days/nights. The checkbox explicitly starts with one day/night, stated on the card; the customer can change it with duration ticks. Any other previously saved duration remains a selectable choice and is not rounded or replaced. Escort selection sends the explicit request text `Escort support requested`; historical escort notes remain readable. Provider details already saved are shown read-only. Change reasons for submitted requests are explicit radio choices, and the backend still receives a required reason with the original confirmation command.

The user explicitly requested removal of **I already have a policy** when informed that its mandatory policy reference could not be replaced with a tick without changing the backend. New choices therefore contain None, Mortality and Combined only. Historical existing-policy selections and recorded declared values remain readable and are not automatically changed. No fabricated policy reference or horse value is sent. Replacing such a selection still follows the original insurance field-clearing policy.

Opening or closing a dialog does not confirm services. Dialogs support Escape, bounded keyboard focus, return focus to the opener and body scroll locking. Mobile layouts keep provider labels and prices readable.

## Main files

| Area | Files |
| --- | --- |
| Theme and forms | `src/app/heritage.css`, `src/app/forms.css`, `src/app/bootstrap.tsx`, `src/shared/ui/common.tsx` |
| Shared interface | `src/components/ui/Icons.tsx`, `WorkspaceShell.tsx`, `FormSection.tsx`, `StatusBadge.tsx`, `Primitives.tsx`, `OrderLifecycle.tsx`, `PortfolioMetrics.tsx`, `RequestTable.tsx`, `LoadedOrderFilter.tsx` |
| Role shells | `src/app/router.tsx`, `src/features/assessment/layout.tsx`, `src/features/assigned-cases/pages.tsx`, `src/features/departure/DeparturePage.tsx` |
| Dashboards and notification display | `src/features/activity-customer/dashboard.tsx`, `notifications.tsx`, `src/features/activity-operations/StaffDashboard.tsx` |
| Long forms and request flow | `src/features/horses/pages.tsx`, `src/features/transport-orders/pages.tsx` |
| Services | `src/features/booking-services/catalog.ts`, `pricing.css`, `BookingServices.tsx`, `service-cards.tsx`, `rates.tsx`, `sections.tsx`, `care-sections.tsx`, `insurance-section.tsx`, `confirm.tsx` |
| Regression coverage | `src/components/ui/design-system.test.tsx`, `src/features/transport-orders/service-flow.test.tsx`, `src/features/booking-services/rates.test.tsx`, adjusted badge assertions in `src/features/plans/plans.test.tsx` |

Existing status/empty-state presentation was also updated in assessment, assigned cases, horse lists, request status/history, plans and Studio, departure, execution, compliance, incidents, quotations, payments, resources, pricing and staff administration. These updates reuse the shared display components.

## Verification

- ESLint and production build pass. No dependencies were added.
- The final complete regression suite passed **730 tests in 76 files** (`artifacts/heritage-full-tests-final.log`, start 18:59:16, duration 176.14s).
- Live browser review passed for all five roles at desktop and 390px mobile width: menu icons, request filters, details, menu operation, no page overflow or uncaught page errors. Driver navigation checks wait for its final login redirect before opening the overview.
- Horse profile and journey forms: four sections each, text/select controls and phone width checked at desktop/mobile; no business records were saved.
- Registration phone control checked at mobile width after applying the joined control sizing to the public form too.
- Live demo order 5 returned HTTP 200 for `/services` and `/services/rates`. All seven dialogs opened and closed correctly. Price visibility was checked by requesting and clearing grooming days without confirming a change. No business write was sent; any service preview is the existing read-only preview API.
- All seven service dialogs were checked to contain no free-text or numeric entry controls. Care and duration ticks, the removed existing-policy choice, focus return and mobile overflow checks passed.
- New-request save/navigation and saved-request dirty-form gating are covered by integration tests with mocked API responses. The browser review did not create a new persisted order.

Ignored local screenshots and review scripts are under `artifacts/`: `heritage-service-cards.png`, `heritage-services-desktop.png`, `heritage-services-mobile.png`, `heritage-service-dialog-mobile.png`, horse/request form screenshots, and screenshots for the five roles. Browser summaries: `heritage-browser-results.json`, `heritage-service-results.json`.

The final pricing reference screenshots are `heritage-care-pricing-desktop.png` and `heritage-care-pricing-mobile.png`. The targeted service/request regression run passed 99 tests in 13 files (`artifacts/heritage-pricing-tests.log`).

## Boundaries

API endpoints, request/response schemas, auth token/cookie handling, operation IDs, rowversion checks, routes and dependency manifests are unchanged. Service confirmation and submit retain their original explicit commands and retry protections. No backend/schema changes were needed. The notification badge counts unread notifications already loaded for the current session; it does not claim to be a server-wide total.

The build still reports the existing large bootstrap bundle warning. All business workflows were not re-executed against real data; the visual browser review avoids persistent business mutations. A production deployment and exhaustive accessibility audit are separate work.
