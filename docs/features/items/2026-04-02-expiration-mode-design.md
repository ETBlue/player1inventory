# Expiration Mode — Design Spec

**Date:** 2026-04-02
**Status:** Approved

## Problem

Two gaps exist in the cloud/local dual-mode architecture:

1. **`useItemSortData` expiry gap:** In local mode, expiry date is auto-calculated from `estimatedDueDays + lastPurchaseDate`. In cloud mode, this calculation was never wired up — the hook only used an explicit `dueDate`. Cloud users could not rely on `"days from purchase"` expiry at all.

2. **Deserialization duplication:** Each dual-mode hook defined its own inline `deserializeCloudX()` helper to convert GraphQL ISO date strings to `Date` objects. No shared layer existed.

Additionally, `expirationMode` was implicitly inferred from which field was set (`dueDate` vs `estimatedDueDays`). This is fragile and ambiguous — both fields could be set, or neither, with no clear intent recorded.

## Solution Overview

- Add an explicit `expirationMode` field to items (stored in IndexedDB and MongoDB)
- Derive expiry date via a shared pure utility `computeExpiryDate(item, lastPurchaseDate?)`
- Wire `computeExpiryDate` into both local and cloud paths of `useItemSortData`
- Centralize all cloud deserialization into `src/lib/deserialization.ts`
- Update the item form to show a mode selector that reveals the relevant field

## Expiration Modes

```ts
type ExpirationMode = 'disabled' | 'date' | 'days from purchase'
```

| Mode | Expiry source | Revealed field |
|------|--------------|----------------|
| `'disabled'` | No tracking | — |
| `'date'` | `item.dueDate` | `dueDate` date picker |
| `'days from purchase'` | `lastPurchaseDate + item.estimatedDueDays` | `estimatedDueDays` number input |

## Section 1 — Type System & Schema

### `src/types/index.ts`

Add:
```ts
export type ExpirationMode = 'disabled' | 'date' | 'days from purchase'
```

Add `expirationMode: ExpirationMode` to the `Item` type (required, non-optional). Runtime safety: `computeExpiryDate` treats `undefined` as `'disabled'`.

### IndexedDB (Dexie) — `src/db/index.ts`

- Bump schema version
- Add `expirationMode` to the items table column string
- **No migration callback** — existing items will have `expirationMode` as `undefined`; `computeExpiryDate` handles this gracefully by treating `undefined` as `'disabled'`

### MongoDB — `apps/server/src/models/Item.model.ts`

Add to `ItemClass`:
```ts
@prop({ type: String, enum: ['disabled', 'date', 'days from purchase'], default: 'disabled' })
expirationMode?: ExpirationMode
```

Run a one-time migration script to infer `expirationMode` for existing documents:
- `estimatedDueDays` is set → `'days from purchase'`
- `dueDate` is set (no `estimatedDueDays`) → `'date'`
- neither → `'disabled'`

### GraphQL — `apps/server/src/schema/item.graphql`

Add to `Item` type:
```graphql
expirationMode: String
```

Add to `UpdateItemInput`:
```graphql
expirationMode: String
```

The field is optional in input for backwards compatibility; backend defaults to `'disabled'` if omitted.

## Section 2 — Shared Utilities

### `src/lib/expiration.ts` (new)

```ts
export function computeExpiryDate(
  item: Pick<Item, 'expirationMode' | 'dueDate' | 'estimatedDueDays'>,
  lastPurchaseDate?: Date
): Date | undefined
```

Logic:
- `undefined` or `'disabled'` → `undefined`
- `'date'` → `item.dueDate`
- `'days from purchase'` → if both `lastPurchaseDate` and `item.estimatedDueDays` are present, return `lastPurchaseDate + estimatedDueDays days`; otherwise `undefined`

### `src/lib/deserialization.ts` (new)

Centralized deserializers replacing all per-hook inline helpers:

```ts
export function deserializeItem(raw: Record<string, unknown>): Item
export function deserializeTag(raw: Record<string, unknown>): Tag
export function deserializeVendor(raw: Record<string, unknown>): Vendor
export function deserializeRecipe(raw: Record<string, unknown>): Recipe
export function deserializeCartItem(raw: Record<string, unknown>): CartItem
```

Each converts ISO date strings from GraphQL responses to `Date` objects. All existing inline `deserializeCloudX` functions in hooks are deleted and replaced with imports from here.

## Section 3 — Hook Changes

### `useItemSortData`

Both local and cloud paths call `computeExpiryDate(item, lastPurchaseDate)`.

- Local: `lastPurchaseDate` comes from the existing TanStack Query fetch
- Cloud: `lastPurchaseDate` comes from the existing `useLastPurchaseDatesQuery` (already fetched — just wasn't wired into the calculation)

No new fetches required. Output shapes of both paths become identical.

### All dual-mode data hooks

Replace inline `deserializeCloudX(...)` calls with imports from `src/lib/deserialization.ts`. No behavioral change — purely structural cleanup.

Affected hooks: `useItems`, `useItem`, `useTags`, `useTag`, `useVendors`, `useRecipes`, `useRecipe`, `useCartItems`, `useItemLogs`.

## Section 4 — Item Form UI

Replace the independent `dueDate` and `estimatedDueDays` fields with:

1. A **mode selector** (segmented control or `<Select>`) with three options:
   - `Disabled`
   - `By date`
   - `Days from purchase`

2. Below the selector, conditionally rendered:
   - `'disabled'` → nothing
   - `'date'` → existing `dueDate` date picker
   - `'days from purchase'` → existing `estimatedDueDays` number input

Field values are preserved in form state when switching modes (not cleared). On save, only the field relevant to the selected mode is submitted; the other is sent as `null`/`undefined` to avoid stale data.

Default for new items: `'disabled'`.

## Section 5 — Backend (`apps/server`)

### Mongoose model

Add `expirationMode` prop to `ItemClass` in `Item.model.ts`.

### GraphQL schema

Add `expirationMode: String` to `Item` type and `UpdateItemInput` in `item.graphql`.

### Resolver

Pass `expirationMode` through on `updateItem`. No server-side expiry computation — calculation stays on the frontend.

### Migration script

One-time script targeting existing MongoDB documents. Infers `expirationMode` from existing fields using the same logic above. Run manually before deploying the updated server.

## Files Changed

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `ExpirationMode` type; add field to `Item` |
| `src/lib/expiration.ts` | New — `computeExpiryDate` |
| `src/lib/deserialization.ts` | New — centralized cloud deserializers |
| `src/db/index.ts` | Dexie version bump, add `expirationMode` column |
| `src/hooks/useItemSortData.ts` | Wire `computeExpiryDate` in both paths |
| `src/hooks/use*.ts` (multiple) | Replace inline deserializers with imports |
| Item form component | Add mode selector, conditional fields |
| `apps/server/src/models/Item.model.ts` | Add `expirationMode` prop |
| `apps/server/src/schema/item.graphql` | Add field to type + input |
| `apps/server/src/resolvers/item.ts` | Pass through `expirationMode` |
| `apps/server/scripts/migrate-expiration-mode.ts` | New — one-time MongoDB migration |

## Out of Scope

- `useOnboardingSetup` cloud path (separate concern)
- Data migration between local and cloud (separate feature, `DataModeCard` TODO)
- Family groups cloud-only features
