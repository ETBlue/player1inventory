# Design — start only the servers the selected E2E project needs (issue #302)

**Date:** 2026-09-24
**Issue:** #302
**Status:** ✅ Implemented

## Problem

`pnpm test:e2e` starts **four** servers and keeps them all alive for the whole
run: the local web app (`5175`), the cloud web app (`5174`), the PWA preview
(`5176`), and the API server (`4001`). The PWA entry also runs a full
production build (`pnpm --filter web build`) before it can listen.

On this machine that starves the run. Measured 2026-09-23 at `main` `b22b53ec`,
same commit, same machine:

| How it was run | Failed | Real bugs among them |
|---|---|---|
| `pnpm test:e2e` (all three projects at once) | 36 | 8 |
| `--project=local` alone | 4 | 4 |
| `--project=cloud` alone | 4 | 4 |
| `--project=pwa` alone | 0 | 0 |

PR #314 changed the verification gate in root `CLAUDE.md` to run the three
projects as three separate commands. That works, but it treats the symptom.

## What was not known before, and now is

**Playwright starts every `webServer` entry regardless of `--project`.** There
is no per-project `webServer`. So a filtered run pays the same cost as the
combined one.

Measured 2026-09-24 on this branch's base (`c36e18a2`). One spec file, one
project:

```bash
pnpm test:e2e --project=local e2e/tests/onboarding.spec.ts
```

Listening ports while those **three local-mode tests** ran:

```
node [::1]:5174   cloud web app
node [::1]:5175   local web app
node [::1]:5176   pwa preview
node *:4001       API server
```

Three tests that never leave IndexedDB started the cloud web app, the API
server, and a full production build.

This explains the cost recorded in `CLAUDE.md`: three separate invocations take
about 14 minutes against about 11 for the combined run. Each invocation repeats
the same four-server startup, including the production build, three times.

## Decision

Build the `webServer` array from the projects the CLI actually selected.

| Project | Servers it needs |
|---|---|
| `local` | local web app (`5175`) |
| `cloud` | cloud web app (`5174`) + API server (`4001`) |
| `pwa` | PWA preview (`5176`, includes the build) |

| Command | Servers today | Servers after |
|---|---|---|
| `--project=local` | 4, one with a build | **1** |
| `--project=cloud` | 4, one with a build | **2** |
| `--project=pwa` | 4, one with a build | **1**, with the build |
| no `--project` | 4 | 4 — unchanged |

Separate runs should then be both lighter **and** faster than the combined run,
instead of slower.

### Why this is safe

Every spec that talks to the API server is either cloud-only or guarded on
`baseURL === CLOUD_WEB_URL`. Checked across all 15 spec files that reference
`CLOUD_SERVER_URL`, `CLOUD_GRAPHQL_URL`, `makeGql`, `cleanupCloudData`,
`seedCloudFixture` or `ensureCloudDefaultLocation`:

- 13 carry at least one `baseURL === CLOUD_WEB_URL` guard.
- The 2 without a guard — `location-scoped-writes.spec.ts` and
  `settings/import-export-cloud.spec.ts` — are cloud-only. Both sit in the
  `local` project's `testIgnore`, and neither runs in `pwa`, whose `testMatch`
  lists only `pwa-offline.spec.ts` and `a11y.spec.ts`.

`a11y.spec.ts` runs in `local` and `pwa` and does call `/e2e/cleanup`, but only
inside a `baseURL === CLOUD_WEB_URL` branch, which is never true in either
project.

### Fallback rule

When the selection cannot be read with confidence, **start everything**. That
is the current behaviour, so the failure mode of a parsing mistake is a slow
run, never a missing server.

Start everything when:

- no `--project` is passed;
- `--ui` or `--debug` is passed — the user picks projects inside the UI, after
  the config has been read;
- a `--project` value is not one of `local`, `cloud`, `pwa` (globs included).

## Second part: one command for the gate

Root `CLAUDE.md` now asks for three commands. A gate that is three commands is
a gate people run one of. Add one script that runs all three in order, and
**keeps going after a failure** so a single run reports all three results.

Two details that a naive `a && b && c` gets wrong:

1. `&&` stops at the first failure, so the other projects never run.
2. The HTML reporter writes to one directory, so run 3 overwrites runs 1 and 2,
   and it opens a browser on failure, which blocks a non-interactive run.

## Alternatives rejected

**Shut the servers down between projects inside one Playwright run.** Playwright
offers no hook for it. It would mean a custom global setup that manages the
processes itself, replacing a supported feature with hand-written process
control.

**Set `reuseExistingServer: true` everywhere.** It makes runs faster by leaving
servers up between runs, but a stale PWA preview then serves an old build and
the test suite reports on code that is no longer there. Wrong trade for a gate.

**Leave it, and keep the three documented commands.** They work. But they cost
three production builds per gate run, and the cost is what makes people skip
the gate.

## What was built

Implemented on branch `fix/e2e-per-project-servers`, 2026-09-24.

| Change | File |
|---|---|
| `webServer` is built from the projects named on the command line | `e2e/playwright.config.ts` |
| One command runs all three projects and reports all three results | `e2e/run-all.sh`, wired as `pnpm test:e2e:all` |
| The two `offline banner a11y` tests now run in the `pwa` project only | `e2e/tests/a11y.spec.ts` |

### The script is `pnpm test:e2e:all`

It sits beside `test:e2e`, `test:e2e:ui` and `test:e2e:debug`, and "all" says
what it does: all three projects, not a subset. `pnpm test:e2e` is unchanged, so
every narrowed run still works exactly as before — `pnpm test:e2e shopping a11y`,
`pnpm test:e2e --project=cloud`.

The script runs the three projects as three separate Playwright invocations. It
collects each exit code instead of chaining with `&&`, prints a summary table
with result, elapsed time and test counts, and exits non-zero if any project
failed. Each project gets its own HTML report directory via
`PLAYWRIGHT_HTML_OUTPUT_DIR`, and `PLAYWRIGHT_HTML_OPEN=never` stops the
reporter opening a browser on failure.

### One spec crossed projects, and the design missed it

`a11y.spec.ts` runs in **both** `local` and `pwa`. Its `offline banner a11y`
block sets `test.use({ baseURL: PWA_WEB_URL })`, so under `local` its two tests
also talked to port `5176`. With the PWA preview no longer started for
`--project=local`, both failed with
`net::ERR_CONNECTION_REFUSED at http://localhost:5176/`.

They ran against the same server with the same code in both projects, so the
`local` copies were exact duplicates. A describe-level `test.skip` now skips them
outside `pwa`. **The skip has to be at describe level.** The file's top-level
`beforeEach` also calls `page.goto('/')`, so a body-level `test.skip(...)` runs
after that hook has already hit `5176`. Measured: body-level skip → **2 failed**;
describe-level skip → **2 skipped**.

This is the only spec in the repo that points at another project's server.
Checked by grepping `e2e/` for `LOCAL_WEB_URL`, `PWA_WEB_URL` and hardcoded
ports: `PWA_WEB_URL` appears in `a11y.spec.ts` and nowhere else outside
`e2e/constants.ts`.

### Measurements

Servers listening during a run, sampled every 2s with
`lsof -nP -iTCP -sTCP:LISTEN`:

| Command | Ports seen |
|---|---|
| `--project=local` | `5175` |
| `--project=cloud` | `5174`, `4001` |
| `--project=pwa` | `5176` |
| `--project local --project pwa` | `5175`, `5176` |
| no `--project` | `5174`, `5175`, `5176`, `4001` |
| `--project=loc*` (glob — fallback) | `5174`, `5175`, `5176`, `4001` |

Startup cost removed. Same commit, same tests per row; the "before" column
forces four servers by passing a glob instead of an exact project name:

| Command | Before (4 servers) | After |
|---|---|---|
| `--project=local e2e/tests/onboarding.spec.ts` | 19s, 20s, 19s | **6s, 7s, 7s** |
| `--project=cloud e2e/tests/item-logs.spec.ts` | 41s | **32s** |
| `--project=pwa e2e/tests/pwa-offline.spec.ts` | 16s | **11s** |

The whole gate, `pnpm test:e2e:all`: **12m39s**, all three green.

| Project | Result | Time | Tests |
|---|---|---|---|
| local | PASS | 3m18s | 170 passed, 5 skipped |
| cloud | PASS | 7m58s | 76 passed, 6 skipped |
| pwa | PASS | 1m23s | 69 passed |

Local passes 170 where it passed 172 before, because the two `offline banner
a11y` duplicates moved to `pwa`-only. `pwa` still runs them, so no behaviour
lost coverage.

### What this did not deliver

The saving is **seconds of startup per invocation**, not the minutes the
14-vs-11 figures in `CLAUDE.md` suggested. Those two numbers came from full runs
on 2026-09-23 under unknown machine load, so they were never a controlled
comparison. The controlled A/B above is the honest number: about 13s for
`local`, 9s for `cloud`, 5s for `pwa`.

The real gain is elsewhere: a filtered run no longer competes with four server
processes it does not use, and the gate no longer runs three production builds
where one is needed.
