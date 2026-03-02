# ItemCard showTags/showExpiration Prop Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace ItemCard's implicit mode-based tag/expiration visibility with explicit `showTags` and `showExpiration` boolean props, then update all call sites accordingly.

**Architecture:** Remove the `!['shopping', 'cooking'].includes(mode)` guard from the three badge sections in `ItemCard`. Add a `showExpiration` prop (default `true`) wrapping the expiration block. Update call sites to pass the appropriate props explicitly. `mode` stays for behavioral logic only (amount controls, ±buttons).

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, TanStack Router

---

### Task 1: Update ItemCard component — showExpiration + remove mode gate

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/components/ItemCard.test.tsx`
- Modify: `src/components/ItemCard.stories.tsx`

**Context:** Currently tags/vendors/recipes are hidden when `['shopping', 'cooking'].includes(mode)` regardless of `showTags`. This task removes that gate (making `showTags` the sole authority) and adds a `showExpiration` prop for the expiration block.

**Step 1: Write the failing tests**

Add to `src/components/ItemCard.test.tsx`. Insert a new `describe` block after the existing `'ItemCard - Cooking mode'` block:

```tsx
describe('ItemCard - showTags and showExpiration props', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['tag-1'],
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const mockTag: Tag = { id: 'tag-1', name: 'Dairy', typeId: 'tt-1' }
  const mockTagType: TagType = {
    id: 'tt-1',
    name: 'Category',
    color: TagColor.teal,
  }

  it('shows tags in shopping mode when showTags is not set (mode no longer gates tags)', async () => {
    // After removing mode gate, tags show by default even in shopping mode
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[mockTag]}
        tagTypes={[mockTagType]}
        mode="shopping"
        // showTags not passed — defaults to true
      />,
    )
    expect(screen.getByTestId('tag-badge-Dairy')).toBeInTheDocument()
  })

  it('hides tags when showTags={false} regardless of mode', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[mockTag]}
        tagTypes={[mockTagType]}
        showTags={false}
      />,
    )
    expect(screen.queryByTestId('tag-badge-Dairy')).not.toBeInTheDocument()
  })

  it('hides expiration when showExpiration={false}', async () => {
    const itemWithExpiry: Item = {
      ...mockItem,
      dueDate: new Date(Date.now() + 10 * 86400000), // 10 days from now
    }
    await renderWithRouter(
      <ItemCard
        item={itemWithExpiry}
        tags={[]}
        tagTypes={[]}
        showExpiration={false}
      />,
    )
    expect(screen.queryByText(/Expires/i)).not.toBeInTheDocument()
  })

  it('shows expiration by default (showExpiration defaults to true)', async () => {
    const itemWithExpiry: Item = {
      ...mockItem,
      dueDate: new Date(Date.now() + 10 * 86400000),
    }
    await renderWithRouter(
      <ItemCard
        item={itemWithExpiry}
        tags={[]}
        tagTypes={[]}
        // showExpiration not passed — defaults to true
      />,
    )
    expect(screen.getByText(/Expires/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: 2 fail — "shows tags in shopping mode" (mode gate still blocks) and "hides expiration when showExpiration={false}" (prop doesn't exist yet). The other 2 may pass already.

**Step 3: Update `src/components/ItemCard.tsx`**

3a. Add `showExpiration` to the props interface (around line 44, after `activeTagIds`):

```ts
activeTagIds?: string[]
showExpiration?: boolean
```

3b. Add `showExpiration = true` to the destructuring (around line 66, after `activeTagIds`):

```ts
activeTagIds,
showExpiration = true,
```

3c. Remove the mode gate from the three badge sections. Find and replace each of the three identical guards:

```tsx
// BEFORE (tags section, ~line 267):
{tags.length > 0 &&
  !['shopping', 'cooking'].includes(mode) &&
  showTags && (

// AFTER:
{tags.length > 0 &&
  showTags && (
```

```tsx
// BEFORE (vendors section, ~line 299):
{vendors.length > 0 &&
  !['shopping', 'cooking'].includes(mode) &&
  showTags && (

// AFTER:
{vendors.length > 0 &&
  showTags && (
```

```tsx
// BEFORE (recipes section, ~line 327):
{recipes.length > 0 &&
  !['shopping', 'cooking'].includes(mode) &&
  showTags && (

// AFTER:
{recipes.length > 0 &&
  showTags && (
```

3d. Wrap the expiration block with `showExpiration`. The expiration block starts at the `{currentQuantity > 0 && estimatedDueDate &&` line inside `<CardContent>`. Add `showExpiration &&` as the first guard:

```tsx
// BEFORE (~line 218):
{currentQuantity > 0 &&
  estimatedDueDate &&
  (() => {

// AFTER:
{showExpiration &&
  currentQuantity > 0 &&
  estimatedDueDate &&
  (() => {
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: all tests pass.

**Step 5: Update Storybook stories**

In `src/components/ItemCard.stories.tsx`, add a `showExpiration` control to the `argTypes` if it exists, or simply ensure any stories that test tag/expiration visibility still make sense. No structural changes needed — the default behavior is preserved.

**Step 6: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx src/components/ItemCard.stories.tsx
git commit -m "feat(item-card): add showExpiration prop, remove mode-based tag gate"
```

---

### Task 2: Update shopping page call site

**Files:**
- Modify: `src/routes/shopping.tsx`

**Context:** Shopping previously relied on `mode="shopping"` to hide tags. That gate is now gone. Shopping also shows expiration, which should be hidden per the design. Need to add both `showTags={false}` and `showExpiration={false}`.

**Step 1: Write the failing test**

In `src/routes/shopping.test.tsx`, add a new test inside the existing shopping test suite. Find an appropriate `describe` block (e.g. near the existing shopping item tests) and add:

```tsx
it('user does not see tags or expiration on shopping page', async () => {
  // Given an item with a tag and an expiration date
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    targetQuantity: 4,
    refillThreshold: 1,
    targetUnit: 'package' as const,
    packedQuantity: 2,
    dueDate: new Date(Date.now() + 5 * 86400000), // 5 days from now
  })
  const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
  await updateItem(item.id, { tagIds: [tag.id] })

  const cart = await getOrCreateActiveCart()
  await addToCart(cart.id, item.id, 1)

  // When rendering the shopping page
  const history = createMemoryHistory({ initialEntries: ['/shopping'] })
  // ... render with router setup matching existing tests in this file

  // Then tags and expiration are not shown
  expect(screen.queryByText('Dairy')).not.toBeInTheDocument()
  expect(screen.queryByText(/Expires/i)).not.toBeInTheDocument()
})
```

> **Note for implementer:** Look at how existing tests in `src/routes/shopping.test.tsx` set up the router and render the page — use the same pattern. Import `createTag`, `createTagType`, `updateItem` from `@/db/operations` and `TagColor` from `@/types` at the top of the test file if not already imported.

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/shopping.test.tsx
```

Expected: the new test fails — tags and/or expiration are visible because `showTags={false}` and `showExpiration={false}` are not yet passed.

**Step 3: Update `src/routes/shopping.tsx`**

Find the `<ItemCard` usage (inside the `renderItemCard` function, around line 210). Add the two new props:

```tsx
<ItemCard
  item={item}
  tags={itemTags}
  tagTypes={tagTypes}
  mode="shopping"
  showTags={false}
  showExpiration={false}
  isChecked={!!ci}
  ...
/>
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/routes/shopping.test.tsx
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/routes/shopping.tsx src/routes/shopping.test.tsx
git commit -m "feat(shopping): hide tags and expiration in shopping mode"
```

---

### Task 3: Update cooking page call site

**Files:**
- Modify: `src/routes/cooking.tsx`

**Context:** Cooking previously relied on `mode="cooking"` to hide tags. That gate is gone. Cooking should hide tags but show expiration (expiration matters when consuming items).

**Step 1: Write the failing test**

In `src/routes/cooking.test.tsx`, add a new test:

```tsx
it('user does not see tags on cooking page but does see expiration', async () => {
  // Given an item with a tag and an expiration date, assigned to a recipe
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    targetQuantity: 4,
    refillThreshold: 1,
    targetUnit: 'package' as const,
    packedQuantity: 2,
    dueDate: new Date(Date.now() + 5 * 86400000),
  })
  const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
  await updateItem(item.id, { tagIds: [tag.id] })

  // ... create recipe with this item, render cooking page (use existing test patterns)

  // Then tags are hidden, expiration is visible
  expect(screen.queryByText('Dairy')).not.toBeInTheDocument()
  expect(screen.getByText(/Expires/i)).toBeInTheDocument()
})
```

> **Note:** Look at existing tests in `src/routes/cooking.test.tsx` for how to set up recipes and render the page.

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: fails — tags are visible (mode gate removed, showTags not yet passed).

**Step 3: Update `src/routes/cooking.tsx`**

Find the `<ItemCard` usage (around line 296). Add `showTags={false}` (no `showExpiration` — let it default to `true`):

```tsx
<ItemCard
  key={ri.itemId}
  item={item}
  tags={itemTags}
  tagTypes={tagTypes}
  mode="cooking"
  showTags={false}
  isChecked={isItemChecked}
  ...
/>
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/routes/cooking.tsx src/routes/cooking.test.tsx
git commit -m "feat(cooking): hide tags, show expiration in cooking mode"
```

---

### Task 4: Update assignment page call sites

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`
- Modify: `src/routes/settings/vendors/$id/items.tsx`
- Modify: `src/routes/settings/recipes/$id/items.tsx`

**Context:** Assignment pages (tag items, vendor items, recipe items) are administrative. Expiration is irrelevant there. Tags already show (no mode gate affects them). Just add `showExpiration={false}` to each.

No new tests needed — the assignment pages don't have expiration-specific tests, and the behavior change (hiding expiration) is already covered by the ItemCard unit test in Task 1. Skip straight to implementation.

**Step 1: Update all three files**

In each file, find the `<ItemCard` usage and add `showExpiration={false}`:

**`src/routes/settings/tags/$id/items.tsx`** (~line 251):
```tsx
<ItemCard
  key={item.id}
  mode="tag-assignment"
  item={item}
  ...
  showExpiration={false}
  isChecked={isAssigned(item.tagIds)}
  ...
/>
```

**`src/routes/settings/vendors/$id/items.tsx`** (~line 250):
```tsx
<ItemCard
  key={item.id}
  mode="tag-assignment"
  item={item}
  ...
  showExpiration={false}
  isChecked={isAssigned(item.vendorIds)}
  ...
/>
```

**`src/routes/settings/recipes/$id/items.tsx`** (~line 316):
```tsx
<ItemCard
  key={item.id}
  mode="recipe-assignment"
  item={item}
  ...
  showExpiration={false}
  isChecked={assigned}
  ...
/>
```

**Step 2: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass, no regressions.

**Step 3: Commit**

```bash
git add src/routes/settings/tags/$id/items.tsx src/routes/settings/vendors/$id/items.tsx src/routes/settings/recipes/$id/items.tsx
git commit -m "feat(assignment-pages): hide expiration in tag/vendor/recipe assignment views"
```

---

### Task 5: Final verification

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.
