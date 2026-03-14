# Shopping Mode Redesign

**Date:** 2026-02-17
**Status:** Approved

## Overview

Redesign the shopping mode to use the familiar pantry-style item card visual, support vendor-based filtering, and improve the cart interaction model with a checkbox toggle for adding/removing items.

## Requirements

- Item cards in shopping mode match the pantry card visual (progress bar, tags, status colors)
- Users can filter items by vendor (e.g., "show only Costco items")
- Items are sorted by stock percentage, lowest first (emptiest items on top)
- Adding to cart: checkbox toggle on each card (checking = add, unchecking = remove)
- When in cart: full card preserved, stepper `[ − ] [ qty ] [ + ]` shows cart quantity in packs
- +/- in shopping mode always operate in pack units, regardless of item's `targetUnit`
- +/- in pantry mode stay unchanged (no modification to pantry behavior)
- Inactive items collapsed at bottom (same as pantry: toggle button, full cards at 50% opacity)
- Inactive items can still be added to cart

## Data Model

### New: `Vendor` entity

```ts
interface Vendor {
  id: string
  name: string
  createdAt: Date
}
```

### Updated: `Item`

```ts
interface Item {
  // ... existing fields unchanged ...
  vendorIds: string[]   // NEW — default []
}
```

### DB Migration

- Dexie.js version bumps to **3**
- Adds `vendors` table with index on `name`
- `vendorIds` is optional on `Item` — no `.upgrade()` callback needed; existing items without `vendorIds` are handled at read-time via `item.vendorIds ?? []`

### New DB Operations

- `getVendors(): Promise<Vendor[]>`

### New Hook

- `useVendors()` — wraps `getVendors()` via TanStack Query

### Out of Scope (follow-up)

- Vendor CRUD UI (create/edit/delete vendors)
- Item-vendor assignment UI (in item detail form)
- Initial vendor data seeded manually via dev console or a seed utility

## Component Changes

### `ItemCard`

**New props:**

```ts
mode?: 'pantry' | 'shopping'            // default: 'pantry'
cartItem?: CartItem                      // present when item is in cart
onToggleCart?: () => void                // checkbox click handler
onUpdateCartQuantity?: (qty: number) => void
```

**Behavior by mode:**

| Feature | `pantry` (default) | `shopping` |
|---------|-------------------|------------|
| +/- buttons | Unchanged (consume/add) | Hidden unless in cart |
| Checkbox | Not shown | Always shown |
| Stepper `[ − qty + ]` | Not shown | Shown when in cart |
| Cart quantity badge | Not shown | Shown when in cart |

**In `shopping` mode, when not in cart:**
- Checkbox unchecked
- No stepper

**In `shopping` mode, when in cart:**
- Checkbox checked
- Stepper: `[ − ]  [qty]  [ + ]` where qty = `cartItem.quantity` (pack units)
- Minimum qty = 1; unchecking the checkbox removes item from cart entirely

**Pack unit behavior:**
- +/- always increment/decrement `cartItem.quantity` by 1 pack
- Does not use `item.consumeAmount` or `item.targetUnit`

## Shopping Route (`src/routes/shopping.tsx`)

### Layout

```
Shopping Page
├── Toolbar
│   ├── Vendor filter dropdown (shows all vendors; filters item list)
│   └── Checkout button ("Checkout (N packs)" — disabled when cart empty)
│       └── Abandon/Clear cart option (when cart has items)
├── Cart section (visible when cart has items)
│   └── ItemCard (mode="shopping", cartItem=...) per cart item
│       — full card visual preserved
│       — checkbox checked + stepper visible
├── Items section (all non-cart active items)
│   └── ItemCard (mode="shopping") per item, sorted by stock % ascending
│       — checkbox unchecked, no stepper
└── Inactive section
    ├── Toggle button: "Show/Hide N inactive items"
    └── ItemCard (mode="shopping") at 50% opacity when expanded
        — checkbox works; inactive items can be added to cart
```

### Sorting

Active items sorted by `currentQuantity / targetQuantity` ascending (0 = emptiest = top).

Edge cases:
- `targetQuantity === 0` but item not inactive: sorts to end of active section
- Inactive items (`targetQuantity === 0 && currentQuantity === 0`): collapsed section

### Vendor Filter

- Local state (not persisted, resets on navigation)
- Selecting a vendor shows only items with that `vendorId` in `item.vendorIds`
- No vendor selected = show all items
- Dropdown hidden if no vendors exist in DB

### Items Shown

All items (not restricted to below-refill-threshold). Shopping mode is a full inventory view with cart capabilities.

## Checkout Flow

No changes to existing checkout logic:

1. User clicks Checkout button
2. Creates inventory log entries for each cart item (`delta = cartItem.quantity` packs)
3. Marks cart as `completed`
4. Clears all cart items
5. Navigates to pantry (home)

Abandon cart: marks as `abandoned`, deletes cart items. Available as a secondary action when cart has items.

## Files Affected

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `Vendor` interface; add `vendorIds` to `Item` |
| `src/db/database.ts` | Bump to v3; add vendors table; migrate items |
| `src/db/operations.ts` | Add `getVendors()` |
| `src/db/operations.test.ts` | Add vendor operation tests |
| `src/hooks/useShoppingCart.ts` | No change |
| `src/hooks/useVendors.ts` | New hook |
| `src/components/ItemCard.tsx` | Add mode, cartItem, onToggleCart, onUpdateCartQuantity props |
| `src/components/ItemCard.stories.tsx` | Add Shopping mode stories |
| `src/routes/shopping.tsx` | Full restructure per layout above |
| `src/routes/shopping.test.tsx` | New / updated tests |

## Out of Scope

- Vendor CRUD (create/edit/delete vendors)
- Item-vendor assignment UI in item detail form
- Persisted vendor filter state (sessionStorage)
- Multi-vendor filter selection (select multiple vendors at once)
