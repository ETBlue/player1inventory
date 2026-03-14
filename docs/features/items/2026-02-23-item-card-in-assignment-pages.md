# ItemCard in Tag and Recipe Assignment Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace custom item-row JSX on the tag items and recipe items pages with `ItemCard`, and unify the ItemCard prop API to remove mode-specific props.

**Architecture:** Refactor ItemCard first (unified, mode-agnostic behavior props), update all existing callsites (PantryItem, shopping page) to use new API, then replace the custom JSX on tag items and recipe items pages with ItemCard.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, TanStack Query, Vitest

---

### Task 1: Update ItemCard props interface

**Files:**
- Modify: `src/components/ItemCard.tsx` (lines 1–28)

**Context:** ItemCard currently has mode-specific props (`cartItem`, `onToggleCart`, `onUpdateCartQuantity`, `onConsume`, `onAdd`). Replace them with unified props that work across all modes.

**Step 1: Update the import line — remove `CartItem`**

In `src/components/ItemCard.tsx` line 11, `CartItem` will no longer be needed. Change:

```ts
import type { CartItem, Item, Tag, TagType } from '@/types'
```

to:

```ts
import type { Item, Tag, TagType } from '@/types'
```

**Step 2: Replace the `ItemCardProps` interface**

Replace lines 13–28 with:

```ts
interface ItemCardProps {
  item: Item
  quantity: number
  tags: Tag[]
  tagTypes: TagType[]
  estimatedDueDate?: Date
  onTagClick?: (tagId: string) => void
  showTags?: boolean
  mode?: 'pantry' | 'shopping' | 'tag-assignment' | 'recipe-assignment'
  // Unified behavior props (mode-agnostic)
  isChecked?: boolean
  onCheckboxToggle?: () => void
  controlAmount?: number       // shown in right-side controls (cart qty, recipe amount)
  minControlAmount?: number    // minimum before minus disables (default: 1)
  onAmountChange?: (delta: number) => void
  disabled?: boolean           // disables checkbox and amount buttons (e.g. while saving)
}
```

**Step 3: Update the function destructuring signature**

Replace lines 30–44 with:

```ts
export function ItemCard({
  item,
  quantity,
  tags,
  tagTypes,
  estimatedDueDate,
  onTagClick,
  showTags = true,
  mode = 'pantry',
  isChecked,
  onCheckboxToggle,
  controlAmount,
  minControlAmount = 1,
  onAmountChange,
  disabled,
}: ItemCardProps) {
```

**Step 4: Run TypeScript check to see what's broken**

```bash
pnpm check
```

Expected: TypeScript errors at every callsite still using old props (`PantryItem.tsx`, `shopping.tsx`, any stories/tests). That's fine — we'll fix them in subsequent tasks.

---

### Task 2: Update ItemCard rendering

**Files:**
- Modify: `src/components/ItemCard.tsx` (lines 44–246)

**Context:** Three rendering areas need to change: (1) Card margins, (2) left checkbox, (3) right-side controls. Also clean up the `mode === 'pantry'` branch in CardHeader.

**Step 1: Update Card className — prop-driven margins**

Replace line 61:

```tsx
// OLD
className={cn(mode === 'shopping' ? 'ml-10 mr-28' : '')}

// NEW
className={cn(
  onCheckboxToggle ? 'ml-10' : '',
  controlAmount !== undefined ? 'mr-28' : '',
)}
```

**Step 2: Replace left checkbox block**

Replace lines 63–74 (the `{mode === 'shopping' && <Checkbox ...>}` block):

```tsx
{onCheckboxToggle && (
  <Checkbox
    checked={!!isChecked}
    onCheckedChange={() => onCheckboxToggle()}
    disabled={disabled}
    aria-label={
      isChecked
        ? `Remove ${item.name}`
        : `Add ${item.name}`
    }
    className="absolute -ml-10"
  />
)}
```

**Step 3: Replace right-side amount controls block**

Replace lines 75–108 (the `{mode === 'shopping' && cartItem && <div ...>}` block) with:

```tsx
{controlAmount !== undefined && (
  <div className="flex items-stretch absolute -right-26 top-1.5">
    <Button
      variant="neutral-outline"
      size="icon"
      className="rounded-tr-none rounded-br-none"
      onClick={(e) => {
        e.preventDefault()
        onAmountChange?.(-1)
      }}
      aria-label={`Decrease quantity of ${item.name}`}
      disabled={disabled || (controlAmount ?? 0) <= minControlAmount}
    >
      <Minus className="h-4 w-4" />
    </Button>
    <span className="flex items-center justify-center text-sm text-center w-[2rem] border-b border-t border-accessory-emphasized">
      {controlAmount}
    </span>
    <Button
      variant="neutral-outline"
      size="icon"
      className="rounded-tl-none rounded-bl-none"
      onClick={(e) => {
        e.preventDefault()
        onAmountChange?.(1)
      }}
      aria-label={`Increase quantity of ${item.name}`}
      disabled={disabled}
    >
      <Plus className="h-4 w-4" />
    </Button>
  </div>
)}
```

**Step 4: Replace pantry ± buttons in CardHeader**

Replace lines 150–178 (the `{mode === 'pantry' && <div>}` block) with:

```tsx
{onAmountChange && controlAmount === undefined && (
  <div>
    <Button
      className="rounded-tr-none rounded-br-none"
      variant="neutral-outline"
      size="icon"
      onClick={(e) => {
        e.preventDefault()
        onAmountChange(-(item.consumeAmount ?? 1))
      }}
      disabled={disabled || quantity <= 0}
      aria-label={`Consume ${item.name}`}
    >
      <Minus className="h-4 w-4" />
    </Button>
    <Button
      className="-ml-px rounded-tl-none rounded-bl-none"
      variant="neutral-outline"
      size="icon"
      onClick={(e) => {
        e.preventDefault()
        onAmountChange(1)
      }}
      disabled={disabled}
      aria-label={`Add ${item.name}`}
    >
      <Plus className="h-4 w-4" />
    </Button>
  </div>
)}
```

**Step 5: Run TypeScript check again**

```bash
pnpm check
```

Expected: Same callsite errors as before — the interface is now correct, callsites still need updating.

---

### Task 3: Update PantryItem

**Files:**
- Modify: `src/components/PantryItem.tsx`

**Context:** PantryItem wraps ItemCard. Its own interface (`onConsume`, `onAdd`) stays the same (the pantry page passes these). Internally, translate them to `onAmountChange`.

**Step 1: Update the ItemCard usage inside PantryItem**

Replace lines 40–52 (the `return <ItemCard .../>` block):

```tsx
return (
  <ItemCard
    item={item}
    quantity={quantity}
    tags={tags}
    tagTypes={tagTypes}
    showTags={showTags}
    {...(estimatedDueDate ? { estimatedDueDate } : {})}
    onAmountChange={(delta) => {
      if (delta > 0) onAdd()
      else onConsume()
    }}
    {...(onTagClick ? { onTagClick } : {})}
  />
)
```

**Step 2: Run TypeScript check**

```bash
pnpm check
```

Expected: PantryItem errors resolved. Shopping page errors remain.

---

### Task 4: Update shopping page

**Files:**
- Modify: `src/routes/shopping.tsx` (the `renderItemCard` function, lines 136–156)

**Context:** Shopping page uses the old `cartItem`, `onToggleCart`, `onUpdateCartQuantity`, `onConsume`, `onAdd` props. Replace with new unified props.

**Step 1: Update `renderItemCard`**

Replace lines 136–156:

```tsx
function renderItemCard(item: Item, className?: string) {
  const ci = cartItemMap.get(item.id)
  const itemTags = tags.filter((t) => item.tagIds.includes(t.id))
  const quantity = getCurrentQuantity(item)
  return (
    <div key={item.id} className={className}>
      <ItemCard
        item={item}
        quantity={quantity}
        tags={itemTags}
        tagTypes={tagTypes}
        mode="shopping"
        isChecked={!!ci}
        controlAmount={ci?.quantity}
        onCheckboxToggle={() => handleToggleCart(item)}
        onAmountChange={(delta) => {
          const newQty = (ci?.quantity ?? 0) + delta
          if (newQty >= 1) handleUpdateCartQuantity(item, newQty)
        }}
      />
    </div>
  )
}
```

Note: `ci?.quantity` is `undefined` when item is not in cart, which hides the right-side amount controls for un-carted items. The `onAmountChange` handler guards against qty < 1 as a safety net.

**Step 2: Run TypeScript check — expect zero errors**

```bash
pnpm check
```

Expected: All TypeScript errors resolved.

**Step 3: Run tests**

```bash
pnpm test
```

Expected: All existing tests pass. If any test references old prop names (`onConsume`, `onAdd`, `cartItem`, `onToggleCart`, `onUpdateCartQuantity`), update them to use new props.

**Step 4: Commit**

```bash
git add src/components/ItemCard.tsx src/components/PantryItem.tsx src/routes/shopping.tsx
git commit -m "refactor(item-card): unify props - replace mode-specific props with isChecked/onCheckboxToggle/controlAmount/onAmountChange"
```

---

### Task 5: Update ItemCard stories

**Files:**
- Modify: `src/components/ItemCard.stories.tsx`

**Context:** Existing stories use old props and will show TypeScript errors. Update them and add stories for the two new modes.

**Step 1: Fix all existing stories**

For any story that passes `onConsume`, `onAdd`, `cartItem`, `onToggleCart`, or `onUpdateCartQuantity`:
- Replace `onConsume={() => {}}` and `onAdd={() => {}}` with `onAmountChange={() => {}}`
- Replace `cartItem={...}` with `isChecked={true}` and `controlAmount={cartItem.quantity}`
- Replace `onToggleCart={...}` with `onCheckboxToggle={...}`
- Replace `onUpdateCartQuantity={...}` with `onAmountChange={...}`

**Step 2: Add a `tag-assignment` mode story**

```tsx
export const TagAssignment: Story = {
  args: {
    ...Default.args,
    mode: 'tag-assignment',
    isChecked: true,
    onCheckboxToggle: () => {},
  },
}

export const TagAssignmentUnchecked: Story = {
  args: {
    ...Default.args,
    mode: 'tag-assignment',
    isChecked: false,
    onCheckboxToggle: () => {},
  },
}
```

**Step 3: Add a `recipe-assignment` mode story**

```tsx
export const RecipeAssignment: Story = {
  args: {
    ...Default.args,
    mode: 'recipe-assignment',
    isChecked: true,
    controlAmount: 2,
    onCheckboxToggle: () => {},
    onAmountChange: () => {},
  },
}

export const RecipeAssignmentUnchecked: Story = {
  args: {
    ...Default.args,
    mode: 'recipe-assignment',
    isChecked: false,
    onCheckboxToggle: () => {},
    // No controlAmount — hides the amount controls
  },
}
```

**Step 4: Verify in Storybook**

```bash
pnpm storybook
```

Open the browser and check that all ItemCard stories render correctly in all four modes.

**Step 5: Commit**

```bash
git add src/components/ItemCard.stories.tsx
git commit -m "chore(storybook): update ItemCard stories for unified props and new modes"
```

---

### Task 6: Update tag items page

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`

**Context:** This page has a custom JSX list (checkbox + name + other-tag badges). Replace it with ItemCard. The page already loads `useTags()` — add `useTagTypes()`.

**Step 1: Update imports**

Add to imports:
```ts
import { ItemCard } from '@/components/ItemCard'
import { useTagTypes } from '@/hooks'
import { getCurrentQuantity } from '@/lib/quantityUtils'
```

Remove imports that are no longer needed in the JSX:
```ts
// Remove these lines:
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
```

**Step 2: Add `useTagTypes` hook call**

After the existing hooks (around line 18), add:

```ts
const { data: tagTypes = [] } = useTagTypes()
```

**Step 3: Replace the item list JSX**

Replace the entire `<div className="space-y-2">` block (lines 120–169) that maps items to rows with:

```tsx
<div className="space-y-px">
  {filteredItems.map((item) => {
    const itemTags = (item.tagIds ?? [])
      .filter((tid) => tid !== tagId)
      .map((tid) => tagMap[tid])
      .filter((t): t is NonNullable<typeof t> => t != null)

    return (
      <ItemCard
        key={item.id}
        mode="tag-assignment"
        item={item}
        quantity={getCurrentQuantity(item)}
        tags={itemTags}
        tagTypes={tagTypes}
        isChecked={isAssigned(item.tagIds)}
        onCheckboxToggle={() => handleToggle(item.id, item.tagIds)}
        disabled={savingItemIds.has(item.id)}
      />
    )
  })}
  {filteredItems.length === 0 && search.trim() && (
    <button
      type="button"
      className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
      onClick={handleCreateFromSearch}
      disabled={createItem.isPending}
    >
      <Plus className="h-4 w-4" />
      Create "{search.trim()}"
    </button>
  )}
</div>
```

Note: `itemTags` excludes the current tag (only OTHER tags are shown in the card, same intent as the old `otherTags` badges).

**Step 4: Run TypeScript check**

```bash
pnpm check
```

**Step 5: Run tests**

```bash
pnpm test
```

**Step 6: Commit**

```bash
git add src/routes/settings/tags/$id/items.tsx
git commit -m "feat(tag-items): use ItemCard for item list"
```

---

### Task 7: Update recipe items page

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx`

**Context:** This page has a custom JSX list (checkbox + name + amount controls). Replace with ItemCard. Currently has no `useTags` or `useTagTypes` — add both.

**Step 1: Update imports**

Add to imports:
```ts
import { ItemCard } from '@/components/ItemCard'
import { useTags, useTagTypes } from '@/hooks'
import { getCurrentQuantity } from '@/lib/quantityUtils'
```

Add `useMemo` to the React import (needed for tagMap):
```ts
import { useMemo, useRef, useState } from 'react'
```

Remove imports no longer needed in JSX:
```ts
// Remove these lines:
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
```

Keep `Plus` only if still used by the "Create" button at the bottom. Check: yes, the `Create "..."` button at the bottom still uses `<Plus className="h-4 w-4" />`, so keep that import.

**Step 2: Add new hook calls and tagMap**

After the existing hooks (around line 19), add:

```ts
const { data: tags = [] } = useTags()
const { data: tagTypes = [] } = useTagTypes()

const tagMap = useMemo(
  () => Object.fromEntries(tags.map((t) => [t.id, t])),
  [tags],
)
```

**Step 3: Replace the item list JSX**

Replace the entire `<div className="space-y-2">` block (lines 168–233) with:

```tsx
<div className="space-y-px">
  {filteredItems.map((item) => {
    const assigned = isAssigned(item.id)
    const itemTags = (item.tagIds ?? [])
      .map((tid) => tagMap[tid])
      .filter((t): t is NonNullable<typeof t> => t != null)

    return (
      <ItemCard
        key={item.id}
        mode="recipe-assignment"
        item={item}
        quantity={getCurrentQuantity(item)}
        tags={itemTags}
        tagTypes={tagTypes}
        isChecked={assigned}
        onCheckboxToggle={() => handleToggle(item.id, item.consumeAmount ?? 1)}
        controlAmount={assigned ? getDefaultAmount(item.id) : undefined}
        minControlAmount={0}
        onAmountChange={(delta) => handleAdjustDefaultAmount(item.id, delta)}
        disabled={savingItemIds.has(item.id)}
      />
    )
  })}
  {filteredItems.length === 0 && search.trim() && (
    <button
      type="button"
      className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
      onClick={handleCreateFromSearch}
      disabled={createItem.isPending}
    >
      <Plus className="h-4 w-4" />
      Create "{search.trim()}"
    </button>
  )}
</div>
```

Notes:
- `controlAmount={assigned ? getDefaultAmount(item.id) : undefined}` — `undefined` when not assigned hides the amount controls
- `minControlAmount={0}` — allows amount to reach 0 (the existing `handleAdjustDefaultAmount` already guards against negatives via `Math.max(0, ...)`)
- `onAmountChange={(delta) => handleAdjustDefaultAmount(item.id, delta)}` — the existing handler multiplies delta by `item.consumeAmount` step size internally, so ItemCard just passes ±1

**Step 4: Run TypeScript check**

```bash
pnpm check
```

**Step 5: Run tests**

```bash
pnpm test
```

**Step 6: Commit**

```bash
git add src/routes/settings/recipes/$id/items.tsx
git commit -m "feat(recipe-items): use ItemCard for item list"
```

---

### Task 8: Final verification

**Step 1: Full TypeScript + lint check**

```bash
pnpm check
```

Expected: Zero errors or warnings.

**Step 2: Full test suite**

```bash
pnpm test
```

Expected: All tests pass.

**Step 3: Production build**

```bash
pnpm build
```

Expected: Build succeeds with no errors.
