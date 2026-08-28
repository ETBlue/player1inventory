# Unified item search — PR D: filter-shelf per-axis picker

> **Note (2026-08-28, later same day):** this plan's completed work included a direct-apply
> bypass — pressing `Add to shelf` skipped the dialog entirely when every unmet axis offered
> exactly one option. The designer reversed that bypass the same day (the dialog now always
> opens as a double-confirm step); this plan's task text below is left as the historical
> record of the work as implemented, not rewritten. See the dated addendum in
> `2026-08-26-unified-item-search-design.md`'s "Filter shelves" section and in
> `2026-08-28-brainstorming-filter-shelf-picker.md` for the reversal.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every bucket-2 tail row on a **filter** shelf actionable — pressing `Add to
shelf` applies the shelf's whole `filterConfig` to the item, with the user picking one option
on every OR'd axis that offers a genuine choice.

**Architecture:** Two new pure functions in `lib/shelfUtils.ts` derive, from an item and a
`filterConfig`, which axes the item already satisfies and which still need a pick. A new
`ShelfFilterPicksDialog` collects those picks. A new `applyShelfFilterPicksBatch` writes
`Item.tagIds` / `Item.vendorIds` and `Recipe.items` in **one Dexie transaction**; the cloud
branch of the wrapping hook does the same two writes sequentially (PR D-1 closes that gap).
`ShelfDetailView` swaps its filter-shelf `groupNote` for a `groupAction`. **`ItemSearchTail`
and `useItemSearchTailWiring` are not modified.**

**Tech Stack:** React 19 + TypeScript (strict, `exactOptionalPropertyTypes`), TanStack Query,
Dexie.js, Radix `RadioGroup` via `components/ui/radio-group`, Vitest + React Testing Library,
Storybook, i18next (`en.json` / `tw.json`).

**Spec:** `docs/features/items/2026-08-26-unified-item-search-design.md` (see the "Filter
shelves" section). Session rulings that refine it:
`docs/features/items/2026-08-28-brainstorming-filter-shelf-picker.md`.

## Global Constraints

- **`ItemSearchTail.tsx` and `useItemSearchTailWiring.tsx` must not change.** The design doc
  states "nothing else about the wiring changes when that lands". A task that needs to edit
  either is a signal the design was misread — stop and report.
- **Cloud keeps exactly one isolated bypass in `useItemSearchTail.ts`.** Do not add a second
  one. The cloud branch this plan *does* add lives in the new mutation hook, which is the
  house dual-mode pattern (`useUpdateItem`, `useUpdateRecipe`), not a bypass.
- **Awaited invalidation:** the new mutation hook's local `onSuccess` must **return** its
  `invalidateQueries` — see the "Awaited invalidation" paragraph in `apps/web/src/hooks/CLAUDE.md`.
- **`|| 1`, never `?? 1`,** when deriving a recipe entry's `defaultAmount` from
  `item.consumeAmount`. `0` is a legitimate stored value meaning "optional, unchecked" in
  cooking. Same operator and rationale as `RecipeDetailView.tsx:182`.
- **Never write a dangling id.** Vendor and recipe options are filtered to entities that
  actually resolve in the current catalogs.
- **Name display convention:** item, tag and recipe names get `capitalize`; **vendor names get
  `normal-case`**. See the "Name Display Convention" section of the root `CLAUDE.md`.
- **Every location-scoped fixture stocks its probe at *another* location** (the `stockId`
  trap). A bucket-2/bucket-3 fixture that is stocked in the active location proves nothing.
- **Mutation-check every test** and report which mutation you ran and that it went RED. A
  green test is not evidence.
- **Verification gate after every task**, from the worktree root, per the root `CLAUDE.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/lib/shelfUtils.ts` (modify) | Adds `isFilterConfigSatisfiable` (shelf-level, item-independent) and `deriveFilterAxes` (per-item). Pure; no i18n, no hooks. |
| `apps/web/src/lib/shelfUtils.test.ts` (modify) | Unit tests for both. |
| `apps/web/src/db/operations.ts` (modify) | Adds `applyShelfFilterPicksBatch` — one `rw` transaction over `[db.items, db.recipes]`, reading current rows *inside* the transaction so a stale render closure cannot double-append. |
| `apps/web/src/db/operations.test.ts` (modify) | Transaction + idempotency tests. |
| `apps/web/src/hooks/useApplyShelfFilterPicks.ts` (create) | Dual-mode mutation hook. Local → the batch op. Cloud → `useUpdateItem` then `useUpdateRecipe`, sequential. |
| `apps/web/src/hooks/useApplyShelfFilterPicks.test.tsx` (create) | Local invalidation-is-returned guard. |
| `apps/web/src/components/shelf/ShelfFilterPicksDialog/ShelfFilterPicksDialog.tsx` (create) | The dialog. Owns picks state, pending, inline error. Presentational apart from `useTranslation`. |
| `.../ShelfFilterPicksDialog/index.ts` (create) | Barrel — `export * from './ShelfFilterPicksDialog'`. |
| `.../ShelfFilterPicksDialog/ShelfFilterPicksDialog.stories.tsx` (create) | Stories: all-met, single open axis, three open axes, error state. |
| `.../ShelfFilterPicksDialog/ShelfFilterPicksDialog.stories.test.tsx` (create) | `composeStories` smoke tests. |
| `.../ShelfFilterPicksDialog/ShelfFilterPicksDialog.test.tsx` (create) | Add-disabled-until-picked, met axes read-only, inline error. |
| `apps/web/src/components/pantry/ShelfDetailView.tsx` (modify) | `groupNote` → `groupAction` for satisfiable filter shelves; mounts the dialog. |
| `apps/web/src/components/pantry/ShelfDetailView.test.tsx` (modify) | Route-level: direct-apply path, dialog path, unsatisfiable-shelf `groupNote` fallback. |
| `apps/web/src/i18n/locales/en.json`, `tw.json` (modify) | `items.searchTail.filterPicks.*`. |
| `e2e/tests/shelves.spec.ts` (modify) | One end-to-end pass through the dialog. |

---

## Task 1: `isFilterConfigSatisfiable` + `deriveFilterAxes`

**Files:**
- Modify: `apps/web/src/lib/shelfUtils.ts`
- Test: `apps/web/src/lib/shelfUtils.test.ts`

**Interfaces:**
- Consumes: `matchesFilterConfig` (existing, same file), `getTagAndDescendantIds` from
  `@/lib/tagUtils`, types `FilterConfig`, `Item`, `Tag`, `TagType` from `@/types`.
- Produces — later tasks depend on these exact names and shapes:

```ts
export interface FilterAxisOption {
  id: string
  name: string
}

export interface FilterAxis {
  /** Stable key: the tagTypeId for a tag axis, 'vendor' / 'recipe' for the other two. */
  key: string
  kind: 'tag' | 'vendor' | 'recipe'
  /**
   * Tag axes only — the tag TYPE's name, which is what makes a shelf filtering on two
   * tag types legible ("Category" / "Storage"). The other two kinds carry no name here;
   * the dialog translates their labels, because a pure function must not call `t`.
   */
  typeName?: string
  /** Resolvable options only, in `filterConfig` order. Never contains a dangling id. */
  options: FilterAxisOption[]
  /**
   * Set when the item ALREADY satisfies this axis — the configured id that does it.
   * An axis with `metBy` is rendered read-only and is never written.
   */
  metBy?: string
}

export function isFilterConfigSatisfiable(
  filterConfig: FilterConfig,
  vendors: { id: string }[],
  recipes: { id: string }[],
): boolean

export function deriveFilterAxes(
  item: Item,
  filterConfig: FilterConfig,
  tags: Tag[],
  tagTypes: TagType[],
  vendors: { id: string; name: string }[],
  recipes: { id: string; name: string; items: { itemId: string }[] }[],
): FilterAxis[]
```

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/shelfUtils.test.ts`. Follow the fixture style already in that
file. Minimum set:

```ts
describe('isFilterConfigSatisfiable', () => {
  it('is true for a config whose vendor and recipe ids all resolve', () => {
    expect(
      isFilterConfigSatisfiable(
        { vendorIds: ['v1'], recipeIds: ['r1'] },
        [{ id: 'v1' }],
        [{ id: 'r1' }],
      ),
    ).toBe(true)
  })

  it('is false when every vendor id points at a deleted vendor', () => {
    // Given a vendor axis naming only ids absent from the catalog
    // Then no press could satisfy it without writing a dangling id
    expect(isFilterConfigSatisfiable({ vendorIds: ['gone'] }, [], [])).toBe(false)
  })

  it('is false when every recipe id points at a deleted recipe', () => {
    expect(isFilterConfigSatisfiable({ recipeIds: ['gone'] }, [], [])).toBe(false)
  })

  it('is true when a vendor axis has at least one resolvable id among dangling ones', () => {
    expect(
      isFilterConfigSatisfiable({ vendorIds: ['gone', 'v1'] }, [{ id: 'v1' }], []),
    ).toBe(true)
  })

  it('is true for a tag-only config even when every tag id is dangling', () => {
    // matchesFilterConfig resolves tag ids through tags.find and SKIPS misses, so an
    // all-dangling tag axis is not a constraint at all — it cannot make a shelf unjoinable.
    expect(isFilterConfigSatisfiable({ tagIds: ['gone'] }, [], [])).toBe(true)
  })

  it('is true for an empty config', () => {
    expect(isFilterConfigSatisfiable({}, [], [])).toBe(true)
  })
})

describe('deriveFilterAxes', () => {
  // Fixtures — two tag types, so the AND-between-types rule is exercised.
  const tagTypes = [
    { id: 'tt-cat', name: 'Category', color: TagColor.blue },
    { id: 'tt-sto', name: 'Storage', color: TagColor.green },
  ]
  const tags = [
    { id: 'dairy', name: 'Dairy', typeId: 'tt-cat' },
    { id: 'frozen', name: 'Frozen', typeId: 'tt-cat' },
    { id: 'fridge', name: 'Fridge', typeId: 'tt-sto' },
  ]
  const vendors = [
    { id: 'v1', name: 'Costco' },
    { id: 'v2', name: '7-Eleven' },
  ]
  const recipes = [{ id: 'r1', name: 'Pancakes', items: [] }]
  const item = (over: Partial<Item> = {}) =>
    ({ id: 'i1', name: 'Oat Milk', tagIds: [], vendorIds: [], ...over }) as Item

  it('returns one axis per tag TYPE present in the config, labelled by the type name', () => {
    const axes = deriveFilterAxes(
      item(),
      { tagIds: ['dairy', 'frozen', 'fridge'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes).toHaveLength(2)
    expect(axes.map((a) => a.typeName).sort()).toEqual(['Category', 'Storage'])
    // OR within a type: both Category options are offered as ONE axis.
    const category = axes.find((a) => a.key === 'tt-cat')
    expect(category?.options.map((o) => o.id)).toEqual(['dairy', 'frozen'])
  })

  it('marks a tag axis met when the item carries one of its tags', () => {
    const axes = deriveFilterAxes(
      item({ tagIds: ['frozen'] }),
      { tagIds: ['dairy', 'frozen'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes[0]?.metBy).toBe('frozen')
  })

  it('marks a tag axis met when the item carries a DESCENDANT of a configured tag', () => {
    // Given 'whole-milk' is a child of 'dairy'
    const nested = [...tags, { id: 'whole-milk', name: 'Whole Milk', typeId: 'tt-cat', parentId: 'dairy' }]
    const axes = deriveFilterAxes(
      item({ tagIds: ['whole-milk'] }),
      { tagIds: ['dairy'] },
      nested,
      tagTypes,
      vendors,
      recipes,
    )
    // metBy names the CONFIGURED id, not the descendant the item actually carries —
    // the configured id is what a write would have to add, and it is already implied.
    expect(axes[0]?.metBy).toBe('dairy')
  })

  it('leaves a tag axis unmet when the item carries a tag of the same type but not a configured one', () => {
    const axes = deriveFilterAxes(
      item({ tagIds: ['fridge'] }),
      { tagIds: ['dairy', 'frozen'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes[0]?.metBy).toBeUndefined()
  })

  it('drops dangling ids from a vendor axis but keeps the resolvable ones', () => {
    const axes = deriveFilterAxes(item(), { vendorIds: ['gone', 'v1'] }, tags, tagTypes, vendors, recipes)
    expect(axes[0]?.options).toEqual([{ id: 'v1', name: 'Costco' }])
  })

  it('marks the vendor axis met when the item already carries a configured vendor', () => {
    const axes = deriveFilterAxes(item({ vendorIds: ['v2'] }), { vendorIds: ['v1', 'v2'] }, tags, tagTypes, vendors, recipes)
    expect(axes[0]?.metBy).toBe('v2')
  })

  it('marks the recipe axis met when a configured recipe already holds the item', () => {
    const held = [{ id: 'r1', name: 'Pancakes', items: [{ itemId: 'i1' }] }]
    const axes = deriveFilterAxes(item(), { recipeIds: ['r1'] }, tags, tagTypes, vendors, held)
    expect(axes[0]?.metBy).toBe('r1')
  })

  it('returns axes in tag → vendor → recipe order', () => {
    const axes = deriveFilterAxes(
      item(),
      { tagIds: ['dairy'], vendorIds: ['v1'], recipeIds: ['r1'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes.map((a) => a.kind)).toEqual(['tag', 'vendor', 'recipe'])
  })

  it('returns no axes for an empty config', () => {
    expect(deriveFilterAxes(item(), {}, tags, tagTypes, vendors, recipes)).toEqual([])
  })

  it('agrees with matchesFilterConfig: every axis met ⇔ the item matches', () => {
    // This is the invariant the whole feature rests on. If it can drift, a press can
    // report success while leaving the row exactly where it was.
    const config = { tagIds: ['dairy'], vendorIds: ['v1'] }
    const matching = item({ tagIds: ['dairy'], vendorIds: ['v1'] })
    const axes = deriveFilterAxes(matching, config, tags, tagTypes, vendors, recipes)
    expect(axes.every((a) => a.metBy !== undefined)).toBe(true)
    expect(matchesFilterConfig(matching, config, recipes, tags)).toBe(true)
  })
})
```

Import `TagColor` from `@/types` for the `tagTypes` fixture, and `matchesFilterConfig` is
already in scope in that test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `(cd apps/web && pnpm vitest run src/lib/shelfUtils.test.ts)`
Expected: FAIL — `isFilterConfigSatisfiable is not a function` / `deriveFilterAxes is not a function`.

- [ ] **Step 3: Implement both functions**

Append to `apps/web/src/lib/shelfUtils.ts`:

```ts
/**
 * Whether ANY item could be made to match this config by adding tags/vendors/recipes.
 *
 * Item-independent on purpose — it is a property of the SHELF, so `ShelfDetailView`
 * decides once per shelf whether the tail's bucket 2 gets an actionable `groupAction`
 * or keeps the inert `groupNote`. `ItemSearchTail`'s `groupAction` is one descriptor for
 * the whole section, so a per-row fallback was never available.
 *
 * An axis is unsatisfiable when every id on it points at a deleted entity. We will not
 * write a dangling vendorId onto an item merely to satisfy `matchesFilterConfig`'s
 * `includes` check, and a deleted recipe has no row to append to.
 *
 * TAG axes are never unsatisfiable: `matchesFilterConfig` resolves each configured tag id
 * through `tags.find` and skips the misses, so an all-dangling tag axis creates no entry
 * in `tagIdsByType` and is not a constraint at all.
 */
export function isFilterConfigSatisfiable(
  filterConfig: FilterConfig,
  vendors: { id: string }[],
  recipes: { id: string }[],
): boolean {
  const vendorIds = filterConfig.vendorIds ?? []
  const recipeIds = filterConfig.recipeIds ?? []

  if (vendorIds.length > 0 && !vendorIds.some((id) => vendors.some((v) => v.id === id))) {
    return false
  }
  if (recipeIds.length > 0 && !recipeIds.some((id) => recipes.some((r) => r.id === id))) {
    return false
  }
  return true
}

/**
 * Breaks a shelf's `filterConfig` into the axes a press must satisfy for one item.
 *
 * `matchesFilterConfig` ANDs across tags/vendors/recipes and ANDs BETWEEN tag types
 * (OR only WITHIN a type), so one axis per tag type is exactly the granularity at which
 * a user choice is meaningful — and exactly the granularity at which skipping one leaves
 * the item still not matching.
 *
 * Axes carrying `metBy` are already satisfied and MUST NOT be written: adding a second
 * tag of a type the item is already tagged with over-assigns, which is the failure mode
 * the design rejected auto-apply-all for.
 *
 * The met checks mirror `matchesFilterConfig` clause for clause — including descendant
 * expansion on tags — because "every axis met" must mean exactly "the item matches".
 * `shelfUtils.test.ts` pins that equivalence directly.
 */
export function deriveFilterAxes(
  item: Item,
  filterConfig: FilterConfig,
  tags: Tag[],
  tagTypes: TagType[],
  vendors: { id: string; name: string }[],
  recipes: { id: string; name: string; items: { itemId: string }[] }[],
): FilterAxis[] {
  const { tagIds = [], vendorIds = [], recipeIds = [] } = filterConfig
  const safeTagIds = tagIds ?? []
  const safeVendorIds = vendorIds ?? []
  const safeRecipeIds = recipeIds ?? []
  const axes: FilterAxis[] = []

  // Tags — one axis per TYPE, in first-appearance order of the configured ids.
  const tagIdsByType = new Map<string, string[]>()
  for (const tagId of safeTagIds) {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) continue
    tagIdsByType.set(tag.typeId, [...(tagIdsByType.get(tag.typeId) ?? []), tagId])
  }
  for (const [typeId, typeTagIds] of tagIdsByType) {
    const metBy = typeTagIds.find((id) =>
      getTagAndDescendantIds(id, tags).some((expanded) => item.tagIds.includes(expanded)),
    )
    axes.push({
      key: typeId,
      kind: 'tag',
      typeName: tagTypes.find((tt) => tt.id === typeId)?.name ?? '',
      options: typeTagIds.map((id) => ({
        id,
        name: tags.find((t) => t.id === id)?.name ?? '',
      })),
      ...(metBy ? { metBy } : {}),
    })
  }

  if (safeVendorIds.length > 0) {
    // The met check uses EVERY configured id (mirroring matchesFilterConfig), while the
    // options offer only resolvable vendors — we read a dangling id as satisfying, but
    // never write one.
    const metBy = safeVendorIds.find((id) => (item.vendorIds ?? []).includes(id))
    axes.push({
      key: 'vendor',
      kind: 'vendor',
      options: safeVendorIds.flatMap((id) => {
        const vendor = vendors.find((v) => v.id === id)
        return vendor ? [{ id, name: vendor.name }] : []
      }),
      ...(metBy ? { metBy } : {}),
    })
  }

  if (safeRecipeIds.length > 0) {
    const metBy = safeRecipeIds.find((id) =>
      recipes.find((r) => r.id === id)?.items.some((ri) => ri.itemId === item.id),
    )
    axes.push({
      key: 'recipe',
      kind: 'recipe',
      options: safeRecipeIds.flatMap((id) => {
        const recipe = recipes.find((r) => r.id === id)
        return recipe ? [{ id, name: recipe.name }] : []
      }),
      ...(metBy ? { metBy } : {}),
    })
  }

  return axes
}
```

Add `TagType` to the existing `import type { FilterConfig, Item, Tag } from '@/types'` line.

Note the `...(metBy ? { metBy } : {})` spreads: `exactOptionalPropertyTypes` is on, so
`metBy: undefined` is not assignable to `metBy?: string`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `(cd apps/web && pnpm vitest run src/lib/shelfUtils.test.ts)`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Run each, confirm RED, then restore:

| Mutation | Test that must redden |
|---|---|
| Drop the `getTagAndDescendantIds` expansion — compare `item.tagIds.includes(id)` directly | "marks a tag axis met when the item carries a DESCENDANT" |
| Return `true` unconditionally from `isFilterConfigSatisfiable` | "is false when every vendor id points at a deleted vendor" |
| Keep dangling ids in `options` (drop the `flatMap` filter, use `map`) | "drops dangling ids from a vendor axis" |
| Group tag axes by tag id instead of `typeId` | "returns one axis per tag TYPE" |

Report the results. If any stays green, the fixture cannot distinguish the behaviour — fix
the fixture, not the assertion.

- [ ] **Step 6: Verification gate + commit**

```bash
(cd apps/web && pnpm lint) && pnpm build 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm check) && pnpm test
git add apps/web/src/lib/shelfUtils.ts apps/web/src/lib/shelfUtils.test.ts
git commit -m "feat(shelf): derive per-axis filter picks from a shelf's filterConfig"
```

---

## Task 2: `applyShelfFilterPicksBatch`

**Files:**
- Modify: `apps/web/src/db/operations.ts`
- Test: `apps/web/src/db/operations.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (the op takes plain ids).
- Produces:

```ts
export interface ShelfFilterPicksInput {
  itemId: string
  /** Tag ids to ADD — one per unmet tag axis. May be empty. */
  addTagIds: string[]
  /** Vendor ids to ADD — at most one, from the unmet vendor axis. May be empty. */
  addVendorIds: string[]
  /** The recipe to add the item to, when the recipe axis was unmet. */
  addRecipeId?: string
}

export async function applyShelfFilterPicksBatch(
  input: ShelfFilterPicksInput,
): Promise<void>
```

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/db/operations.test.ts`, following that file's existing setup helpers.

```ts
describe('applyShelfFilterPicksBatch', () => {
  it('user can apply tag, vendor and recipe picks in one press', async () => {
    // Given an item carrying neither the tag nor the vendor, and a recipe without it
    const item = await createItem({
      name: 'Oat Milk', tagIds: [], vendorIds: [], targetUnit: 'package',
      targetQuantity: 0, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0,
    })
    const recipe = await createRecipe({ name: 'Pancakes', items: [] })

    // When the picks are applied
    await applyShelfFilterPicksBatch({
      itemId: item.id,
      addTagIds: ['frozen'],
      addVendorIds: ['v1'],
      addRecipeId: recipe.id,
    })

    // Then all three land
    const saved = await db.items.get(item.id)
    expect(saved?.tagIds).toContain('frozen')
    expect(saved?.vendorIds).toContain('v1')
    const savedRecipe = await db.recipes.get(recipe.id)
    expect(savedRecipe?.items.map((ri) => ri.itemId)).toContain(item.id)
  })

  it('rolls back the item write when the recipe write fails', async () => {
    // Given an item and a recipe id that does not exist
    const item = await createItem({
      name: 'Oat Milk', tagIds: [], vendorIds: [], targetUnit: 'package',
      targetQuantity: 0, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0,
    })

    // When the recipe half of the batch throws
    await expect(
      applyShelfFilterPicksBatch({
        itemId: item.id,
        addTagIds: ['frozen'],
        addVendorIds: [],
        addRecipeId: 'no-such-recipe',
      }),
    ).rejects.toThrow()

    // Then the tag write is rolled back too — the whole press either lands or does not.
    // This is the assertion the Dexie transaction exists for; a sequential
    // implementation leaves 'frozen' on the item and passes everything else.
    const saved = await db.items.get(item.id)
    expect(saved?.tagIds).not.toContain('frozen')
  })

  it('does not duplicate ids that are already present', async () => {
    // Given an item that already carries the tag and vendor, in a recipe that already
    // holds it — the shape two quick presses produce
    const item = await createItem({
      name: 'Oat Milk', tagIds: ['frozen'], vendorIds: ['v1'], targetUnit: 'package',
      targetQuantity: 0, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0,
    })
    const recipe = await createRecipe({
      name: 'Pancakes', items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    // When the same picks are applied again
    await applyShelfFilterPicksBatch({
      itemId: item.id, addTagIds: ['frozen'], addVendorIds: ['v1'], addRecipeId: recipe.id,
    })

    // Then nothing is duplicated and the existing recipe amount is untouched
    const saved = await db.items.get(item.id)
    expect(saved?.tagIds).toEqual(['frozen'])
    expect(saved?.vendorIds).toEqual(['v1'])
    const savedRecipe = await db.recipes.get(recipe.id)
    expect(savedRecipe?.items).toEqual([{ itemId: item.id, defaultAmount: 2 }])
  })

  it("uses the item's consumeAmount as the recipe entry's defaultAmount", async () => {
    const item = await createItem({
      name: 'Flour', tagIds: [], vendorIds: [], targetUnit: 'package', consumeAmount: 3,
      targetQuantity: 0, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0,
    })
    const recipe = await createRecipe({ name: 'Pancakes', items: [] })

    await applyShelfFilterPicksBatch({
      itemId: item.id, addTagIds: [], addVendorIds: [], addRecipeId: recipe.id,
    })

    const savedRecipe = await db.recipes.get(recipe.id)
    expect(savedRecipe?.items[0]?.defaultAmount).toBe(3)
  })

  it('falls back to defaultAmount 1 when consumeAmount is 0', async () => {
    // `|| 1`, not `?? 1`: defaultAmount 0 means "optional, unchecked" in cooking, so a
    // 0 consumeAmount would add an ingredient that silently does nothing.
    const item = await createItem({
      name: 'Salt', tagIds: [], vendorIds: [], targetUnit: 'package', consumeAmount: 0,
      targetQuantity: 0, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0,
    })
    const recipe = await createRecipe({ name: 'Pancakes', items: [] })

    await applyShelfFilterPicksBatch({
      itemId: item.id, addTagIds: [], addVendorIds: [], addRecipeId: recipe.id,
    })

    const savedRecipe = await db.recipes.get(recipe.id)
    expect(savedRecipe?.items[0]?.defaultAmount).toBe(1)
  })
})
```

Check the existing `operations.test.ts` for how it imports `db`, `createItem` and
`createRecipe` and match it — do not invent a different setup.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `(cd apps/web && pnpm vitest run src/db/operations.test.ts -t applyShelfFilterPicksBatch)`
Expected: FAIL — `applyShelfFilterPicksBatch is not a function`.

- [ ] **Step 3: Implement**

Add to `apps/web/src/db/operations.ts`, next to `applyUnitSwitchBatch`:

```ts
export interface ShelfFilterPicksInput {
  itemId: string
  addTagIds: string[]
  addVendorIds: string[]
  addRecipeId?: string
}

/**
 * Applies a filter shelf's picks as ONE transaction: the item's tag/vendor ids and the
 * recipe's membership either both land or neither does.
 *
 * Modelled on `applyUnitSwitchBatch` above, with one deliberate difference: the current
 * rows are read INSIDE the transaction rather than passed in by the caller. The caller's
 * copies come from a React render closure, and two quick presses against a stale closure
 * would append a duplicate id — reading here makes the write idempotent regardless.
 *
 * `[db.items, db.recipes]` only: the picker writes `Item.tagIds` / `Item.vendorIds`,
 * which are GLOBAL Item fields, and `Recipe.items`. No `ItemStock` is involved, so
 * unlike `applyUnitSwitchBatch` this transaction does not name `db.itemStocks`.
 *
 * The CLOUD path does not go through here — it does two sequential Apollo round-trips
 * (`useApplyShelfFilterPicks`), so a cloud half-write is possible. PR D-1 closes that
 * with a `prisma.$transaction` resolver.
 */
export async function applyShelfFilterPicksBatch(
  input: ShelfFilterPicksInput,
): Promise<void> {
  const now = new Date()
  await db.transaction('rw', [db.items, db.recipes], async () => {
    const item = await db.items.get(input.itemId)
    if (!item) throw new Error(`Item not found: ${input.itemId}`)

    // Union, not concat — re-pressing must not duplicate an id.
    const tagIds = [...new Set([...item.tagIds, ...input.addTagIds])]
    const vendorIds = [...new Set([...(item.vendorIds ?? []), ...input.addVendorIds])]
    await writeItemUpdate(input.itemId, { tagIds, vendorIds }, DEFAULT_LOCATION_ID, now)

    if (input.addRecipeId) {
      const recipe = await db.recipes.get(input.addRecipeId)
      if (!recipe) throw new Error(`Recipe not found: ${input.addRecipeId}`)
      if (!recipe.items.some((ri) => ri.itemId === input.itemId)) {
        await db.recipes.update(input.addRecipeId, {
          items: [
            ...recipe.items,
            // `|| 1`, NOT `?? 1`: consumeAmount 0 is legitimate, and defaultAmount 0
            // means "optional, unchecked" in cooking — same operator and rationale as
            // RecipeDetailView.tsx:182.
            { itemId: input.itemId, defaultAmount: item.consumeAmount || 1 },
          ],
          updatedAt: now,
        })
      }
    }
  })
}
```

`writeItemUpdate`'s `locationId` argument is unused on this path — neither `tagIds` nor
`vendorIds` is a `StockFields` key, so its stock branch never fires. `DEFAULT_LOCATION_ID`
is passed only to satisfy the signature; **do not** pass an active location here and imply
this write is location-scoped, because it is not.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `(cd apps/web && pnpm vitest run src/db/operations.test.ts -t applyShelfFilterPicksBatch)`
Expected: PASS (5 tests).

- [ ] **Step 5: Mutation-check**

| Mutation | Test that must redden |
|---|---|
| Replace the `db.transaction` wrapper with two plain sequential `await`s | "rolls back the item write when the recipe write fails" |
| `[...item.tagIds, ...input.addTagIds]` without the `new Set` | "does not duplicate ids that are already present" |
| `?? 1` instead of `|| 1` | "falls back to defaultAmount 1 when consumeAmount is 0" |
| Drop the `recipe.items.some(...)` guard | "does not duplicate ids" (the recipe assertion) |

Report each result.

- [ ] **Step 6: Verification gate + commit**

```bash
(cd apps/web && pnpm lint) && pnpm build 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm check) && pnpm test
git add apps/web/src/db/operations.ts apps/web/src/db/operations.test.ts
git commit -m "feat(shelf): apply filter-shelf picks in one Dexie transaction"
```

---

## Task 3: `useApplyShelfFilterPicks`

**Files:**
- Create: `apps/web/src/hooks/useApplyShelfFilterPicks.ts`
- Create: `apps/web/src/hooks/useApplyShelfFilterPicks.test.tsx`
- Modify: `apps/web/src/hooks/index.ts` (re-export, matching how `useShowStock` is re-exported)

**Interfaces:**
- Consumes: `applyShelfFilterPicksBatch` + `ShelfFilterPicksInput` (Task 2), `useUpdateItem`
  from `./useItems`, `useUpdateRecipe` from `./useRecipes`, `useDataMode` from `./useDataMode`.
- Produces:

```ts
export interface ApplyShelfFilterPicksVars {
  /** The item being added. Cloud merges from its arrays; local re-reads the row instead. */
  item: PantryItem
  addTagIds: string[]
  addVendorIds: string[]
  /** Current recipe row, when the recipe axis was unmet. Cloud needs `items` to merge. */
  recipe?: { id: string; items: RecipeItem[] }
}

export function useApplyShelfFilterPicks(): {
  mutateAsync: (vars: ApplyShelfFilterPicksVars) => Promise<void>
  isPending: boolean
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useApplyShelfFilterPicks.test.tsx`. The one behaviour worth a
guard is the **returned invalidation** — `useUpdateItem` and `useAddItemToLocation` shipped
without one and `hooks/CLAUDE.md` records that gap; do not repeat it here.

Model the test on `ShelfDetailView.test.tsx`'s existing gate technique described in
`hooks/CLAUDE.md`: hold the refetch open behind a `vi.mock` gate on the `queryFn`
(`getAllItems`), call `mutateAsync`, and assert the promise has **not** resolved while the
gate is closed.

```ts
it('mutateAsync resolves only after the invalidated queries refetch', async () => {
  // Given a gate held closed on getAllItems (the queryFn behind ['items'])
  let releaseRefetch: () => void = () => {}
  const gate = new Promise<void>((resolve) => { releaseRefetch = resolve })
  vi.mocked(getAllItems).mockImplementation(async () => { await gate; return [] })

  // When the picks are applied
  const { result } = renderHook(() => useApplyShelfFilterPicks(), { wrapper })
  let settled = false
  const pending = result.current
    .mutateAsync({ item, addTagIds: ['frozen'], addVendorIds: [] })
    .then(() => { settled = true })

  // Then it has NOT resolved while the refetch is still in flight
  await Promise.resolve()
  expect(settled).toBe(false)

  // And it resolves once the refetch lands
  releaseRefetch()
  await pending
  expect(settled).toBe(true)
})
```

Fill in the `wrapper` (a `QueryClientProvider`) and the `getAllItems` mock to match the
conventions already used in `apps/web/src/hooks/useItems.test.tsx`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `(cd apps/web && pnpm vitest run src/hooks/useApplyShelfFilterPicks.test.tsx)`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { applyShelfFilterPicksBatch } from '@/db/operations'
import type { PantryItem, RecipeItem } from '@/types'
import { useDataMode } from './useDataMode'
import { useUpdateItem } from './useItems'
import { useUpdateRecipe } from './useRecipes'

export interface ApplyShelfFilterPicksVars {
  item: PantryItem
  addTagIds: string[]
  addVendorIds: string[]
  recipe?: { id: string; items: RecipeItem[] }
}

/**
 * Applies a filter shelf's per-axis picks to one item.
 *
 * LOCAL is atomic — one Dexie transaction over `[db.items, db.recipes]`
 * (`applyShelfFilterPicksBatch`), which also re-reads both rows inside the transaction,
 * so `vars.item` / `vars.recipe` are ignored on this path.
 *
 * CLOUD is NOT atomic: Apollo has no client-side transaction, so it does two sequential
 * round-trips and the second can fail alone. This is the same asymmetry `useApplyUnitSwitch`
 * already ships (which throws in cloud; here we degrade rather than refuse, because a
 * filter shelf's tags/vendors/recipes all exist in cloud and withholding the feature would
 * be gratuitous). A cloud half-write is benign and self-healing — nothing WRONG is
 * persisted, only something incomplete, and the dialog recomputes which axes are met so a
 * retry writes only what is still missing. PR D-1 replaces this branch with a single
 * `prisma.$transaction` resolver — see
 * `docs/features/items/2026-08-28-unified-item-search-plan-d1-cloud-transaction.md`.
 *
 * The local `onSuccess` RETURNS its invalidations, so `mutateAsync` resolves only once
 * both refetches have landed — see the "Awaited invalidation" paragraph in
 * `hooks/CLAUDE.md`. Two keys, not four: invalidation matches by PREFIX, so `['items']`
 * covers `useItems` and `useStockedItems` alike and `['recipes']` covers `['recipes', id]`.
 */
export function useApplyShelfFilterPicks() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const updateItem = useUpdateItem()
  const updateRecipe = useUpdateRecipe()

  const localMutation = useMutation({
    mutationFn: async (vars: ApplyShelfFilterPicksVars) => {
      await applyShelfFilterPicksBatch({
        itemId: vars.item.id,
        addTagIds: vars.addTagIds,
        addVendorIds: vars.addVendorIds,
        ...(vars.recipe ? { addRecipeId: vars.recipe.id } : {}),
      })
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
      ]),
  })

  if (mode === 'cloud') {
    return {
      mutateAsync: async (vars: ApplyShelfFilterPicksVars) => {
        if (vars.addTagIds.length > 0 || vars.addVendorIds.length > 0) {
          await updateItem.mutateAsync({
            id: vars.item.id,
            updates: {
              tagIds: [...new Set([...vars.item.tagIds, ...vars.addTagIds])],
              vendorIds: [
                ...new Set([...(vars.item.vendorIds ?? []), ...vars.addVendorIds]),
              ],
            },
          })
        }
        if (vars.recipe && !vars.recipe.items.some((ri) => ri.itemId === vars.item.id)) {
          await updateRecipe.mutateAsync({
            id: vars.recipe.id,
            updates: {
              items: [
                ...vars.recipe.items,
                // `|| 1`, not `?? 1` — see applyShelfFilterPicksBatch.
                { itemId: vars.item.id, defaultAmount: vars.item.consumeAmount || 1 },
              ],
            },
          })
        }
      },
      isPending: updateItem.isPending || updateRecipe.isPending,
    }
  }

  return localMutation
}
```

Then add `export * from './useApplyShelfFilterPicks'` to `apps/web/src/hooks/index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `(cd apps/web && pnpm vitest run src/hooks/useApplyShelfFilterPicks.test.tsx)`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Drop the `return` in front of `Promise.all` in `onSuccess` (make it a statement body that
returns nothing). The "resolves only after the refetch" test must go RED. If it stays green
the test is timing-blind and is not pinning the behaviour — the whole point of this test is
that `useUpdateItem` and `useAddItemToLocation` have no such guard today.

- [ ] **Step 6: Verification gate + commit**

```bash
(cd apps/web && pnpm lint) && pnpm build 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm check) && pnpm test
git add apps/web/src/hooks/useApplyShelfFilterPicks.ts apps/web/src/hooks/useApplyShelfFilterPicks.test.tsx apps/web/src/hooks/index.ts
git commit -m "feat(shelf): add useApplyShelfFilterPicks dual-mode mutation hook"
```

---

## Task 4: `ShelfFilterPicksDialog` + i18n

**Files:**
- Create: `apps/web/src/components/shelf/ShelfFilterPicksDialog/ShelfFilterPicksDialog.tsx`
- Create: `apps/web/src/components/shelf/ShelfFilterPicksDialog/index.ts`
- Create: `apps/web/src/components/shelf/ShelfFilterPicksDialog/ShelfFilterPicksDialog.stories.tsx`
- Create: `apps/web/src/components/shelf/ShelfFilterPicksDialog/ShelfFilterPicksDialog.stories.test.tsx`
- Create: `apps/web/src/components/shelf/ShelfFilterPicksDialog/ShelfFilterPicksDialog.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`, `apps/web/src/i18n/locales/tw.json`

**Interfaces:**
- Consumes: `FilterAxis` from `@/lib/shelfUtils` (Task 1).
- Produces:

```ts
export interface FilterPicks {
  /** One chosen tag id per unmet tag axis. */
  tagIds: string[]
  /** The chosen vendor id, when the vendor axis was unmet. */
  vendorId?: string
  /** The chosen recipe id, when the recipe axis was unmet. */
  recipeId?: string
}

export interface ShelfFilterPicksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Name of the item being added — used in the title only. */
  itemName: string
  /** Name of the filter shelf being joined — used in the title only. */
  shelfName: string
  /** From `deriveFilterAxes`. Axes carrying `metBy` render read-only. */
  axes: FilterAxis[]
  /** Rejects to surface an inline error and keep the dialog open. */
  onConfirm: (picks: FilterPicks) => Promise<void>
}
```

- [ ] **Step 1: Add the i18n keys**

In `en.json`, inside `items.searchTail` (after `notMatchingShelf`):

```json
"filterPicks": {
  "title": "Add {{name}} to {{shelf}}",
  "vendorAxis": "Vendor",
  "recipeAxis": "Recipe",
  "met": "Already set: {{name}}",
  "error": "Couldn't add to this shelf. Try again.",
  "confirm": "Add",
  "cancel": "Cancel"
}
```

In `tw.json`, the same block at the same position:

```json
"filterPicks": {
  "title": "將「{{name}}」加入「{{shelf}}」",
  "vendorAxis": "商家",
  "recipeAxis": "食譜",
  "met": "已符合：{{name}}",
  "error": "無法加入此層架，請再試一次。",
  "confirm": "加入",
  "cancel": "取消"
}
```

`i18n/locales/locales.test.ts` enforces key parity between the two files — run it and
confirm it passes before moving on.

- [ ] **Step 2: Write the failing component tests**

Create `ShelfFilterPicksDialog.test.tsx`:

```tsx
const tagAxis: FilterAxis = {
  key: 'tt-cat', kind: 'tag', typeName: 'Category',
  options: [{ id: 'dairy', name: 'Dairy' }, { id: 'frozen', name: 'Frozen' }],
}
const metAxis: FilterAxis = {
  key: 'tt-sto', kind: 'tag', typeName: 'Storage',
  options: [{ id: 'fridge', name: 'Fridge' }], metBy: 'fridge',
}
const vendorAxis: FilterAxis = {
  key: 'vendor', kind: 'vendor',
  options: [{ id: 'v1', name: 'Costco' }, { id: 'v2', name: '7-Eleven' }],
}

it('user cannot confirm until every open axis has a pick', async () => {
  // Given two open axes, neither picked
  render(<ShelfFilterPicksDialog open itemName="Oat Milk" shelfName="Dairy"
    axes={[tagAxis, vendorAxis]} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

  // Then Add is disabled
  expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()

  // When only one axis is picked
  await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
  // Then Add is still disabled
  expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()

  // When the second is picked too
  await userEvent.click(screen.getByRole('radio', { name: 'Costco' }))
  // Then Add is enabled
  expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
})

it('pre-selects an axis that offers exactly one option', async () => {
  // Given one open axis with a single option and one with two
  const single: FilterAxis = { key: 'vendor', kind: 'vendor', options: [{ id: 'v1', name: 'Costco' }] }
  render(<ShelfFilterPicksDialog open itemName="Oat Milk" shelfName="Dairy"
    axes={[single]} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

  // Then it is already chosen and Add is immediately available
  expect(screen.getByRole('radio', { name: 'Costco' })).toBeChecked()
  expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
})

it('renders a satisfied axis read-only and never asks about it', () => {
  render(<ShelfFilterPicksDialog open itemName="Oat Milk" shelfName="Dairy"
    axes={[metAxis, tagAxis]} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

  // Then the met axis shows its value but offers no radio
  expect(screen.getByText(/already set: fridge/i)).toBeInTheDocument()
  expect(screen.queryByRole('radio', { name: 'Fridge' })).not.toBeInTheDocument()
})

it('omits a met axis from the confirmed picks', async () => {
  // Given one met axis and one open axis
  const onConfirm = vi.fn().mockResolvedValue(undefined)
  render(<ShelfFilterPicksDialog open itemName="Oat Milk" shelfName="Dairy"
    axes={[metAxis, tagAxis]} onConfirm={onConfirm} onOpenChange={vi.fn()} />)

  // When the open axis is picked and confirmed
  await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
  await userEvent.click(screen.getByRole('button', { name: /add/i }))

  // Then only the open axis's pick is sent — the met one is NOT re-written, which is
  // what stops the item gaining a second Storage tag it already has.
  expect(onConfirm).toHaveBeenCalledWith({ tagIds: ['frozen'] })
})

it('keeps the dialog open and shows an inline error when the write fails', async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
  const onOpenChange = vi.fn()
  render(<ShelfFilterPicksDialog open itemName="Oat Milk" shelfName="Dairy"
    axes={[tagAxis]} onConfirm={onConfirm} onOpenChange={onOpenChange} />)

  await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
  await userEvent.click(screen.getByRole('button', { name: /add/i }))

  // Then the error is shown, the dialog stays open, and Add is usable again
  expect(await screen.findByText(/couldn't add to this shelf/i)).toBeInTheDocument()
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
  expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
})

it('closes on a successful confirm', async () => {
  const onOpenChange = vi.fn()
  render(<ShelfFilterPicksDialog open itemName="Oat Milk" shelfName="Dairy"
    axes={[tagAxis]} onConfirm={vi.fn().mockResolvedValue(undefined)} onOpenChange={onOpenChange} />)

  await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
  await userEvent.click(screen.getByRole('button', { name: /add/i }))

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `(cd apps/web && pnpm vitest run src/components/shelf/ShelfFilterPicksDialog)`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the dialog**

Structure it on `AddShelfDialog.tsx` (same folder) — `Dialog` / `DialogContent` /
`DialogHeader` + `DialogTitle` / `DialogMain className="space-y-4"` / `DialogFooter` with a
`neutral-outline` Cancel and a primary submit carrying `isLoading`.

Requirements the tests above pin, plus:

- **Axis labels:** a tag axis uses `axis.typeName`; vendor uses
  `t('items.searchTail.filterPicks.vendorAxis')`; recipe uses `…recipeAxis`. Wrap each in a
  `<Label>` and give the `RadioGroup` an `aria-labelledby` pointing at it, so a screen
  reader announcing a radio says which axis it belongs to.
- **Name display:** tag and recipe option names get `capitalize`; **vendor option names get
  `normal-case`** (the vendor-name exception in the root `CLAUDE.md`).
- **Pre-selection:** initial picks = every unmet axis whose `options.length === 1`. Reset
  this whenever `open` flips to true or `axes` changes, so reopening on a different row does
  not carry the previous row's picks. Clear the error at the same time.
- **`canConfirm`** = every axis without `metBy` has a pick.
- **The confirmed `FilterPicks` contains only unmet axes' picks.** Build `tagIds` from the
  tag axes in `axes` order; set `vendorId` / `recipeId` only when those axes are unmet.
- **Error copy** is `t('items.searchTail.filterPicks.error')`, rendered under the axes,
  before the footer. Give it `role="alert"` so it is announced.
- An axis whose `options` is empty and which is unmet cannot occur here — `ShelfDetailView`
  refuses to offer the action for such a shelf (Task 5). Do not add UI for it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `(cd apps/web && pnpm vitest run src/components/shelf/ShelfFilterPicksDialog)`
Expected: PASS.

- [ ] **Step 6: Write the stories + smoke tests**

`ShelfFilterPicksDialog.stories.tsx` — four stories with realistic data:
`SingleOpenAxis` (collapses to one radio group), `ThreeOpenAxes` (two tag types + vendor +
recipe), `SomeAlreadyMet` (the mixed read-only/open case), `WriteFailed` (an `onConfirm`
that rejects, so the inline error is visible in Storybook).

`ShelfFilterPicksDialog.stories.test.tsx` — `composeStories` + RTL, asserting a real UI
element per story (the dialog heading, a named radio), never `container.firstChild`.

- [ ] **Step 7: Mutation-check**

| Mutation | Test that must redden |
|---|---|
| Make `canConfirm` always `true` | "cannot confirm until every open axis has a pick" |
| Drop the single-option pre-selection | "pre-selects an axis that offers exactly one option" |
| Include met axes in the built `FilterPicks` | "omits a met axis from the confirmed picks" |
| Call `onOpenChange(false)` in a `finally` instead of only on success | "keeps the dialog open … when the write fails" |

- [ ] **Step 8: Verification gate + commit**

```bash
(cd apps/web && pnpm lint) && pnpm build 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm build-storybook) && (cd apps/web && pnpm check) && pnpm test
git add apps/web/src/components/shelf/ShelfFilterPicksDialog apps/web/src/i18n/locales
git commit -m "feat(shelf): add ShelfFilterPicksDialog for per-axis filter picks"
```

---

## Task 5: Wire it into `ShelfDetailView`

**Files:**
- Modify: `apps/web/src/components/pantry/ShelfDetailView.tsx` (the `groupNote` branch at
  `:272-278`, and the comment block at `:214-218`)
- Test: `apps/web/src/components/pantry/ShelfDetailView.test.tsx`

**Interfaces:**
- Consumes: `deriveFilterAxes` + `isFilterConfigSatisfiable` (Task 1),
  `useApplyShelfFilterPicks` (Task 3), `ShelfFilterPicksDialog` + `FilterPicks` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing route-level tests**

Add to `ShelfDetailView.test.tsx`, following its existing render helper and mocks. **Every
fixture's probe item must be stocked at ANOTHER location** — a bucket-2 row is "stocked here
but absent from this list", so the shelf-membership fixture does the discriminating work,
but any bucket-3 row you add must not be stocked in the active location or the test proves
nothing.

```tsx
it('user can add a searched item to a single-criterion filter shelf in one press', async () => {
  // Given a filter shelf keyed on one tag, and a stocked item lacking that tag
  // (so it is in bucket 2 — stocked here, absent from this shelf's list)
  // When the user searches for it and presses Add to shelf
  // Then no dialog opens and the item gains the tag
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(updateSpy).toHaveBeenCalled())
})

it('user picks one option per axis when the shelf filters on two tag types', async () => {
  // Given a filter shelf with Category(Dairy|Frozen) AND Storage(Fridge|Pantry)
  // When the user presses Add to shelf on a bucket-2 row
  // Then the dialog opens with BOTH axes
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Category')).toBeInTheDocument()
  expect(within(dialog).getByText('Storage')).toBeInTheDocument()

  // And confirming applies both picks
})

it('does not ask about an axis the item already satisfies', async () => {
  // Given the item is already tagged Frozen and the shelf also filters on a vendor
  // When the row's button is pressed
  // Then only the vendor axis is open — Category shows as already set
})

it('keeps the inert note when the shelf filters on a deleted vendor only', async () => {
  // Given a filter shelf whose vendorIds name a vendor that no longer exists
  // Then bucket 2 renders the note, not a button — no press could satisfy that axis
  expect(await screen.findByText(/doesn't match this shelf's filters/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add to shelf/i })).not.toBeInTheDocument()
})
```

Flesh each out against the file's existing fixture helpers — do not invent a new harness.

- [ ] **Step 2: Run to verify they fail**

Run: `(cd apps/web && pnpm vitest run src/components/pantry/ShelfDetailView.test.tsx)`
Expected: FAIL — filter shelves currently render the note, never a button.

- [ ] **Step 3: Implement the wiring**

In `ShelfDetailView.tsx`:

```tsx
const applyPicks = useApplyShelfFilterPicks()
const [picksItem, setPicksItem] = useState<PantryItem | null>(null)

// Whether ANY item could be made to match — an axis naming only deleted entities cannot
// be satisfied by any press, and `groupAction` is one descriptor for the WHOLE section,
// so such a shelf keeps the inert note rather than showing a button that cannot work.
const filterConfig = shelf?.type === 'filter' ? shelf.filterConfig : undefined
const canJoinFilterShelf =
  !!filterConfig && isFilterConfigSatisfiable(filterConfig, vendors, recipes)

const axesFor = (item: PantryItem) =>
  filterConfig
    ? deriveFilterAxes(item, filterConfig, tags, tagTypes, vendors, recipes)
    : []

// Applies the picks the user made (or the ones that needed no choice).
const applyFilterPicks = async (item: PantryItem, picks: FilterPicks) => {
  const recipe = picks.recipeId ? recipes.find((r) => r.id === picks.recipeId) : undefined
  await applyPicks.mutateAsync({
    item,
    addTagIds: picks.tagIds,
    addVendorIds: picks.vendorId ? [picks.vendorId] : [],
    ...(recipe ? { recipe: { id: recipe.id, items: recipe.items } } : {}),
  })
}
```

The `groupAction` replacing the `groupNote` branch:

```tsx
...(shelf?.type === 'filter' && canJoinFilterShelf
  ? {
      groupAction: {
        label: t('items.searchTail.addToShelf'),
        icon: <ArrowUpFromLine />,
        onAction: async (item: PantryItem) => {
          const axes = axesFor(item)
          const open = axes.filter((a) => !a.metBy)
          // Every open axis has exactly one option, so there is nothing to choose:
          // apply straight away and let the row's own spinner carry the wait. This is
          // the design's "the picker collapses to a plain button on the common
          // single-tag-type shelf".
          if (open.every((a) => a.options.length === 1)) {
            await applyFilterPicks(item, {
              tagIds: open.flatMap((a) =>
                a.kind === 'tag' && a.options[0] ? [a.options[0].id] : [],
              ),
              ...(open.find((a) => a.kind === 'vendor')?.options[0]
                ? { vendorId: open.find((a) => a.kind === 'vendor')?.options[0]?.id }
                : {}),
              ...(open.find((a) => a.kind === 'recipe')?.options[0]
                ? { recipeId: open.find((a) => a.kind === 'recipe')?.options[0]?.id }
                : {}),
            })
            return
          }
          // Otherwise hand off to the dialog. The wiring hook clears its pending id when
          // this resolves, which is correct — the dialog is modal and owns the wait from
          // here, including its own pending state and inline error.
          setPicksItem(item)
        },
      },
    }
  : {}),
...(shelf?.type === 'filter' && !canJoinFilterShelf
  ? { groupNote: () => <span>{t('items.searchTail.notMatchingShelf')}</span> }
  : {}),
```

And mount the dialog next to the existing `QuickUpdateDialog`:

```tsx
{picksItem && (
  <ShelfFilterPicksDialog
    open
    onOpenChange={(v) => !v && setPicksItem(null)}
    itemName={picksItem.name}
    shelfName={shelfName}
    axes={axesFor(picksItem)}
    onConfirm={(picks) => applyFilterPicks(picksItem, picks)}
  />
)}
```

**Rewrite the comment block at `:214-218`.** It currently says filter shelves get
`groupNote` and calls itself "PR D's swap point". That is now false. Replace it with what
the code does: filter shelves get a `groupAction` whose press either applies directly or
opens the picker, and the `groupNote` survives only for a shelf with an unsatisfiable axis.
Do not reword around the stale claim — delete it and state the new behaviour.

- [ ] **Step 4: Run to verify they pass**

Run: `(cd apps/web && pnpm vitest run src/components/pantry/ShelfDetailView.test.tsx)`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

| Mutation | Test that must redden |
|---|---|
| Always open the dialog (drop the single-option direct-apply branch) | "in one press" (asserts no dialog) |
| Always apply directly (never `setPicksItem`) | "user picks one option per axis" |
| Make `canJoinFilterShelf` always `true` | "keeps the inert note when the shelf filters on a deleted vendor" |
| Pass all axes to the dialog instead of recomputing `metBy` | "does not ask about an axis the item already satisfies" |

- [ ] **Step 6: Verification gate + commit**

```bash
(cd apps/web && pnpm lint) && pnpm build 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm build-storybook) && (cd apps/web && pnpm check) && pnpm test
git add apps/web/src/components/pantry/ShelfDetailView.tsx apps/web/src/components/pantry/ShelfDetailView.test.tsx
git commit -m "feat(shelf): make filter-shelf search-tail rows actionable via the per-axis picker"
```

---

## Task 6: E2E + documentation

**Files:**
- Modify: `e2e/tests/shelves.spec.ts`
- Modify: `apps/web/src/components/CLAUDE.md`, `apps/web/src/hooks/CLAUDE.md`,
  `apps/web/src/routes/CLAUDE.md`
- Modify: `docs/features/items/2026-08-26-unified-item-search-design.md` (PR D row → shipped)
- Modify: `docs/INDEX.md`

- [ ] **Step 1: Add the E2E test**

In `e2e/tests/shelves.spec.ts`, seed (via `page.evaluate`, resolving on `tx.oncomplete` —
see the root `CLAUDE.md`'s E2E section) a filter shelf on two tag types plus an item lacking
both tags, then: search for the item, press `Add to shelf`, pick one option per axis,
confirm, and assert the row moves into the shelf's own list.

- [ ] **Step 2: Run the E2E slice**

```bash
pnpm test:e2e --grep "shelves|vendors-group|recipes-group|items|a11y"
```

The spec list is derived from **file names**, not route names — `shelves.spec.ts`,
`vendors-group.spec.ts` and `recipes-group.spec.ts` all cover the pantry page. Expect the 4
known #257 colour-contrast failures on shelves / vendor-group / recipe-group and **no
others**. Any new failure is a hard stop.

- [ ] **Step 3: Update the three CLAUDE.md files**

- `components/CLAUDE.md` — add `ShelfFilterPicksDialog` under "Shelf Components"; update the
  `ItemSearchTail` paragraph's closing line, which currently ends "Still outstanding: the
  filter-shelf per-axis picker … — PR D". It is no longer outstanding. Update the
  `ShelfDetailView` entry's `groupAction`/`groupNote` description.
- `hooks/CLAUDE.md` — add `useApplyShelfFilterPicks`, and **add it to the "Awaited
  invalidation" paragraph's guarded list** (it is guarded, unlike `useUpdateItem` and
  `useAddItemToLocation`; that paragraph explicitly warns against reading it as covering
  hooks it does not).
- `routes/CLAUDE.md` — the table row at `:96` describes the filter-shelf `groupNote` and
  says "PR D adds a per-axis picker … and swaps this `groupNote` for a `groupAction` once
  the user's picks are in hand". Rewrite it to describe shipped behaviour, including the
  unsatisfiable-axis case where the `groupNote` survives.

- [ ] **Step 4: Update the design doc and INDEX**

In `2026-08-26-unified-item-search-design.md`, change the PR D row in **both** phasing
tables from "not planned"/"not planned yet" to shipped, and update the header paragraph that
says "only PR D … remains". In `docs/INDEX.md`, mark the PR D plan ✅ and add the PR D-1 row
as 🔲 Pending.

- [ ] **Step 5: Commit**

```bash
git add e2e apps/web/src/components/CLAUDE.md apps/web/src/hooks/CLAUDE.md apps/web/src/routes/CLAUDE.md docs
git commit -m "docs(items): record the filter-shelf per-axis picker and add its E2E coverage"
```

---

## Self-review

**Spec coverage.** The design's "Filter shelves" section requires: apply the whole filter
(Task 5's `applyFilterPicks` sends every unmet axis); one pick per tag type (Task 1 groups by
`typeId`); one vendor and one recipe pick (Task 1's two singleton axes); single-option axes
pre-selected (Task 4 Step 4 + Task 5's direct-apply branch); every bucket-2 row actionable
(Task 5) — with the one documented exception the design did not anticipate, the unsatisfiable
axis, which is recorded in the brainstorming log as a session ruling rather than a silent
deviation. "Nothing else about the wiring changes" is enforced as a global constraint.

**Placeholders.** None — every code step carries the actual code or, for the two test files
with an established local harness (`ShelfDetailView.test.tsx`, `useApplyShelfFilterPicks.test.tsx`),
the actual assertions plus an explicit instruction to reuse that file's existing helpers
rather than invent one.

**Type consistency.** `FilterAxis` / `FilterAxisOption` (Task 1) are consumed unchanged by
Tasks 4 and 5. `ShelfFilterPicksInput` (Task 2) is consumed by Task 3.
`ApplyShelfFilterPicksVars` (Task 3) is consumed by Task 5. `FilterPicks` (Task 4) is
produced by the dialog and consumed by Task 5's `applyFilterPicks`. `metBy`, `options`,
`typeName`, `key` and `kind` are spelled identically throughout.

**Known-red baseline.** 4 pre-existing a11y colour-contrast failures (#257) on shelves /
vendor-group / recipe-group. Anything beyond those is this branch's fault.
