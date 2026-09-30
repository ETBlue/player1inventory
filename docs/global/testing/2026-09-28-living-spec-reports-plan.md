# Living Spec Reports (Step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Playwright and Vitest results as public HTML pages at
`spec.player1inventory.etblue.tw` that non-developers can read.

**Architecture:** A helper wraps every `async` page-object method in `test.step`, so the
Playwright HTML report shows readable steps with no spec changes. A build script collects
the three per-project Playwright reports, a feature page built from Vitest's JSON output,
and a landing page into one folder. A publish script runs everything and uploads the folder with
`wrangler pages deploy`.

**Tech Stack:** Playwright 1.58 (`test.step`, HTML reporter), Vitest 4 (`json` reporter),
Node ESM script, bash,
Cloudflare `wrangler`.

**Design:** [2026-09-28-living-spec-reports-design.md](2026-09-28-living-spec-reports-design.md)

---

## File map

| File | Action | Purpose |
|---|---|---|
| `e2e/pages/step.ts` | create | `withSteps(obj)` helper |
| `e2e/pages/*.ts`, `e2e/pages/settings/*.ts` (13 files) | modify | call `withSteps(this)` in each constructor |
| `e2e/playwright.config.ts` | modify | `screenshot: 'on'` only when `SPEC_REPORT=1` |
| `scripts/spec/build.mjs`, `scripts/spec/features.mjs` (+ test) | create | copy reports into `spec-dist/`, write the feature page and the landing page |
| `scripts/spec/publish.sh` | create | run tests, build, deploy, exit non-zero if tests failed |
| `package.json` (root) | modify | `spec:vitest`, `spec:build`, `spec:publish` scripts; `wrangler` dev dependency |
| `.gitignore` | modify | `spec-dist/`, `apps/web/spec-report/` |
| `CLAUDE.md`, `e2e/CLAUDE.md` | modify | new commands, step helper rule |
| design doc, `docs/INDEX.md` | modify | status, one-time Cloudflare setup |

---

### Task 1: Check the Vitest `html` report with a `-t` filter (decision gate) — ✅ done, gate FAILED

> **Result (2026-09-29):** the report lists 1,695 of 2,259 tests as "skipped" by default,
> no Vitest option removes them, it publishes all test source and `config.env` values, and
> it does not work at 390px. The user chose a custom page from Vitest's JSON output
> instead, and widened the filter to any test title starting with `user `. Task 4 below is
> rewritten for that. Details: Round 6 of the brainstorming log.

This task decides whether the design's Vitest choice holds. **Do not build on it until
this task reports.**

**Files:** none committed.

- [ ] **Step 1: Generate the filtered report**

```bash
cd apps/web && pnpm exec vitest run -t "user (can|sees)" --reporter=html --outputFile.html=/tmp/p1i-vitest-spec/index.html
```

- [ ] **Step 2: Measure what the report contains**

Also run the same filter with the JSON reporter and count:

```bash
cd apps/web && pnpm exec vitest run -t "user (can|sees)" --reporter=json --outputFile=/tmp/p1i-vitest-spec.json
node -e "const r=require('/tmp/p1i-vitest-spec.json');const s={};for(const f of r.testResults)for(const a of f.assertionResults)s[a.status]=(s[a.status]||0)+1;console.log(r.numTotalTestSuites,s)"
```

Open `/tmp/p1i-vitest-spec/index.html` with `npx vite preview --outDir /tmp/p1i-vitest-spec`
(the html reporter needs to be served over HTTP, not opened as a file) and take a
screenshot of the main view with Playwright or describe it.

- [ ] **Step 3: Report, then stop**

Report:
- passed / skipped / failed counts from Step 2
- whether skipped (filtered-out) tests are visible in the UI by default, and whether the UI
  can hide them
- whether the report works from a static host (no dev server), and its total size
- screenshots or a plain description of the first screen

**Gate:** if filtered-out tests show as ~1,950 skipped rows by default, the main session
brings this back to the user (custom page vs built-in reporter) before Task 3. Task 2 does
not depend on this and may go ahead.

---

### Task 2: Step helper for page objects

**Files:**
- Create: `e2e/pages/step.ts`
- Modify: every page object — `CookingPage`, `ItemPage`, `OnboardingPage`, `PantryPage`,
  `SettingsPage`, `ShoppingPage`, `StockFormPage`, `StockPagerPage`,
  `settings/RecipeDetailPage`, `settings/RecipesPage`, `settings/TagDetailPage`,
  `settings/TagsPage`, `settings/VendorsPage`

- [ ] **Step 1: Write the helper**

```ts
// e2e/pages/step.ts
import { test } from '@playwright/test'

// `checkRecipe` → `Check recipe`
function toWords(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Show only simple values in the step name. A Locator or Page argument would
// print as a long internal string, so it is left out.
function formatArg(arg: unknown): string | null {
  if (typeof arg === 'string') return `"${arg}"`
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
  return null
}

/**
 * Wrap every async method of a page object in `test.step`, so the HTML report
 * shows `Check recipe "Pasta"` instead of raw locator calls.
 *
 * Only async methods are wrapped. The `get…` methods return a Locator
 * synchronously; wrapping them would make them return a Promise and break
 * every caller.
 *
 * Call once, at the end of the constructor: `withSteps(this)`.
 */
export function withSteps<T extends object>(obj: T): T {
  const proto = Object.getPrototypeOf(obj)
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue
    const fn = Object.getOwnPropertyDescriptor(proto, key)?.value
    if (typeof fn !== 'function' || fn.constructor.name !== 'AsyncFunction') continue
    Object.defineProperty(obj, key, {
      configurable: true,
      writable: true,
      value(...args: unknown[]) {
        const parts = args.map(formatArg).filter((p): p is string => p !== null)
        const title = [toWords(key), ...parts].join(' ')
        return test.step(title, () => fn.apply(obj, args), { box: true })
      },
    })
  }
  return obj
}
```

**Check before trusting the `AsyncFunction` test:** Playwright transpiles TypeScript
itself. Confirm that `async` methods keep `constructor.name === 'AsyncFunction'` after
transpiling (Step 4 shows it: if no steps appear, they do not). If they do not, report it
— do not switch to a name-based rule on your own.

- [ ] **Step 2: Call it in every constructor**

```ts
constructor(page: Page) {
  this.page = page
  withSteps(this)
}
```

For the `constructor(readonly page: Page) {}` form (`StockFormPage`, `StockPagerPage`),
add the call in the body.

Before editing, `grep -rn "new .*Page(" e2e/` and confirm no page object is created
outside a test or hook (for example in a global setup). `test.step` throws outside a test.
Report any such use.

- [ ] **Step 3: Type-check and lint**

```bash
pnpm exec tsc --noEmit -p e2e   # if e2e has no tsconfig, report what type-checks e2e today
(cd apps/web && pnpm check)
```

- [ ] **Step 4: Prove the steps appear**

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/p1i-steps.json pnpm exec playwright test --config=e2e/playwright.config.ts --project=local e2e/tests/cooking.spec.ts --reporter=json
node -e "const r=require('/tmp/p1i-steps.json');const t=[];const walk=s=>{for(const x of s.steps||[]){t.push(x.title);walk(x)}};for(const su of r.suites)for(const sp of (function f(s){return [...(s.specs||[]),...(s.suites||[]).flatMap(f)]})(su))for(const te of sp.tests)for(const re of te.results)walk(re);console.log([...new Set(t)].filter(x=>/^[A-Z][a-z]/.test(x)).slice(0,20))"
```

Expected: titles like `Navigate to`, `Check recipe "…"`. All cooking tests pass.

- [ ] **Step 5: Mutation check**

Remove the `withSteps(this)` call from `CookingPage` only, re-run Step 4: the
`Check recipe` titles must disappear. Restore it and confirm they return. Report both
results.

- [ ] **Step 6: Run the E2E specs that use page objects, `local` project**

```bash
pnpm exec playwright test --config=e2e/playwright.config.ts --project=local
```

Expected: same pass count as `main` (170 passed / 5 skipped, measured 2026-09-24). Report
the numbers. Any new failure is a stop.

- [ ] **Step 7: Commit**

```bash
git add e2e/pages
git commit -m "feat(e2e): show page-object methods as steps in the HTML report"
```

Then `git show --stat HEAD` and confirm all 14 files are in the commit (`lint-staged` can
rewrite staged files; see root `CLAUDE.md`).

---

### Task 3: Screenshots for spec runs

**Files:** Modify `e2e/playwright.config.ts`

- [ ] **Step 1:** In the shared `use` block (or each project's `use` if there is none),
add:

```ts
// Spec reports (`pnpm spec:publish`) attach a screenshot to every test, so a
// non-developer can see the screen. Normal runs keep the default (off), which
// keeps the report small and the run fast.
screenshot: process.env.SPEC_REPORT === '1' ? 'on' : 'off',
```

- [ ] **Step 2:** Run one spec with `SPEC_REPORT=1` and confirm the HTML report shows an
image per test. Run it without and confirm there are none. Report the report size for
both.

- [ ] **Step 3: Commit** — `feat(e2e): attach screenshots when building the spec report`

---

### Task 4: Build and publish scripts

Rewritten on 2026-09-29 after the Task 1 gate failed.

**Files:**
- Create: `scripts/spec/build.mjs`, `scripts/spec/features.mjs`,
  `scripts/spec/features.test.mjs`, `scripts/spec/publish.sh`
- Modify: root `package.json`, `.gitignore`

- [ ] **Step 1: Root scripts and dependency**

```bash
pnpm add -Dw wrangler
```

```json
"spec:vitest": "pnpm --filter web exec vitest run --reporter=default --reporter=json --reporter=html --outputFile.json=spec-report/vitest.json --outputFile.html=spec-report/html/index.html",
"spec:build": "node scripts/spec/build.mjs",
"spec:publish": "bash scripts/spec/publish.sh",
"test:spec": "node --test scripts/spec/"
```

No `-t`. Vitest's `-t` matches the full name including `describe` titles, so it cannot
select "own title starts with `user `". The whole suite runs; the build script filters.

`.gitignore`: add `spec-dist/` and `apps/web/spec-report/`.

- [ ] **Step 2: `scripts/spec/features.mjs` — the feature page**

Export a function `renderFeaturePage(vitestJson)` that returns an HTML string. Keep it
pure (no file access) so it can be tested.

1. From `testResults[].assertionResults[]`, keep a test when its own `title` starts with
   `user ` (case-sensitive, trailing space). Use `title`, not `fullName`.
2. Turn each file's absolute `name` into a path relative to `apps/web/src`. Never print an
   absolute path.
3. Group into sections by feature area from that path:
   - `routes/<x>/…` or `routes/<x>.tsx` → `<x>` in words (`settings/tags` → "Settings ·
     Tags"; `index` → "Pantry")
   - otherwise the first folder (`hooks` → "Hooks", `components/<x>` → "Components ·
     <x>", `db` → "Database", `lib` → "Library")
   - List the final section names in your report, so the user can rename them.
4. Inside a section: `ancestorTitles` joined with " › " as a sub-heading, and each test as
   one line with ✅ (passed) / ❌ (failed) / ⏭ (skipped or todo).
5. At the top: totals (passed / failed / skipped) and a note that the page lists only tests
   named "user …".
6. Escape all test text for HTML.
7. No source code, no env values, no absolute paths. Plain HTML, inline CSS, readable at
   390px, light and dark via `prefers-color-scheme`.

Test it with `node --test` in `scripts/spec/features.test.mjs` and a hand-made JSON
fixture that has: a `user …` test inside a `describe` (must be kept), a non-`user` test
(must be dropped), a title with `<script>` (must be escaped), a failed test (must show ❌),
and a file path under `/Users/…` (must not appear in the output).

Mutation checks: switch `title` to `fullName` and confirm the `describe` case goes red;
remove the escaping and confirm the `<script>` case goes red. Report both.

- [ ] **Step 3: `scripts/spec/build.mjs`**

1. Delete and recreate `spec-dist/`.
2. Copy `playwright-report/local`, `/cloud`, `/pwa` to `spec-dist/local`, `/cloud`,
   `/pwa`. A missing report is not an error: skip it and mark the link "not run" on the
   landing page.
3. Read `apps/web/spec-report/vitest.json` and write `spec-dist/features/index.html` with
   `renderFeaturePage`. Missing JSON → "not run", as above.
4. Write `spec-dist/index.html`: title "Player 1 Inventory — Spec", four links with a
   one-line description each (Local mode, Cloud mode, Offline (PWA), Feature tests), and
   the pass/fail totals for each where they can be read. Add the build date (ISO, UTC) and
   the commit from `git rev-parse --short HEAD`, plus a "dirty" note if
   `git status --porcelain` is not empty. Same look as the feature page.
5. Print the folder size.

Node built-ins only (`node:fs`, `node:child_process`, `node:path`).

- [ ] **Step 4: `scripts/spec/publish.sh`**

```bash
#!/usr/bin/env bash
# Build the living spec site and upload it to Cloudflare Pages.
#
# It publishes even when tests fail: a failing test is something the reader
# should see. It still exits non-zero at the end, so a caller (a future CI job)
# can tell.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export SPEC_REPORT=1
failed=0
pnpm spec:vitest    || failed=1
pnpm test:e2e:all   || failed=1
pnpm spec:build     || exit 1   # nothing to publish
pnpm exec wrangler pages deploy spec-dist --project-name "${SPEC_PAGES_PROJECT:-p1i-spec}" --branch main || exit 1
pnpm exec wrangler pages deploy spec-dist-dev --project-name "${SPEC_DEV_PAGES_PROJECT:-p1i-spec-dev}" --branch main || exit 1
exit $failed
```

The Vitest step and the E2E step run one after the other, never at the same time (root
`CLAUDE.md`: parallel runs starve the machine).

- [ ] **Step 5: Verify the build without deploying**

Run `pnpm spec:vitest`, then one small Playwright spec per project with the
`PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/<project>` layout `run-all.sh` uses, then
`pnpm spec:build`. Serve `spec-dist/` with `python3 -m http.server` and check with
Playwright that all four links open a working page, at desktop width and at 390px. Take
screenshots and look at them. `grep -r "/Users/" spec-dist/features spec-dist/index.html`
must find nothing. Report the counts on the feature page.

Do **not** run `wrangler pages deploy`. It needs the user's Cloudflare login.

- [ ] **Step 6: Commit** — `feat(spec): build and publish script for the living spec site`


---

### Task 4b: Developer Vitest report (added 2026-09-29)

Design part 4b. Can be done together with Task 4 by the same agent.

**Files:** `scripts/spec/build.mjs`, `scripts/spec/secrets.mjs` (+ test), `.gitignore`

- [ ] **Step 1:** `spec:vitest` (Task 4 Step 1) already writes the html report to
  `apps/web/spec-report/html/`. Confirm one run gives both the JSON and the html output.
- [ ] **Step 2: Secret guard** — `scripts/spec/secrets.mjs` exports
  `findSecrets(text) → string[]` (the patterns that matched). Patterns: `sk_live`,
  `sk_test`, `DATABASE_URL`, `postgres://`, `postgresql://`, `BEGIN PRIVATE KEY`.
  `node --test` cases: clean text → `[]`; each pattern → found; a `pk_test_…` Clerk
  publishable key → **not** found. Mutation check: remove one pattern and confirm its
  test goes red.
- [ ] **Step 3: Build** — `build.mjs` deletes and recreates `spec-dist-dev/`. It unzips
  `apps/web/spec-report/html/html.meta.json.gz` with `node:zlib`, runs `findSecrets` on
  the text, and on any match prints the patterns and exits 1 **before** writing either
  folder. Otherwise it copies `apps/web/spec-report/html/` to `spec-dist-dev/`. A missing
  html report is not an error: skip `spec-dist-dev/` and print a warning; `publish.sh`
  then skips the second deploy.
- [ ] **Step 4: Verify** — serve `spec-dist-dev/` with `python3 -m http.server`, open it
  with Playwright, confirm the dashboard shows the whole suite (about 2,259 tests, 0
  skipped). Prove the guard end to end: put a fake `sk_test_x` into a copy of the meta file,
  run the build against it, confirm exit 1 and that nothing was written.
- [ ] **Step 5:** `.gitignore` adds `spec-dist-dev/`.
- [ ] **Step 6: Commit** — `feat(spec): publish the full Vitest UI report for developers`

---

### Task 5: Documentation

**Files:** root `CLAUDE.md`, `e2e/CLAUDE.md`, design doc, `docs/INDEX.md`

- [ ] Root `CLAUDE.md` Commands block: add `pnpm spec:build` and `pnpm spec:publish`
  with one-line comments.
- [ ] `e2e/CLAUDE.md`: a short section "Page-object steps" — new page objects must call
  `withSteps(this)`; `get…` methods stay synchronous; method names become step names, so
  name them as actions.
- [ ] Design doc: status, any change from the plan, and **one-time setup** for the user:
  `pnpm exec wrangler login`; create Pages projects `p1i-spec` and `p1i-spec-dev` (direct
  upload); add custom domains `spec.player1inventory.etblue.tw` and
  `dev-spec.player1inventory.etblue.tw`.
- [ ] `docs/INDEX.md`: row status.
- [ ] Commit — `docs(testing): living spec reports usage and setup`

---

### Task 6: Final gate (main session)

- [ ] The full Verification Gate from root `CLAUDE.md`, including `pnpm test:e2e:all`.
- [ ] The user runs the one-time setup, then `pnpm spec:publish`, and checks the site.
