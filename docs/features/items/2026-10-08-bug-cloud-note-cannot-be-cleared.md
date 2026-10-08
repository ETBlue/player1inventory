# Bug: a cloud note or Wikidata URL could be saved but never cleared

- **Issue:** [#335](https://github.com/ETBlue/player1inventory/issues/335) (cloud-parity PR B)
- **Found:** 2026-10-08, on branch `feature/cloud-item-note-wikidata`, while writing the E2E
  test that task 3 of the PR B plan asked for
- **Fixed:** 2026-10-08, same branch, commit `b6d4f364`
- **Area:** items — the Info tab's `note` and `wikidataUrl` fields, cloud mode only

## Bug description

In cloud mode a user could type a note or a Wikidata URL on an item's Info tab and save it.
Emptying the same field and pressing Save did nothing. Reopening the Info tab showed the old
text again.

| Action | Local mode | Cloud mode before the fix |
|---|---|---|
| Fill the field and save | works | works |
| Empty the field and save | clears it | **old value comes back** |

Both fields are on the Info tab, so both halves of the bug are reachable from one screen.

## Root cause

Three steps, and the `?? null` guard in the middle was missing.

1. `buildInfoUpdates` (`apps/web/src/routes/items/$id/index.tsx:104`) sets the key to
   `undefined` when the user empties the input. It does this on purpose, and its comment says
   so: assigning `undefined` rather than deleting the key keeps the key **present**, which is
   how the next step is told "clear this field".
2. `toUpdateItemInput` (`apps/web/src/hooks/useItems.ts:165`) is what reads that signal. Each
   clearable field gets its own line turning the present-but-`undefined` key into an explicit
   `null`:

   ```ts
   ...('packageUnit' in rest && { packageUnit: rest.packageUnit ?? null }),
   ```

   Six fields carried that `?? null` guard — `packageUnit`, `measurementUnit`,
   `amountPerPackage`, `estimatedDueDays`, `expirationThreshold`, `expirationMode`. A seventh,
   `dueDate`, has its own form of the same guard. **`note` and `wikidataUrl` had none.** They
   rode through on the `...rest` spread with the value still `undefined`.
3. Apollo serialises GraphQL variables with `JSON.stringify`, which **drops** a key whose
   value is `undefined`. So the server received no `note` key at all.
   `buildItemUpdateData` (`apps/server/src/resolvers/item.resolver.ts:73`) tests
   `!== undefined` on each input key, by design: an absent key means "leave it alone". It left
   the stored value alone, exactly as asked.

Nothing threw. The save reported success and changed nothing.

## Why nobody saw it earlier

The bug was unreachable until commit `44b3572d`, earlier on this same branch. Before that the
cloud GraphQL `Item` type declared neither field, so a cloud save carrying either one failed
GraphQL validation outright and no value was ever stored. There was nothing to clear.

So this is not an old defect that went unnoticed. It became reachable and was found in the
same PR.

## Fix applied

Two lines in `toUpdateItemInput`, matching the six already there — commit `b6d4f364`:

```ts
...('wikidataUrl' in rest && { wikidataUrl: rest.wikidataUrl ?? null }),
...('note' in rest && { note: rest.note ?? null }),
```

The server half needed no change, and that was a separate decision worth recording.
`buildItemUpdateData` passes both values through **raw**:

```ts
...(rest.wikidataUrl !== undefined ? { wikidataUrl: rest.wikidataUrl } : {}),
...(rest.note !== undefined ? { note: rest.note } : {}),
```

It does **not** use the file's own `strOr` helper there. `strOr` is `v ?? undefined`, which
would turn the explicit `null` back into `undefined` — Prisma's "leave this column alone" —
and the bug would survive the client fix. `createItem` in the same file does use `strOr`, for
the opposite reason: on a create there is no stored value to keep, so an absent or null input
must become a NULL column and never the empty string.

## Tests added

Three tests, and the differential between them is what proves the fix.

| Test | File | Commit |
|---|---|---|
| `user can clear a saved note and wikidata URL in cloud mode` | `apps/web/src/hooks/useItems.test.ts` | `b6d4f364` |
| `passes a filled note and wikidata URL straight through` | `apps/web/src/hooks/useItems.test.ts` | `b6d4f364` |
| `user can clear a saved note and wikidata URL` | `e2e/tests/item-management.spec.ts` | `eed5f19a` |

The E2E test runs in **both** the `local` and the `cloud` projects. It fills both fields,
saves, asserts the starting state, then empties both and asserts they stay empty after a
reload. Asserting the starting state matters: without it an empty readback would also pass
when the first save failed.

### Why a separate E2E test and not two more lines on the existing one

`user can persist note and wikidata URL on the Info tab` already existed, and task 3 of the
plan only asked for its `test.skip` to be removed. That test fills both fields and reads them
back, so it cannot see this bug. Measured in the `cloud` project with the two `?? null` guards
removed from `toUpdateItemInput`:

| Test | Result with the guard removed |
|---|---|
| `user can clear a saved note and wikidata URL` | **RED** — `Expected: "" / Received: "A note that should not survive."` |
| `user can persist note and wikidata URL on the Info tab` | **GREEN** |

1 failed, 11 passed. That difference is the reason for a second test. The filling test passes
with or without the fix, so it is not evidence that clearing works.

A second mutation check, run the same way, removed `note` from `buildItemUpdateData` in
`item.resolver.ts`: **2 failed, 10 passed**, both with a value difference rather than a
timeout — `Expected: "Buy the 1L carton; lactose-free preferred." / Received: ""` and
`Expected: "A note that should not survive." / Received: ""`.

A `user …` title also appears on the public spec site as a sentence, so clearing being its own
test gives it its own line there.

## What this says about the issue's acceptance criterion

Issue #335 said removing the `test.skip` **is** the acceptance criterion. It was not enough.
The un-skipped test passes against the broken code. An acceptance criterion that names a test
is only as strong as what that test can fail on.

## PR / commits

| Commit | What it did |
|---|---|
| `44b3572d` | made the bug reachable — `note` and `wikidataUrl` added to the cloud schema |
| `b6d4f364` | the fix: two `?? null` guards, plus the two unit tests |
| `eed5f19a` | the E2E clearing test, and the `test.skip` removed from the filling test |

Branch `feature/cloud-item-note-wikidata`, cloud-parity PR B. Design:
`docs/global/cloud-parity/2026-10-08-parity-followup-design.md`. Plan:
`docs/global/cloud-parity/2026-10-08-parity-followup-plan-pr-b.md`.
