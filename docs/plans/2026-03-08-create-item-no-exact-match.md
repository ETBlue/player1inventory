# Create Item When No Exact Match — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the "Create" button in item search inputs whenever the typed query has no exact name match among results, even when partial matches exist.

**Architecture:** Add a `hasExactMatch?: boolean` prop to `ItemListToolbar`. Each of the 5 pages that use `onCreateFromSearch` computes `hasExactMatch` from its local `searchedItems` array and passes it down. `ItemListToolbar` replaces the two occurrences of `queriedCount === 0` with `!hasExactMatch`.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library

---

### Task 1: Update failing tests in vendor items tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.test.tsx:242-279`

**Step 1: Update the existing test to match new behavior**

Replace the test at line 242 ("user sees the create button only when search has text and zero items match") with:

```tsx
it('user sees create button when search has text and no exact item match', async () => {
  // Given a vendor with one item named "Milk"
  const vendor = await createVendor('Costco')
  await makeItem('Milk')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  // When user opens the search panel
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
  })

  // When user types text that partially matches "Milk" but is not an exact match
  await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

  // Then the create button is visible (partial match ≠ exact match)
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: /create item/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
  })

  // When user types an exact match (case-insensitive)
  await user.clear(screen.getByPlaceholderText(/search items/i))
  await user.type(screen.getByPlaceholderText(/search items/i), 'Milk')

  // Then the create button is gone (exact match exists)
  await waitFor(() => {
    expect(
      screen.queryByRole('button', { name: /create item/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
  })
})
```

**Step 2: Run the test to confirm it fails**

```bash
cd /path/to/worktree
pnpm test src/routes/settings/vendors/\$id/items.test.tsx --reporter=verbose 2>&1 | grep -A5 "no exact item match"
```

Expected: FAIL — the create button is not showing for "mil" yet.

**Step 3: Commit the failing test**

```bash
git add src/routes/settings/vendors/\$id/items.test.tsx
git commit -m "test(vendor-items): update create button test for no-exact-match behavior"
```

---

### Task 2: Update failing tests in tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.test.tsx:248-289`

**Step 1: Update the existing test**

Replace the test at line 248 ("user sees the create button only when search has text and zero items match") with the same pattern as Task 1 — searching "mil" should show Create, searching "Milk" should hide it. Adapt names to use tag-specific setup (e.g. `makeItem('Milk')` and a tag instead of vendor).

Find the exact test body by reading the file, then apply the same changes:
- Rename test to "user sees create button when search has text and no exact item match"
- Partial match → Create shown
- Exact match (case-insensitive) → Create NOT shown

**Step 2: Run the test to confirm it fails**

```bash
pnpm test src/routes/settings/tags/\$id/items.test.tsx --reporter=verbose 2>&1 | grep -A5 "no exact item match"
```

Expected: FAIL

**Step 3: Commit**

```bash
git add src/routes/settings/tags/\$id/items.test.tsx
git commit -m "test(tag-items): update create button test for no-exact-match behavior"
```

---

### Task 3: Update failing tests in recipe items tab

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.test.tsx:244`

**Step 1: Update the existing test**

Replace the test at line 244 ("user sees Create item button when search has text and zero items match") with the same pattern — partial match shows Create, exact match hides it.

**Step 2: Run the test to confirm it fails**

```bash
pnpm test src/routes/settings/recipes/\$id/items.test.tsx --reporter=verbose 2>&1 | grep -A5 "no exact item match"
```

Expected: FAIL

**Step 3: Commit**

```bash
git add src/routes/settings/recipes/\$id/items.test.tsx
git commit -m "test(recipe-items): update create button test for no-exact-match behavior"
```

---

### Task 4: Update ItemListToolbar to use hasExactMatch prop

**Files:**
- Modify: `src/components/ItemListToolbar.tsx`

**Step 1: Add `hasExactMatch` to the props interface (line 33–58)**

In `ItemListToolbarProps`, add after `onCreateFromSearch`:

```ts
hasExactMatch?: boolean
```

**Step 2: Add to the function destructuring (line 60–75)**

Add `hasExactMatch` to the destructured props list.

**Step 3: Replace first occurrence of `queriedCount === 0` (line 123)**

```ts
// Before:
if (createOrSearch && queriedCount === 0 && search.trim()) {

// After:
if (createOrSearch && !hasExactMatch && search.trim()) {
```

**Step 4: Replace second occurrence of `queriedCount === 0` (line 274)**

```ts
// Before:
(onCreateFromSearch && queriedCount === 0 ? (

// After:
(onCreateFromSearch && !hasExactMatch ? (
```

**Step 5: Run all tests to see failures clearly**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗" | head -30
```

Expected: The 3 test files updated in Tasks 1–3 still fail (pages don't pass `hasExactMatch` yet). Other tests should pass.

**Step 6: Commit**

```bash
git add src/components/ItemListToolbar.tsx
git commit -m "feat(toolbar): replace queriedCount===0 with hasExactMatch prop"
```

---

### Task 5: Wire hasExactMatch in pantry page

**Files:**
- Modify: `src/routes/index.tsx`

**Step 1: Compute hasExactMatch after the existing `searchedItems` line (around line 98)**

`searchedItems` is already defined as:
```ts
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase())
)
```

Add immediately after:
```ts
const hasExactMatch = searchedItems.some(
  (item) => item.name.toLowerCase() === search.trim().toLowerCase()
)
```

**Step 2: Pass to ItemListToolbar (around line 182)**

```tsx
<ItemListToolbar
  ...existing props...
  hasExactMatch={hasExactMatch}
  onCreateFromSearch={handleCreateFromSearch}
>
```

**Step 3: Run tests**

```bash
pnpm test src/routes/index.test.tsx --reporter=verbose 2>&1 | tail -10
```

Expected: PASS (pantry tests cover basic create-from-search with zero results, which still works)

**Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(pantry): pass hasExactMatch to ItemListToolbar"
```

---

### Task 6: Wire hasExactMatch in shopping page

**Files:**
- Modify: `src/routes/shopping.tsx`

**Step 1: Compute hasExactMatch after the existing `searchedItems` line (around line 114)**

`searchedItems` is already defined. Add immediately after:
```ts
const hasExactMatch = searchedItems.some(
  (item) => item.name.toLowerCase() === search.trim().toLowerCase()
)
```

**Step 2: Pass to ItemListToolbar (around line 220)**

```tsx
<ItemListToolbar
  ...existing props...
  hasExactMatch={hasExactMatch}
  onCreateFromSearch={handleCreateFromSearch}
>
```

**Step 3: Run tests**

```bash
pnpm test src/routes/shopping.test.tsx --reporter=verbose 2>&1 | tail -10
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat(shopping): pass hasExactMatch to ItemListToolbar"
```

---

### Task 7: Wire hasExactMatch in vendor items tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`

**Step 1: Compute hasExactMatch after the existing `searchedItems` line (around line 159)**

`searchedItems` is already defined. Add immediately after:
```ts
const hasExactMatch = searchedItems.some(
  (item) => item.name.toLowerCase() === search.trim().toLowerCase()
)
```

**Step 2: Pass to ItemListToolbar (around line 202)**

```tsx
<ItemListToolbar
  ...existing props...
  hasExactMatch={hasExactMatch}
  onCreateFromSearch={handleCreateFromSearch}
>
```

**Step 3: Run tests**

```bash
pnpm test "src/routes/settings/vendors/\$id/items.test.tsx" --reporter=verbose 2>&1 | tail -20
```

Expected: PASS including the updated "no exact item match" test.

**Step 4: Commit**

```bash
git add "src/routes/settings/vendors/\$id/items.tsx"
git commit -m "feat(vendor-items): pass hasExactMatch to ItemListToolbar"
```

---

### Task 8: Wire hasExactMatch in tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`

**Step 1: Compute hasExactMatch after the existing `searchedItems` line (around line 139)**

`searchedItems` is already defined. Add immediately after:
```ts
const hasExactMatch = searchedItems.some(
  (item) => item.name.toLowerCase() === search.trim().toLowerCase()
)
```

**Step 2: Pass to ItemListToolbar (around line 202)**

```tsx
<ItemListToolbar
  ...existing props...
  hasExactMatch={hasExactMatch}
  onCreateFromSearch={handleCreateFromSearch}
>
```

**Step 3: Run tests**

```bash
pnpm test "src/routes/settings/tags/\$id/items.test.tsx" --reporter=verbose 2>&1 | tail -20
```

Expected: PASS

**Step 4: Commit**

```bash
git add "src/routes/settings/tags/\$id/items.tsx"
git commit -m "feat(tag-items): pass hasExactMatch to ItemListToolbar"
```

---

### Task 9: Wire hasExactMatch in recipe items tab

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx`

**Step 1: Compute hasExactMatch after the existing `searchedItems` line (around line 95)**

`searchedItems` is already defined. Add immediately after:
```ts
const hasExactMatch = searchedItems.some(
  (item) => item.name.toLowerCase() === search.trim().toLowerCase()
)
```

**Step 2: Pass to ItemListToolbar (around line 255)**

```tsx
<ItemListToolbar
  ...existing props...
  hasExactMatch={hasExactMatch}
  onCreateFromSearch={handleCreateFromSearch}
>
```

**Step 3: Run all tests**

```bash
pnpm test --reporter=verbose 2>&1 | tail -30
```

Expected: ALL PASS

**Step 4: Commit**

```bash
git add "src/routes/settings/recipes/\$id/items.tsx"
git commit -m "feat(recipe-items): pass hasExactMatch to ItemListToolbar"
```

---

### Task 10: Final verification

**Step 1: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: All tests pass, no failures.

**Step 2: Run lint check**

```bash
pnpm check 2>&1 | tail -10
```

Expected: No errors or warnings.

**Step 3: Invoke finishing skill**

Use `superpowers:finishing-a-development-branch` to complete the branch.
