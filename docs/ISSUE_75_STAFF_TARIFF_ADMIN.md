# Issue 75 — Manager staff and tariff administration

Issue: <https://github.com/nhana123/SWP391_FA26_EQUITRANSIT_FE/issues/75>.

Branch: `feature/75-manager-staff-tariff-administration`.
Base FE: `dev@9943d78adfccd66537b2d1252de265a8204dd6d2`.
Contract source BE: `dev@33d96ec4937d7321cc66fb093af781a336e8d67a`.
Reviewed the supplied FE1_COMMERCIAL_FINANCE_GUIDE.md, Task 02 and DTO appendix.
This branch is independent of #74; it does not copy unmerged service-preference changes.

## Routes

Sign in as an authorized active Manager, then use the sidebar links.

| Route                                    | Purpose                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `/manager/staff-administration`          | Staff list, role/status filters, paging and workload counts.                  |
| `/manager/staff-administration/new`      | Provision User + StaffProfile using the acting Manager version.               |
| `/manager/staff-administration/:staffId` | Staff detail, full profile edit and reasoned status change.                   |
| `/manager/service-prices`                | Existing catalog/history with product-supported units and successor versions. |
| `/manager/staff`                         | Existing Specialist/Coordinator case directory retained for FE2 assignments.  |

All new routes are inside the Manager role gate. Private pages also avoid requests
for other roles. Backend live authorization remains authoritative: JWT role alone
does not prove the staff profile is active. Rejected reads hide private actions/data.

## Staff behavior

- Uses GET/POST /api/manager/staff, GET/PUT /{staffId} and POST /{staffId}/status.
  Staff ID and User ID are displayed separately; the path always uses Staff ID.
- Roles: MANAGER, SPECIALIST, COORDINATOR, DRIVER. No Customer/Admin provisioning,
  public registration, password reset or DELETE is added.
- Create sends command + full profile + initialPassword. Its command version is
  StaffPage.actorRecordVersion. Edit/status use the target StaffView version.
- Full profile replacement retains editable fields; optional blanks become null.
  Phone, field lengths and role values follow StaffProfileInput validation.
- Initial password: 12–72 UTF-16 characters, at most 72 UTF-8 bytes. Input is masked,
  local memory only, retained for identical uncertain retries and cleared on success.
  Response schemas discard credentials; no password enters query caches, storage,
  success notices or logs. Raw credential validation text is not reflected in errors.
- Status ACTIVE/INACTIVE/LOCKED requires a reason (1–500 characters). Reactivation
  does not restore assignments. Last Manager, in-transit driver and incompatible
  role/assignment protection remain server decisions, with source-backed error guidance.
- Successful self-demotion/self-disable clears the Manager session. Shared 401
  handling also clears the session and account query cache.
- List exposes both statuses, employee code, department, specialization and order,
  trip and total assignment counts. Pagination uses actual totalElements/size;
  StaffPage does not contain totalPages. Query keys isolate account/filter/page.
- Versions are pinned while editing. Definite 409 requires explicit reload/review
  and keeps inputs. STAFF_ADMIN_BUSY, network and 5xx retries retain UUID, version
  and exact payload. Background 503 preserves forms and blocks writes until reload.
- Successful commands exit the form before refreshing reads. A failed refresh
  cannot become another create/update/status. Staff and assignment directories refresh.

## Tariff extension

- Reuses /api/manager/service-tariffs. Unit choices come from product.allowedUnits;
  SHIPMENT is available only when offered. Older responses allow only their existing
  product unit; the full unit enum is never offered indiscriminately.
- Replacement initially keeps the reviewed tariff unit. Requests keep exact USD
  text, source and optional offset-date expiry. UUID and unitCode are top-level;
  create omits recordVersion on the wire and PUT sends the reviewed prior version.
- PUT publishes a successor. No history, quotation snapshot or tariff is deleted
  or edited in place. INCLUDED products stay non-chargeable.
- Background reads cannot silently change the reviewed version. Conflict reload
  retrieves the current product and latest tariff ID/version, displays the reviewed
  price and retains proposed price/source/unit for user review.
- 400 fields appear beside controls. 403/404 remove write access. 409 requires
  reload/review; busy/uncertain retries retain the command including unit. 503
  is deployment-blocked and preserves input.

## Deployment and checks

The guide described staff as local/unmerged. Reviewed BE dev now contains its
Controller, DTOs, service and migration 013_staff_provisioning.sql. This proves
source availability, not deployment of migration 013 on the running test DB.
Tariff management depends on migration 006. This branch changes no BE/DB data.

Run from this checkout:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --pool=threads --maxWorkers=2
npm.cmd run build
npm.cmd exec -- playwright test --config playwright.issue75.config.ts
```

The dedicated browser config uses this checkout on port 5185, strictPort and no
server reuse. Two mocked cases use actual login/sidebar navigation: mobile staff
creation with 503/identical retry, and a SHIPMENT tariff successor. Password input
is masked in screenshots; traces/video are off. Screenshots exist only if cases run.
These UI tests do not prove integration with a live BE/database.

### Verification results — 18 October 2026

| Check                         | Result                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/component regression     | Passed: 329 tests in 39 files, including 43 added tests for #75.                                                                                                           |
| Focused Staff/Tariff suite    | Passed: 48 tests in 6 files, including the existing tariff regressions.                                                                                                    |
| ESLint                        | Passed.                                                                                                                                                                    |
| TypeScript / production build | Passed. Existing large-chunk warning: main chunk 642.16 kB / 186.04 kB gzip.                                                                                               |
| Browser discovery             | Two mocked browser cases discovered; both are included in the default E2E suite.                                                                                           |
| Local browser execution       | Attempted; plugin setup and teardown each timed out after 45 seconds before tests executed. No browser pass or new screenshot is claimed.                                  |
| Live BE integration           | Blocked: GET http://127.0.0.1:8080/v3/api-docs failed with Windows socket access denied. Zero live business scenarios executed; migration/auth/DB deployment not verified. |

Lint/typecheck/build/unit results describe this local #75 source. No commit,
push, PR or successful CI result for this branch is claimed.

## Live acceptance still required

Use the team's authorized isolated test environment with matching BE and migrations
006/013. Do not seed/migrate a customer database for these UI tests.

1. List/filter/page; create each role; read by returned Staff ID; edit full profile;
   change ACTIVE/INACTIVE/LOCKED with a reason and inspect assignment counts.
2. Verify duplicate email/code, stale version, last active Manager, incompatible
   work and in-transit driver restrictions. Check self-disable/demotion and 401.
3. Interrupt/retry the same UUID and confirm a single resulting change. Failed
   GET after successful write must only reload. Other roles must receive 403.
4. Publish/replace permitted units including SHIPMENT; reject unsupported units,
   conflicts and expired validity. Old tariffs and issued quote snapshots stay intact.
5. Verify 503 preserves input, and collect redacted screenshots and actual outcomes.

Mock tests or source availability alone do not complete live acceptance.
