# Vendor Items Immediate Save Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make each checkbox click on the vendor items tab immediately save the vendor assignment, removing the Save button.

**Architecture:** Replace the staged `toggled` map with a direct `updateItem.mutateAsync` call in `handleToggle`. Track in-flight mutations with a `savingItemIds` Set to disable checkboxes during pending saves. Remove all staged-state logic and the Save button.

**Tech Stack:** React 19, TanStack Query (`useUpdateItem`), Vitest + React Testing Library

---

### Task 1: Update tests to match immediate-save behavior

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.test.tsx`

Tests that reference the Save button must be replaced. Four tests need changing:

1. `save button is disabled when no changes are made` → **delete** (no Save button)
2. `user can assign this vendor to an item and save` → rewrite without Save click
3. `user can remove this vendor from an item and save` → rewrite without Save click
4. `save button is disabled after saving (form is clean)` → **delete** (no Save button)

**Step 1: Replace test "user can assign this vendor to an item and save"**

Find and replace the test body so the user just clicks the checkbox without clicking Save. The DB assertion stays the same.

New test:

```ts
it('user can assign this vendor to an item by clicking the checkbox', async () => {
  // Given a vendor and an unassigned item
  const vendor = await createVendor('Costco')
  const item = await makeItem('Milk')

  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  // When user clicks the checkbox
  await waitFor(() => {
    expect(screen.getByLabelText('Milk')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Milk'))

  // Then the item now has this vendor assigned in the DB
  await waitFor(async () => {
    const updated = await db.items.get(item.id)
    expect(updated?.vendorIds).toContain(vendor.id)
  })
})
```

**Step 2: Replace test "user can remove this vendor from an item and save"**

```ts
it('user can remove this vendor from an item by clicking the checkbox', async () => {
  // Given a vendor already assigned to an item
  const vendor = await createVendor('Costco')
  const item = await makeItem('Milk', [vendor.id])

  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  // When user unchecks the item
  await waitFor(() => {
    expect(screen.getByLabelText('Milk')).toBeChecked()
  })
  await user.click(screen.getByLabelText('Milk'))

  // Then the vendor is removed from the item in the DB
  await waitFor(async () => {
    const updated = await db.items.get(item.id)
    expect(updated?.vendorIds ?? []).not.toContain(vendor.id)
  })
})
```

**Step 3: Delete the two Save-button tests**

Remove these tests entirely:
- `save button is disabled when no changes are made`
- `save button is disabled after saving (form is clean)`

**Step 4: Run the tests to verify they fail**

```bash
pnpm test src/routes/settings/vendors/\$id/items.test.tsx
```

Expected: the two new tests fail because the implementation still uses staged state + Save button. The deleted tests are gone. Other tests (checklist display, filter, new item creation) still pass.

**Step 5: Commit**

```bash
git add src/routes/settings/vendors/\$id/items.test.tsx
git commit -m "test(vendors): update items tab tests for immediate save on checkbox click"
```

---

### Task 2: Rewrite VendorItemsTab to save immediately on checkbox click

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`

**Step 1: Remove staged-state imports and state**

Remove these from the import list (they're no longer needed):
- `useVendorLayout` import
- `useEffect` from the React import (keep `useMemo`, `useState`)

Remove these state declarations and derived values:
```ts
// DELETE all of these:
const { registerDirtyState } = useVendorLayout()
const [toggled, setToggled] = useState<Record<string, boolean>>({})
const isDirty = Object.keys(toggled).length > 0
useEffect(() => {
  registerDirtyState(isDirty)
}, [isDirty, registerDirtyState])
```

**Step 2: Add savingItemIds state**

Add a Set to track which items have in-flight mutations:

```ts
const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())
```

**Step 3: Simplify isAssigned**

Replace the toggled-overlay version:
```ts
// OLD:
const isAssigned = (itemId: string, vendorIds: string[] = []) => {
  const dbAssigned = vendorIds.includes(vendorId)
  return toggled[itemId] ? !dbAssigned : dbAssigned
}

// NEW:
const isAssigned = (vendorIds: string[] = []) => vendorIds.includes(vendorId)
```

**Step 4: Rewrite handleToggle to save immediately**

```ts
const handleToggle = async (itemId: string, currentVendorIds: string[] = []) => {
  const dbAssigned = currentVendorIds.includes(vendorId)
  const newVendorIds = dbAssigned
    ? currentVendorIds.filter((id) => id !== vendorId)
    : [...currentVendorIds, vendorId]

  setSavingItemIds((prev) => new Set(prev).add(itemId))
  try {
    await updateItem.mutateAsync({
      id: itemId,
      updates: { vendorIds: newVendorIds },
    })
  } finally {
    setSavingItemIds((prev) => {
      const next = new Set(prev)
      next.delete(itemId)
      return next
    })
  }
}
```

**Step 5: Delete handleSave**

Remove the entire `handleSave` function.

**Step 6: Update the JSX**

In the checkbox row, update `onCheckedChange` to pass the item's vendorIds, and add a `disabled` prop:

```tsx
// OLD:
<Checkbox
  id={`item-${item.id}`}
  checked={checked}
  onCheckedChange={() => handleToggle(item.id)}
/>

// NEW:
<Checkbox
  id={`item-${item.id}`}
  checked={isAssigned(item.vendorIds)}
  onCheckedChange={() => handleToggle(item.id, item.vendorIds)}
  disabled={savingItemIds.has(item.id)}
/>
```

Also update the `checked` variable usage — since `isAssigned` no longer needs `item.id`, simplify the row:

```tsx
// In the filteredItems.map, replace:
const checked = isAssigned(item.id, item.vendorIds)
// With: just use isAssigned(item.vendorIds) inline in the Checkbox above
// And remove the `checked` variable entirely
```

**Step 7: Remove the Save button**

Delete this from the JSX:
```tsx
<Button onClick={handleSave} disabled={!isDirty || updateItem.isPending}>
  Save
</Button>
```

**Step 8: Run the tests**

```bash
pnpm test src/routes/settings/vendors/\$id/items.test.tsx
```

Expected: all tests pass.

**Step 9: Commit**

```bash
git add src/routes/settings/vendors/\$id/items.tsx
git commit -m "feat(vendors): save vendor assignment immediately on checkbox click, remove save button"
```

---

### Task 3: Clean up useVendorLayout import if unused

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`

After Task 2, `useVendorLayout` is no longer imported in `items.tsx`. Verify the import was removed in Task 2 Step 1. If it was missed, remove it now.

Also verify that `useEffect` is no longer imported (it was only used for `registerDirtyState`). If the import remains and `useEffect` is unused, remove it.

**Step 1: Check for unused imports**

```bash
pnpm check
```

Biome will report any unused imports. Fix any that were missed.

**Step 2: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

**Step 3: Commit if any cleanup was needed**

```bash
git add src/routes/settings/vendors/\$id/items.tsx
git commit -m "chore(vendors): remove unused imports after immediate-save refactor"
```

---

### Task 4: Verify in the browser

**Step 1: Start the dev server**

```bash
pnpm dev
```

**Step 2: Manual smoke test**

1. Navigate to `/settings/vendors`, create a vendor (e.g. "Costco")
2. Go to the vendor's Items tab
3. Check an item — verify its checkbox reflects the change immediately (no Save button needed)
4. Uncheck the item — verify it reverts immediately
5. Navigate to the Info tab — confirm the navigation guard does NOT fire (no dirty state)
6. Edit the vendor name on the Info tab without saving — confirm the navigation guard DOES fire when switching to Items tab
