# Phase A Implementation Plan — Nested Tags

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add `parentId` support to `Tag`, expose a descendant-expansion helper, and update all tag-related UI to render and filter with the nested structure.

**Design doc:** `docs/features/onboarding/2026-03-26-design-onboarding.md`

**Prerequisite:** None. This phase is self-contained and must merge before Phase B.

**Tech stack:** TypeScript types, Dexie.js schema migration, React components, TanStack Query hooks, existing filter pipeline.

**TDD approach:** Write failing test → implement → green. Every step ends with the full verification gate.

---

## Verification Gate (run after every step)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-phase-a.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-phase-a.log && echo "FAIL: deprecated imports" || echo "OK"
```

Final step only — also run:
```bash
pnpm test:e2e --grep "tags|items|pantry|shopping|a11y"
```

---

## Step 1 — Add `parentId` to Tag type and Dexie schema

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/db/index.ts` (Dexie schema)
- Modify: `apps/web/src/db/operations.ts` (createTag, updateTag)
- Modify: `apps/web/src/db/operations.test.ts`

**What to do:**

1. In `src/types/index.ts`, add `parentId?: string` to the `Tag` interface.

2. In `src/db/index.ts`, bump the DB version and add `parentId` to the `tags` table index. The new version entry should be a no-op migration (existing tags get `parentId = undefined` automatically — IndexedDB sparse index):
```ts
.version(N + 1)
.stores({
  tags: 'id, typeId, parentId, createdAt',  // add parentId
  // all other tables unchanged
})
// no .upgrade() needed — parentId is optional, undefined by default
```

3. In `src/db/operations.ts`, update `createTag` to accept `parentId?: string` in its input type and pass it through to the DB write. Update `updateTag` similarly.

4. **Tests:** In `operations.test.ts`, add:
- `user can create a tag with a parentId`
- `user can create a tag without a parentId` (existing test should still pass)
- `user can update a tag's parentId`

**Commit:** `feat(tags): add parentId to Tag type and Dexie schema`

---

## Step 2 — Add `getTagAndDescendantIds` helper

**Files:**
- Create: `apps/web/src/lib/tagUtils.ts`
- Create: `apps/web/src/lib/tagUtils.test.ts`

**What to do:**

Create `getTagAndDescendantIds(tagId: string, allTags: Tag[]): string[]`:
- Returns the given `tagId` plus the IDs of all its descendants (recursive)
- If the tag has no children, returns `[tagId]`
- Handles arbitrary depth

Also create `getTagDepth(tagId: string, allTags: Tag[]): number`:
- Returns 0 for top-level tags (no `parentId`)
- Returns 1 for direct children, 2 for grandchildren, etc.
- Used for visual indentation in filter dropdowns

**Tests** (`tagUtils.test.ts`):
- `getTagAndDescendantIds returns only the tag itself when it has no children`
- `getTagAndDescendantIds returns the tag and all direct children`
- `getTagAndDescendantIds returns the tag and all descendants recursively`
- `getTagDepth returns 0 for a top-level tag`
- `getTagDepth returns 1 for a direct child`
- `getTagDepth returns 2 for a grandchild`

**Commit:** `feat(tags): add getTagAndDescendantIds and getTagDepth helpers`

---

## Step 3 — Update `useTags` hook to expose nested structure

**Files:**
- Modify: `apps/web/src/hooks/useTags.ts`

**What to do:**

Add a new derived selector or hook `useTagsByType(typeId)` that returns tags for a given type **sorted with parents before children, children indented by depth**. This is the data shape needed by filter dropdowns and the Settings/Tags UI.

Specifically, add a `useTagsWithDepth(typeId?: string)` hook that returns `Array<Tag & { depth: number }>` — tags sorted so that each parent appears before its children, with `depth` computed via `getTagDepth`.

Sorting algorithm: depth-first traversal — for each top-level tag, emit it, then recursively emit its children.

**Tests:** Add unit tests for the sorting/depth logic.

**Commit:** `feat(tags): add useTagsWithDepth hook for hierarchical display`

---

## Step 4 — Update Settings/Tags UI to render hierarchy

**Files:**
- Modify: `apps/web/src/routes/settings/tags/index.tsx`
- Modify: `apps/web/src/routes/settings/tags/$id/index.tsx` (tag detail — show parent info)
- Modify: `apps/web/src/routes/settings/tags/index.stories.tsx`
- Modify: `apps/web/src/routes/settings/tags/index.stories.test.tsx`

**What to do:**

In `settings/tags/index.tsx`:
- Replace flat tag list rendering with `useTagsWithDepth`
- Add `pl-{depth * 4}` (or equivalent Tailwind indent) to each tag row based on `depth`
- Top-level tags (depth 0): no indent, full weight
- Child tags (depth ≥ 1): indented, slightly muted or smaller text

Drag-and-drop reorder: only allow reordering within the same parent group (tags with the same `parentId`). If existing drag-and-drop doesn't support this constraint, disable drag-and-drop for child tags for now and add a TODO comment.

In `settings/tags/$id/index.tsx`:
- Show "Parent: [tag name]" if `tag.parentId` is set
- Allow changing `parentId` via a select dropdown (optional for now — can be a TODO)

**Stories:** Add a `WithNestedTags` story showing the indented hierarchy.

**Commit:** `feat(settings/tags): render nested tag hierarchy with indentation`

---

## Step 5 — Update filter dropdowns to support nested tag selection

**Files:**
- Modify: `apps/web/src/components/item/ItemFilters/index.tsx` (or wherever tag filter dropdowns are rendered)
- Modify: `apps/web/src/lib/filterUtils.ts` (or `filterItems` function — wherever tag filtering logic lives)
- Modify related test files

**What to do:**

**Filter dropdown UI:**
- Use `useTagsWithDepth(typeId)` to render tag options in each tag-type dropdown
- Render each option with `pl-{depth * 4}` indent
- Support **multi-select**: render checkboxes inside the dropdown (not a single-value select); selected tags show as a count badge on the dropdown trigger ("3 selected")
- Currently the filter uses single-select per tag type — change to multi-select array per type

**Filter logic:**
- In `filterItems` (or equivalent), for each selected tag ID, expand to include descendants via `getTagAndDescendantIds`
- An item matches if it has ANY tag that is in the expanded set
- Example: user selects "Food" → expanded set = [Food, 生鮮, 熟食, 零食…] → item matches if tagged with any of these

**URL params:** Tag filter URL params currently store a single tag ID per type. Change to comma-separated list per type (or array). Update `validateSearch` on affected routes.

**Affected routes:** pantry (`index.tsx`), shopping (`shopping.tsx`), and all items-tab pages in settings (tag/$id, vendor/$id, recipe/$id).

**Tests:**
- `filterItems returns items tagged with a parent tag`
- `filterItems returns items tagged with a child tag when parent is selected`
- `filterItems returns items matching any of multiple selected tags`

**Commit:** `feat(filters): support nested multi-select tag filtering with descendant expansion`

---

## Step 6 — Update item detail Tags tab to show hierarchy

**Files:**
- Modify: `apps/web/src/routes/items/$id/tags.tsx`
- Modify: `apps/web/src/routes/items/$id/tags.stories.tsx`
- Modify: `apps/web/src/routes/items/$id/tags.stories.test.tsx`

**What to do:**

The Tags tab currently renders a flat list of tag badges grouped by tag type. Update to:
- Within each tag type section, render top-level tags first
- Child tags appear indented under their parent (using `useTagsWithDepth`)
- Visual separator or subtle indent distinguishes parent vs child tags
- Assignment behavior unchanged: clicking any tag (parent or child) toggles it on/off

**Stories:** Add a `WithNestedTags` story showing the indented hierarchy with some parent and some child tags assigned.

**Commit:** `feat(items/tags): render nested tag hierarchy in assignment tab`

---

## Final E2E check

After all steps pass the verification gate:

```bash
pnpm test:e2e --grep "tags|items|pantry|shopping|a11y"
```

Fix any failures before marking Phase A complete.
