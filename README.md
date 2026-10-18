# EquiTransit frontend — FE1

Issue #77 has preview-only handover, internal-cost and settlement routes;
F14 integration is blocked by the missing BE contract. See
[the scope and BE handoff](docs/ISSUE_77_HANDOVER_SETTLEMENT.md).

Manager staff provisioning and the tariff unit/version extension for issue #75:
see [the review guide](docs/ISSUE_75_STAFF_TARIFF_ADMIN.md) for routes, contracts,
checks and deployment dependencies.

React + TypeScript strict + Vite. Implements FE-01–FE-12 against backend `dev`
commit `de7b083a21c18bb0be2ea41e7c93a720c5c1670f` (F01–F05, including auth/OpenAPI audit fixes).

The latest backend requires preferred departure and import type at submission,
as well as horse, international route, addresses, named timezones and deadline.
Drafts may remain partial. Microchip/passport, receiver phone and route timezone
patterns match the updated `ApiPatterns`; optional blanks are sent as null.

Registration phone now follows the same PHONE pattern (8–15 digits, optional +,
first digit nonzero). Public email inputs retain email keyboard/autofill without
an ASCII-only restriction; backend `@Email` remains the authority for grammar.
Confirm password is bounded to 72 characters. JWT lifetime still comes from the
actual login response; documentation examples do not change runtime TTL.

## Run

Use Node 24 LTS, then:

```sh
npm ci
cp .env.example .env
npm run dev
```

On PowerShell, replace `cp` with `Copy-Item`. The app runs at
`http://localhost:5173`. `VITE_API_BASE_URL` defaults to `http://127.0.0.1:8080`.
Configure the backend's `EQ_CORS_ORIGIN` and `EQ_FRONTEND_URL` to
`http://localhost:5173`. Only public configuration belongs in `VITE_*` variables.

Backend local mode writes email to its `.local/outbox/`; it does not deliver email
to a mailbox. Open the verification/reset link from that outbox. Tokens are
captured into memory and removed from the URL before the application mounts.

## Implemented scope

| Feature | Routes / behavior                                                      |
| ------- | ---------------------------------------------------------------------- |
| FE-01   | `/register`; personal registration, shared providers/API/router/config |
| FE-02   | `/verify-email`, `/resend-verification`; explicit one-time action      |
| FE-03   | `/login`; memory-only bearer session, expiry, role guards, logout      |
| FE-04   | `/customer/account`; current customer's read-only profile              |
| FE-05   | `/forgot-password`, `/reset-password`; generic email response, reset   |
| FE-06   | `/customer/horses`; bounded pagination, debounced name search          |
| FE-07   | `/customer/horses/new`; incomplete measurements allowed                |
| FE-08   | `/customer/horses/:id`; identity, care and UTC measurement time        |
| FE-09   | `/customer/horses/:id/edit`; full replacement, conflict comparison     |
| FE-10   | `/customer/requests/new`; partial international single-horse draft     |
| FE-11   | `/customer/requests/:id`; reopen, full replacement, preserve services  |
| FE-12   | Review & Submit step; immutable capture and safe UUID retry            |

`/customer/requests` currently provides new/open-by-ID navigation to resume FE1
drafts. FE2 owns the complete request list/history and submitted-revision views.
The draft ID is displayed after creation and is present in the route URL.

The request wizard follows Journey → Horse → Service preferences → Review.
Service preferences are displayed read-only until FE2 supplies its slot. A new
draft can be saved or submitted without service choices, as permitted by F03.
Quotation/payment, document uploads, operational portals and automatic status
approval are outside FE1. Staff can log in; the role landing explains which
workspace is supplied later. No customer `/me` request is made for staff.

## Shared contract for FE2

See [docs/FE2_HANDOFF.md](docs/FE2_HANDOFF.md). Reuse the existing app, session,
router, HTTP/query clients and typed `OrderDraft`/`ServicePreferences`; do not
create a second auth store or another provider tree. Role gates are UX; backend
ownership/assignment authorization remains authoritative.

## Data and concurrency

- No runtime fixtures or localStorage persistence. JWT, passwords and public
  tokens never enter persistent browser storage or logs.
- New sessions get a query namespace. Logout, expiry and protected 401 cancel
  requests and remove all user data. 403 does not start a refresh loop.
- Response boundaries reject malformed DTOs and unsafe integer IDs.
- Dates require explicit ISO offsets; IANA route timezone is a separate field.
  Blank optional inputs become null; unknown measurements never become zero.
- Horse/order PUT is a full replacement. 409 retains edits and requires explicit
  comparison/reload. Refetch never silently adopts a new write version.
- Create POST has no automatic retry. An ambiguous failure blocks another save
  and directs the user to check server data first.
- Submit keeps one UUID, version and payload during an uncertain retry; it then
  reads current order data. Pending submission freezes editing. Rejected commands
  are distinct from an uncertain result.
- Quantity/money from F05 is not computed by FE1. Existing declared-value decimal
  strings and complete service preferences are preserved in draft updates.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest covers token handling, byte limits, session cleanup, response validation,
nullable measurements, service preservation, 409 retention and identical submit
retry. Playwright tests use API mocks only in tests; these are not proof of real
backend/SQL integration. CI runs these checks on every push and pull request.

## Design and remaining acceptance

Based on the current English Workflow Figma screens A01–A03, C02–C04,
C06–C09/C17 inspected on 14 October 2026. Organization fields, multi-horse orders,
sample prices and upload controls were omitted according to the current scope.
Verify/reset views follow the shared auth layout because separate current frames
were not present in the inspected inventory. Further high-fidelity extraction
was blocked by Figma's Starter MCP call limit. Exact asset/token matching remains
a design-review item; the home illustration is a text treatment, not a copied
Figma image.

The backend was unreachable at `127.0.0.1:8080` during implementation. Real
integration must be verified with a separately configured backend/test database
and migrations appropriate to each backend flow. Do not restore or seed a real
customer database for frontend tests. Missing tariffs/policies legitimately
produce pending estimates; producer/quote/payment F06–F16 remain dependencies.

No DB changes, automatic merge or deployment are included. Existing integration
branch `dev-fe` is used; `main` is retained for reviewed releases.
