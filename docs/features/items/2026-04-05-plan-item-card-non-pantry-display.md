# Plan: Item Card Minimal Display on Non-Pantry Pages

**Date:** 2026-04-05
**Branch:** `refactor/item-card-non-pantry`
**Status:** 🔲 Pending

## Goal

Create a clear visual distinction between the pantry page (full info, user-controlled) and all other item list pages (minimal info, fixed display). On non-pantry pages, hide contextually irrelevant information — tags, vendors, recipes, tag summary, and expiration — so the user can focus on the item and its relation to the current context (shopping cart, cooking recipe, tag/vendor/recipe membership).

## Design Table

| Page           | `showTags` | `showTagSummary` | Tags toggle | `showExpiration` |
|----------------|-----------|-----------------|-------------|-----------------|
| Pantry         | `isTagsVisible` (user toggle) | `true` (default) | shown | `true` (default) |
| Shopping       | `false`   | `false`         | hidden      | `true` ← enable |
| Cooking        | `false`   | `false`         | hidden      | `true` (default) |
| Tag items      | `false`   | `false`         | hidden      | `false` ← add   |
| Vendor items   | `false`   | `false`         | hidden      | `false` ← add   |
| Recipe items   | `false`   | `false`         | hidden      | `false` ← add   |

**Rationale:**
- Tag/vendor/recipe items pages are for metadata maintenance, not time-sensitive action — expiration info is irrelevant there.
- Shopping page is about action (buying, abandoning expired stock) — expiration is relevant.
- Cooking page doesn't need expiration in current scope.
- Pantry is the primary view — full info, user-controlled.

## Implementation Steps

### Step 1 — Shopping page

**File:** `apps/web/src/routes/shopping.tsx`

Changes:
- Remove `showExpiration={false}` from `renderItemCard` (default is `true`, so expiration will show)
- Verify `showTags={false}` and `showTagSummary={false}` are already present (they are)
- Verify toolbar does not pass `isTagsToggleEnabled` (already the case)

### Step 2 — Tag / Vendor / Recipe items pages

**Files:**
- `apps/web/src/routes/settings/tags/$id/items.tsx`
- `apps/web/src/routes/settings/vendors/$id/items.tsx`
- `apps/web/src/routes/settings/recipes/$id/items.tsx`

Changes per file:
- Change `showTags={isTagsVisible}` → `showTags={false}`
- Add `showTagSummary={false}`
- Add `showExpiration={false}`
- Remove `isTagsToggleEnabled` prop from toolbar (or set to `false`)

### Step 3 — Cooking page (verify / align)

**File:** `apps/web/src/routes/cooking.tsx`

Changes:
- Verify `showTags={false}` is already set
- Add `showTagSummary={false}` if missing
- Verify toolbar does not pass `isTagsToggleEnabled`
- `showExpiration` — leave at default (`true`); cooking page already has no expiration override

### Step 4 — Verification gate

Run full quality gate:

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Then E2E:

```bash
pnpm test:e2e --grep "shopping|tags|vendors|recipes|a11y"
```

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/routes/shopping.tsx` | Remove `showExpiration={false}` |
| `apps/web/src/routes/cooking.tsx` | Verify alignment |
| `apps/web/src/routes/settings/tags/$id/items.tsx` | Hide tags, summary, expiration; remove toggle |
| `apps/web/src/routes/settings/vendors/$id/items.tsx` | Hide tags, summary, expiration; remove toggle |
| `apps/web/src/routes/settings/recipes/$id/items.tsx` | Hide tags, summary, expiration; remove toggle |

## No Story/Test Changes Expected

These are prop-level display tweaks on existing routes. ItemCard and toolbar components are not modified — only their call sites. No new behavior is introduced that requires new tests or stories. Existing smoke tests cover the affected components.
