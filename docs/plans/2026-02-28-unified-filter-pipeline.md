# Unified Filter Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor all item list pages so search and filters are mutually exclusive branches that converge only at `sortItems`, eliminating inconsistent "filters still apply during search" bugs.

**Architecture:** Each page computes `searchedItems` (name search, no filters) and `filteredItems` (all URL-param filters, no search) independently, then passes `search.trim() ? searchedItems : filteredItems` to `sortItems`. Shopping page has a vendor pre-scope that only applies to the `filteredItems` branch.

**Tech Stack:** React 19, TanStack Query, TanStack Router, Vitest + React Testing Library

---

### Task 1: Pantry page

**Files:**
- Modify: `src/routes/index.tsx:112-181`
- Test: `src/routes/index.test.tsx`

**Step 1: Write the failing test**

Add to `src/routes/index.test.tsx` inside the existing `describe` block. First check what helper functions and imports already exist — replicate their pattern.

```typescript
it('user can search all items even when vendor filter is active', async () => {
  // Given two items and a vendor
  const vendor = await createVendor('Costco')
  await createItem({
    name: 'Milk',
    tagIds: [],
    vendorIds: [vendor.id],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })
  await createItem({
    name: 'Eggs',
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })

  // When user loads pantry with vendor filter active
  const history = createMemoryHistory({
    initialEntries: [`/?f_vendor=${vendor.id}`],
  })
  const router = createRouter({ routeTree, history })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  // And opens search and types "Eggs" (Eggs is not assigned to the vendor)
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
  })
  await user.type(screen.getByPlaceholderText(/search items/i), 'Eggs')

  // Then Eggs appears (vendor filter is bypassed during search)
  await waitFor(() => {
    expect(screen.getByText('Eggs')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/index.test.tsx --reporter=verbose
```

Expected: FAIL — Eggs does not appear because vendor filter still applies during search.

**Step 3: Implement the change**

In `src/routes/index.tsx`, replace lines 112–181:

```typescript
// Branch A: search only (no filters)
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase()),
)

// Branch B: all filters, no search
const tagFiltered = filterItems(items, filterState)
const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
const filteredItems = filterItemsByRecipes(
  vendorFiltered,
  selectedRecipeIds,
  recipes,
)
```

Then update the `sortItems` call:

```typescript
const sortedItems = sortItems(
  search.trim() ? searchedItems : filteredItems,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/routes/index.test.tsx --reporter=verbose
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/routes/index.tsx src/routes/index.test.tsx
git commit -m "fix(pantry): search bypasses all filters independently"
```

---

### Task 2: Shopping page

**Files:**
- Modify: `src/routes/shopping.tsx:44-176`
- Test: `src/routes/shopping.test.tsx`

**Step 1: Write the failing test**

Add to `src/routes/shopping.test.tsx`:

```typescript
it('user can search all items regardless of selected vendor scope', async () => {
  // Given two items and a vendor
  const vendor = await createVendor('Costco')
  await createItem({
    name: 'Milk',
    tagIds: [],
    vendorIds: [vendor.id],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })
  await createItem({
    name: 'Eggs',
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })

  renderShopping()
  const user = userEvent.setup()

  // When user selects Costco vendor scope
  const vendorSelect = await screen.findByRole('combobox')
  await user.click(vendorSelect)
  await user.click(await screen.findByRole('option', { name: /costco/i }))

  // Then only Milk is shown (vendor scope active, Eggs hidden)
  await waitFor(() => {
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(screen.queryByText('Eggs')).not.toBeInTheDocument()
  })

  // When user searches for "Eggs"
  await user.click(screen.getByRole('button', { name: /toggle search/i }))
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
  })
  await user.type(screen.getByPlaceholderText(/search items/i), 'Eggs')

  // Then Eggs appears (search bypasses vendor scope)
  await waitFor(() => {
    expect(screen.getByText('Eggs')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/shopping.test.tsx --reporter=verbose
```

Expected: FAIL — Eggs does not appear because search runs on vendor-scoped items.

**Step 3: Implement the change**

First, add the missing imports to `src/routes/shopping.tsx`:

```typescript
// Add to existing import from '@/hooks':
import { useRecipes } from '@/hooks/useRecipes'
import { filterItemsByRecipes, filterItemsByVendors } from '@/lib/filterUtils'
```

Add `useRecipes` query near the other data queries:

```typescript
const { data: recipes = [] } = useRecipes()
```

Update `useUrlSearchAndFilters` destructure to add `selectedRecipeIds`:

```typescript
const { search, filterState, selectedRecipeIds } = useUrlSearchAndFilters()
```

Replace the filter pipeline (lines ~144–176):

```typescript
// Vendor pre-scope: applies to filter branch only
const vendorScopedItems = selectedVendorId
  ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
  : items

// Branch A: search all items, no vendor scope, no filters
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase()),
)

// Branch B: vendor-scoped, then tag + recipe filters
const tagFiltered = filterItems(vendorScopedItems, filterState)
const filteredItems = filterItemsByRecipes(
  tagFiltered,
  selectedRecipeIds,
  recipes,
)

const displayItems = search.trim() ? searchedItems : filteredItems

// Cart section: apply user sort
const cartSectionItems = sortItems(
  displayItems.filter((item) => cartItemMap.has(item.id)),
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)

// Pending section: apply user sort
const pendingItems = sortItems(
  displayItems.filter((item) => !cartItemMap.has(item.id)),
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
```

Update the `ItemListToolbar` to pass `recipes` (add to existing props):

```typescript
<ItemListToolbar
  ...existing props...
  recipes={recipes}
  items={vendorScopedItems}
/>
```

Note: keep `items={vendorScopedItems}` (not all items) so filter counts in FilterStatus are scoped to the selected vendor.

**Step 4: Run test to verify it passes**

```bash
pnpm test src/routes/shopping.test.tsx --reporter=verbose
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/routes/shopping.tsx src/routes/shopping.test.tsx
git commit -m "fix(shopping): search bypasses vendor scope; add recipe filter support"
```

---

### Task 3: Tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx:149-175`
- Test: `src/routes/settings/tags/$id/items.test.tsx`

**Step 1: Write the failing test**

Add to `src/routes/settings/tags/$id/items.test.tsx`. First skim the existing helpers (vendor, recipe creation) to replicate the pattern.

```typescript
it('user can search all items even when vendor filter is active', async () => {
  // Given a tag, a vendor, and two items
  const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
  const vendor = await createVendor('Costco')
  await createItem({
    name: 'Milk',
    tagIds: [],
    vendorIds: [vendor.id],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })
  await createItem({
    name: 'Eggs',
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })

  // When user loads tag items tab with vendor filter active
  const history = createMemoryHistory({
    initialEntries: [
      `/settings/tags/${tag.id}/items?f_vendor=${vendor.id}`,
    ],
  })
  const router = createRouter({ routeTree, history })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  // And searches for "Eggs" (Eggs not assigned to vendor)
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
  })
  await user.type(screen.getByPlaceholderText(/search items/i), 'Eggs')

  // Then Eggs appears (vendor filter bypassed during search)
  await waitFor(() => {
    expect(screen.getByText('Eggs')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test "src/routes/settings/tags/\$id/items.test.tsx" --reporter=verbose
```

Expected: FAIL.

**Step 3: Implement the change**

In `src/routes/settings/tags/$id/items.tsx`, replace the filter pipeline (lines 149–175):

```typescript
// Branch A: search only
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase()),
)

// Branch B: all filters
const tagFiltered = filterItems(items, filterState)
const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
const recipeFiltered = filterItemsByRecipes(
  vendorFiltered,
  selectedRecipeIds,
  recipes,
)

// Converge at sort
const filteredItems = sortItems(
  search.trim() ? searchedItems : recipeFiltered,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
```

**Step 4: Run test to verify it passes**

```bash
pnpm test "src/routes/settings/tags/\$id/items.test.tsx" --reporter=verbose
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add "src/routes/settings/tags/\$id/items.tsx" "src/routes/settings/tags/\$id/items.test.tsx"
git commit -m "fix(tag-items): search bypasses all filters independently"
```

---

### Task 4: Vendor items tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx:13,165-210`
- Test: `src/routes/settings/vendors/$id/items.test.tsx`

**Step 1: Write the failing test**

Add to `src/routes/settings/vendors/$id/items.test.tsx`:

```typescript
it('user can search all items even when recipe filter is active', async () => {
  // Given a vendor, a recipe, and two items
  const vendor = await createVendor('Costco')
  const recipe = await createRecipe({ name: 'Pasta', items: [] })
  await createItem({
    name: 'Milk',
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })
  await createItem({
    name: 'Eggs',
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 0,
  })
  // Add Milk to recipe but not Eggs
  await db.recipes.update(recipe.id, {
    items: [{ itemId: (await db.items.where('name').equals('Milk').first())!.id, defaultAmount: 1 }],
  })

  // When user loads vendor items tab with recipe filter active
  const history = createMemoryHistory({
    initialEntries: [
      `/settings/vendors/${vendor.id}/items?f_recipe=${recipe.id}`,
    ],
  })
  const router = createRouter({ routeTree, history })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  // And searches for "Eggs" (Eggs not in the recipe)
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
  })
  await user.type(screen.getByPlaceholderText(/search items/i), 'Eggs')

  // Then Eggs appears (recipe filter bypassed during search)
  await waitFor(() => {
    expect(screen.getByText('Eggs')).toBeInTheDocument()
  })
})
```

Note: you'll need to import `createRecipe` and `db` if not already imported.

**Step 2: Run test to verify it fails**

```bash
pnpm test "src/routes/settings/vendors/\$id/items.test.tsx" --reporter=verbose
```

Expected: FAIL.

**Step 3: Implement the change**

In `src/routes/settings/vendors/$id/items.tsx`:

1. Update the `filterUtils` import to add `filterItemsByVendors`:

```typescript
import {
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from '@/lib/filterUtils'
```

2. Replace the filter pipeline (lines 165–191):

```typescript
// Branch A: search only
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase()),
)

// Branch B: all filters
const tagFiltered = filterItems(items, filterState)
const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
const recipeFiltered = filterItemsByRecipes(
  vendorFiltered,
  selectedRecipeIds,
  recipes,
)

// Converge at sort
const filteredItems = sortItems(
  search.trim() ? searchedItems : recipeFiltered,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
```

3. Remove `hideVendorFilter` from the `ItemListToolbar` props:

```typescript
<ItemListToolbar
  sortBy={sortBy}
  sortDirection={sortDirection}
  onSortChange={(field, direction) => {
    setSortBy(field)
    setSortDirection(direction)
  }}
  isTagsToggleEnabled
  items={items}
  vendors={vendors}
  recipes={recipes}
  onCreateFromSearch={handleCreateFromSearch}
  className="bg-transparent border-none"
/>
```

**Step 4: Run test to verify it passes**

```bash
pnpm test "src/routes/settings/vendors/\$id/items.test.tsx" --reporter=verbose
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add "src/routes/settings/vendors/\$id/items.tsx" "src/routes/settings/vendors/\$id/items.test.tsx"
git commit -m "fix(vendor-items): search bypasses all filters; show all filter controls"
```

---

### Task 5: Recipe items tab

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx:131-166,254-268`
- Test: `src/routes/settings/recipes/$id/items.test.tsx`

**Step 1: Write the failing test**

Add to `src/routes/settings/recipes/$id/items.test.tsx`:

```typescript
it('user can search all items even when vendor filter is active', async () => {
  // Given a recipe, a vendor, and two items
  const recipe = await makeRecipe('Pasta')
  const vendor = await createVendor('Costco')
  await createItem({
    name: 'Noodles',
    tagIds: [],
    vendorIds: [vendor.id],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
  })
  await createItem({
    name: 'Butter',
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
  })

  // When user loads recipe items tab with vendor filter active
  const history = createMemoryHistory({
    initialEntries: [
      `/settings/recipes/${recipe.id}/items?f_vendor=${vendor.id}`,
    ],
  })
  const router = createRouter({ routeTree, history })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  // And searches for "Butter" (Butter not assigned to vendor)
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
  })
  await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')

  // Then Butter appears (vendor filter bypassed during search)
  await waitFor(() => {
    expect(screen.getByLabelText('Add Butter')).toBeInTheDocument()
  })
})
```

Note: `createVendor` needs to be added to the imports in this test file.

**Step 2: Run test to verify it fails**

```bash
pnpm test "src/routes/settings/recipes/\$id/items.test.tsx" --reporter=verbose
```

Expected: FAIL.

**Step 3: Implement the change**

In `src/routes/settings/recipes/$id/items.tsx`:

1. Replace the filter pipeline (lines 131–166). The existing assigned-first split moves to work on `displayItems`:

```typescript
// Branch A: search only
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase()),
)

// Branch B: all filters
const tagFiltered = filterItems(items, filterState)
const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
const recipeFiltered = filterItemsByRecipes(
  vendorFiltered,
  selectedRecipeIds,
  allRecipes,
)

const displayItems = search.trim() ? searchedItems : recipeFiltered

// Assigned-first sort
const assignedItems = displayItems.filter((item) => isAssigned(item.id))
const unassignedItems = displayItems.filter((item) => !isAssigned(item.id))

const sortedAssigned = sortItems(
  assignedItems,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
const sortedUnassigned = sortItems(
  unassignedItems,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)

const filteredItems = [...sortedAssigned, ...sortedUnassigned]
```

2. Remove `hideRecipeFilter` from the `ItemListToolbar` props:

```typescript
<ItemListToolbar
  sortBy={sortBy}
  sortDirection={sortDirection}
  onSortChange={(field, direction) => {
    setSortBy(field)
    setSortDirection(direction)
  }}
  isTagsToggleEnabled
  items={items}
  vendors={vendors}
  recipes={allRecipes}
  onCreateFromSearch={handleCreateFromSearch}
  className="bg-transparent border-none"
/>
```

**Step 4: Run test to verify it passes**

```bash
pnpm test "src/routes/settings/recipes/\$id/items.test.tsx" --reporter=verbose
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add "src/routes/settings/recipes/\$id/items.tsx" "src/routes/settings/recipes/\$id/items.test.tsx"
git commit -m "fix(recipe-items): search bypasses all filters; show all filter controls"
```

---

### Task 6: Run full test suite

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS, no regressions.

**Step 2: If any failures, fix them before proceeding**

Common issues to watch for:
- Shopping page: `filteredItems` variable used somewhere that now needs to be `displayItems`
- Tests that assert specific item counts under filter — re-read the test to understand what it's checking

**Step 3: Commit if there were any fixup changes**

```bash
git add -p
git commit -m "fix: resolve test suite regressions from filter pipeline refactor"
```
