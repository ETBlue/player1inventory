# Cascade Deletion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a tag, tag type, or vendor is deleted, automatically clean up all references from items.

**Architecture:** Cascade logic lives in `src/db/operations.ts` (the data layer). The three delete functions each clean up item references before deleting the record. New count helpers support impact-aware confirmation dialogs in the UI.

**Tech Stack:** Dexie.js (IndexedDB), TanStack Query, React, Vitest + React Testing Library

---

### Task 1: Cascade `deleteTag` — remove tag from all items

**Files:**
- Modify: `src/db/operations.ts` (the `deleteTag` function, ~line 156)
- Test: `src/db/operations.test.ts` (add to `Tag operations` describe block)

**Step 1: Write the failing test**

Add a new `describe` block in `src/db/operations.test.ts` after the existing `Tag operations` block:

```ts
describe('Tag cascade operations', () => {
  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.items.clear()
  })

  it('user can delete a tag and it is removed from all items', async () => {
    // Given a tag type, a tag, and two items using that tag
    const tagType = await createTagType({ name: 'Type' })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item1 = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [tag.id],
    })
    const item2 = await createItem({
      name: 'Eggs',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [tag.id],
    })
    const item3 = await createItem({
      name: 'Bread',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    // When deleting the tag
    await deleteTag(tag.id)

    // Then the tag record is gone
    const allTags = await getAllTags()
    expect(allTags.find((t) => t.id === tag.id)).toBeUndefined()

    // And the tag is removed from items that had it
    const updated1 = await getItem(item1.id)
    const updated2 = await getItem(item2.id)
    expect(updated1?.tagIds).not.toContain(tag.id)
    expect(updated2?.tagIds).not.toContain(tag.id)

    // And items that didn't have the tag are unaffected
    const updated3 = await getItem(item3.id)
    expect(updated3?.tagIds).toEqual([])
  })
})
```

Add missing imports at the top of the test file:
```ts
import {
  // ... existing imports ...
  deleteTag,
  getAllTags,
  getItem,
  // ...
} from './operations'
```

**Step 2: Run the test to verify it fails**

```bash
pnpm test src/db/operations.test.ts
```

Expected: FAIL — tag still referenced in item after deletion.

**Step 3: Update `deleteTag` in `src/db/operations.ts`**

Replace:
```ts
export async function deleteTag(id: string): Promise<void> {
  await db.tags.delete(id)
}
```

With:
```ts
export async function deleteTag(id: string): Promise<void> {
  const items = await db.items.filter((item) => item.tagIds.includes(id)).toArray()
  const now = new Date()
  for (const item of items) {
    await db.items.update(item.id, {
      tagIds: item.tagIds.filter((tagId) => tagId !== id),
      updatedAt: now,
    })
  }
  await db.tags.delete(id)
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/db/operations.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(cascade): deleteTag removes tag from all item tagIds"
```

---

### Task 2: Cascade `deleteTagType` — delete child tags (which cascade to items)

**Files:**
- Modify: `src/db/operations.ts` (the `deleteTagType` function, ~line 125)
- Test: `src/db/operations.test.ts` (add to `Tag cascade operations` describe block)

**Step 1: Write the failing test**

Add inside the `Tag cascade operations` describe block:

```ts
it('user can delete a tag type and all its tags are removed from items', async () => {
  // Given a tag type with two tags, and an item using both
  const tagType = await createTagType({ name: 'Type' })
  const tag1 = await createTag({ name: 'Dairy', typeId: tagType.id })
  const tag2 = await createTag({ name: 'Meat', typeId: tagType.id })
  const item = await createItem({
    name: 'Milk',
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [tag1.id, tag2.id],
  })

  // When deleting the tag type
  await deleteTagType(tagType.id)

  // Then the tag type is gone
  const allTypes = await getAllTagTypes()
  expect(allTypes.find((t) => t.id === tagType.id)).toBeUndefined()

  // And both child tags are gone
  const allTags = await getAllTags()
  expect(allTags.find((t) => t.id === tag1.id)).toBeUndefined()
  expect(allTags.find((t) => t.id === tag2.id)).toBeUndefined()

  // And the item's tagIds are emptied
  const updatedItem = await getItem(item.id)
  expect(updatedItem?.tagIds).toEqual([])
})
```

**Step 2: Run the test to verify it fails**

```bash
pnpm test src/db/operations.test.ts
```

Expected: FAIL — tags still referenced in item after deletion.

**Step 3: Update `deleteTagType` in `src/db/operations.ts`**

Replace:
```ts
export async function deleteTagType(id: string): Promise<void> {
  await db.tagTypes.delete(id)
}
```

With:
```ts
export async function deleteTagType(id: string): Promise<void> {
  const tags = await db.tags.where('typeId').equals(id).toArray()
  for (const tag of tags) {
    await deleteTag(tag.id)
  }
  await db.tagTypes.delete(id)
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/db/operations.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(cascade): deleteTagType cascades through child tags to item tagIds"
```

---

### Task 3: Cascade `deleteVendor` — remove vendor from all items

**Files:**
- Modify: `src/db/operations.ts` (the `deleteVendor` function, ~line 298)
- Test: `src/db/operations.test.ts` (add to `Vendor operations` describe block)

**Step 1: Write the failing test**

Add inside the existing `Vendor operations` describe — also add `await db.items.clear()` to its `beforeEach`:

```ts
describe('Vendor operations', () => {
  beforeEach(async () => {
    await db.vendors.clear()
    await db.items.clear()  // add this line
  })

  // ... existing tests unchanged ...

  it('user can delete a vendor and it is removed from all items', async () => {
    // Given a vendor and two items assigned to it
    const vendor = await createVendor('Costco')
    const item1 = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    const item2 = await createItem({
      name: 'Eggs',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    const item3 = await createItem({
      name: 'Bread',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [],
    })

    // When deleting the vendor
    await deleteVendor(vendor.id)

    // Then the vendor is gone
    const vendors = await getVendors()
    expect(vendors.find((v) => v.id === vendor.id)).toBeUndefined()

    // And the vendor is removed from items that had it
    const updated1 = await getItem(item1.id)
    const updated2 = await getItem(item2.id)
    expect(updated1?.vendorIds).not.toContain(vendor.id)
    expect(updated2?.vendorIds).not.toContain(vendor.id)

    // And items without this vendor are unaffected
    const updated3 = await getItem(item3.id)
    expect(updated3?.vendorIds ?? []).toEqual([])
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
pnpm test src/db/operations.test.ts
```

Expected: FAIL — vendor still referenced in items after deletion.

**Step 3: Update `deleteVendor` in `src/db/operations.ts`**

Replace:
```ts
export async function deleteVendor(id: string): Promise<void> {
  await db.vendors.delete(id)
}
```

With:
```ts
export async function deleteVendor(id: string): Promise<void> {
  const items = await db.items
    .filter((item) => item.vendorIds?.includes(id) ?? false)
    .toArray()
  const now = new Date()
  for (const item of items) {
    await db.items.update(item.id, {
      vendorIds: item.vendorIds?.filter((vid) => vid !== id) ?? [],
      updatedAt: now,
    })
  }
  await db.vendors.delete(id)
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/db/operations.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(cascade): deleteVendor removes vendor from all item vendorIds"
```

---

### Task 4: Add `getItemCountByVendor` and `getTagCountByType` operations

These power the impact counts in confirmation dialogs.

**Files:**
- Modify: `src/db/operations.ts` (add after existing `getItemCountByTag`, ~line 165)
- Test: `src/db/operations.test.ts` (new describe blocks)

**Step 1: Write failing tests**

Add two new `describe` blocks in `src/db/operations.test.ts`:

```ts
describe('getItemCountByVendor', () => {
  beforeEach(async () => {
    await db.vendors.clear()
    await db.items.clear()
  })

  it('returns count of items assigned to a vendor', async () => {
    // Given a vendor with two assigned items
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    await createItem({
      name: 'Eggs',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    await createItem({
      name: 'Bread',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [],
    })

    // When counting items for the vendor
    const count = await getItemCountByVendor(vendor.id)

    // Then only the two assigned items are counted
    expect(count).toBe(2)
  })
})

describe('getTagCountByType', () => {
  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
  })

  it('returns count of tags under a tag type', async () => {
    // Given a tag type with three tags
    const tagType = await createTagType({ name: 'Type' })
    await createTag({ name: 'Dairy', typeId: tagType.id })
    await createTag({ name: 'Meat', typeId: tagType.id })
    await createTag({ name: 'Produce', typeId: tagType.id })

    // And another tag type with one tag (should not be counted)
    const otherType = await createTagType({ name: 'Other' })
    await createTag({ name: 'Frozen', typeId: otherType.id })

    // When counting tags for the first type
    const count = await getTagCountByType(tagType.id)

    // Then only tags of that type are counted
    expect(count).toBe(3)
  })
})
```

Add to imports at top of test file:
```ts
import {
  // ... existing ...
  getItemCountByVendor,
  getTagCountByType,
} from './operations'
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/db/operations.test.ts
```

Expected: FAIL — functions not defined.

**Step 3: Add the two functions to `src/db/operations.ts`**

Add after the existing `getItemCountByTag` function (~line 165):

```ts
export async function getItemCountByVendor(vendorId: string): Promise<number> {
  return db.items
    .filter((item) => item.vendorIds?.includes(vendorId) ?? false)
    .count()
}

export async function getTagCountByType(typeId: string): Promise<number> {
  return db.tags.where('typeId').equals(typeId).count()
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/db/operations.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(cascade): add getItemCountByVendor and getTagCountByType operations"
```

---

### Task 5: Update hooks — invalidate items cache + add count hooks

**Files:**
- Modify: `src/hooks/useTags.ts`
- Modify: `src/hooks/useVendors.ts`

No tests needed here — these are thin wrappers over operations already tested in Task 1–4. Cache invalidation is covered by integration tests in Tasks 6–8.

**Step 1: Update `src/hooks/useTags.ts`**

1. Add import for `getTagCountByType` at the top:

```ts
import {
  createTag,
  createTagType,
  deleteTag,
  deleteTagType,
  getAllTags,
  getAllTagTypes,
  getItemCountByTag,
  getTagCountByType,   // add this
  getTagsByType,
  updateTag,
  updateTagType,
} from '@/db/operations'
```

2. Update `useDeleteTag` to also invalidate `['items']`:

```ts
export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
```

3. Update `useDeleteTagType` to also invalidate `['items']`:

```ts
export function useDeleteTagType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTagType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
```

4. Add `useTagCountByType` hook at the end of the file:

```ts
export function useTagCountByType(typeId: string) {
  return useQuery({
    queryKey: ['tags', 'countByType', typeId],
    queryFn: () => getTagCountByType(typeId),
    enabled: !!typeId,
  })
}
```

**Step 2: Update `src/hooks/useVendors.ts`**

1. Add imports for new operation and query:

```ts
import {
  createVendor,
  deleteVendor,
  getItemCountByVendor,   // add this
  getVendors,
  updateVendor,
} from '@/db/operations'
```

2. Update `useDeleteVendor` to also invalidate `['items']`:

```ts
export function useDeleteVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
```

3. Add `useItemCountByVendor` hook at the end of the file:

```ts
export function useItemCountByVendor(vendorId: string) {
  return useQuery({
    queryKey: ['items', 'countByVendor', vendorId],
    queryFn: () => getItemCountByVendor(vendorId),
    enabled: !!vendorId,
  })
}
```

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: PASS (no test changes, just hook updates)

**Step 4: Commit**

```bash
git add src/hooks/useTags.ts src/hooks/useVendors.ts
git commit -m "feat(cascade): invalidate items cache on delete; add count hooks"
```

---

### Task 6: Update `TagDetailDialog` — confirm delete with item count

Currently the Delete button calls `onDelete` directly with no confirmation. Add an internal `ConfirmDialog` that shows the item count.

**Files:**
- Modify: `src/components/TagDetailDialog.tsx`

**Step 1: Update `src/components/TagDetailDialog.tsx`**

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useItemCountByTag } from '@/hooks/useTags'
import type { Tag } from '@/types'

interface TagDetailDialogProps {
  tag: Tag
  tagName: string
  onTagNameChange: (name: string) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export function TagDetailDialog({
  tag,
  tagName,
  onTagNameChange,
  onSave,
  onDelete,
  onClose,
}: TagDetailDialogProps) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editTagName">Name</Label>
              <Input
                id="editTagName"
                value={tagName}
                onChange={(e) => onTagNameChange(e.target.value)}
                placeholder="e.g., Dairy"
                onKeyDown={(e) => e.key === 'Enter' && onSave()}
              />
            </div>
            <div className="space-y-2">
              <Label>Item count</Label>
              <p className="text-sm text-foreground-muted">
                {itemCount} items using this tag
              </p>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button variant="destructive" onClick={() => setShowConfirm(true)}>
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="neutral-ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onSave}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={(open) => !open && setShowConfirm(false)}
        title={`Delete "${tag.name}"?`}
        description={`This will remove "${tag.name}" from ${itemCount} item${itemCount === 1 ? '' : 's'}.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setShowConfirm(false)
          onDelete()
        }}
        destructive
      />
    </>
  )
}
```

**Step 2: Run all tests**

```bash
pnpm test
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/components/TagDetailDialog.tsx
git commit -m "feat(cascade): add confirmation dialog to tag delete showing item count"
```

---

### Task 7: Update `tags.tsx` — remove manual loop, update tag type dialog with tag count

The `handleDeleteTagType` in `tags.tsx` manually loops through child tags and calls `deleteTag`. This is now redundant since `deleteTagType` in operations.ts handles it. Remove the loop. Also update the confirmation dialog to show the tag count.

**Files:**
- Modify: `src/routes/settings/tags.tsx`

**Step 1: Update `src/routes/settings/tags.tsx`**

1. Add `useTagCountByType` to the hook imports:

```ts
import {
  useCreateTag,
  useCreateTagType,
  useDeleteTag,
  useDeleteTagType,
  useTags,
  useTagCountByType,    // add this
  useTagTypes,
  useUpdateTag,
  useUpdateTagType,
} from '@/hooks/useTags'
```

2. Add the count hook near the other hooks at the top of the component (alongside `deleteTagType`):

```ts
const tagTypeDeleteId = tagTypeToDelete?.id ?? ''
const { data: tagTypeTagCount = 0 } = useTagCountByType(tagTypeDeleteId)
```

3. Simplify `handleDeleteTagType` — remove the manual loop, `deleteTagType` now cascades:

```ts
const handleDeleteTagType = () => {
  if (tagTypeToDelete) {
    deleteTagType.mutate(tagTypeToDelete.id)
    setTagTypeToDelete(null)
  }
}
```

4. Update the `ConfirmDialog` description to show tag count:

```tsx
<ConfirmDialog
  open={!!tagTypeToDelete}
  onOpenChange={(open) => !open && setTagTypeToDelete(null)}
  title={`Delete "${tagTypeToDelete?.name}"?`}
  description={`This will delete "${tagTypeToDelete?.name}" and its ${tagTypeTagCount} tag${tagTypeTagCount === 1 ? '' : 's'}, removing them from all assigned items.`}
  confirmLabel="Delete"
  onConfirm={handleDeleteTagType}
  destructive
/>
```

5. Remove `useDeleteTag` from imports and the `const deleteTag = useDeleteTag()` line — it is no longer used in this component.

**Step 2: Run all tests**

```bash
pnpm test
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/settings/tags.tsx
git commit -m "feat(cascade): simplify tag type delete; show tag count in confirmation"
```

---

### Task 8: Update vendor delete dialog — show item count

**Files:**
- Modify: `src/routes/settings/vendors/index.tsx`

**Step 1: Update `src/routes/settings/vendors/index.tsx`**

1. Add `useItemCountByVendor` to the hook imports:

```ts
import { useItemCountByVendor, useDeleteVendor, useVendors } from '@/hooks/useVendors'
```

2. Add the count hook in the component body:

```ts
const vendorDeleteId = vendorToDelete?.id ?? ''
const { data: vendorItemCount = 0 } = useItemCountByVendor(vendorDeleteId)
```

3. Update the `ConfirmDialog` description:

```tsx
<ConfirmDialog
  open={!!vendorToDelete}
  onOpenChange={(open) => !open && setVendorToDelete(null)}
  title={`Delete "${vendorToDelete?.name}"?`}
  description={`This will remove "${vendorToDelete?.name}" from ${vendorItemCount} item${vendorItemCount === 1 ? '' : 's'}.`}
  confirmLabel="Delete"
  onConfirm={handleConfirmDelete}
  destructive
/>
```

**Step 2: Run all tests**

```bash
pnpm test
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/settings/vendors/index.tsx
git commit -m "feat(cascade): show item count in vendor delete confirmation"
```

---

## Done

Run the full test suite one final time:

```bash
pnpm test
```

All tests should pass. The cascade deletion feature is complete.
