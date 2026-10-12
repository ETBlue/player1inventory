# Bug: Cloud import "replace" silently skips the rows it was asked to overwrite

Issue: #330

## Bug Description

On the cloud import **replace** strategy, the rows the user chose to overwrite are
not overwritten. The import reports success. Nothing warns the user.

Steps to reproduce:

1. Be in cloud mode with one existing item, `Milk`.
2. Import a backup holding two items: `Milk` (the same id — a conflict) and
   `Bread` (new).
3. Choose **replace**, which means "overwrite what is already there".

What happens:

| Pass | Data | Batch key | Result |
|---|---|---|---|
| create | `[Bread]` | `items:0` | sent, key recorded |
| upsert | `[Milk]` | `items:0` | **skipped** — the key is already in the set |

`Bread` is created. `Milk` is **not** updated.

Affected entities are every one that can appear in both passes on `replace`:
`items`, `tags`, `tagTypes`, `vendors`, `recipes`, `inventoryLogs`,
`shoppingCarts`, `cartItems`, `shelves`.

**Local mode is unaffected.** `importLocalData` does not batch and holds no session.

The two entities cloud-locations PR 4b added cannot hit it either, because
`partitionPayload` routes `locations` only to the create pass and `itemStocks` only
to the upsert pass.

## Root Cause

`apps/web/src/lib/importData.ts`. The resumable-batch key does not record which of
the two passes it came from. Built in `runBulkBatches`:

```ts
const key = `${spec.entityType}:${i}`   // no mode
if (session.completedBatchKeys.has(key)) { continue }
...
session.completedBatchKeys.add(key)
```

`bulkCreate` and `bulkUpsert` are both thin wrappers over `runBulkBatches`,
differing only in the `mode` argument — which never reaches the key. On the
`replace` path, `importCloudData` passes **the same `session` object** to both, so
the upsert pass finds the create pass's key and treats its own batch as already
sent.

## Why no test caught it

Every existing test of this path uses a payload where each entity appears in only
one pass, so the two passes never collide on a key. `importCloudData — batched
cloud import` had 5 tests and none mixed a conflicting row and a new row of the
same entity. It has 6 now; the new one is that fixture. See *Test Added* below.

## Fix Applied

One line, in `runBulkBatches` (`apps/web/src/lib/importData.ts`):

```diff
-      const key = `${spec.entityType}:${i}`
+      const key = `${mode}:${spec.entityType}:${i}`
```

`mode` was already a parameter of `runBulkBatches` and already used a few lines
below, so nothing new had to be threaded through. Its only two values are
`'create'` and `'upsert'`, and its only two call sites are `bulkCreate` and
`bulkUpsert`.

### No migration was needed

The issue body raised the key format as a possible migration worry. It is not
one. An `ImportSession` is never persisted:

| Where it lives | Reference |
|---|---|
| a local `const` in `importCloudData` | `importData.ts:2262` |
| attached to a thrown error | `importData.ts:2424` |
| one React `useState` | `ImportCard.tsx:66`, `:156` |

The only resume path is the "Retry" button in the same page session
(`ImportCard.tsx:277-297`). A page reload loses the session. `completedBatchKeys`
is a `Set`, which `JSON.stringify` turns into `{}`, and nothing in the repo
serializes it. So there is no saved session to invalidate, no version flag and no
cleanup code.

### Comments corrected at the same time

Five comments stated the old key format or reasoned from it. All five were wrong
after the fix, so all five were rewritten:

| File | What it said |
|---|---|
| `importData.ts` `ImportSession.completedBatchKeys` | gave the key format |
| `importData.ts` `EntitySpec.entityType` | called `entityType` "the prefix of the batch key" — `mode` is the prefix now |
| `importData.ts` `runBulkBatches` | a long comment calling this "a PRE-EXISTING BUG and not this function's to fix" |
| `importData.ts` `importCloudData`'s session comment | "The keys are `${entityType}:${i}`" |
| `importData.ts` `partitionPayload`'s `toUpsert.locations: []` | said resending the locations "would be a second batch under the same key". The keys no longer collide, so the reason is now the wasted round trip alone. This one was **not** in the fix brief; it was found by reading the file |

## Test Added

### Unit test — `apps/web/src/lib/importData.test.ts`

`user replacing cloud data has a conflicting item really overwritten`, in the
`importCloudData — batched cloud import` block.

Its fixture is the one no existing test had: cloud mode, `replace` strategy, a
payload with **one item the destination already holds** (`item-collides`, named
`Backup Name` in the payload and `Stale Name` in the destination) and **one it
does not** (`item-new`). That is what gives the `items` entity a batch on both
passes.

It asserts the ids every `BulkUpsertItems` call carried, and the ids every
`BulkCreateItems` call carried:

```ts
expect(idsSentBy('BulkUpsertItems')).toEqual([CONFLICTING_ID])
expect(idsSentBy('BulkCreateItems')).toEqual([NEW_ID])
```

Written that way for two reasons, both from *Proving a Test Works* in the root
`CLAUDE.md`:

- A **call count** would also pass against an implementation that sent the
  create batch twice, so the document name is part of the filter.
- `find(...)` plus `toBeDefined()` was the first version. With the bug back it
  failed as `expected undefined to be defined`, which proves much less than a
  value difference. The list form reports `[] vs ['item-collides']` instead.

Three existing fixtures gained the `create:` prefix. All three use the `clear` or
`skip` strategy, and both run the create pass only:

| Line | Test | New fixture |
|---|---|---|
| ~`:2419` | `user retrying a failed import does not re-send the locations and stock already sent` | `['create:locations:0', 'create:itemStocks:0']` |
| ~`:2508` | `skips already-completed batches on retry` | `['create:items:0']` |
| ~`:2558` | `throws with session attached when a batch fails` | asserts `create:items:0` / `create:items:1` |

`opName` moved from inside one `describe` block to module level, renamed
`opNameOf`, so the new test can use it. Five existing call sites updated.

### E2E regression guard — `e2e/tests/settings/import-strategies.spec.ts`

PR #342 already built the exact mixed `replace` fixture this bug needs, and made
its last assertion record the wrong value on purpose. The ternary is now
collapsed to `COLLIDING_ITEM_BACKUP_NAME`, so both modes expect the same name,
and the comment block records the fix rather than an open defect.

### Mutation checks, with the exact red text

All three were run on 2026-10-12.

| # | What was mutated | Command | Result |
|---|---|---|---|
| 1 | `mode` removed from the batch key | `npx vitest run src/lib/importData.test.ts` | **RED.** `AssertionError: expected [] to deeply equal [ 'item-collides' ]`. Three existing fixture tests went red too, so 4 failed / 120 passed. Restored: 124 passed |
| 2 | the same, with the ternary already collapsed | `pnpm test:e2e --project=cloud e2e/tests/settings/import-strategies.spec.ts` | **RED** at `import-strategies.spec.ts:463` — `Expected: "Fixture Item" / Received: "Stale Name"`. With the fix: **2 passed (46.5s)** |
| 3 | nothing (negative control) | `pnpm test:e2e --project=local e2e/tests/settings/import-strategies.spec.ts` | **2 passed (4.3s)**. Local mode never batched, so this was green before the fix. It proves the mode that was already right was not broken — it is **not** evidence that the fix works |

In mutation check 2's run, the spec's **first** test (`clear`) also failed, with
`Test timeout of 30000ms exceeded`. That was machine load — the load average was
about 9 at the time — and it passed in the next run at load 3.3. A timeout is not
an assertion; only the named-value failure above counts.

### Suite counts

Measured on this worktree, not copied from a doc.

| Suite | Before | After |
|---|---|---|
| `apps/web` | 251 files / 2304 tests | 251 files / **2305** tests |
| `apps/server` | 27 files / 391 tests | unchanged |
| `scripts/spec` | 70 tests | unchanged |

All green. `pnpm lint`, `pnpm build`, `pnpm build-storybook` and `pnpm check` all
pass; `pnpm check`'s output is byte-identical to the baseline apart from its
timing line.

## PR / Commit

Branch `fix/import-replace-batch-key`, based on `main` at `2067e24a`.

| Commit | What |
|---|---|
| `4f0ce5ef` | this bug doc, as a stub |
| `1807d4ff` | `fix(import): put the pass in the cloud import batch key` — the fix, the new unit test, the three updated fixtures |
| `252ad7e0` | `test(e2e): turn the #330 assertion into a regression guard` |

PR: not yet opened.

## Still owed

`pnpm test:e2e:all` — the full three-project gate. Only
`settings/import-strategies.spec.ts` was run, in `cloud` and in `local`.
