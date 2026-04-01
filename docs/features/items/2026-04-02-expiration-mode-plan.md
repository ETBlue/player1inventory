# Expiration Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit `expirationMode` field to items in both IndexedDB and MongoDB, centralize cloud deserialization helpers, and wire `computeExpiryDate` into both local and cloud paths of `useItemSortData`.

**Architecture:** `ExpirationMode` is added to the shared types package and flows through the stack: MongoDB model → GraphQL schema (with codegen) → frontend `Item` type → form values → sort utilities. A pure `computeExpiryDate(item, lastPurchaseDate?)` function replaces all implicit "prefer `estimatedDueDays` over `dueDate`" logic. A new `deserialization.ts` replaces four inline `deserializeCloudX` functions scattered across hooks.

**Tech Stack:** TypeScript (shared types package at `packages/types/`), Typegoose/Mongoose, GraphQL (graphql-codegen), React + TanStack Query, Dexie.js (IndexedDB), Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/types/src/index.ts` | Modify | Add `ExpirationMode` type; add `expirationMode?` to `Item` |
| `apps/server/src/schema/item.graphql` | Modify | Add `expirationMode` to `Item` type and `UpdateItemInput` |
| `apps/server/src/models/Item.model.ts` | Modify | Add `expirationMode` Typegoose prop |
| `apps/web/src/lib/expiration.ts` | Create | `computeExpiryDate(item, lastPurchaseDate?)` |
| `apps/web/src/lib/expiration.test.ts` | Create | Tests for `computeExpiryDate` |
| `apps/web/src/lib/deserialization.ts` | Create | `deserializeItem`, `deserializeVendor`, `deserializeRecipe`, `deserializeCart` |
| `apps/web/src/lib/deserialization.test.ts` | Create | Tests for all four deserializers |
| `apps/web/src/db/index.ts` | Modify | Bump Dexie schema to v7; add `expirationMode` column |
| `apps/web/src/hooks/useItemSortData.ts` | Modify | Use `computeExpiryDate` in local and cloud paths |
| `apps/web/src/hooks/useItems.ts` | Modify | Delete `deserializeCloudItem`, import from `deserialization.ts`; add `expirationMode` to `toUpdateItemInput` |
| `apps/web/src/hooks/useVendors.ts` | Modify | Delete `deserializeCloudVendor`, import from `deserialization.ts` |
| `apps/web/src/hooks/useRecipes.ts` | Modify | Delete `deserializeCloudRecipe`, import from `deserialization.ts` |
| `apps/web/src/hooks/useShoppingCart.ts` | Modify | Delete `deserializeCloudCart`, import from `deserialization.ts` |
| `apps/web/src/components/item/ItemForm/index.tsx` | Modify | Update `expirationMode` type to `ExpirationMode`; add `'disabled'` option; default to `'disabled'` |
| `apps/web/src/components/item/ItemForm/ItemForm.test.tsx` | Modify | Add test for `'disabled'` mode |
| `apps/web/src/routes/items/$id/index.tsx` | Modify | Read `item.expirationMode` in `itemToFormValues`; store `expirationMode` in `buildUpdates` |
| `apps/web/src/routes/items/new.tsx` | Modify | Include `expirationMode` in `buildCreateData` |
| `apps/server/src/models/Item.model.test.ts` | Modify | Add test for `expirationMode` default |
| `apps/server/src/scripts/migrate-expiration-mode.ts` | Create | One-time MongoDB migration script |
| `docs/INDEX.md` | Modify | Mark items feature as In Progress |

---

## Task 1: Shared types + backend GraphQL schema + Mongoose model + codegen

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/server/src/schema/item.graphql`
- Modify: `apps/server/src/models/Item.model.ts`

- [ ] **Step 1: Add `ExpirationMode` type and field to shared types**

In `packages/types/src/index.ts`, add after the `DEFAULT_PACKAGE_UNIT` line:

```ts
export type ExpirationMode = 'disabled' | 'date' | 'days from purchase'
```

Add to the `Item` interface, in the `// Expiration` section after `expirationThreshold`:

```ts
  expirationMode?: ExpirationMode
```

- [ ] **Step 2: Add `expirationMode` to GraphQL schema**

In `apps/server/src/schema/item.graphql`, add to the `Item` type after `expirationThreshold`:

```graphql
  expirationMode: String
```

Add to `UpdateItemInput` after `expirationThreshold`:

```graphql
  expirationMode: String
```

- [ ] **Step 3: Add `expirationMode` to Mongoose model**

In `apps/server/src/models/Item.model.ts`, add after the `expirationThreshold` prop:

```ts
  @prop({ type: String, enum: ['disabled', 'date', 'days from purchase'], default: 'disabled' })
  expirationMode?: ExpirationMode
```

Add `ExpirationMode` to the import from `@p1i/types`:

```ts
import type { ExpirationMode, Item } from '@p1i/types'
```

- [ ] **Step 4: Run codegen to regenerate frontend GraphQL types**

```bash
pnpm codegen
```

Expected: `✔ Generate to apps/web/src/generated/graphql.ts` — no errors.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
(cd apps/web && pnpm build) 2>&1 | tail -20
```

Expected: build succeeds (or only pre-existing errors unrelated to this change).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/index.ts \
        apps/server/src/schema/item.graphql \
        apps/server/src/models/Item.model.ts \
        apps/web/src/generated/graphql.ts
git commit -m "feat(items): add ExpirationMode type to shared types, GraphQL schema, and Mongoose model"
```

---

## Task 2: `computeExpiryDate` utility (TDD)

**Files:**
- Create: `apps/web/src/lib/expiration.ts`
- Create: `apps/web/src/lib/expiration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/expiration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import { computeExpiryDate } from './expiration'

type ItemSlice = Pick<Item, 'expirationMode' | 'dueDate' | 'estimatedDueDays'>

describe('computeExpiryDate', () => {
  const dueDate = new Date('2026-06-01')
  const lastPurchase = new Date('2026-01-01')

  it('returns undefined when mode is disabled', () => {
    const item: ItemSlice = { expirationMode: 'disabled', dueDate, estimatedDueDays: 30 }
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })

  it('returns undefined when mode is undefined (treats as disabled)', () => {
    const item: ItemSlice = { expirationMode: undefined, dueDate, estimatedDueDays: 30 }
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })

  it('returns dueDate when mode is date', () => {
    const item: ItemSlice = { expirationMode: 'date', dueDate, estimatedDueDays: undefined }
    expect(computeExpiryDate(item)).toEqual(dueDate)
  })

  it('returns undefined when mode is date but dueDate is missing', () => {
    const item: ItemSlice = { expirationMode: 'date', dueDate: undefined, estimatedDueDays: undefined }
    expect(computeExpiryDate(item)).toBeUndefined()
  })

  it('returns lastPurchase + estimatedDueDays when mode is days from purchase', () => {
    const item: ItemSlice = { expirationMode: 'days from purchase', dueDate: undefined, estimatedDueDays: 30 }
    const result = computeExpiryDate(item, lastPurchase)
    const expected = new Date(lastPurchase.getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(result).toEqual(expected)
  })

  it('returns undefined when mode is days from purchase but lastPurchaseDate is missing', () => {
    const item: ItemSlice = { expirationMode: 'days from purchase', dueDate: undefined, estimatedDueDays: 30 }
    expect(computeExpiryDate(item, undefined)).toBeUndefined()
  })

  it('returns undefined when mode is days from purchase but estimatedDueDays is missing', () => {
    const item: ItemSlice = { expirationMode: 'days from purchase', dueDate: undefined, estimatedDueDays: undefined }
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
(cd apps/web && pnpm test expiration.test) 2>&1 | tail -15
```

Expected: FAIL with `Cannot find module './expiration'` or similar.

- [ ] **Step 3: Implement `computeExpiryDate`**

Create `apps/web/src/lib/expiration.ts`:

```ts
import type { Item } from '@/types'

export function computeExpiryDate(
  item: Pick<Item, 'expirationMode' | 'dueDate' | 'estimatedDueDays'>,
  lastPurchaseDate?: Date,
): Date | undefined {
  const mode = item.expirationMode
  if (!mode || mode === 'disabled') return undefined
  if (mode === 'date') return item.dueDate
  // 'days from purchase'
  if (!lastPurchaseDate || !item.estimatedDueDays) return undefined
  return new Date(
    lastPurchaseDate.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test expiration.test) 2>&1 | tail -10
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/expiration.ts apps/web/src/lib/expiration.test.ts
git commit -m "feat(items): add computeExpiryDate utility with tests"
```

---

## Task 3: Centralized cloud deserializers (TDD)

**Files:**
- Create: `apps/web/src/lib/deserialization.ts`
- Create: `apps/web/src/lib/deserialization.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/deserialization.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  deserializeCart,
  deserializeItem,
  deserializeRecipe,
  deserializeVendor,
} from './deserialization'

describe('deserializeItem', () => {
  it('converts ISO date strings to Date objects', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('converts dueDate ISO string to Date when present', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      dueDate: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.dueDate).toBeInstanceOf(Date)
    expect(result.dueDate).toEqual(new Date('2026-06-01T00:00:00.000Z'))
  })

  it('leaves dueDate undefined when absent', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.dueDate).toBeUndefined()
  })

  it('passes through expirationMode string as-is', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      expirationMode: 'days from purchase',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.expirationMode).toBe('days from purchase')
  })
})

describe('deserializeVendor', () => {
  it('converts createdAt ISO string to Date', () => {
    const raw = { id: '1', name: 'Costco', createdAt: '2026-01-01T00:00:00.000Z' }
    const result = deserializeVendor(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })
})

describe('deserializeRecipe', () => {
  it('converts createdAt and updatedAt ISO strings to Date', () => {
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeRecipe(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('converts lastCookedAt when present', () => {
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      lastCookedAt: '2026-03-01T00:00:00.000Z',
    }
    const result = deserializeRecipe(raw)
    expect(result.lastCookedAt).toBeInstanceOf(Date)
    expect(result.lastCookedAt).toEqual(new Date('2026-03-01T00:00:00.000Z'))
  })

  it('leaves lastCookedAt undefined when absent', () => {
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeRecipe(raw)
    expect(result.lastCookedAt).toBeUndefined()
  })
})

describe('deserializeCart', () => {
  it('converts createdAt ISO string to Date', () => {
    const raw = { id: '1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }
    const result = deserializeCart(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('converts completedAt when present', () => {
    const raw = {
      id: '1',
      status: 'completed',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeCart(raw)
    expect(result.completedAt).toBeInstanceOf(Date)
    expect(result.completedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'))
  })

  it('leaves completedAt undefined when absent', () => {
    const raw = { id: '1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }
    const result = deserializeCart(raw)
    expect(result.completedAt).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
(cd apps/web && pnpm test deserialization.test) 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module './deserialization'`.

- [ ] **Step 3: Implement the deserializers**

Create `apps/web/src/lib/deserialization.ts`:

```ts
import type { Item, Recipe, ShoppingCart, Vendor } from '@/types'

// GraphQL returns dueDate/createdAt/updatedAt as ISO strings; convert to Date.
export function deserializeItem(raw: Record<string, unknown>): Item {
  return {
    ...raw,
    dueDate: raw.dueDate ? new Date(raw.dueDate as string) : undefined,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  } as Item
}

// GraphQL returns createdAt as ISO string; convert to Date.
export function deserializeVendor(raw: Record<string, unknown>): Vendor {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
  } as Vendor
}

// GraphQL returns createdAt/updatedAt/lastCookedAt as ISO strings; convert to Date.
export function deserializeRecipe(raw: Record<string, unknown>): Recipe {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
    lastCookedAt: raw.lastCookedAt
      ? new Date(raw.lastCookedAt as string)
      : undefined,
  } as Recipe
}

// GraphQL returns createdAt/completedAt as ISO strings; convert to Date.
export function deserializeCart(raw: Record<string, unknown>): ShoppingCart {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
    completedAt: raw.completedAt
      ? new Date(raw.completedAt as string)
      : undefined,
  } as ShoppingCart
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test deserialization.test) 2>&1 | tail -10
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/deserialization.ts apps/web/src/lib/deserialization.test.ts
git commit -m "feat(items): add centralized cloud deserialization helpers with tests"
```

---

## Task 4: Dexie schema version bump

**Files:**
- Modify: `apps/web/src/db/index.ts`

- [ ] **Step 1: Add version 7 to the Dexie schema**

In `apps/web/src/db/index.ts`, append after the version 6 block (before `export { db }`):

```ts
// Version 7: Add expirationMode to items — no migration callback (prototype mode, single user)
db.version(7).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
})
```

- [ ] **Step 2: Verify tests still pass**

```bash
(cd apps/web && pnpm test) 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/db/index.ts
git commit -m "feat(items): bump Dexie schema to v7 for expirationMode field"
```

---

## Task 5: Update `useItemSortData` to use `computeExpiryDate`

**Files:**
- Modify: `apps/web/src/hooks/useItemSortData.ts`

- [ ] **Step 1: Update the hook**

Replace the entire file content of `apps/web/src/hooks/useItemSortData.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getLastPurchaseDate } from '@/db/operations'
import { useLastPurchaseDatesQuery } from '@/generated/graphql'
import { useDataMode } from '@/hooks/useDataMode'
import { computeExpiryDate } from '@/lib/expiration'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'

export function useItemSortData(items: Item[] | undefined) {
  const safeItems = items ?? []
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  // quantities: sync from item fields — already cloud-compatible, unchanged
  const quantities = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of safeItems) {
      map.set(item.id, getCurrentQuantity(item))
    }
    return map
  }, [safeItems])

  // ── Cloud: batch Apollo query for all item purchase dates ─────────────────
  const itemIds = safeItems.map((i) => i.id)
  const { data: cloudDatesData } = useLastPurchaseDatesQuery({
    variables: { itemIds },
    skip: !isCloud || safeItems.length === 0,
  })
  const cloudPurchaseDates = useMemo(() => {
    const map = new Map<string, Date | null>()
    for (const r of cloudDatesData?.lastPurchaseDates ?? []) {
      map.set(r.itemId, r.date ? new Date(r.date) : null)
    }
    return map
  }, [cloudDatesData])

  // ── Local: TanStack Query ─────────────────────────────────────────────────
  const expiryKey = safeItems
    .map(
      (i) =>
        `${i.id}:${String(i.expirationMode)}:${String(i.dueDate)}:${String(i.estimatedDueDays)}`,
    )
    .join(',')

  const { data: localExpiryDates } = useQuery({
    queryKey: ['sort', 'expiryDates', expiryKey],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of safeItems) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        map.set(item.id, computeExpiryDate(item, lastPurchase ?? undefined))
      }
      return map
    },
    enabled: !isCloud && safeItems.length > 0,
  })

  const purchaseKey = safeItems.map((i) => i.id).join(',')

  const { data: localPurchaseDates } = useQuery({
    queryKey: ['sort', 'purchaseDates', purchaseKey],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of safeItems) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: !isCloud && safeItems.length > 0,
  })

  // ── Cloud: derive expiryDates from cloudPurchaseDates + computeExpiryDate ─
  const cloudExpiryDates = useMemo(() => {
    if (!isCloud) return undefined
    const map = new Map<string, Date | undefined>()
    for (const item of safeItems) {
      const lastPurchase = cloudPurchaseDates.get(item.id) ?? undefined
      map.set(item.id, computeExpiryDate(item, lastPurchase))
    }
    return map
  }, [isCloud, safeItems, cloudPurchaseDates])

  return {
    quantities,
    expiryDates: isCloud ? cloudExpiryDates : localExpiryDates,
    purchaseDates: isCloud ? cloudPurchaseDates : localPurchaseDates,
  }
}
```

- [ ] **Step 2: Run all tests**

```bash
(cd apps/web && pnpm test) 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useItemSortData.ts
git commit -m "feat(items): use computeExpiryDate in useItemSortData for both local and cloud paths"
```

---

## Task 6: Refactor hook deserializers + update `toUpdateItemInput`

**Files:**
- Modify: `apps/web/src/hooks/useItems.ts`
- Modify: `apps/web/src/hooks/useVendors.ts`
- Modify: `apps/web/src/hooks/useRecipes.ts`
- Modify: `apps/web/src/hooks/useShoppingCart.ts`

- [ ] **Step 1: Update `useItems.ts`**

In `apps/web/src/hooks/useItems.ts`:

**Delete** lines 29–37 (the `deserializeCloudItem` function):
```ts
// GraphQL returns dueDate/createdAt/updatedAt as ISO strings; convert to Date.
function deserializeCloudItem(item: Record<string, unknown>): Item {
  return {
    ...item,
    dueDate: item.dueDate ? new Date(item.dueDate as string) : undefined,
    createdAt: new Date(item.createdAt as string),
    updatedAt: new Date(item.updatedAt as string),
  } as Item
}
```

**Add** import at the top, after the existing imports:
```ts
import { deserializeItem } from '@/lib/deserialization'
```

**Replace** `deserializeCloudItem(i as Record<string, unknown>)` (two occurrences in `useItems` and `useItem`) with `deserializeItem(i as Record<string, unknown>)`.

**Update** `toUpdateItemInput` to include `expirationMode` (add after `expirationThreshold` line):
```ts
function toUpdateItemInput(updates: Partial<Item>): UpdateItemInput {
  const { id: _id, createdAt: _c, updatedAt: _u, dueDate, ...rest } = updates
  return {
    ...rest,
    packageUnit: rest.packageUnit ?? null,
    measurementUnit: rest.measurementUnit ?? null,
    amountPerPackage: rest.amountPerPackage ?? null,
    estimatedDueDays: rest.estimatedDueDays ?? null,
    expirationThreshold: rest.expirationThreshold ?? null,
    expirationMode: rest.expirationMode ?? null,
    dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
  }
}
```

- [ ] **Step 2: Update `useVendors.ts`**

In `apps/web/src/hooks/useVendors.ts`:

**Delete** lines 21–26 (the `deserializeCloudVendor` function):
```ts
// GraphQL returns createdAt as ISO string; convert to Date.
function deserializeCloudVendor(vendor: Record<string, unknown>): Vendor {
  return {
    ...vendor,
    createdAt: new Date(vendor.createdAt as string),
  } as Vendor
}
```

**Add** import after the existing imports:
```ts
import { deserializeVendor } from '@/lib/deserialization'
```

**Replace** `deserializeCloudVendor(v as Record<string, unknown>)` with `deserializeVendor(v as Record<string, unknown>)`.

- [ ] **Step 3: Update `useRecipes.ts`**

In `apps/web/src/hooks/useRecipes.ts`:

**Delete** lines 25–35 (the `deserializeCloudRecipe` function):
```ts
// GraphQL returns createdAt/updatedAt/lastCookedAt as ISO strings; convert to Date.
function deserializeCloudRecipe(recipe: Record<string, unknown>): Recipe {
  return {
    ...recipe,
    createdAt: new Date(recipe.createdAt as string),
    updatedAt: new Date(recipe.updatedAt as string),
    lastCookedAt: recipe.lastCookedAt
      ? new Date(recipe.lastCookedAt as string)
      : undefined,
  } as Recipe
}
```

**Add** import after the existing imports:
```ts
import { deserializeRecipe } from '@/lib/deserialization'
```

**Replace** all calls to `deserializeCloudRecipe(...)` with `deserializeRecipe(...)`.

- [ ] **Step 4: Update `useShoppingCart.ts`**

In `apps/web/src/hooks/useShoppingCart.ts`:

**Delete** lines 27–35 (the `deserializeCloudCart` function):
```ts
// GraphQL returns createdAt/completedAt as ISO strings; convert to Date.
function deserializeCloudCart(cart: Record<string, unknown>): ShoppingCart {
  return {
    ...cart,
    createdAt: new Date(cart.createdAt as string),
    completedAt: cart.completedAt
      ? new Date(cart.completedAt as string)
      : undefined,
  } as ShoppingCart
}
```

**Add** import after the existing imports:
```ts
import { deserializeCart } from '@/lib/deserialization'
```

**Replace** `deserializeCloudCart(cloud.data.activeCart as Record<string, unknown>)` with `deserializeCart(cloud.data.activeCart as Record<string, unknown>)`.

- [ ] **Step 5: Run all tests**

```bash
(cd apps/web && pnpm test) 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useItems.ts \
        apps/web/src/hooks/useVendors.ts \
        apps/web/src/hooks/useRecipes.ts \
        apps/web/src/hooks/useShoppingCart.ts
git commit -m "refactor(hooks): replace inline cloud deserializers with centralized deserialization.ts; add expirationMode to toUpdateItemInput"
```

---

## Task 7: Update `ItemForm` component

**Files:**
- Modify: `apps/web/src/components/item/ItemForm/index.tsx`
- Modify: `apps/web/src/components/item/ItemForm/ItemForm.test.tsx`

- [ ] **Step 1: Update `ItemFormValues` type and form component**

In `apps/web/src/components/item/ItemForm/index.tsx`:

**Add** import at the top:
```ts
import type { ExpirationMode } from '@/types'
```

**Replace** the `expirationMode` field in `ItemFormValues`:
```ts
// Before:
  expirationMode: 'date' | 'days'

// After:
  expirationMode: ExpirationMode
```

**Replace** the default value for `expirationMode`:
```ts
// Before:
  expirationMode: 'date',

// After:
  expirationMode: 'disabled',
```

**Replace** the `useState` type for `expirationMode`:
```ts
// Before:
  const [expirationMode, setExpirationMode] = useState<'date' | 'days'>(

// After:
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>(
```

**Replace** the `onValueChange` type in the Select:
```ts
// Before:
  onValueChange={(value: 'date' | 'days') => setExpirationMode(value)}

// After:
  onValueChange={(value: ExpirationMode) => setExpirationMode(value)}
```

**Add** a `'disabled'` option as the first item in the SelectContent:
```tsx
<SelectItem value="disabled">
  <div className="flex items-center gap-2">
    <span>No expiration</span>
  </div>
</SelectItem>
```

**Replace** the `'days'` SelectItem value with `'days from purchase'`:
```tsx
// Before:
<SelectItem value="days">

// After:
<SelectItem value="days from purchase">
```

**Replace** the conditional rendering for the `estimatedDueDays` field:
```tsx
// Before:
{expirationMode === 'days' && (

// After:
{expirationMode === 'days from purchase' && (
```

- [ ] **Step 2: Add a test for `'disabled'` mode**

In `apps/web/src/components/item/ItemForm/ItemForm.test.tsx`, update the `editInitialValues` object to use `'disabled'` as the default and add a test:

The existing `editInitialValues` uses `expirationMode: 'date' as const` — this remains valid since `'date'` is still in `ExpirationMode`. No change needed there.

Add a new test at the end of the file:

```ts
describe('ItemForm — expirationMode select', () => {
  it('shows No expiration, Specific Date, and Days from Purchase options', async () => {
    // Given an ItemForm in create mode
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)

    // When user opens the expiration mode select
    await user.click(screen.getByRole('combobox', { name: /calculate expiration/i }))

    // Then all three options are present
    expect(screen.getByRole('option', { name: /no expiration/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /specific date/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /days from purchase/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
(cd apps/web && pnpm test ItemForm) 2>&1 | tail -10
```

Expected: all tests pass including the new one.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/item/ItemForm/index.tsx \
        apps/web/src/components/item/ItemForm/ItemForm.test.tsx
git commit -m "feat(items): add disabled mode to ItemForm expirationMode selector; use ExpirationMode type"
```

---

## Task 8: Update `$id/index.tsx` route

**Files:**
- Modify: `apps/web/src/routes/items/$id/index.tsx`

- [ ] **Step 1: Update `itemToFormValues` to read `item.expirationMode`**

In `apps/web/src/routes/items/$id/index.tsx`, replace the `itemToFormValues` function:

```ts
// Before:
function itemToFormValues(item: Item): ItemFormValues {
  return {
    ...
    expirationMode: item.estimatedDueDays != null ? 'days' : 'date',
    ...
  }
}

// After:
function itemToFormValues(item: Item): ItemFormValues {
  return {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate
      ? (item.dueDate.toISOString().split('T')[0] ?? '')
      : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount ?? 1,
    // Read explicit expirationMode; fall back to inference for items created
    // before this field was added (pre-migration existing data).
    expirationMode:
      item.expirationMode ??
      (item.estimatedDueDays != null
        ? 'days from purchase'
        : item.dueDate
          ? 'date'
          : 'disabled'),
    expirationThreshold: item.expirationThreshold ?? '',
  }
}
```

- [ ] **Step 2: Update `ItemUpdatePayload` type to include `expirationMode`**

Replace the `ItemUpdatePayload` type:

```ts
// Before:
type ItemUpdatePayload = Omit<Partial<Item>, 'dueDate' | 'estimatedDueDays'> & {
  dueDate?: Date | undefined
  estimatedDueDays?: number | undefined
}

// After:
type ItemUpdatePayload = Omit<
  Partial<Item>,
  'dueDate' | 'estimatedDueDays' | 'expirationMode'
> & {
  dueDate?: Date | undefined
  estimatedDueDays?: number | undefined
  expirationMode?: Item['expirationMode']
}
```

- [ ] **Step 3: Update `buildUpdates` to store `expirationMode` and use new mode values**

Replace the `buildUpdates` function:

```ts
function buildUpdates(values: ItemFormValues): ItemUpdatePayload {
  const updates: ItemUpdatePayload = {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    consumeAmount: values.consumeAmount,
    expirationMode: values.expirationMode,
  }

  if (values.expirationMode === 'date') {
    updates.estimatedDueDays = undefined
    updates.dueDate = values.dueDate ? new Date(values.dueDate) : undefined
  } else if (values.expirationMode === 'days from purchase') {
    updates.dueDate = undefined
    updates.estimatedDueDays = values.estimatedDueDays
      ? Number(values.estimatedDueDays)
      : undefined
  } else {
    // 'disabled'
    updates.dueDate = undefined
    updates.estimatedDueDays = undefined
  }

  if (values.packageUnit) {
    updates.packageUnit = values.packageUnit
  } else {
    delete updates.packageUnit
  }
  if (values.measurementUnit) {
    updates.measurementUnit = values.measurementUnit
  } else {
    delete updates.measurementUnit
  }
  if (values.amountPerPackage) {
    updates.amountPerPackage = Number(values.amountPerPackage)
  } else {
    delete updates.amountPerPackage
  }
  if (values.expirationThreshold) {
    updates.expirationThreshold = Number(values.expirationThreshold)
  } else {
    delete updates.expirationThreshold
  }

  return updates
}
```

- [ ] **Step 4: Run all tests**

```bash
(cd apps/web && pnpm test) 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/items/'$id'/index.tsx
git commit -m "feat(items): read and store expirationMode in item detail route"
```

---

## Task 9: Update `new.tsx` route

**Files:**
- Modify: `apps/web/src/routes/items/new.tsx`

- [ ] **Step 1: Update `buildCreateData` to include `expirationMode`**

In `apps/web/src/routes/items/new.tsx`, replace `buildCreateData`:

```ts
function buildCreateData(
  values: ItemFormValues,
): Omit<Item, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: values.consumeAmount,
    tagIds: [],
    expirationMode: values.expirationMode,
    ...(values.packageUnit ? { packageUnit: values.packageUnit } : {}),
    ...(values.measurementUnit
      ? { measurementUnit: values.measurementUnit }
      : {}),
    ...(values.amountPerPackage
      ? { amountPerPackage: Number(values.amountPerPackage) }
      : {}),
    ...(values.expirationThreshold
      ? { expirationThreshold: Number(values.expirationThreshold) }
      : {}),
    ...(values.expirationMode === 'days from purchase' && values.estimatedDueDays
      ? { estimatedDueDays: Number(values.estimatedDueDays) }
      : {}),
  }
}
```

- [ ] **Step 2: Run all tests**

```bash
(cd apps/web && pnpm test) 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/items/new.tsx
git commit -m "feat(items): include expirationMode in new item create data"
```

---

## Task 10: Server model test + MongoDB migration script

**Files:**
- Modify: `apps/server/src/models/Item.model.test.ts`
- Create: `apps/server/src/scripts/migrate-expiration-mode.ts`

- [ ] **Step 1: Add a test for `expirationMode` default**

In `apps/server/src/models/Item.model.test.ts`, add inside the `describe('ItemModel')` block:

```ts
  it('defaults expirationMode to disabled', async () => {
    // Given an item created without expirationMode
    const item = await ItemModel.create({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
    })

    // Then expirationMode defaults to 'disabled'
    expect(item.expirationMode).toBe('disabled')
  })

  it('stores expirationMode when provided', async () => {
    // Given an item with expirationMode set
    const item = await ItemModel.create({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
      expirationMode: 'days from purchase',
    })

    // Then expirationMode is stored correctly
    expect(item.expirationMode).toBe('days from purchase')
  })
```

- [ ] **Step 2: Run server tests**

```bash
(cd apps/server && pnpm test) 2>&1 | tail -10
```

Expected: all server tests pass including the two new ones.

- [ ] **Step 3: Create the migration script**

Create `apps/server/src/scripts/migrate-expiration-mode.ts`:

```ts
/**
 * One-time migration: infer expirationMode for existing MongoDB items.
 *
 * Run before deploying the updated server:
 *   npx tsx apps/server/src/scripts/migrate-expiration-mode.ts
 *
 * Logic:
 *   - estimatedDueDays is set → 'days from purchase'
 *   - dueDate is set (no estimatedDueDays) → 'date'
 *   - neither → 'disabled'
 */
import mongoose from 'mongoose'
import { ItemModel } from '../models/Item.model.js'

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI environment variable is required')

  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  const items = await ItemModel.find({ expirationMode: { $exists: false } })
  console.log(`Found ${items.length} items without expirationMode`)

  let updated = 0
  for (const item of items) {
    const mode =
      item.estimatedDueDays != null
        ? 'days from purchase'
        : item.dueDate != null
          ? 'date'
          : 'disabled'

    await ItemModel.updateOne({ _id: item._id }, { $set: { expirationMode: mode } })
    updated++
  }

  console.log(`Updated ${updated} items`)
  await mongoose.disconnect()
  console.log('Done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/models/Item.model.test.ts \
        apps/server/src/scripts/migrate-expiration-mode.ts
git commit -m "feat(items): add server test for expirationMode default; add MongoDB migration script"
```

---

## Task 11: Verification gate + docs update

- [ ] **Step 1: Run full quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Fix any errors before continuing.

- [ ] **Step 2: Run E2E tests**

```bash
pnpm test:e2e --grep "items|a11y"
```

Fix any failures before continuing.

- [ ] **Step 3: Update `docs/INDEX.md`**

In `docs/INDEX.md`, update the `items` row status to `🔄 In Progress` and add a note:

```markdown
| [items](features/items/) | 🔄 In Progress | Explicit expirationMode field in progress (`feature/expiration-mode`) |
```

- [ ] **Step 4: Commit**

```bash
git add docs/INDEX.md
git commit -m "docs(index): mark items feature as in progress for expiration-mode branch"
```
