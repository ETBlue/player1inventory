# Plan — lint and type-check `e2e/` (#322), plus #325

**Date:** 2026-10-11
**Branch:** `chore/e2e-lint-and-typecheck` · worktree `.worktrees/chore-e2e-tooling`
**Base:** `main` at `3d570963`
**Issues:** #322 (nothing lints or type-checks `e2e/`), #325 (hardcoded URL in an error message)

This is PR 1 of two. PR 2 is #323 — moving four spec files into the `cloud` project. **This one goes first on purpose:** the four cloud fixtures #323 needs would otherwise be written with no type checking at all, which is how two of the traps in the cloud-parity series happened.

## What the gate covers today

| Command | Covers `e2e/`? |
|---|---|
| `pnpm lint` / `pnpm check` | No — both are `pnpm --filter web …`, and there is **no root `biome.json`** |
| `pnpm build` | No — `apps/web` and `apps/server` only |
| `pnpm test` | No — vitest does not run Playwright specs |
| `pnpm test:e2e` | Runs the specs, but esbuild strips types without checking them |

`e2e/` holds 29 spec files plus helpers and page objects. Nothing checks any of it.

## Measured on this branch, 2026-10-11

`tsc --noEmit` over `e2e/**/*.ts`, with `@types/node` made resolvable:

| Count | Code | Where |
|---|---|---|
| **63** | `TS2559` | `e2e/tests/a11y.spec.ts` — all one mistake, repeated once per `checkA11y` call |
| 63 | | total |

**#322's figure of 74, and the 78 that PR #342 measured, are both inflated by the probe tsconfig, not by the code.** Every hand-rolled probe so far omitted node types, which adds `TS2307` (`node:fs`, `node:path`, `node:url`) and `TS2591` (`process`) on top. With node types resolvable, those vanish and only the 63 remain. The issue's own body names the cause: *"every task hand-rolls its own tsconfig"*.

**A caution for whoever measures again:** with `types: ["node"]` but `@types/node` **unresolvable**, `tsc` reports exactly **1** error — `TS2688` — because it bails before checking anything. That looks like success and is not. `@types/node` is a dependency of `apps/web` and `apps/server` but **not of the root**, and pnpm does not hoist, so a root-level program cannot see it without being given it.

## The 63 errors are one real bug, not noise

```
e2e/tests/a11y.spec.ts(162,36): error TS2559: Type '{ runOnly: { type: "tag"; values: string[]; }; }'
  has no properties in common with type 'AxeOptions'.
```

`axe-playwright`'s types:

```ts
export interface axeOptionsConfig { axeOptions?: RunOptions }
export type AxeOptions = { includedImpacts?; detailedReport?; detailedReportOptions?; verbose? } & axeOptionsConfig
```

and at runtime (`node_modules/axe-playwright/dist/index.js:111`):

```js
const violations = yield getViolations(page, context, axeOptions?.axeOptions)
```

So axe's run options must be **nested** under an `axeOptions` key. `a11y.spec.ts` passes them at the top level:

```ts
const AXE_OPTIONS = {
  runOnly: { type: 'tag' as const, values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
}
// …
await checkA11y(page, undefined, AXE_OPTIONS)
```

`axeOptions.axeOptions` is therefore `undefined`, `getViolations` receives no run options, and **axe runs with its own defaults. The WCAG AA filter has never taken effect.**

The comment above the constant says *"Explicitly set runOnly so future tooling and AI agents know the intended level"*, and the root `CLAUDE.md` repeats it: *"targeting WCAG AA … the target is explicit via `AXE_OPTIONS` in the spec file"*. Both describe an intent the code does not carry out.

**The direction is the safe one.** Axe's default set is a *superset* of the four WCAG tags — it also runs `best-practice` rules — so these scans have been **stricter** than documented, not laxer. No accessibility violation has been missed because of this.

**But fixing it narrows the gate**, and that is a real reduction in checking. So it is measured, not assumed — see task 3.

---

## Task 1 — make `e2e/` type-checked

1. Add `@types/node` to the **root** `devDependencies`. It is already in `apps/web` and `apps/server` at `^24.10.10`; match that version.
2. Add a tsconfig for `e2e/`. Decide its path and say why — `e2e/tsconfig.json` keeps it beside what it checks; a root `tsconfig.e2e.json` matches how `apps/server/tsconfig.scripts.json` sits beside its sibling. Either is defensible.
3. **Get `lib` and `types` right, and report the resulting count.** Specs run in Node but their `page.evaluate` / `addInitScript` callbacks run in the browser and touch `localStorage`, `indexedDB` and `document`. A config with no DOM lib may report errors that are an artefact of the config rather than the code — the exact mistake this plan opens by describing. State what you chose and what the count was before and after each change.
4. Wire it so **something in the verification gate actually runs it.** Root `typecheck` is `pnpm --filter web typecheck && pnpm --filter server typecheck`, and **`pnpm typecheck` is not currently in the gate at all** — the gate runs `lint`, `build`, `build-storybook`, `check` and `test`. So adding to `typecheck` alone would change nothing in practice. Choose where it belongs, wire it, and update the Verification Gate section of the root `CLAUDE.md` to match.

**Mutation check.** Put a deliberate type error in a spec — `const x: number = 's'` — and confirm the gate command you wired fails and names the file. Then remove it. Without this the config could be including nothing and still report success.

---

## Task 2 — make `e2e/` linted and formatted

There is no root `biome.json`; `apps/web/biome.json` is the only one, and both root scripts delegate to that workspace.

Add Biome coverage for `e2e/`. **The constraint that matters: `apps/web`'s existing 4 warnings in `src/routes/shopping/index.tsx` must stay at 4**, and no existing `e2e/` file may be reformatted into a large diff that buries the real change. Measure the warning and error count for `e2e/` before you change anything, report it, and fix or explicitly accept each one.

If the honest answer is that linting `e2e/` surfaces more than fits in this PR, say so and propose what to defer — a long tail of style fixes is not worth blocking the type-checking on.

---

## Task 3 — the `AxeOptions` bug, measured before it is fixed

**Do not simply nest the options and move on.** That narrows the accessibility gate from axe's default rule set to four WCAG tags, and nobody has checked what that loses.

1. Run `e2e/tests/a11y.spec.ts` as it is today — defaults in effect — and capture the violations axe reports. The suite is green, so capture the full result set rather than only failures; `checkA11y`'s reporter prints what it found.
2. Run it again with the options correctly nested, so the WCAG filter applies.
3. **Diff the two rule sets.** The question to answer: *is anything currently being caught only by a rule outside the four WCAG tags?*

| Diff result | What to do |
|---|---|
| Empty — the filter loses nothing | Apply the fix. Narrowing costs nothing and the code finally matches its comment |
| Not empty | **Stop and report.** Name the rules that would stop running. This becomes the user's decision, not yours |

Either way, correct the comment above `AXE_OPTIONS` and the root `CLAUDE.md`'s a11y section, both of which describe an intent the code did not carry out. Record the date it was found and that the scans had been stricter than documented, so nobody later reads the change as a weakening nobody noticed.

**Note the knock-on:** `checkA11yAllowingKnownConfirmContrast` and `KNOWN_CONFIRM_CONTRAST_EXCLUSION` pass options the same way. Check whether they have the same bug.

### Outcome, measured 2026-10-11

**Done. The fix was applied.** The counts, over 130 scans — 64 in `local`, 66 in `pwa`:

| Quantity | Count |
|---|---|
| rule ids evaluated with axe defaults | 89 |
| rule ids evaluated with the four WCAG tags | 62 |
| stopped running | 28, all `best-practice` |
| started running | 1 — `target-size` (wcag22aa) |
| of the 28, how many report a violation or an incomplete on any scanned page | **0** |

**The plan's two-row table was too coarse, and following it literally would have stopped the
work for nothing.** It said "diff not empty → stop and report". The diff is 28 rules and will
always be: axe's default set is a strict superset of the four WCAG tags, so a non-empty diff
was certain before any measurement. What decides the question is whether any dropped rule is
catching something today, and none is. The task brief carried a three-row tree that asked
exactly that, and that is the one that was followed.

**`checkA11yAllowingKnownConfirmContrast` did NOT have the same bug.** It calls
`getViolations`, whose third parameter is a bare axe `RunOptions`, so its `exclude` and its
`rules` override were always applied. It did, however, pass no `runOnly` at all, so it ran
axe's defaults — which is why it had matched its 63 siblings. Both now build their options
from one `WCAG_AA_TAGS` constant.

**Two false claims were found in the spec's own comments.** One said the WCAG level was
"explicitly set"; it was not. The other said `target-size` "still polices" the known-bad
destructive confirm button; axe ships that rule `enabled: false`, so with defaults it was not
running at all. Both are corrected in place.

---

## Task 4 — #325, one line

`cleanupCloudData` in `e2e/helpers/cloudTeardown.ts` builds its error with the literal `/e2e/cleanup` rather than the URL it called, which is `${CLOUD_SERVER_URL}/e2e/cleanup`. So the message drops host and port, and would keep saying `/e2e/cleanup` if the path changed. Use the URL variable.

---

## Task 5 — documentation

1. `e2e/CLAUDE.md` — its *Nothing lints or type-checks `e2e/`* section is now wrong. Replace it with what runs and how to run it. **Correct the stale error counts there too**, and say that a hand-rolled probe without node types inflates them.
2. Root `CLAUDE.md` — the Verification Gate gains a step; the a11y section's claim about `AXE_OPTIONS` needs correcting.
3. `docs/INDEX.md` — a row under `testing`.

---

## Verification gate

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build-e2e-tooling.log
grep 'TS6385' /tmp/p1i-build-e2e-tooling.log && echo FAIL || echo OK
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
pnpm test
```

Plus whatever new command task 1 wires in.

**Baseline on this branch:** server **391** / 27 files, web **2304** / 251 files. Re-measure rather than subtracting.

**A worktree with no `pnpm codegen` looks exactly like a starved machine.** Measured on this
branch while taking that baseline: after `pnpm install` but before `pnpm codegen`, `pnpm test:web`
reported **124 failed suites of 251** and **1176 tests passed** — about half the real count, with
**zero** failed tests. That is the same shape the root `CLAUDE.md` describes as starvation. It was
not. Every one of the 124 failed with `Failed to resolve import "@/generated/graphql"`, because the
generated files are gitignored and a fresh worktree has none. `pnpm codegen` fixed it and the count
returned to 2304 / 251.

The tell that separates the two: starvation gives a failing set that **moves between runs** and
tests that pass when run alone, while a missing codegen gives the **same** files every time and one
identical resolve error in each. Check the first failure's message before reaching for load average.

**Final phase:** the three projects as separate invocations, `cloud` in chunks. `a11y.spec.ts` runs in `local` and `pwa`, so both matter here — this PR touches it.

Swap has been sitting near its limit all week; it reached 319 MB free during PR C. Two E2E failures in that PR were `socket hang up` and `read ECONNRESET`, both proved transient by running the spec alone and re-running the chunk. Expect the same and prove it the same way.

## What the user gets (UX)

Nothing. One accessibility change could narrow which rules run, and task 3 exists so that is a measured decision rather than a side effect.

## What the developer gets (DX)

| Gain | Specifics |
|---|---|
| A whole directory stops being unchecked | 29 spec files plus helpers and page objects get `tsc` and Biome |
| A failure that now has a name | a type error in a spec is reported by the gate instead of by nothing |
| Honest documentation | three stale error counts corrected, and the `AXE_OPTIONS` claim that the code never carried out |
| A real bug found | the WCAG filter has never applied. It was hiding behind the 63 type errors nobody could see |

**DX cost:** one more command in the gate, and one more tsconfig to keep in step.
