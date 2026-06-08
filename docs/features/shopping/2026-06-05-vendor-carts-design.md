# Shopping — Vendor-Based Carts

> Supersedes `2026-04-04-shopping-vendor-carts-design.md` (which had open questions; all are now resolved below).

## Overview

Restructure the shopping feature so each vendor has its own independent cart. The existing single-cart shopping page becomes a two-level experience: a vendor cart list at `/shopping` and a per-vendor cart page at `/shopping/$vendorId`.

## Motivation

Real shopping trips are per-store. When a user plans a Costco run and an iHerb order simultaneously, mixing all vendors in one list creates cognitive load. Per-vendor carts make it natural to shop one store at a time and check out independently.

## Resolved Design Decisions

| Question | Decision |
|---|---|
| Cart state shared or per-vendor? | **Per-vendor** — each vendor cart is fully independent |
| Items in multiple vendor carts? | **Yes** — checking item in Vendor A doesn't affect Vendor B's cart |
| Items with no vendor? | **Separate "No vendor" cart** (URL: `/shopping/no-vendor`) |
| Show empty vendor carts? | **Always** — all vendors shown, even with 0 checked items |
| Controls in vendor cart page? | **Full controls** — filter, sort, search retained (no vendor dropdown) |

---

## UX Flow

### Root Shopping Page (`/shopping`)

Replaces the current single shopping page as the entry point.

**Toolbar:**
```
[Shopping]              [Sort ▾]
```

**Content — Vendor Cart Card List:**
- One card per vendor (from the vendors list) + one "No vendor" card at the bottom
- All cards shown regardless of whether items are checked
- Card shows:
  - Vendor name (or "No vendor")
  - Checked item count + total quantity (e.g. "3 items · 7 packs checked")
  - Total available items from this vendor (e.g. "of 12 available")
  - Visual highlight (border or badge) when at least one item is checked
- Tapping a card navigates to `/shopping/$vendorId` (or `/shopping/no-vendor`)

**Sort options (persisted in URL / localStorage):**
- **Last visited** (default) — vendor with most recent visit on top
- **Alphabetical** — by vendor name A–Z
- **Most items** — by total available item count descending
- "No vendor" card always appears last regardless of sort

### Per-Vendor Cart Page (`/shopping/$vendorId`)

Replaces the current shopping page UI, scoped to one vendor.

**Toolbar row 1 (top):**
```
[← Back]                [Vendor Name]
```

**Toolbar row 2 (action row):**
```
[X packs checked]       [Cancel ×]   [Done ✓]
```
- Same semantics as current row 1 (count + cancel + checkout)
- Cancel: abandons **only this vendor's cart** (not other vendors)
- Done: checks out **only this vendor's cart items**

**Toolbar row 3 (filter/sort row):**
```
[Filter ⚙]  [Sort ▾]  [Direction ↑↓]  [Search 🔍]
```
- Same as current `ItemListToolbar` but **without** the vendor dropdown
- Scope is locked to the current vendor

**Main content (same as current shopping page):**
- Cart section: items checked into this vendor's cart
- Divider
- Pending section: items available from this vendor, not yet checked
- Pinning, quantity controls, and checkout confirmation dialog unchanged

**"No vendor" cart page** (`/shopping/no-vendor`):
- Same UI, shows items with empty `vendorIds` array
- Toolbar row 1: `[← Back]` + `[No vendor]` title

---

## Data Model Changes

### `ShoppingCart` — add two fields

```typescript
interface ShoppingCart {
  id: string
  vendorId: string | null  // NEW — null = "No vendor" cart; vendorId = specific vendor
  lastVisitedAt: Date | null  // NEW — for "last visited" sort order
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  completedAt?: Date
}
```

### `CartItem` — unchanged

```typescript
interface CartItem {
  id: string
  cartId: string
  itemId: string
  quantity: number  // 0 = pinned (keep in cart but don't buy)
}
```

### Multiple active carts

- Many carts can have `status: 'active'` simultaneously — one per vendorId
- `getOrCreateActiveCart(vendorId: string | null)` finds the active cart for that vendor or creates one
- `getAllActiveCarts()` returns all active carts (for the root page)

### Database migration (Dexie version bump)

- Add `vendorId: null` to all existing `shoppingCarts` rows (existing cart → "No vendor")
- Add `lastVisitedAt: null` to all existing rows
- Existing cart items remain untouched (they stay in the "No vendor" cart)
- Update Dexie table definition: `shoppingCarts: 'id, status, vendorId, createdAt, completedAt'`

---

## Route Structure

```
shopping.tsx              → /shopping (vendor cart list — new root page)
shopping.$vendorId.tsx    → /shopping/$vendorId (per-vendor cart page)
```

- `$vendorId` is a real vendor UUID for normal vendors
- The literal string `'no-vendor'` in the URL maps to `vendorId: null` in the database
- `shopping.tsx` no longer renders the cart UI — it becomes the vendor list

---

## Component Inventory

### New components
- `VendorCartCard` — card for the vendor cart list (name, checked count, available count)

### Modified components
- `shopping.tsx` — replace cart UI with vendor card list + sort toolbar
- `shopping.$vendorId.tsx` — new file containing current shopping cart UI, adapted for vendor scope
- `ItemListToolbar` — pass `hideVendor?: boolean` prop to suppress vendor dropdown in vendor cart context
- Shopping toolbar — split into two rows: row 1 (back + name), row 2 (count + cancel/done)

### Unchanged components
- `ItemCard` in shopping mode
- Checkout confirmation dialog
- Pin/unpin logic
- Tag/recipe filter panel

---

## Hook Changes

| Hook | Change |
|---|---|
| `useActiveCart()` | **Deprecated** → replaced by `useVendorCart(vendorId)` |
| `useVendorCart(vendorId)` | **New** — gets or creates the active cart for a specific vendor |
| `useAllActiveCarts()` | **New** — returns all active carts with their vendor info and item counts |
| `useCartItems(cartId)` | Unchanged |
| `useCheckout()` | Updated — takes `cartId`, checks out only that cart's items |
| `useAbandonCart()` | Unchanged — already takes `cartId` |
| `useAddToCart()` | Updated — caller passes the `cartId` for the target vendor |
| `useVendorItemCounts()` | Unchanged — used by root page for "X available" counts |

`lastVisitedAt` is updated via a `useUpdateCartLastVisited()` mutation called when navigating to a vendor cart page.

---

## Checkout Behavior

- Checkout in `/shopping/$vendorId` processes **only that vendor's cart items**
- Pinned items from the checked-out cart are moved to a new cart **for the same vendor**
- Other vendors' carts are unaffected
- Inventory log entry: same as current — `"Purchased at {vendor}"` or `"Purchased"` for "No vendor" cart

---

## Migration for Existing Cart Data

On first load after the upgrade, Dexie version migration runs automatically:
1. All existing `shoppingCarts` rows get `vendorId = null` and `lastVisitedAt = null`
2. No cart items are moved or deleted
3. The existing active cart becomes the "No vendor" cart
4. Users who had items checked across multiple vendors will find them all in the "No vendor" cart; they can re-add to vendor-specific carts on their next shopping trip

---

## Out of Scope

- Vendor cart ordering within a single vendor (same as current item sort)
- Price tracking or per-vendor unit costs
- Sharing vendor carts across users
- Bulk "add all to Vendor X's cart" action
- Vendor cart templates / recurring lists

---

## Status

🔲 Pending — implementation plan not yet written
