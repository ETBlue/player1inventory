# ItemCard Button Loading States — Implementation Plan

## Goal

Show a spinner on the specific +/- button that was clicked while its HTTP mutation is in flight, instead of just silently disabling the card.

## Scope

| File | Change |
|------|--------|
| `apps/web/src/components/item/ItemCard/ItemCard.tsx` | Add `isPending` prop + local direction tracking + spinner icon |
| `apps/web/src/routes/shopping.tsx` | Pass `isPending={pendingItemIds.has(item.id)}` to ItemCard |
| `apps/web/src/routes/index.tsx` | Add per-item `pendingItemIds` tracking + pass `isPending` to ItemCard |

**Not in scope:** `cooking.tsx` — amount changes there are local state only (no HTTP), no loading needed.

## Design

### New `ItemCard` prop

```ts
isPending?: boolean  // true while a mutation is in progress for this item
```

Distinct from `disabled`: `disabled` blocks interaction for any reason (e.g. quantity at min);
`isPending` signals a mutation is in progress and drives the spinner.

### Internal state

```ts
const [pendingDirection, setPendingDirection] = useState<-1 | 1 | null>(null)
```

- Set to `-1` or `1` when the corresponding button is clicked (before calling `onAmountChange`)
- Reset to `null` when `isPending` transitions from `true` to `false` via `useEffect`

### Visual behaviour

- `isPending && pendingDirection === -1` → minus button shows `<Loader2 className="h-4 w-4 animate-spin" />`
- `isPending && pendingDirection === 1` → plus button shows `<Loader2 className="h-4 w-4 animate-spin" />`
- Otherwise → normal `<Minus />` / `<Plus />` icons
- Both buttons remain `disabled` while `isPending` (same as today via `disabled` prop from caller)

Applies to **both** button groups: shopping/recipe-assignment/cooking (absolute-positioned overlay) and pantry (inline header).

### `shopping.tsx` update

`renderItemCard` already has `disabled={pendingItemIds.has(item.id)}`. Add:
```tsx
isPending={pendingItemIds.has(item.id)}
```

### `index.tsx` (pantry) update

Currently no per-item pending tracking exists. Add:
```tsx
const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
```

Wrap each `onAmountChange` handler:
```tsx
onAmountChange={async (delta) => {
  setPendingItemIds(prev => new Set(prev).add(item.id))
  try {
    // ... existing mutation logic
  } finally {
    setPendingItemIds(prev => {
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })
  }
}}
```

Pass `isPending={pendingItemIds.has(item.id)}` to ItemCard.

## Tasks

### Task 1 — Update ItemCard to support visual loading states

**File:** `apps/web/src/components/item/ItemCard/ItemCard.tsx`

1. Add `import { Loader2 } from 'lucide-react'` (alongside existing imports)
2. Add `isPending?: boolean` to `ItemCardProps`
3. Add `isPending = false` to the destructured props
4. Add state: `const [pendingDirection, setPendingDirection] = useState<-1 | 1 | null>(null)`
5. Add effect:
   ```ts
   useEffect(() => {
     if (!isPending) setPendingDirection(null)
   }, [isPending])
   ```
6. In the shopping/recipe-assignment/cooking button group (lines ~122–157):
   - Minus button: call `setPendingDirection(-1)` before `onAmountChange?.(-1)`; show `<Loader2 className="h-4 w-4 animate-spin" />` when `isPending && pendingDirection === -1`
   - Plus button: call `setPendingDirection(1)` before `onAmountChange?.(1)`; show `<Loader2 className="h-4 w-4 animate-spin" />` when `isPending && pendingDirection === 1`
7. In the pantry button group (lines ~200–229):
   - Minus button: call `setPendingDirection(-1)` before `onAmountChange(-(item.consumeAmount ?? 1))`; show spinner when `isPending && pendingDirection === -1`
   - Plus button: call `setPendingDirection(1)` before `onAmountChange(1)`; show spinner when `isPending && pendingDirection === 1`

After implementation: run `pnpm --filter web tsc --noEmit` from repo root to verify no type errors.

Commit message: `feat(item-card): add isPending prop and per-button loading spinner`

### Task 2 — Wire isPending in shopping.tsx and index.tsx

**Files:** `apps/web/src/routes/shopping.tsx`, `apps/web/src/routes/index.tsx`

#### shopping.tsx

In `renderItemCard` (line ~229), add `isPending={pendingItemIds.has(item.id)}` alongside the existing `disabled` prop. No other changes needed.

#### index.tsx

1. Add `const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())` near the top of the component (near other useState calls)
2. For **both** the `activeItems` and `inactiveItems` ItemCard instances, wrap the existing `onAmountChange` async handler:
   - Add `setPendingItemIds(prev => new Set(prev).add(item.id))` at the start
   - Wrap the existing `updateItem.mutateAsync(...)` calls in a try/finally
   - In `finally`: `setPendingItemIds(prev => { const next = new Set(prev); next.delete(item.id); return next })`
3. Add `isPending={pendingItemIds.has(item.id)}` to both ItemCard instances

After implementation: run `pnpm --filter web tsc --noEmit` from repo root.

Commit message: `feat(pantry,shopping): pass isPending to ItemCard for button loading states`
