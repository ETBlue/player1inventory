# ItemCard showTagSummary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `showTagSummary` prop to `ItemCard` so shopping and cooking pages can suppress the "N tags · N vendors · N recipes" count without affecting the pantry collapsed-tags state.

**Architecture:** Add `showTagSummary?: boolean` (default `true`) to `ItemCard`. Gate the existing count block on `!showTags && showTagSummary && (counts...)`. Shopping and cooking pages pass `showTagSummary={false}` alongside their existing `showTags={false}`.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library

---

### Task 1: Add `showTagSummary` prop to ItemCard

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/components/ItemCard.test.tsx`

**Context:** The count summary block is in `CardContent` and currently reads:
```tsx
{(tags.length > 0 || vendors.length > 0 || recipes.length > 0) &&
  !showTags && (
    <span className="text-xs text-foreground-muted">
      {[...].filter(Boolean).join(' · ')}
    </span>
  )}
```
There is an existing test `'shows vendor and recipe counts alongside tag count when collapsed'` that passes `showTags={false}` and asserts "1 tag · 1 vendor · 1 recipe" is present — it must continue to pass after this change.

**Step 1: Write the failing test**

Add to `src/components/ItemCard.test.tsx` inside the `'ItemCard - vendor and recipe display'` describe block (after the last test in that block):

```tsx
it('hides tag/vendor/recipe count when showTagSummary={false}', async () => {
  // Given showTags=false (collapsed) but showTagSummary=false (no count wanted)
  await renderWithRouter(
    <ItemCard
      item={mockItem}
      tags={mockTags}
      tagTypes={mockTagTypes}
      showTags={false}
      showTagSummary={false}
      vendors={mockVendors}
      recipes={mockRecipes}
    />,
  )

  // Then the count summary is not shown
  expect(screen.queryByText(/tag/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/vendor/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/recipe/i)).not.toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: the new test fails — count summary is still visible because `showTagSummary` doesn't exist yet.

**Step 3: Update `src/components/ItemCard.tsx`**

3a. Add `showTagSummary?: boolean` to the `ItemCardProps` interface (after `showExpiration?: boolean`):
```ts
showTagSummary?: boolean
```

3b. Add `showTagSummary = true` to the destructured params (after `showExpiration = true,`):
```ts
showTagSummary = true,
```

3c. Update the count block condition. Find:
```tsx
{(tags.length > 0 || vendors.length > 0 || recipes.length > 0) &&
  !showTags && (
```
Change to:
```tsx
{(tags.length > 0 || vendors.length > 0 || recipes.length > 0) &&
  !showTags &&
  showTagSummary && (
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: all tests pass, including the existing "shows vendor and recipe counts alongside tag count when collapsed" test (which doesn't pass `showTagSummary`, so it gets default `true`).

**Step 5: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx
git commit -m "feat(item-card): add showTagSummary prop to suppress count on shopping/cooking"
```

---

### Task 2: Update shopping and cooking call sites

**Files:**
- Modify: `src/routes/shopping.tsx`
- Modify: `src/routes/cooking.tsx`

No new tests needed — the component-level test in Task 1 covers the behavior. The existing shopping/cooking integration tests verify the pages render correctly; passing `showTagSummary={false}` is a non-breaking addition.

**Step 1: Update `src/routes/shopping.tsx`**

Find the `<ItemCard` in the `renderItemCard` function and add `showTagSummary={false}` alongside the existing `showTags={false}`:

```tsx
<ItemCard
  item={item}
  tags={itemTags}
  tagTypes={tagTypes}
  mode="shopping"
  showTags={false}
  showExpiration={false}
  showTagSummary={false}
  isChecked={!!ci}
  ...rest of existing props...
/>
```

**Step 2: Update `src/routes/cooking.tsx`**

Find the `<ItemCard` and add `showTagSummary={false}` alongside the existing `showTags={false}`:

```tsx
<ItemCard
  key={ri.itemId}
  item={item}
  tags={itemTags}
  tagTypes={tagTypes}
  mode="cooking"
  showTags={false}
  showTagSummary={false}
  isChecked={isItemChecked}
  ...rest of existing props...
/>
```

**Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass, no regressions.

**Step 4: Commit**

```bash
git add src/routes/shopping.tsx src/routes/cooking.tsx
git commit -m "feat(shopping,cooking): suppress tag/vendor/recipe count summary"
```
