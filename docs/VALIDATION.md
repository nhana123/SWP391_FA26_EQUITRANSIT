# Implementation validation

Updated: 15 October 2026. Backend dev baseline:
`de7b083a21c18bb0be2ea41e7c93a720c5c1670f`.

| Check                            | Actual result                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ESLint                           | Passed                                                                                                                       |
| TypeScript strict                | Passed                                                                                                                       |
| Vitest                           | 21 tests passed in 6 files                                                                                                   |
| Playwright                       | 3 browser tests passed                                                                                                       |
| Production Vite build            | Passed; app chunk approximately 482 kB / 146 kB gzip                                                                         |
| Visual inspection                | Registration desktop/mobile, horse form and journey form inspected; no horizontal overflow or browser page errors in capture |
| Real API / SQL integration       | Not run: backend unavailable at 127.0.0.1:8080                                                                               |
| Exact Figma asset/token matching | Pending: further extraction blocked by Figma Starter call limit                                                              |
| GitHub push / PR                 | Blocked: connected integration returned 403 when creating a feature branch                                                   |

Tests contain isolated API mocks. Application runtime contains no mock response
fallbacks. GitHub write failure is a connection permission limitation, not a code
build failure. This is an implementation for review, not a claim that the issues
have been reviewed/merged or real integration acceptance is complete.

Auth regression coverage now checks international email reaching API validation,
invalid optional phone retaining the form without dispatch, valid phone/null
address payloads, and the same behavior in a real browser. Existing horse/draft
tests remain passing. The six files touched by this update were compared with the
user's D:/Code/SWP FE checkout and matched the previously delivered baseline.
The local BE checkout HEAD also matched the remote dev SHA above.

## Import the source package into the existing FE repository

Clone/fetch the existing repository, create a feature branch from `dev-fe`, and
extract the archive contents into that checkout. The archive contains source and
lockfile, not `.git`, node_modules, build output or credentials. Review the diff
before committing, then open a PR into `dev-fe`. Never force-push or replace the
existing Git history. Keep each subsequent issue/feature change independently
reviewable; this initial package provides all FE1 dependencies together.

Run the README commands after extraction. Configure and start the backend before
real integration. Acceptance still requires registration/verification/login,
horse create/edit/conflict and draft submit tests against valid isolated test
data, plus peer review. Existing active staff roles and source policies must be
provided by the backend team; frontend code does not seed or fabricate them.
