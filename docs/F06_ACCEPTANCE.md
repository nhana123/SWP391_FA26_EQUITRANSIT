# F06 acceptance suite — issue 61

Branch: `feature/61-versioned-quotation-integration-tests`.
FE base: `dev` at `36a0cd02bb52012a52ffd2962e6d85b604741560`.
BE contract inspected: `dev` at `54df4ff0b97062e501e70b2baa7ea4236f3b55e8`.

This branch adds acceptance infrastructure and tests, not another implementation
of source/preparation/publication. It intentionally starts from dev, which at
inspection time did not yet contain Customer PR70 (issue 60). Test a build with
all dependencies 56–60 integrated; an older Customer page cannot pass the suite.

## Two independent kinds of tests

- `npm test` runs existing component/API unit tests plus the new environment and
  reporting guards. These are unit/mock tests, not real BE integration evidence.
- `npm run test:acceptance` runs 28 Playwright cases against a real isolated BE.
  The suite does not fulfill fabricated API responses. Controlled response-loss
  and late-read tests forward an actual server response and delay/drop delivery.
  Their writes, conflicts, UUID receipts and SQL counts still come from the BE.

The existing mock browser suite keeps its current `npm run test:e2e` command.
Acceptance tests live outside its testDir. `test:acceptance:list` discovers test
cases without starting a server or provisioning data; discovery is not a pass.

## Preflight and run

Use Node compatible with the repository (>=22.12); the scripts use Node's native
TypeScript stripping and env-file support. No dependencies were added.

1. Install locked dependencies: `npm.cmd ci`.
2. Install the matching browser: `npx.cmd playwright install chromium` (Linux CI:
   `npx playwright install --with-deps chromium`). Do not substitute another
   Playwright version or treat discovery as proof that Chromium is installed.
3. Copy `.env.acceptance.example` to `.env.acceptance.local` with PowerShell
   `Copy-Item .env.acceptance.example .env.acceptance.local` or CMD
   `copy .env.acceptance.example .env.acceptance.local`.
4. Configure the authorized test BE, trusted shared fixture adapter and test
   credentials in that ignored local file. Do not put tokens/passwords in Git,
   issue comments, CLI arguments, screenshots or reports.
5. Run `npm.cmd run test:acceptance:preflight`. It performs read-only inspection
   and live `/v3/api-docs` comparison. It does not provision or clean fixtures.
6. Run `npm.cmd run test:acceptance`. The launcher passes the same environment to
   preflight and Playwright. By default it starts Vite with VITE_API_BASE_URL set
   to the verified test BE. Set EQ_ACCEPTANCE_FE_ORIGIN for an existing test FE.

Useful commands:

```text
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --pool=threads --maxWorkers=2
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:acceptance:list
npm.cmd run test:acceptance:preflight
npm.cmd run test:acceptance
npm.cmd run test:acceptance -- --headed --grep F06-01
```

Only `--headed`, `--grep` and `--grep-invert` are accepted by the live launcher.
Filtered runs cannot mark full acceptance complete. Trace/reporter/config
overrides are rejected because they can capture passwords or run mock projects
under the live command. Direct Playwright invocation still has the environment
guard in globalSetup; use the launcher for reproducible evidence settings.

## Shared fixture adapter contract (#55)

The inspection includes `frontendOrigin`, which must match
EQ_ACCEPTANCE_FE_ORIGIN (or the local default http://127.0.0.1:5173), as well as
the verified BE origin. Credential-bearing URLs are rejected. A schema-pending
secondary backend must have a distinct verified origin and a supplied fixture
orderId; no order ID is guessed and the primary schema is never downgraded.

Issue 55 is closed, but its real integration fixture/setup adapter was not found
in the inspected FE dev tree or issue timeline. This branch defines an extension
contract for that tooling rather than duplicating producer seeding. A provider
for the actual authorized environment remains required. There is no synthetic
provider, auto-migration, fallback seed, hidden health/debug endpoint or guessed
price/evidence in the suite.

EQ_ACCEPTANCE_FIXTURE_DRIVER must point to an absolute, trusted `.mjs` module
exporting a default object implementing `FixtureDriver` in
`tests/acceptance/environment.ts`. It must have no import-time side effects and
must never log credentials, supplier costs or private evidence. Integrate these
methods with the existing #55 setup/cleanup functions:

| Method                                                | Required behavior                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect()`                                           | Read the actual datasource catalog/migrations, BE origin, deployed FE feature availability and credential environment-prefix mapping. It must perform no writes and must not return a hard-coded assertion that the database is safe. |
| `createScenario({runId,name})`                        | Create one disposable, independently owned scenario using shared setup and real producer fixtures. Return the typed Scenario and IDs/provenance for that exact run.                                                                   |
| `observe({runId,scenarioId,orderId})`                 | Read actual SQL counts scoped to the owned fixture order: schedule rows, accepted quotes, money receipts, reservations and departure authorizations. Return Observation. Never invent zero counts when a table/query is unavailable.  |
| `cleanupScenario({runId,scenarioId,orderId,created})` | Recheck the actual catalog and ownership, then remove only that scenario's fixture rows and captured IDs/UUIDs. Keep SQL constraints enabled; do not perform broad deletes or reset shared data. Verify zero fixture residue.         |
| `finishRun({runId})`                                  | Recover only partial fixtures belonging to this run (including setup failures), then verify zero remaining run fixtures. A failed cleanup fails the run.                                                                              |

Import the exported TypeScript types into the adapter project while developing
it. The runtime module returns plain objects; credentials themselves are read
only from environment variables. `inspect().accounts` maps manager, coordinator,
customer, foreignCustomer, unassignedCoordinator, specialist and driver to
prefixes such as EQ_TEST_MANAGER. The harness reads `<prefix>_EMAIL` and
`<prefix>_PASSWORD`, logs in through the real login API and checks the returned
role. Tokens are held in isolated request/browser contexts and disposed.

The adapter must verify the exact catalog
`EquiTransit_FigmaMigrationTest_20261013_143729` before every fixture/cleanup
write. The harness independently rejects other catalog names, BE origins,
missing migrations 001–005, old Customer builds, absent credentials, cross-run
IDs and malformed observations before business writes. Migration 006 is needed
for catalog replacement cases 21/22. Deploy migrations separately through the
reviewed backend workflow, never through frontend test startup.

Scenario contains a newly owned approved order with assigned staff and real
revision-bound distance/clinical/quarantine/fit/source data. It also supplies:

- `prepare`: valid QuotePrepareInput, schedule, captured terms and assessments.
- `offer`: valid SupplierOfferInput matching a priced assessment; purchase and
  retail prices must differ. UI cases replace the assessment's source with the
  offer they actually record. No supplier reservation is created.
- `expectedTotal` and `expectedIncludedCodes`: sourced expectations, with at
  least one included charge for 01/02. Expected amounts are exact decimal text;
  only integer cents are used for assertions, never authoritative FE pricing.
- `revisionDraft`, `services` and `horseRecordVersion`: full valid F03/F05 input
  producing an actual change, not a no-op. They must preserve fixture ownership.
- Optional scoped `tariff` with existing family ID and valid replacement input;
  optional `existingQuoteId` for the unsupported-snapshot profile.

All profiles return catalog/runId/scenarioId/orderId/revisionId/orderNumber and
documented provenance. Preserve the run ledger before starting setup so a
partial setup can be cleaned. Use parameterized SQL, parent-bound IDs and a run
marker checked against actual fixture rows. Do not trust IDs merely because
they appeared in a JSON file. Do not run against EquiTransit production.

### Profiles and acceptance coverage

The `name` argument is the stable case ID, not a free-text test title.

| Cases | Shared fixture profile and assertion                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01–02 | Fully priced current approved order; actual UI offer → DRAFT → APPROVE → ISSUE → owning Customer ACCEPT, including units/totals/schedule/version and SQL side-effect counters.                                                                                      |
| 03–05 | Valid order; Manager rejects DRAFT/APPROVED and Customer rejects ISSUED through the UI.                                                                                                                                                                             |
| 06    | Priced order with a real future validity window <=45 seconds. No clock mocking or backdating server data; wait boundedly for expiry, reject ACCEPT and explicitly EXPIRE.                                                                                           |
| 07–10 | Remove only the named producer source/evidence/rate/quantity, or provide an actually expired source, in isolated fixtures. Preparation stays pending/null and approval/issue are blocked.                                                                           |
| 11    | All seven test actors; live role/ownership/assignment denials and invalid-JWT 401; raw Customer DTO excludes internal fields.                                                                                                                                       |
| 12–16 | UUID replay/changed-body 409, competing prepare, concurrent identical/separate acceptance and accept-versus-revision; real SQL counts and stale Manager confirmation UI.                                                                                            |
| 17–20 | Replacement/F03 revision/F05 service confirmation supersede unaccepted versions; accepted commitments reject direct rewrite/new preparation.                                                                                                                        |
| 21–22 | Fixture-owned tariff family using migration 006. Replace a sourced tariff through its actual API and verify issued/accepted snapshot immutability.                                                                                                                  |
| 23    | Real successful ACCEPT with its browser response deliberately dropped, then identical UUID/version/body retry.                                                                                                                                                      |
| 24    | Priced terms containing an inert HTML-looking test marker; mobile/keyboard review and real supersession/404 hide cached data.                                                                                                                                       |
| 25    | A fixture-owned unsupported stored quotation snapshot created by authorized test tooling; actual API 409 and visible error, no details.                                                                                                                             |
| 26    | Real quote GET delayed across UI logout; the old Customer snapshot must disappear.                                                                                                                                                                                  |
| 27    | Optional independently inspected secondary test BE with migration 005 absent, a fixture order ID and the same test-account mapping. Forward to the actual server to verify API/UI 503 and no automatic retry. Never remove migration 005 to manufacture this state. |
| 28    | Separate ACCEPT UUIDs race against the same parent version; one winner and one conflict, no duplicate schedule.                                                                                                                                                     |

If profile 27's secondary backend is absent, that case is explicitly skipped
with a blocker. The full-acceptance flag remains false. Other missing profiles
fail setup; they are not silently converted into skipped or passing cases.

## Evidence and defect handoff

`artifacts/f06/preflight.json` records readiness and zero business execution on
a blocked run. `artifacts/f06/acceptance-results.json` records actual counts,
durations and completeness after a real browser run. Only all 28 distinct cases
passing, with cleanup and runner success, can set acceptanceComplete=true.
Existing `--list` output is discovery evidence only.

Raw traces, video, HAR, arbitrary stdout and raw Playwright errors are deliberately
not exported from live runs: they can contain bearer tokens, login bodies and
supplier data. The suite attaches a sanitized event trace (method/path/status
only) and explicitly captures fixture Customer summary screenshots. Review even
these artifacts before sharing. Keep artifacts ignored by Git; do not upload an
entire browser profile or credential env file.

For any real defect, record case ID, FE/BE commits, expected/actual behavior,
sanitized evidence path, cleanup status and a linked issue. SOURCE/PREPARE/
PUBLISH defects belong to Dev 2; do not reimplement them in this suite. Keep
blocked prerequisites separate from confirmed product defects. See
`F06_ACCEPTANCE_RESULTS.md` for the current actual execution status.
