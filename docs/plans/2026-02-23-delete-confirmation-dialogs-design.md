# Delete Confirmation Dialogs Design

**Date:** 2026-02-23
**Status:** Approved

## Overview

Replace all browser `confirm()` dialogs with custom AlertDialog components that show impact information before deletion. Add delete button to tag detail page and implement cascade deletion for items.

## Requirements

1. Add delete button to tag detail page top bar (matching item page pattern)
2. Replace browser `confirm()` in item page with custom AlertDialog
3. Show impact counts in all delete confirmation dialogs
4. Implement cascade deletion for items (delete related inventory logs and cart items)

## User Answers

**Q: Should tag delete confirmation show impact counts?**
A: Yes, use custom AlertDialog (option C) showing affected item count

**Q: Should item deletion show/handle related data?**
A: Yes, both show impact (option B) and cascade delete (option C)

## Approach: Inline AlertDialogs

Each page manages its own delete confirmation dialog following the existing "unsaved changes" pattern. This approach:
- Maintains consistency with existing codebase patterns
- Keeps deletion logic self-contained and clear
- Avoids premature abstraction (only 2 use cases)
- Allows flexibility for future divergence

## Architecture & Data Flow

### Database Operations Layer

**Extend `deleteItem()` in `src/db/operations.ts`:**

```typescript
export async function deleteItem(id: string): Promise<void> {
  // Delete related inventory logs
  await db.inventoryLogs.where('itemId').equals(id).delete()

  // Delete related cart items
  await db.cartItems.where('itemId').equals(id).delete()

  // Delete the item itself
  await db.items.delete(id)
}
```

**Add count helper functions:**

```typescript
export async function getInventoryLogCountByItem(itemId: string): Promise<number> {
  return await db.inventoryLogs.where('itemId').equals(id).count()
}

export async function getCartItemCountByItem(itemId: string): Promise<number> {
  return await db.cartItems.where('itemId').equals(id).count()
}
```

### React Query Hooks

**Add to `src/hooks/useItems.ts`:**

```typescript
export function useInventoryLogCountByItem(itemId: string) {
  return useQuery({
    queryKey: ['inventoryLogs', 'countByItem', itemId],
    queryFn: () => getInventoryLogCountByItem(itemId),
    enabled: !!itemId,
  })
}

export function useCartItemCountByItem(itemId: string) {
  return useQuery({
    queryKey: ['cartItems', 'countByItem', itemId],
    queryFn: () => getCartItemCountByItem(itemId),
    enabled: !!itemId,
  })
}
```

Tag page reuses existing `useItemCountByTag()` hook.

## UI Components

### Tag Page Delete Button

**File:** `src/routes/settings/tags/$id.tsx`

**Additions:**
- Import `Trash2` icon from lucide-react
- Import `useDeleteTag`, `useItemCountByTag` hooks
- Add `showDeleteDialog` state
- Add delete button in top bar after tabs
- Add AlertDialog component

**Delete button placement:**

```tsx
<Button
  variant="destructive"
  size="icon"
  onClick={() => setShowDeleteDialog(true)}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

**Dialog content:**

```tsx
<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete tag?</AlertDialogTitle>
      <AlertDialogDescription>
        {affectedItemCount > 0
          ? `${affectedItemCount} item${affectedItemCount === 1 ? '' : 's'} will lose this tag.`
          : 'This tag is not assigned to any items.'}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          deleteTag.mutate(id, {
            onSuccess: () => goBack(),
          })
        }}
        disabled={deleteTag.isPending}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {deleteTag.isPending ? 'Deleting...' : 'Delete'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Item Page Delete Dialog

**File:** `src/routes/items/$id.tsx`

**Changes:**
- Replace browser `confirm()` with AlertDialog state
- Add `useInventoryLogCountByItem`, `useCartItemCountByItem` hooks
- Add `showDeleteDialog` state
- Replace button `onClick` to open dialog
- Add AlertDialog component

**Dialog content:**

```tsx
<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete item?</AlertDialogTitle>
      <AlertDialogDescription>
        {(logCount > 0 || cartCount > 0) && (
          <>
            This will also delete:
            <ul className="list-disc list-inside mt-2">
              {logCount > 0 && <li>{logCount} inventory log{logCount === 1 ? '' : 's'}</li>}
              {cartCount > 0 && <li>{cartCount} cart entr{cartCount === 1 ? 'y' : 'ies'}</li>}
            </ul>
          </>
        )}
        {logCount === 0 && cartCount === 0 && 'This item has no related data.'}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          deleteItem.mutate(id, {
            onSuccess: () => goBack(),
          })
        }}
        disabled={deleteItem.isPending}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {deleteItem.isPending ? 'Deleting...' : 'Delete'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Navigation & UX

### Post-Deletion Behavior

Both pages use `goBack()` from `useAppNavigation` hook:
- Returns to previous app page (or fallback if no history)
- Tag page fallback: `/settings/tags`
- Item page fallback: `/` (home)

### Loading States

During deletion (mutation pending):
- Dialog remains open with disabled buttons
- "Delete" button shows "Deleting..." text
- Buttons disabled using `mutation.isPending` state

### Error Handling

If deletion fails:
- Log error to console
- Dialog remains open (user can retry or cancel)
- Consider adding toast notification (if toast system exists)

### Edge Cases

- Item/tag already deleted (race condition): `goBack()` works safely
- Counts fail to load: show 0 counts, deletion still functional
- Dirty state guard: delete button always works regardless of unsaved changes

## Testing

### Database Operations Tests

**File:** `src/db/operations.test.ts`

Add tests for:
- `deleteItem()` cascade deletes inventory logs
- `deleteItem()` cascade deletes cart items
- `getInventoryLogCountByItem()` returns correct count
- `getCartItemCountByItem()` returns correct count

### Component Integration Tests

**Item page** (`src/routes/items/$id.test.tsx`):
- User can open delete dialog
- Dialog shows correct counts for logs and cart items
- User can confirm deletion (item deleted, navigates back)
- User can cancel deletion (dialog closes, item remains)

**Tag page** (new file: `src/routes/settings/tags/$id.test.tsx`):
- User can open delete dialog
- Dialog shows correct affected item count
- User can confirm deletion (tag deleted, navigates back)
- User can cancel deletion (dialog closes, tag remains)

## Files Changed

**Modified:**
- `src/db/operations.ts` - Cascade deletion for items, add count helpers
- `src/db/operations.test.ts` - Add cascade deletion tests
- `src/hooks/useItems.ts` - Add count hooks
- `src/routes/items/$id.tsx` - Replace confirm() with AlertDialog
- `src/routes/items/$id.test.tsx` - Add delete dialog tests
- `src/routes/settings/tags/$id.tsx` - Add delete button and dialog

**Created:**
- `src/routes/settings/tags/$id.test.tsx` - Tag delete dialog tests

## Success Criteria

- ✅ Tag page has delete button in top bar matching item page pattern
- ✅ All `confirm()` calls replaced with custom AlertDialog
- ✅ Delete dialogs show impact counts before deletion
- ✅ Item deletion cascades to inventory logs and cart items
- ✅ Post-deletion navigation works (goBack to previous page)
- ✅ All tests pass
