# Bug: Stock tab clears a location's `dueDate` when `expirationMode` isn't `'date'`

**Date:** 2026-08-29
**Issue:** [#261](https://github.com/ETBlue/player1inventory/issues/261)
**Area:** `apps/web` — item detail Stock tab (`routes/items/$id/stock.tsx`)

## Bug description

Two surfaces write the per-location `dueDate`, using **opposite conventions** for what
"the expiration mode isn't `date`" means:

| Surface | Behaviour when `expirationMode !== 'date'` |
|---|---|
| `QuickUpdateDialog` (pantry) | Omits the `dueDate` key entirely → the stored value is **left alone** |
| Item detail Stock tab (`buildStockUpdates`) | Sends `dueDate: undefined` → the stored value is **cleared** |

So saving the Stock tab for an item in `'days from purchase'` or `'disabled'` mode
silently discards whatever `dueDate` that location had.

**Impact today: low, but it is a trap.** `computeExpiryDate`
(`lib/expiration.ts:18-33`) does not read `dueDate` outside `'date'` mode, so the
discarded value is currently unread and nothing visibly breaks. The failure shows on a
**mode switch**: set a date in `'date'` mode → switch the item to `'days from purchase'`
→ save the Stock tab once → switch back to `'date'`. The date is gone, with no warning
at any step.

## Root cause

`buildStockUpdates` (`apps/web/src/routes/items/$id/stock.tsx:106-117`) always emits the
`dueDate` key:

```ts
dueDate:
  values.expirationMode === 'date' && values.dueDate
    ? new Date(values.dueDate)
    : undefined,
```

Both persistence paths read a **present-but-undefined** key as "clear it":

- Cloud — `toUpdateItemInput` (`apps/web/src/hooks/useItems.ts:98`) guards with
  `'dueDate' in updates` and sends `null`.
- Local — `upsertItemStock` (`apps/web/src/db/operations.ts:127`) does
  `{ ...existing, ...fields }`, so an explicit `undefined` overwrites the stored date.

That "present key means clear" convention is deliberate and used widely (the Info tab's
`buildInfoUpdates` relies on it for `note`, `packageUnit`, `estimatedDueDays`, …). The
defect is that the Stock tab emits the key even when it never rendered the field: a form
must not clear a value it did not show the user. The `QuickUpdateDialog` already gets
this right (`QuickUpdateDialog.tsx:212-218`), with a mutation-checked test pinning the
no-key case.

The Info tab is not involved — `buildInfoUpdates`
(`routes/items/$id/index.tsx:105-137`) never writes `dueDate`; its comment already says
"the per-location `dueDate` is the Stock tab's to clear."

## Fix applied

`apps/web/src/routes/items/$id/stock.tsx` — `buildStockUpdates` now emits the `dueDate`
key only in `'date'` mode, via a conditional spread, exactly as `QuickUpdateDialog` does:

```ts
...(values.expirationMode === 'date'
  ? { dueDate: values.dueDate ? new Date(values.dueDate) : undefined }
  : {}),
```

Inside `'date'` mode the key is still emitted when the field is empty — that is the user
clearing a date they can actually see, and it must still clear the stored one. Only the
non-`'date'` case changes, from "key present, `undefined`" to "no key".

The gate is on `expirationMode`, **not** on `values.dueDate` being empty: `itemToFormValues`
(`stock.tsx:45-48`) seeds `values.dueDate` from `item.dueDate` regardless of mode, so in
`'days from purchase'` mode the form still holds a non-empty date string. Gating on the
value would not have fixed the bug.

Nothing else changed. `upsertItemStock` and `toUpdateItemInput` keep the
present-key-means-clear convention — it is deliberate and relied on by many global `Item`
fields in `buildInfoUpdates`. No other call site sends `dueDate: undefined` expecting a
clear (full sweep of `apps/web/src` recorded in the issue thread).

The explanatory comments on `ItemUpdatePayload` and `buildStockUpdates` were rewritten:
the former now names all **three** distinct states (key absent = leave alone; key + Date =
set; key + `undefined` = clear) instead of implying two.

## Test added

Four tests in `apps/web/src/routes/items/$id/stock.test.tsx`, under
`describe('a save must not clear a due date the form never rendered')`:

1. `user can save a quantity in "days from purchase" mode without losing this location's due date`
2. `user can save a quantity in "disabled" expiration mode without losing this location's due date`
3. `user can clear the due date in "date" mode and have it cleared on this location`
4. `cloud mode: saving a quantity in "days from purchase" mode sends no dueDate key at all`

Tests 1 and 2 stock a real `dueDate` first and assert `toEqual(storedDate)` on the exact
`Date` — a fixture without a stored date could not detect a clear. Test 1 also asserts the
"Expires on" field is genuinely absent, which is the premise of the whole case. Test 4
asserts `'dueDate' in variables.input === false` on the real Apollo mutation call:
`toEqual` cannot tell an absent key from an `undefined` one, so it would have passed
against the buggy code.

### Mutation check

Two mutations, run separately and re-verified in the main session, not only by the
implementing agent:

**A — restore the buggy unconditional `dueDate:` key:**

| Test | Result |
|---|---|
| 1 | RED — `expected undefined to deeply equal 2026-12-24T00:00:00.000Z` |
| 2 | RED — `expected undefined to deeply equal 2026-11-11T00:00:00.000Z` |
| 3 | GREEN — correct: this is the over-correction control, and the buggy code also clears in `'date'` mode |
| 4 | RED — `expected true to be false` on `'dueDate' in input` |

**B — over-correct, never emit the key:** test 3 goes RED
(`expected 2026-12-24T00:00:00.000Z to be undefined`), proving it is a real guard and not
a vacuous pass; tests 1, 2 and 4 stay green, as intended.

Every test goes red under at least one mutation, and both mutations are caught. Restored
source: 29/29 green in the file.

## PR / commit

PR *TBD*
