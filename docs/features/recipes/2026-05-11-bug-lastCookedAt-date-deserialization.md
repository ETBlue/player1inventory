# Bug: lastCookedAt.getTime is not a function after import

## Bug Description

After importing a JSON backup file in offline mode, navigating to the cooking page throws:

```
TypeError: he.lastCookedAt.getTime is not a function
```

Steps to reproduce:
1. Download data from cloud mode
2. Open the app in offline mode in a fresh browser tab
3. Import the downloaded JSON backup file
4. Navigate to the cooking page

## Root Cause

`importLocalData()` in `apps/web/src/lib/importData.ts` inserts recipes into Dexie without deserializing date fields. Exported JSON serializes `Date` objects as ISO strings; without deserialization on import, `lastCookedAt` remains a string. The cooking page's sort function calls `.getTime()` on it, which only exists on `Date` objects.

The fix already exists: `deserializeRecipe()` in `apps/web/src/lib/deserialization.ts` handles the conversion. It is imported in `importData.ts` but not applied to recipes (unlike items, which use `deserializeItem()`, and inventoryLogs/shelves, which have inline conversion).

Affected locations in `importData.ts`:
- Line 687 (clear strategy): `db.recipes.bulkAdd(payload.recipes as Recipe[])`
- Line 727 (skip strategy, create): `db.recipes.bulkAdd(toCreate.recipes as Recipe[], ...)`
- Line 823 (replace strategy, create): `db.recipes.bulkAdd(toCreate.recipes as Recipe[], ...)`
- Line 859 (replace strategy, upsert): `db.recipes.bulkPut(toUpsert.recipes as Recipe[])`

## Fix Applied

In `apps/web/src/lib/importData.ts`, wrapped all four recipe `bulkAdd`/`bulkPut` call sites with `.map(r => deserializeRecipe(r as unknown as Record<string, unknown>))` — mirroring how `deserializeItem` was already applied to items. `deserializeRecipe` is imported from `./deserialization`.

## Test Added

Three new tests in `apps/web/src/lib/importData.test.ts` (inside the `importLocalData` describe block):
- `user can import recipe with lastCookedAt as ISO string (clear) — stored as Date`
- `user can import recipe with lastCookedAt as ISO string (skip) — stored as Date`
- `user can import recipe with lastCookedAt as ISO string (replace) — stored as Date`

Each asserts that after import, `lastCookedAt` is a `Date` instance.

## PR / Commit

Commit: b780ca63 `fix(recipes): deserialize date fields on import`
PR: *TBD*
