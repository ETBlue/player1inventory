# Inactive Items Sort Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Place inactive items at the bottom of all item lists and fix their stock sort to use binary 100%/0% progress instead of always-100%.

**Architecture:**
- Feature 1 (stock sort): In `src/lib/sortUtils.ts`, when sorting by stock, inactive items
  (`targetQuantity === 0 && refillThreshold === 0`) use `qty > 0 ? 1.0 : 0.0` as progress
  instead of the normal `qty / targetQuantity` calculation. Requires importing `isInactive`
  from `@/lib/quantityUtils`.
- Feature 2 (inactive at bottom): Non-assignment pages (shopping) split their sorted arrays into
  active/inactive and render a "N inactive items" count label between them, mirroring the pantry.
  Assignment pages (tags, vendors, recipe items) use a four-bucket split:
  `[assigned-active, assigned-inactive, unassigned-active, unassigned-inactive]` — assignment
  takes priority over active/inactive status, but inactive items sink within each group.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, `isInactive` from
`src/lib/quantityUtils.ts`

---

## Task 1: Fix stock sort for inactive items

**Files:**
- Modify: `src/lib/sortUtils.ts:1` (import) and `src/lib/sortUtils.ts:38-39` (progress lines)
- Test: `src/lib/sortUtils.test.ts`

**Background:** Currently all inactive items get `progress = 1` (100%) in the stock sort because
`targetQuantity === 0` hits the `a.targetQuantity > 0 ? ... : 1` fallback. The fix overrides this
for inactive items to use `qty > 0 ? 1 : 0` instead.

**Step 1: Write failing tests**

Add a new `describe` block at the end of `src/lib/sortUtils.test.ts`:

```typescript
describe('sortItems - stock sort for inactive items', () => {
  const makeInactive = (id: string): Item => ({
    id,
    name: `Item ${id}`,
    tagIds: [],
    targetQuantity: 0,    // isInactive requires both fields = 0
    refillThreshold: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  it('inactive item with qty > 0 sorts after inactive item with qty = 0 in stock asc', () => {
    // Given: two inactive items, one with stock and one without
    const items = [makeInactive('A'), makeInactive('B')]
    const quantities = new Map([
      ['A', 5], // has stock → should be treated as 100%
      ['B', 0], // no stock  → should be treated as 0%
    ])

    // When: sorted by stock ascending (worst first)
    const sorted = sortItems(items, quantities, new Map(), new Map(), 'stock', 'asc')

    // Then: empty (0%) sorts before stocked (100%)
    expect(sorted[0].id).toBe('B') // 0% worst → first in asc
    expect(sorted[1].id).toBe('A') // 100% best → last in asc
  })

  it('inactive item with qty > 0 sorts before inactive item with qty = 0 in stock desc', () => {
    const items = [makeInactive('A'), makeInactive('B')]
    const quantities = new Map([
      ['A', 5], // has stock → 100%
      ['B', 0], // no stock  → 0%
    ])

    // When: sorted by stock descending (best first)
    const sorted = sortItems(items, quantities, new Map(), new Map(), 'stock', 'desc')

    // Then: stocked (100%) sorts before empty (0%)
    expect(sorted[0].id).toBe('A') // 100% best → first in desc
    expect(sorted[1].id).toBe('B') // 0% worst → last in desc
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/lib/sortUtils
```

Expected: 2 new tests FAIL (both A and B currently get progress=1, so they sort equally)

**Step 3: Implement the fix**

In `src/lib/sortUtils.ts`:

1. Change the import on line 1 from:
   ```typescript
   import { getStockStatus } from '@/lib/quantityUtils'
   ```
   to:
   ```typescript
   import { getStockStatus, isInactive } from '@/lib/quantityUtils'
   ```

2. Replace lines 38–39:
   ```typescript
   // Before
   const progressA = a.targetQuantity > 0 ? qtyA / a.targetQuantity : 1
   const progressB = b.targetQuantity > 0 ? qtyB / b.targetQuantity : 1
   ```
   ```typescript
   // After
   const progressA = isInactive(a)
     ? qtyA > 0 ? 1 : 0
     : a.targetQuantity > 0 ? qtyA / a.targetQuantity : 1
   const progressB = isInactive(b)
     ? qtyB > 0 ? 1 : 0
     : b.targetQuantity > 0 ? qtyB / b.targetQuantity : 1
   ```

**Step 4: Run tests**

```bash
pnpm test src/lib/sortUtils
```

Expected: all tests PASS including the 2 new ones

**Step 5: Commit**

```bash
git add src/lib/sortUtils.ts src/lib/sortUtils.test.ts
git commit -m "fix(sort): inactive items use binary 0%/100% progress in stock sort"
```

---

## Task 2: Inactive items at bottom in shopping page

**Files:**
- Modify: `src/routes/shopping.tsx`
- Test: `src/routes/shopping.test.tsx`

**Background:** The shopping page renders two sorted arrays: `cartSectionItems` (in cart) and
`pendingItems` (not in cart). Apply the pantry's active/inactive split to both sections with a
"N inactive items" count label.

**Note:** `isInactive` is already available in this file if it imports from `@/lib/quantityUtils`.
Check the existing imports before adding.

**Step 1: Write failing test**

In `src/routes/shopping.test.tsx`, add a test (look at existing tests for the `renderShoppingPage`
or similar helper pattern):

```typescript
it('user can see inactive items displayed after active items in the pending section', async () => {
  // Given: one active item and one inactive item (targetQuantity=0, refillThreshold=0)
  await createItem({
    name: 'Active Item',
    targetUnit: 'package',
    targetQuantity: 5,
    refillThreshold: 2,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
    vendorIds: [],
  })
  await createItem({
    name: 'Zebra Inactive', // starts with Z so it would sort last alphabetically anyway
    targetUnit: 'package',
    targetQuantity: 0,      // inactive
    refillThreshold: 0,     // inactive
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
    tagIds: [],
    vendorIds: [],
  })
  // Rename to put Zebra before Active alphabetically but still inactive
  await createItem({
    name: 'Aardvark Inactive', // A < Active alphabetically — would sort FIRST without inactive split
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
    tagIds: [],
    vendorIds: [],
  })

  // When: user views shopping page
  renderShoppingPage() // use the existing helper from this test file

  // Then: inactive item count label is shown
  await waitFor(() => {
    expect(screen.getByText(/1 inactive item/i)).toBeInTheDocument()
  })
})
```

> Note: Read `src/routes/shopping.test.tsx` first to find the existing `renderShoppingPage`
> helper (or equivalent) and the import list, then adapt the test to match the file's conventions.
> The key assertion is that the "N inactive items" label appears.

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/shopping
```

Expected: FAIL — no "inactive items" label in the DOM

**Step 3: Implement the split**

In `src/routes/shopping.tsx`:

1. Add `isInactive` to the import from `@/lib/quantityUtils` (or add the import if not present).

2. After `cartSectionItems` and `pendingItems` are computed, add:
   ```typescript
   const activeCartItems = cartSectionItems.filter((item) => !isInactive(item))
   const inactiveCartItems = cartSectionItems.filter((item) => isInactive(item))
   const activePendingItems = pendingItems.filter((item) => !isInactive(item))
   const inactivePendingItems = pendingItems.filter((item) => isInactive(item))
   ```

3. In the JSX, replace `cartSectionItems.map(...)` with:
   ```tsx
   {activeCartItems.map((item) => renderItemCard(item))}
   {inactiveCartItems.length > 0 && (
     <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
       {inactiveCartItems.length} inactive item{inactiveCartItems.length !== 1 ? 's' : ''}
     </div>
   )}
   {inactiveCartItems.map((item) => renderItemCard(item))}
   ```

4. Replace `pendingItems.map(...)` with:
   ```tsx
   {activePendingItems.map((item) => renderItemCard(item))}
   {inactivePendingItems.length > 0 && (
     <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
       {inactivePendingItems.length} inactive item{inactivePendingItems.length !== 1 ? 's' : ''}
     </div>
   )}
   {inactivePendingItems.map((item) => renderItemCard(item))}
   ```

**Step 4: Run tests**

```bash
pnpm test src/routes/shopping
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/shopping.tsx src/routes/shopping.test.tsx
git commit -m "feat(shopping): place inactive items at bottom with count label"
```

---

## Task 3: Four-bucket split in tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx:161-164` (the two-bucket split)
- Test: `src/routes/settings/tags/$id/items.test.tsx`

**Background:** Currently the tag items tab splits into `[assigned, unassigned]`. The new split
is `[assigned-active, assigned-inactive, unassigned-active, unassigned-inactive]`.
"Assignment takes priority" — an assigned inactive item still appears before an unassigned active
item.

**Step 1: Write failing test**

Add to `src/routes/settings/tags/$id/items.test.tsx` inside the `describe` block:

```typescript
it('user can see assigned inactive items before unassigned active items', async () => {
  // Given: tag with items in four buckets
  const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

  // Active assigned (Apple — alphabetically first of all, assigned)
  await makeItem('Apple', [tag.id])

  // Inactive assigned (Milk — assigned, but inactive; M sorts after B alphabetically)
  await createItem({
    name: 'Milk',
    tagIds: [tag.id],
    targetUnit: 'package',
    targetQuantity: 0,      // inactive
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
    vendorIds: [],
  })

  // Active unassigned (Butter — NOT assigned, active; B sorts before M alphabetically)
  await makeItem('Butter')

  // When: user views items tab (default sort: name asc)
  renderItemsTab(tag.id)

  // Then: order should be Apple (assigned-active) → Milk (assigned-inactive) → Butter (unassigned-active)
  // Key: Milk (M) appears BEFORE Butter (B) despite M > B alphabetically
  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: /apple|milk|butter/i })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/apple/i)   // assigned-active, first
    expect(names[1]).toMatch(/milk/i)    // assigned-inactive, before unassigned-active
    expect(names[2]).toMatch(/butter/i)  // unassigned-active, despite B < M alphabetically
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/settings/tags
```

Expected: FAIL — Butter appears before Milk (two-bucket puts all assigned first, but Milk and
Butter are in different buckets and Milk sorts after Butter within the unassigned group)

Wait — actually with the current two-bucket split: Milk (assigned) and Apple (assigned) → top,
then Butter (unassigned) → bottom. So the current order is: Apple, Milk, Butter. That passes!
But we want: Apple, Milk, Butter. So this test might already pass... let me reconsider.

Actually the current two-bucket `filteredItems = [...assigned, ...unassigned]` gives:
- assigned (by name): Apple, Milk
- unassigned (by name): Butter
- Result: Apple, Milk, Butter ✓

This would already pass. Need a different test. Make the inactive assigned item sort alphabetically AFTER the unassigned active item to prove the bucket ordering. Use "Zucchini" as the inactive assigned item (Z > B):

```typescript
it('user can see assigned inactive items before unassigned active items', async () => {
  const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

  // Inactive assigned: Zucchini (Z > B alphabetically, but should appear before Butter)
  await createItem({
    name: 'Zucchini',
    tagIds: [tag.id],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
    vendorIds: [],
  })

  // Active unassigned: Butter (B < Z alphabetically, NOT assigned)
  await makeItem('Butter')

  // When: user views items tab (default sort: name asc)
  renderItemsTab(tag.id)

  // Then: Zucchini (assigned-inactive) appears BEFORE Butter (unassigned-active)
  // Without four-bucket: current two-bucket puts Zucchini first (it's assigned), so this PASSES now.
  // We need a case where INACTIVE moves something DOWN.
  // ...
})
```

Hmm, the two-bucket split already puts all assigned before all unassigned. The four-bucket split
changes the order WITHIN groups (inactive sinks to bottom of each group).

A failing test needs to show an inactive assigned item sinking BELOW an active assigned item.
Current two-bucket: `[assigned-sorted, unassigned-sorted]`. With name-asc, assigned items sort
as Apple (active) then Zucchini (inactive) — which is already alphabetical order. With the
four-bucket: Apple (assigned-active), Zucchini (assigned-inactive) — same order because Z > A.

The key failing scenario: an inactive assigned item (Apple) that would normally sort BEFORE
an active assigned item (Zucchini) — but should sort AFTER it.

```typescript
it('user can see active assigned items before inactive assigned items', async () => {
  const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

  // Active assigned: Zucchini (Z — sorts LAST alphabetically among assigned)
  await makeItem('Zucchini', [tag.id])

  // Inactive assigned: Apple (A — sorts FIRST alphabetically, but should sink below Zucchini)
  await createItem({
    name: 'Apple',
    tagIds: [tag.id],
    targetUnit: 'package',
    targetQuantity: 0,    // inactive
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
    vendorIds: [],
  })

  // When: user views items tab (default sort: name asc)
  renderItemsTab(tag.id)

  // Then: Zucchini (assigned-active) appears BEFORE Apple (assigned-inactive)
  // Without four-bucket: Apple (A) sorts before Zucchini (Z) — both assigned, alphabetical
  // With four-bucket: Zucchini (assigned-active) before Apple (assigned-inactive)
  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: /zucchini|apple/i })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/zucchini/i)  // active → floats above inactive
    expect(names[1]).toMatch(/apple/i)     // inactive → sinks below active
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/settings/tags
```

Expected: FAIL — Apple (A) sorts before Zucchini (Z) with the current two-bucket split

**Step 3: Implement — replace two-bucket with four-bucket**

In `src/routes/settings/tags/$id/items.tsx`, replace lines 161–164:

```typescript
// Before (two-bucket)
const filteredItems = [
  ...sortedItems.filter((item) => isAssigned(item.tagIds)),
  ...sortedItems.filter((item) => !isAssigned(item.tagIds)),
]
```

```typescript
// After (four-bucket: assignment takes priority, inactive sinks within each group)
const filteredItems = [
  ...sortedItems.filter((item) => isAssigned(item.tagIds) && !isInactive(item)),
  ...sortedItems.filter((item) => isAssigned(item.tagIds) && isInactive(item)),
  ...sortedItems.filter((item) => !isAssigned(item.tagIds) && !isInactive(item)),
  ...sortedItems.filter((item) => !isAssigned(item.tagIds) && isInactive(item)),
]
```

Also add `isInactive` to the import from `@/lib/quantityUtils`:
```typescript
import { getCurrentQuantity, isInactive } from '@/lib/quantityUtils'
```

Wait — after Task 6 of the previous plan, `getCurrentQuantity` was removed (moved into
`useItemSortData`). Check the current imports at the top of this file before modifying.
The correct import is: `import { isInactive } from '@/lib/quantityUtils'`

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/tags
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/settings/tags/\$id/items.tsx src/routes/settings/tags/\$id/items.test.tsx
git commit -m "feat(tags): inactive items sink to bottom within assigned/unassigned groups"
```

---

## Task 4: Four-bucket split in vendor items tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx:181-184` (the two-bucket split)
- Test: `src/routes/settings/vendors/$id/items.test.tsx`

**Step 1: Write failing test** (same logic as Task 3, using vendor assignment)

Add to `src/routes/settings/vendors/$id/items.test.tsx`:

```typescript
it('user can see active assigned items before inactive assigned items', async () => {
  // Given: a vendor with one active-assigned and one inactive-assigned item
  const vendor = await createVendor('Supermart')

  // Active assigned: Zucchini (sorts last alphabetically — should float above inactive)
  await makeItem('Zucchini', [vendor.id])

  // Inactive assigned: Apple (sorts first alphabetically — should sink below Zucchini)
  // Use createItem directly since makeItem creates active items
  // Check how createItem is used in this test file for the correct parameter shape
  await createItem({
    name: 'Apple',
    vendorIds: [vendor.id],
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 0,    // inactive
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })

  // When: user views items tab (default sort: name asc)
  renderItemsTab(vendor.id)

  // Then: Zucchini (active) appears before Apple (inactive) despite Z > A alphabetically
  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: /zucchini|apple/i })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/zucchini/i)
    expect(names[1]).toMatch(/apple/i)
  })
})
```

> Read `src/routes/settings/vendors/$id/items.test.tsx` first to confirm the `makeItem` helper
> signature (it may take `vendorIds` as second param) and `createItem` parameter shape. Adapt.

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/settings/vendors
```

Expected: FAIL

**Step 3: Implement**

In `src/routes/settings/vendors/$id/items.tsx`, replace lines 181–184:

```typescript
// After (four-bucket)
const filteredItems = [
  ...sortedItems.filter((item) => isAssigned(item.vendorIds) && !isInactive(item)),
  ...sortedItems.filter((item) => isAssigned(item.vendorIds) && isInactive(item)),
  ...sortedItems.filter((item) => !isAssigned(item.vendorIds) && !isInactive(item)),
  ...sortedItems.filter((item) => !isAssigned(item.vendorIds) && isInactive(item)),
]
```

Add import: `import { isInactive } from '@/lib/quantityUtils'`

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/vendors
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/settings/vendors/\$id/items.tsx src/routes/settings/vendors/\$id/items.test.tsx
git commit -m "feat(vendors): inactive items sink to bottom within assigned/unassigned groups"
```

---

## Task 5: Four-bucket split in recipe items tab

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx:110-130` (the pre-sort split and concat)
- Test: `src/routes/settings/recipes/$id/items.test.tsx`

**Background:** The recipe items tab is different from tags/vendors. It pre-splits into
`assignedItems` / `unassignedItems` BEFORE sorting, then sorts each group separately:
```typescript
const sortedAssigned = sortItems(assignedItems, ...)
const sortedUnassigned = sortItems(unassignedItems, ...)
const filteredItems = [...sortedAssigned, ...sortedUnassigned]
```

The fix: after sorting each group, further split each into active and inactive:
```typescript
const activeAssigned   = sortedAssigned.filter((item) => !isInactive(item))
const inactiveAssigned = sortedAssigned.filter((item) => isInactive(item))
const activeUnassigned   = sortedUnassigned.filter((item) => !isInactive(item))
const inactiveUnassigned = sortedUnassigned.filter((item) => isInactive(item))
const filteredItems = [
  ...activeAssigned,
  ...inactiveAssigned,
  ...activeUnassigned,
  ...inactiveUnassigned,
]
```

**Step 1: Write failing test**

Read `src/routes/settings/recipes/$id/items.test.tsx` first to find the `renderItemsTab` helper
and `makeItem` pattern. Then add:

```typescript
it('user can see active assigned items before inactive assigned items', async () => {
  // Given: a recipe with one active-assigned and one inactive-assigned item
  const recipe = await createRecipe({ name: 'Pasta' }) // use existing helpers

  // Active assigned: Zucchini
  const zucchini = await makeItem('Zucchini')
  await addItemToRecipe(recipe.id, zucchini.id) // or however assignment works for recipes

  // Inactive assigned: Apple (sorts before Zucchini but should sink below it)
  const apple = await createItem({
    name: 'Apple',
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })
  await addItemToRecipe(recipe.id, apple.id)

  // When: user views recipe items tab
  renderItemsTab(recipe.id)

  // Then: Zucchini (active) before Apple (inactive) despite Z > A alphabetically
  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: /zucchini|apple/i })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/zucchini/i)
    expect(names[1]).toMatch(/apple/i)
  })
})
```

> **Important:** Read the existing test file first. Recipe tests may use different helpers (e.g.,
> `createRecipe`, `addItemToRecipe`). Adapt the test to use the actual helpers available.

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/settings/recipes
```

Expected: FAIL

**Step 3: Implement**

In `src/routes/settings/recipes/$id/items.tsx`:

1. Add import: `import { isInactive } from '@/lib/quantityUtils'`

2. Find the `filteredItems` line (currently `const filteredItems = [...sortedAssigned, ...sortedUnassigned]`
   around line 130) and replace:

```typescript
// Before
const filteredItems = [...sortedAssigned, ...sortedUnassigned]
```

```typescript
// After
const filteredItems = [
  ...sortedAssigned.filter((item) => !isInactive(item)),
  ...sortedAssigned.filter((item) => isInactive(item)),
  ...sortedUnassigned.filter((item) => !isInactive(item)),
  ...sortedUnassigned.filter((item) => isInactive(item)),
]
```

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/recipes
```

Expected: PASS

**Step 5: Final full test run**

```bash
pnpm test
```

Expected: all tests pass

**Step 6: Commit**

```bash
git add src/routes/settings/recipes/\$id/items.tsx src/routes/settings/recipes/\$id/items.test.tsx
git commit -m "feat(recipes): inactive items sink to bottom within assigned/unassigned groups"
```

---

## Verification

```bash
pnpm test       # all tests pass
pnpm build      # no TypeScript errors
```

Manual verification:
1. Sort pantry by stock. Create an inactive item (set targetQuantity=0, refillThreshold=0)
   with some quantity — it should appear at the bottom of the inactive section and above inactive
   items with zero quantity.
2. Shopping page: inactive items should appear at the bottom of the pending section with a count label.
3. Tag items tab: active assigned items should appear before inactive assigned items.
4. Vendor items tab: same.
5. Recipe items tab: same.
