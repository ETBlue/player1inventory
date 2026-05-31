# Quick Update Dialog — Design

**Date:** 2026-05-31  
**Branch:** `feature/quick-update-dialog`  
**Status:** Pending implementation

---

## Goal

Replace the repeated +/- button clicks in the pantry ItemCard with a single "quick update" icon button that opens a dialog. The user adjusts quantities locally in the dialog and submits with one HTTP request.

---

## Problem

Each +/- click in the pantry page triggers an HTTP mutation. For users who need 4–10 increments per item, this results in 4–10 round trips — slow and frustrating.

---

## Solution Overview

- **Trigger**: Replace both +/- buttons in the pantry ItemCard header with one icon button
- **Dialog**: Local editing of `packedQuantity` and `unpackedQuantity` with instant actions, then single-request submit

---

## Component Design

### `QuickUpdateDialog`

**Location:** `apps/web/src/components/item/QuickUpdateDialog/`  
**Files:** `QuickUpdateDialog.tsx`, `index.ts`, `QuickUpdateDialog.stories.tsx`, `QuickUpdateDialog.stories.test.tsx`

```typescript
interface QuickUpdateDialogProps {
  item: Item
  isOpen: boolean
  onClose: () => void
  onSubmit: (updates: { packedQuantity: number; unpackedQuantity: number }) => Promise<void>
}
```

**Internal state:**
- `localPacked: number` — initialized from `item.packedQuantity`
- `localUnpacked: number` — initialized from `item.unpackedQuantity`
- `isPending: boolean` — true while submit request is in-flight

**Dialog layout:**

```
┌─────────────────────────────────────┐
│ Update [item name]             [✕]  │
├─────────────────────────────────────┤
│ Packed      [ − ] [ 2  ] [ + ]      │
│ Unpacked    [ − ] [ 1  ] [ + ]      │
├─────────────────────────────────────┤
│ [Clear]  [Fill to Full]  [Open Pkg] │  ← "Open Pkg" hidden if no packageUnit
├─────────────────────────────────────┤
│ ████████░░░░░░░░░░  4 / 6           │  ← live progress bar
├─────────────────────────────────────┤
│                 [Cancel]  [Update]  │
└─────────────────────────────────────┘
```

---

## Dialog Actions

### Row Steppers (+/-)

Each row (Packed, Unpacked) has its own `−` and `+` buttons that step by `item.consumeAmount`:

- **Packed `+`**: `localPacked += consumeAmount`
- **Packed `−`**: `localPacked = Math.max(0, localPacked − consumeAmount)`
- **Unpacked `+`**: `localUnpacked += consumeAmount`
- **Unpacked `−`**: `localUnpacked = Math.max(0, localUnpacked − consumeAmount)`

Values are floored at 0 — neither can go negative.

### Manual Input

Each row's value is an editable number input. Accepts non-negative numbers. Invalid input (empty, negative) clamps to 0 on blur.

### Clear

Sets `localPacked = 0`, `localUnpacked = 0`.

### Fill to Full

Sets `localPacked = item.targetQuantity`, `localUnpacked = 0`.

### Open Package *(only shown when `item.packageUnit` is defined)*

Decreases `localPacked` by 1 (floor 0), increases `localUnpacked` by `item.amountPerPackage ?? 1`.  
Disabled when `localPacked === 0`.

---

## Live Progress Bar

Reuses the existing progress bar component. Computed from local state:

```typescript
const localTotal =
  item.targetUnit === 'measurement' && item.amountPerPackage
    ? localPacked * item.amountPerPackage + localUnpacked
    : localPacked + localUnpacked

const progress = item.targetQuantity > 0 ? localTotal / item.targetQuantity : 1
```

The bar updates instantly on every local state change before submit.

---

## Row Labels

| Item type | Packed row label | Unpacked row label |
|---|---|---|
| Has `packageUnit` | `packageUnit` value (e.g. "box") | `measurementUnit` value (e.g. "oz") |
| No `packageUnit` | "Packed" | "Unpacked" |

---

## Submit

On "Update" click:

1. Sets `isPending = true`, disables all inputs and buttons
2. Calls `onSubmit({ packedQuantity: localPacked, unpackedQuantity: localUnpacked })`
3. On success: `onClose()` — dialog unmounts, ItemCard re-renders with fresh data
4. On error: clears `isPending`, keeps dialog open so user can retry
5. `dueDate` is **never** included in the submit payload

---

## Changes to Existing Components

### `ItemCard.tsx`

In pantry mode, remove the two `−` / `+` buttons and the `onAmountChange` prop. Add:

- `onQuickUpdate?: () => void` — opens the dialog (called from pantry page)
- Render a single icon button (e.g. `Pencil` from lucide-react) where the +/- buttons were

The `isPending` prop and its spinner remain — used while the dialog submit is in-flight.

### `routes/index.tsx` (PantryView)

- Remove `onAmountChange` handler logic
- Add `quickUpdateItemId: string | null` state
- Render one `<QuickUpdateDialog>` instance (outside the list, controlled by `quickUpdateItemId`)
- Pass the `onSubmit` handler that calls `updateItem.mutateAsync({ id, updates: { packedQuantity, unpackedQuantity } })` — no `dueDate`

---

## What Does NOT Change

- `addItem` / `consumeItem` utility functions — no longer called from pantry page for the quick update flow
- All other modes (shopping, cooking, tag-assignment, recipe-assignment) — unchanged
- Cloud vs local mode handling in `useUpdateItem` — unchanged; the dialog just calls the same hook

---

## Files to Create / Modify

| Action | File |
|---|---|
| Create | `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx` |
| Create | `apps/web/src/components/item/QuickUpdateDialog/index.ts` |
| Create | `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.stories.tsx` |
| Create | `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.stories.test.tsx` |
| Modify | `apps/web/src/components/item/ItemCard/ItemCard.tsx` |
| Modify | `apps/web/src/routes/index.tsx` |
| Update | `apps/web/src/components/item/ItemCard/ItemCard.stories.tsx` (remove/update pantry-mode stories) |

---

## Out of Scope

- Editing `dueDate` in the dialog
- Cooking / shopping page amount adjustment (separate feature)
- Animated transitions in the progress bar inside the dialog
