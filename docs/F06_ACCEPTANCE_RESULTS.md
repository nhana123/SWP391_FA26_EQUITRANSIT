# Issue 61 — actual validation and outstanding acceptance

Recorded on 17 October 2026 (UTC+7). No production database was modified and no
issue was closed by this work.

## Code and dependencies

- FE base: `36a0cd02bb52012a52ffd2962e6d85b604741560` (dev).
- BE source inspected: `54df4ff0b97062e501e70b2baa7ea4236f3b55e8`.
- Feature branch: `feature/61-versioned-quotation-integration-tests`.
- At inspection, issue 60 was still in open PR70 and absent from dev.
- Issue 55 was closed, but no real shared fixture adapter/setup module or linked
  run evidence was found in the inspected dev tree or its issue timeline.
- Existing BE QuotationIntegrationTest was read for actual catalog guards,
  lifecycle, schedule uniqueness, source/revision checks and race semantics.
  Reading it does not mean that its native SQL tests were executed here.

## Actual checks

| Check                                                | Actual result                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                                           | Passed during implementation; final verification recorded below                                                                                                     |
| ESLint                                               | Passed during implementation; final verification recorded below                                                                                                     |
| Unit guards                                          | Initial 24 guard/reporting tests passed; additional CLI guards included in final full run                                                                           |
| Live suite discovery                                 | 28 cases discovered in 3 files; no business case executed by discovery                                                                                              |
| Live runner without opt-in                           | Exit 1, OPT_IN_REQUIRED; no fixture or business writes                                                                                                              |
| Read-only preflight with explicit test configuration | Exit 1, SHARED_55_FIXTURE_DRIVER_REQUIRED; zero business tests executed                                                                                             |
| SQL connection probe                                 | `sqlcmd` integrated-auth SELECT DB_NAME() against the exact test catalog could not connect; login/instance timeout. No migration or data write was attempted.       |
| Matching Chromium installation                       | Playwright 1.64.1 requested Chromium v1248 / Chrome 156.0.8078.4. Download failed with ENOTFOUND cdn.playwright.dev; browser installation is not claimed as passed. |
| Real BE/browser acceptance                           | Blocked before fixture setup: 0 passed, 0 failed business cases, 0 skipped by Playwright, 28 not executed. This is not an integration pass.                         |

Final verification: the full Vitest run passed **236 tests in 31 files**
(205 existing dev tests plus 31 new acceptance guard/reporting tests). ESLint,
TypeScript and production build passed; the existing large-chunk warning
remains. A focused rerun of the 31 guard tests also passed. Discovery still
finds all 28 live cases. These figures exclude issue 60's 45 tests because PR70
was not in the branch's dev baseline; they do not claim a combined #60/#61 run.

The live runner output is reproducible in `artifacts/f06/preflight.json`.
Ignored local artifacts are not checked into Git. The suite does not send writes
when environment verification fails and does not substitute mock responses.

## Acceptance matrix

| Issue criterion                                            | Implemented verification                                                        | Execution status                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Correct scripts/runtime and honest counts                  | Scripts, preflight, dedicated reporter, no filtered/skip completion             | Static/unit checks performed; live runtime blocked           |
| Isolated DB/migrations and scoped cleanup                  | Exact catalog check, #55 adapter contract, scoped IDs/UUIDs, cleanup assertions | Shared adapter/connection missing; not exercised against SQL |
| Full happy path                                            | F06-01/02 through Manager/Coordinator/Customer UI                               | Not executed                                                 |
| REJECT/EXPIRE/pending/included/precision/privacy           | F06-03–11 plus captured snapshot assertions                                     | Not executed                                                 |
| Role/revision/source/schema errors                         | F06-11/16/17–20/25/27                                                           | Not executed                                                 |
| Real concurrency/idempotency                               | F06-12–16/23/28 via real API and SQL observations                               | Not executed                                                 |
| Supersession/immutability/no financial side effects        | F06-01/02/13/17–22/28                                                           | Not executed                                                 |
| UI/responsive/basic accessibility/stale responses/evidence | F06-01–06/16/23–27 and sanitized event/screenshot capture                       | Not executed                                                 |

## Blockers to resolve before full acceptance

1. Integrate Customer issue 60 into the FE build under test (PR70 at inspection).
2. Supply the trusted shared #55 fixture adapter implementing FixtureDriver;
   no producer setup was duplicated or invented to bypass this dependency.
3. Provide an accessible, explicitly authorized BE/test SQL environment on the
   exact approved catalog, with 001–005 and 006 for catalog cases, seven fixture
   actor credentials and revision-bound producer data.
4. Install the package-matching Chromium runtime where download/network access
   is available; this environment failed DNS resolution for the installer.
5. Provide an independently inspected schema-pending secondary test backend for
   case 27, or retain its explicit skip/blocker and incomplete acceptance.
6. Private instructions at D:/FPT-ki7/SWP/AI and API_openAI.md were unavailable
   here and must be reviewed in the intended project environment.

No live product defect is confirmed by an unexecuted test. On a real failure,
record its case/evidence and link a defect issue; route source/prepare/publish
defects to Dev 2. Full F06 acceptance and issue closure remain pending.
