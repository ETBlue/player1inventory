---
date: 2026-08-27
area: items
status: fixed
---

# Bug: `user can create an item` E2E asserts a locator that can never pass

## Bug Description

`e2e/tests/item-management.spec.ts` → `user can create an item` fails in **both** the `local`
and `cloud` projects:

```
Error: expect(locator).not.toBeVisible() failed
Locator: getByText('Must be greater than 0.')
Expected: not visible
Received: visible
```

Measured at `HEAD` before the fix: **2 failed / 19 passed / 1 skipped** for
`pnpm test:e2e --grep "item-management"` — the two failures being this one test in each project.
Every other test in the file passed.

**Pre-existing on `main`, unrelated to this branch's feature.** The assertion was added by
`9e323fa6` (2026-08-24, *"fix(items): default a new item's consume amount to 1, not 0"*) and has
never been able to pass. The quick-update stock-settings work this branch carries touches neither
the assertion, `ItemForm`'s validation, nor the create flow.

## Root Cause

The assertion intended "no validation error is shown", but the string it matched is not unique to
the error.

Two `<p>` elements sit under the **Amount per Consume** field on the item Info tab:

| Element | Source | Text | Renders |
|---|---|---|---|
| Validation error | `ItemForm.tsx:335` → `Input`'s `error` prop (`ui/input.tsx`) | `Must be greater than 0.` | only when `consumeAmount <= 0` |
| Helper text | `ItemForm.tsx:470` | `Amount added/removed per +/- button click. Must be greater than 0.` | **unconditionally** |

`page.getByText(...)` substring-matches by default, so it resolved the *helper* paragraph — which
is always on screen — and `.not.toBeVisible()` therefore failed on every run, regardless of
whether the validation error was present. The assertion could not fail for the reason it was
written, and could not pass at all.

## Fix Applied

`e2e/tests/item-management.spec.ts` only. **No source file was changed** — `ItemForm.tsx`,
`ui/input.tsx` and every other `apps/web` file are untouched by this fix.

Before:

```ts
await expect(page.getByText('Must be greater than 0.')).not.toBeVisible()
```

After:

```ts
await expect(
  page.getByText('Must be greater than 0.', { exact: true }),
).toHaveCount(0)
```

`exact: true` compares an element's **entire** trimmed text, so the longer helper string can never
equal it — only the standalone error `<p>` can. `toHaveCount(0)` states the intent directly (the
error element is conditionally rendered, so "no validation error" means "not in the DOM") and
avoids any strict-mode ambiguity. The test's intent is unchanged: creating an item must show no
consumeAmount validation error.

A hook was **not** added to the error element (`role="alert"` or a `data-` attribute on
`ui/input.tsx`'s error `<p>`). It would have been a shared-component change affecting every
`Input` error in the app, and the text-exactness fix is smaller and fully sufficient.

## Test Changed

`e2e/tests/item-management.spec.ts:48` — `user can create an item`. No test added; the existing
assertion was repaired and given a comment explaining why `exact: true` is load-bearing.

**Mutation check.** `ItemForm.tsx:335` was temporarily changed from
`consumeAmount <= 0 ? …` to `consumeAmount <= 999999 ? …`, forcing the validation error to render
on a freshly created item. The fixed test went **RED in both projects** at the new assertion:

```
Locator:  getByText('Must be greater than 0.', { exact: true })
Expected: 0
Received: 1
```

`ItemForm.tsx` was then restored via `git checkout --` and verified byte-identical
(md5 `78885987588de550be5a194f91332ee6`, matching the pre-mutation hash; `git status` clean for
that file).

## Verification

`pnpm test:e2e --grep "item-management"` — **21 passed, 1 skipped, 0 failed** across the `local`
and `cloud` projects. (The skip is the pre-existing `test.skip` on `user can persist note and
wikidata URL on the Info tab` in cloud: `wikidataUrl` / `note` are not yet in the cloud GraphQL
schema.)

The full verification gate was intentionally not run here — it is run once for the branch as a
whole.

## PR / Commit

*TBD*
