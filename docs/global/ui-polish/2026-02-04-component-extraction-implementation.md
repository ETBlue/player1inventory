# Component Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract 6 inline components from route files to improve code organization and readability.

**Architecture:** Copy-paste component code from route files into new files in `src/components/`, update imports, verify no behavior changes.

**Tech Stack:** React, TypeScript, TanStack Router/Query, existing component patterns

---

## Task 1: Extract TagBadge Component

**Files:**
- Create: `src/components/TagBadge.tsx`
- Modify: `src/routes/settings/tags.tsx` (lines 37-54)

**Step 1: Create TagBadge.tsx**

Copy the TagBadge component from tags.tsx lines 37-54:

```tsx
import { Badge } from '@/components/ui/badge'
import { getContrastTextColor } from '@/lib/utils'
import { useItemCountByTag } from '@/hooks/useTags'
import type { Tag, TagType } from '@/types'

export function TagBadge({
  tag,
  tagType,
  onClick
}: {
  tag: Tag
  tagType: TagType
  onClick: () => void
}) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)
  const backgroundColor = tagType.color || '#3b82f6'
  const textColor = getContrastTextColor(backgroundColor)

  return (
    <Badge
      style={{
        backgroundColor,
        color: textColor,
      }}
      className="cursor-pointer"
      onClick={onClick}
    >
      {tag.name} ({itemCount})
    </Badge>
  )
}
```

**Step 2: Update tags.tsx imports**

In `src/routes/settings/tags.tsx`:
- Add import: `import { TagBadge } from '@/components/TagBadge'`
- Remove the TagBadge component function (lines 37-54)

**Step 3: Verify TypeScript**

Run: `pnpmtypecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/TagBadge.tsx src/routes/settings/tags.tsx
git commit -m "refactor: extract TagBadge component"
```

---

## Task 2: Extract TagDetailDialog Component

**Files:**
- Create: `src/components/TagDetailDialog.tsx`
- Modify: `src/routes/settings/tags.tsx` (lines 56-112)

**Step 1: Create TagDetailDialog.tsx**

Copy the TagDetailDialog component from tags.tsx lines 56-112:

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useItemCountByTag } from '@/hooks/useTags'
import type { Tag } from '@/types'

export function TagDetailDialog({
  tag,
  tagName,
  onTagNameChange,
  onSave,
  onDelete,
  onClose,
}: {
  tag: Tag
  tagName: string
  onTagNameChange: (name: string) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)

  return (
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
            <p className="text-sm text-muted-foreground">
              {itemCount} items using this tag
            </p>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <Button variant="destructive" onClick={onDelete}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Update tags.tsx imports**

In `src/routes/settings/tags.tsx`:
- Add import: `import { TagDetailDialog } from '@/components/TagDetailDialog'`
- Remove the TagDetailDialog component function (lines 56-112)

**Step 3: Verify TypeScript**

Run: `pnpmtypecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/TagDetailDialog.tsx src/routes/settings/tags.tsx
git commit -m "refactor: extract TagDetailDialog component"
```

---

## Task 3: Extract EditTagTypeDialog Component

**Files:**
- Create: `src/components/EditTagTypeDialog.tsx`
- Modify: `src/routes/settings/tags.tsx` (extract inline dialog JSX)

**Step 1: Create EditTagTypeDialog.tsx**

Create a new component extracting the Edit TagType Dialog logic:

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { getContrastTextColor } from '@/lib/utils'
import type { TagType } from '@/types'

export function EditTagTypeDialog({
  tagType,
  name,
  color,
  onNameChange,
  onColorChange,
  onSave,
  onClose,
}: {
  tagType: TagType | null
  name: string
  color: string
  onNameChange: (name: string) => void
  onColorChange: (color: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <Dialog open={!!tagType} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tag Type</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="editTagTypeName">Name</Label>
            <Input
              id="editTagTypeName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Ingredient type"
              onKeyDown={(e) => e.key === 'Enter' && onSave()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editTagTypeColor">Color</Label>
            <div className="flex gap-2">
              <Input
                id="editTagTypeColor"
                type="color"
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-16 h-10 p-1"
              />
              <Input
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                placeholder="#3b82f6"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className="h-10 rounded-md flex items-center justify-center font-medium text-sm"
              style={{
                backgroundColor: color,
                color: getContrastTextColor(color),
              }}
            >
              Example Tag
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Update tags.tsx**

In `src/routes/settings/tags.tsx`:
- Add import: `import { EditTagTypeDialog } from '@/components/EditTagTypeDialog'`
- Replace the inline Edit TagType Dialog JSX with:

```tsx
<EditTagTypeDialog
  tagType={editTagType}
  name={editTagTypeName}
  color={editTagTypeColor}
  onNameChange={setEditTagTypeName}
  onColorChange={setEditTagTypeColor}
  onSave={handleEditTagType}
  onClose={() => setEditTagType(null)}
/>
```

**Step 3: Verify TypeScript**

Run: `pnpmtypecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/EditTagTypeDialog.tsx src/routes/settings/tags.tsx
git commit -m "refactor: extract EditTagTypeDialog component"
```

---

## Task 4: Extract AddTagDialog Component

**Files:**
- Create: `src/components/AddTagDialog.tsx`
- Modify: `src/routes/settings/tags.tsx` (extract inline dialog JSX)

**Step 1: Create AddTagDialog.tsx**

Create a new component extracting the Add Tag Dialog logic:

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export function AddTagDialog({
  open,
  tagName,
  onTagNameChange,
  onAdd,
  onClose,
}: {
  open: boolean
  tagName: string
  onTagNameChange: (name: string) => void
  onAdd: () => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tagName">Name</Label>
            <Input
              id="tagName"
              value={tagName}
              onChange={(e) => onTagNameChange(e.target.value)}
              placeholder="e.g., Dairy, Frozen"
              onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onAdd}>Add Tag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Update tags.tsx**

In `src/routes/settings/tags.tsx`:
- Add import: `import { AddTagDialog } from '@/components/AddTagDialog'`
- Replace the inline Add Tag Dialog JSX with:

```tsx
<AddTagDialog
  open={!!addTagDialog}
  tagName={newTagName}
  onTagNameChange={setNewTagName}
  onAdd={handleAddTag}
  onClose={() => setAddTagDialog(null)}
/>
```

**Step 3: Verify TypeScript**

Run: `pnpmtypecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/AddTagDialog.tsx src/routes/settings/tags.tsx
git commit -m "refactor: extract AddTagDialog component"
```

---

## Task 5: Extract PantryItem Component

**Files:**
- Create: `src/components/PantryItem.tsx`
- Modify: `src/routes/index.tsx` (lines 85-133)

**Step 1: Create PantryItem.tsx**

Copy the PantryItem component from index.tsx lines 85-133:

```tsx
import { useQuery } from '@tanstack/react-query'
import { ItemCard } from '@/components/ItemCard'
import { getCurrentQuantity, getLastPurchaseDate } from '@/db/operations'
import type { Item } from '@/types'

export function PantryItem({
  item,
  tags,
  tagTypes,
  onConsume,
  onAdd,
}: {
  item: Item
  tags: Array<{ id: string; name: string; typeId: string }>
  tagTypes: Array<{ id: string; name: string; color?: string }>
  onConsume: () => void
  onAdd: () => void
}) {
  const { data: quantity = 0 } = useQuery({
    queryKey: ['items', item.id, 'quantity'],
    queryFn: () => getCurrentQuantity(item.id),
  })

  const { data: lastPurchase } = useQuery({
    queryKey: ['items', item.id, 'lastPurchase'],
    queryFn: () => getLastPurchaseDate(item.id),
  })

  const estimatedDueDate =
    item.estimatedDueDays && lastPurchase
      ? new Date(lastPurchase.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000)
      : item.dueDate

  const cardProps: {
    item: Item
    quantity: number
    tags: Array<{ id: string; name: string; typeId: string }>
    tagTypes: Array<{ id: string; name: string; color?: string }>
    estimatedDueDate?: Date
    onConsume: () => void
    onAdd: () => void
  } = {
    item,
    quantity,
    tags,
    tagTypes,
    onConsume,
    onAdd,
  }

  if (estimatedDueDate) {
    cardProps.estimatedDueDate = estimatedDueDate
  }

  return <ItemCard {...cardProps} />
}
```

**Step 2: Update index.tsx**

In `src/routes/index.tsx`:
- Add import: `import { PantryItem } from '@/components/PantryItem'`
- Remove the PantryItem component function (lines 85-133)
- Update the usage to just `<PantryItem ... />` (component logic is already extracted)

**Step 3: Verify TypeScript**

Run: `pnpmtypecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/PantryItem.tsx src/routes/index.tsx
git commit -m "refactor: extract PantryItem component"
```

---

## Task 6: Extract ShoppingItemWithQuantity Component

**Files:**
- Create: `src/components/ShoppingItemWithQuantity.tsx`
- Modify: `src/routes/shopping.tsx` (lines 163-191)

**Step 1: Create ShoppingItemWithQuantity.tsx**

Copy the ShoppingItemWithQuantity component from shopping.tsx lines 163-191:

```tsx
import { useQuery } from '@tanstack/react-query'
import { ShoppingItemCard } from '@/components/ShoppingItemCard'
import { getCurrentQuantity } from '@/db/operations'
import type { Item } from '@/types'

export function ShoppingItemWithQuantity({
  item,
  cartItem,
  onAddToCart,
  onUpdateQuantity,
  onRemove,
}: {
  item: Item
  cartItem: { id: string; cartId: string; itemId: string; quantity: number } | undefined
  onAddToCart: () => void
  onUpdateQuantity: (qty: number) => void
  onRemove: () => void
}) {
  const { data: quantity = 0 } = useQuery({
    queryKey: ['items', item.id, 'quantity'],
    queryFn: () => getCurrentQuantity(item.id),
  })

  return (
    <ShoppingItemCard
      item={item}
      currentQuantity={quantity}
      onAddToCart={onAddToCart}
      onUpdateQuantity={onUpdateQuantity}
      onRemove={onRemove}
      {...(cartItem ? { cartItem } : {})}
    />
  )
}
```

**Step 2: Update shopping.tsx**

In `src/routes/shopping.tsx`:
- Add import: `import { ShoppingItemWithQuantity } from '@/components/ShoppingItemWithQuantity'`
- Remove the ShoppingItemWithQuantity component function (lines 163-191)

**Step 3: Verify TypeScript**

Run: `pnpmtypecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/ShoppingItemWithQuantity.tsx src/routes/shopping.tsx
git commit -m "refactor: extract ShoppingItemWithQuantity component"
```

---

## Task 7: Final Verification

**Step 1: Run all checks**

```bash
npm test
pnpmlint
pnpmtypecheck
pnpmbuild
```

Expected: All pass, no errors

**Step 2: Visual verification**

Run: `pnpmdev`

Test in browser:
- Navigate to Settings > Tags - verify tag management works
- Navigate to Pantry - verify items display correctly
- Navigate to Shopping - verify shopping mode works
- Check all dialogs open/close correctly

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```

---

## Summary

**Files created:** 6 new components
- TagBadge.tsx
- TagDetailDialog.tsx
- EditTagTypeDialog.tsx
- AddTagDialog.tsx
- PantryItem.tsx
- ShoppingItemWithQuantity.tsx

**Files modified:** 3 route files
- src/routes/settings/tags.tsx (435 → ~260 lines, 40% reduction)
- src/routes/index.tsx (135 → ~85 lines, 37% reduction)
- src/routes/shopping.tsx (191 → ~170 lines, 11% reduction)

**Total tasks:** 7 (6 extractions + 1 verification)
