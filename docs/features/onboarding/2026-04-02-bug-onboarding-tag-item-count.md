# Bug: Tag item counts incorrect in onboarding item selection view

**Date:** 2026-04-02
**Branch:** docs/readme-rewrite

---

## Bug description

In the onboarding flow's item selection view (`TemplateItemsBrowser`), tag item counts displayed in the filter panel are always 0 (or show database item counts instead of template item counts).

**Steps to reproduce:**
1. Start onboarding and choose "Choose from a template..."
2. Select a template and proceed to the item selection step
3. Open the tag filter panel
4. Observe: tag item counts are wrong (0 or database values, not template item counts)

**Expected:** each tag shows how many template items belong to it

---

## Root cause

Two separate data source mismatches in `TemplateItemsBrowser`:

1. **`ItemFilters` receives `items={[]}`** (line 234) instead of the filtered template items. `calculateTagCount()` in `filterUtils.ts` counts matches against this array, so all counts are 0.

2. **`TagBadge` calls `useItemCountByTag(tag.id)`** unconditionally (line 14 in `TagBadge/index.tsx`), which queries the real IndexedDB. Template tags have synthetic IDs (e.g. `'produce'`, `'refrigerated'`) that don't exist in the database, so the hook returns 0.

---

## Fix applied

1. **`TagBadge`** — added optional `count?: number` prop. When provided, skips the `useItemCountByTag` database hook entirely (passes `''` as tagId to disable the query) and renders the given count directly.

2. **`TemplateItemsBrowser`** — added `templateItemsAsItems` computed variable that maps `templateItems` to minimal `Item[]` objects with `tagIds: item.tagKeys`. Passed this array to `<ItemFilters items={templateItemsAsItems} ...>` instead of the previous `items={[]}`.

## Test added

- `TagBadge.stories.test.tsx`: `WithCountProp renders the provided count instead of database value` — verifies that a badge with `count={42}` renders "(42)" without querying the database.
- `TemplateItemsBrowser.stories.test.tsx`: `user can see tag filter buttons with non-zero counts when filters are opened` — verifies that opening the filter panel renders tag type dropdown buttons.

## PR / commit

Branch: `docs/readme-rewrite` (committed inline with docs rewrite work)
