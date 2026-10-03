# Brainstorming: Living Spec Reports

Date: 2026-09-25 to 2026-09-28

## Goal

Turn the Vitest and Playwright test results into "live spec docs": HTML pages that
non-developers can open and read, deployed on the web.

## Facts found in the repo at the start

| Fact | Detail |
|---|---|
| Playwright reporter | `reporter: 'html'` in `e2e/playwright.config.ts` |
| Playwright reports | `e2e/run-all.sh` writes one HTML report per project: `playwright-report/local`, `/cloud`, `/pwa` |
| Vitest reporter | default (terminal only) |
| CI | none. There is no `.github/workflows`. All test runs happen on a developer machine |
| Test naming | 451 of 2,406 Vitest tests start with `user can`. E2E titles use `user can …` and `user sees …` |
| Given / When / Then | written as code comments. No reporter can see them |
| `test.step` | used in no E2E spec |
| Page objects | 9 classes in `e2e/pages/`, about 1,000 lines. Methods are plain `async` functions |
| Deploy | the design guide deploys through Cloudflare Pages' own Git connection. There is no `wrangler` in the repo |

## Round 1: Is this possible, and which way?

Three options were listed.

| Option | Decision | Why |
|---|---|---|
| 1. Publish the built-in HTML reports as they are | Kept as the **first step** (see Round 3) | Almost no work. Its weakness is that it is made for developers |
| 2. Allure Report (`allure-vitest` + `allure-playwright`) | **Deferred** to step 2 | Nice dashboard, history, groups by feature, one report for both suites. But it is one more tool to learn and maintain. Allure 2 needs Java to build the report; Allure 3 is Node-based, but its maturity was not checked |
| 3. Custom JSON → HTML spec page | **Deferred** | Most control over what a non-developer sees. But we would build and maintain the generator ourselves |

Points raised for any option:

- The Given / When / Then comments are invisible to reporters. To show them, either wrap
  them in `test.step('Given …')` (shows in reports) or parse source comments (breaks
  easily).
- "Live" needs automation. Without CI the page is only as fresh as the last manual run.
  E2E in CI is hard: it needs Clerk keys, the Neon test branch, and about 14 minutes.
- Public pages show the feature list to everyone. Cloudflare Access could limit it.
- Screenshots per behavior help non-developers a lot.

## Round 2: What does the industry do?

The common name is **living documentation**, from BDD and the book *Specification by
Example* (Gojko Adzic, 2011). The spec and the tests are the same thing.

The standard method is **Gherkin + Cucumber**: plain-language `.feature` files, step
definitions that connect each sentence to code, and a reporter that shows each sentence
green or red. In our stack the matching tool is **playwright-bdd**. Other tools: Reqnroll
(.NET), Behave (Python), Gauge (Markdown specs), Concordion (HTML specs), and Allure or
Serenity BDD for reports.

What the industry has learned:

- Teams use Gherkin for high-level behavior, almost never for unit tests.
- The step-definition layer costs real work. Steps get duplicated and drift. Many teams
  adopted Cucumber and later left it for this reason.
- It pays off only if non-developers **write or review** the specs. If they only read
  results, a readable report gives the same benefit for less effort.

## Round 3: The user's answers and proposals

**Q: Will non-developers read the spec, or also write it?**
A: **Read only.**

Result: **Gherkin / Cucumber / playwright-bdd is abandoned.** Its main benefit is that
non-developers can write specs, and we do not need that. Its main cost, the step layer,
would remain.

**Proposal: keep "user can …" names in Vitest, add `test.step` only to Playwright E2E.**
Decision: **accepted.**

- E2E is where steps help a reader most. These tests follow a user through real screens.
- Vitest feature tests read fine as one sentence each.
- Two ways to cut cost were added:
  - Turn page-object methods into steps with one helper, instead of editing all 25 spec
    files. Add Given / When / Then steps only where grouping helps.
  - Report only feature tests from Vitest with `vitest run -t "user (can|sees)"`. This
    keeps about 1,950 unit tests ("returns 0 when…") out of the report.
- Try Playwright's own HTML report before adding Allure. It already shows steps and
  screenshots. Two things may later push us to Allure: it lists a test once per project
  (`local`, `cloud`, `pwa`), and it cannot show Vitest results.

**Proposal: replace "user" in Vitest names with a role, for example "location owner
can …", to fit the coming RBAC feature.**
Decision: **rejected as a broad rename. Role names only in RBAC tests, when RBAC is built.**

Reasons:

1. Local mode has no roles. Most Vitest feature tests run against Dexie, which is
   single-user. "Location owner can create an item" would describe a check that does not
   exist there.
2. RBAC is not built yet (see
   `docs/global/permissions/2026-08-29-design-location-rbac.md`). A role in a test name is
   a claim. It is only true if the test sets up that role **and** fails when the role
   check is removed (the mutation-check rule in the root `CLAUDE.md`). Renaming now gives
   names that no test backs.
3. Churn. Renaming 451+ tests changes no behavior and causes conflicts on every open
   branch.

Rule adopted:

| Test kind | Name |
|---|---|
| Behavior that does not depend on role (local mode, most UI) | keep `user can …` |
| RBAC tests, when RBAC is built | `location member can edit stock`, `location viewer cannot edit stock` |

Also: include the negative (`cannot`) cases, because "what can a viewer do" is the most
useful question for a reader. To group by role in a report, use
`describe('as location viewer', …)`. Every reporter shows describe blocks as headings, so
no tags or labels are needed.

## Round 4: The four-step plan

Accepted by the user.

1. Add a step helper to page objects. Publish Playwright's HTML report plus a filtered
   Vitest report to Cloudflare Pages. Check whether non-developers can read it.
2. If the duplicated projects or the two separate reports are a problem, switch to Allure.
3. Add Given / When / Then `test.step` blocks to E2E specs where page-object steps alone
   are not clear.
4. Add role names only in new RBAC tests, when RBAC is built.

Why this order: step 1 is the cheapest, and after it we can judge whether steps 2 and 3
are worth their cost before spending most of the effort.

## Round 5: Details of step 1

| Question | Options | Decision | Why |
|---|---|---|---|
| Who can open the pages? | Public; private with Cloudflare Access | **Public** | Simplest. The report shows feature names, test names and screenshots of seeded test data, but no secrets |
| How is a report published? | Local script; GitHub Actions; local now, CI later | **Local now, CI later** | No CI exists today, and cloud E2E in CI needs secrets and ~14 minutes. A later CI job will call the same script |
| Which Playwright projects? | All three, one page each; local only; all three merged with `merge-reports` | **All three, one page each** | Nothing is lost, and no test appears twice inside one report. "Local only" hides cloud and offline behavior. "Merged" shows most tests two or three times |
| How is Vitest shown? | Small custom page from JSON; Vitest's built-in `html` reporter | **Built-in `html` reporter** | User's choice: no script to write. Risk noted: it is the Vitest developer UI, and tests filtered out by `-t` may show as "skipped". The plan's first task checks this. If they show as ~1,950 skipped rows, we return to this choice |
| Where do the pages live? | New Pages project on its own subdomain; inside the design guide | **New Pages project**, `spec.player1inventory.etblue.tw` | The design guide builds from Git in Cloudflare and cannot run our tests there, so reports do not fit in its build |
| How do page-object methods become steps? | A. auto-wrap all `async` methods; B. `@step` decorator per method; C. manual `test.step` in each method | **A. Auto-wrap** | 9 one-line edits instead of editing every method. Names come from the method name and arguments, e.g. `Check recipe "Pasta"`. Sync methods such as `getRecipeCheckbox` return a `Locator` and are left alone. A small name override can be added later for names that read badly |

## Round 6: The Vitest `html` reporter failed its check (2026-09-29)

Task 1 of the plan checked the built-in Vitest report with `-t "user (can|sees)"`. It did
not pass:

| Finding | Detail |
|---|---|
| Filtered-out tests are visible by default | 1,695 of 2,259 rows are grey "skipped"; the dashboard shows "1695 Skip / 2259 Total" |
| No setting removes them | `HTMLReporter` in `@vitest/ui` 4.0.18 reads only `outputFile` and writes every file. The UI filter is not a URL parameter; it is saved in `localStorage` (`vitest-ui_task-tree-filter`) |
| It publishes private details | the full source of all 249 test files, absolute local paths (`/Users/etblue/...`), and `config.env` values (`VITE_CLERK_PUBLISHABLE_KEY`, localhost GraphQL URLs) |
| Not usable on a phone | at 390px the test tree is cut to a few characters |

Also found:

- **564** tests match `user (can|sees)`, not ~451 as first counted. The suite has 2,259
  tests in 249 files.
- **263** more titles start with "user" but do not match, for example "user who signs out
  leaves no cached cloud data on the device" and "user still sees the app when restoring
  fails".

Options considered:

| Option | Decision | Why |
|---|---|---|
| Built-in report, viewer ticks **Fail + Pass + Only Tests** | **Rejected** | Every viewer must do it by hand. The dashboard still counts 1,695 skipped. Source and env still published |
| Built-in report + a `<script>` that presets the `localStorage` filter | **Rejected** | Depends on an undocumented storage key. Dashboard still wrong. Source and env still published |
| Built-in report + a script that prunes `html.meta.json.gz` (decode with `flatted`, drop skipped tests and sources, gzip again) | **Rejected** | Tested and working: 83 files, 564 tests, correct dashboard. But it depends on the internal data format of `@vitest/ui`, so a Vitest upgrade can break it silently. Still not usable on a phone |
| Leave Vitest out of step 1 | **Rejected** | Loses the feature tests from the spec for no strong reason |
| **Custom page from Vitest's JSON output** | **Adopted** | The JSON format is stable and documented. We control what is shown: no source, no env, readable on a phone. About the same amount of code as the prune script |

**Which tests count as feature tests?**

| Option | Decision |
|---|---|
| Only `user can` / `user sees` (564) | Rejected — the other 263 are feature behavior too, and renaming them is churn |
| **Any test whose own title starts with `user `** | **Adopted** |

> **Correction (2026-09-29, after the build):** the real count of tests whose own title
> starts with `user ` is **802**, not 564 + 263. Those two numbers were counted with `-t`,
> which matches the full name including `describe` titles.

How the filter is applied: **not** with `-t`. Vitest's `-t` matches the full name,
including `describe` titles, so `-t "^user "` would miss every test inside a `describe`
block. Instead the whole `apps/web` suite runs with the JSON reporter, and the build script
keeps each test whose own `title` starts with `user `. The run then skips nothing.

## Round 7: Keep the Vitest UI report for developers (2026-09-29)

**Request:** keep the original Vitest UI report as a developer tool, published on its own
subdomain, apart from the non-developer spec.

Facts that shaped the answer:

- One Vitest run can write JSON and HTML at the same time
  (`--reporter=default --reporter=json --reporter=html`). No second run is needed.
- The developer report shows the **whole** suite, with no `-t`, so the "1,695 skipped
  rows" problem from Round 6 does not happen.
- A different subdomain needs a second Cloudflare Pages project. Every custom domain on one
  project serves the same content.
- It is a snapshot of the last `spec:publish` run. It does not replace the live
  `pnpm test:ui`.

The private details found in Round 6, looked at again for a developer audience:

| What the report contains | Risk | Why |
|---|---|---|
| Full test source code | none | `ETBlue/player1inventory` is a public repo |
| Absolute paths (`/Users/etblue/...`) | very low | shows the local username and folder layout |
| `config.env` (`VITE_CLERK_PUBLISHABLE_KEY`, localhost URLs) | low today | every `VITE_` value is built into the app bundle, so it is public by design. The risk is a real secret added with a `VITE_` prefix by mistake |

Decisions:

| Question | Options | Decision | Why |
|---|---|---|---|
| Who can open it? | public + secret guard; private with Cloudflare Access | **Public + secret guard** | The repo is public and `VITE_` values are public by design. The build fails if the report contains a string that looks like a secret, so a mistake stops the publish instead of leaking |
| When? | in step 1 as Task 4b; later on its own branch | **In step 1, Task 4b** | Small addition to the scripts Task 4 writes anyway |

## Round 8: How Wrangler logs in (2026-10-03)

The first setup said `pnpm exec wrangler login`. The user asked what that does, and whether
Wrangler is safe.

Facts checked:

| Fact | Detail |
|---|---|
| Who makes Wrangler | Cloudflare. Source `github.com/cloudflare/workers-sdk`, npm publisher `wrangler-publisher <workers-devprod@cloudflare.com>`, license MIT OR Apache-2.0 |
| Provenance | 4.143.0 has an SLSA provenance attestation: npm can verify it was built from that repo by Cloudflare's CI |
| Install scripts | pnpm 10.28.2 runs install scripts only for packages in `onlyBuiltDependencies` (`@parcel/watcher`, `@prisma/engines`, `prisma`), so Wrangler's dependencies ran none |
| What `wrangler login` does | an OAuth flow in the browser. It saves a **broad** token in a plain file in the home folder |

Concerns, most important first:

1. The `wrangler login` token can change the whole Cloudflare account (DNS, Workers, other
   sites), and any program running as the user can read the file. This is the only real
   concern.
2. npm supply-chain attacks. True for every npm package; reduced by the lockfile and the
   install-script allowlist above.
3. What gets published. Handled by the secret guard (not screenshots).
4. Anonymous telemetry. Privacy, not security. `wrangler telemetry disable` turns it off.

| Option | Decision | Why |
|---|---|---|
| `wrangler login` | **Rejected** | Broad token, stored in a plain file |
| **Scoped API token** (`CLOUDFLARE_API_TOKEN` with only Cloudflare Pages: Edit, plus `CLOUDFLARE_ACCOUNT_ID`), kept in the macOS Keychain | **Adopted** | Can only deploy Pages projects. It is also what a future CI job needs, because CI cannot open a browser |

The two Pages projects are created with `wrangler pages project create`, so the first
deploy does not stop at an interactive prompt.

Not yet verified: that a token with only Pages: Edit is enough for
`wrangler pages project create`. If it fails with a permission error, check this first.

## Final decision

Build step 1 as described in
[the design doc](2026-09-28-living-spec-reports-design.md).
