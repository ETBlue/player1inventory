# Pantry Item Dual-Units Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement dual-unit tracking system (package + measurement) with packed/unpacked quantities, configurable consume amounts, flexible expiration modes, and inactive item management.

**Architecture:** Database schema migration → Core business logic (quantity calculations, consume logic) → UI components (form fields, progress bar, badges) → Integration (pantry view, inactive items). Each layer tested independently before integration.

**Tech Stack:** React 19, TypeScript, Dexie.js (IndexedDB), TanStack Query, Vitest, React Testing Library, Storybook

---

## Task 1: Database Schema Migration

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/db/index.ts`
- Test: `src/db/migrations.test.ts` (create)

**Step 1: Write failing test for new Item fields**

Create `src/db/migrations.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './index'

describe('Item schema migration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('allows creating item with dual-unit fields', async () => {
    const item = await db.items.add({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
      consumeAmount: 0.25,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(item).toBeDefined()
  })

  it('allows creating item with simple tracking (no measurement unit)', async () => {
    const item = await db.items.add({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(item).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test migrations.test.ts --run`

Expected: FAIL - TypeScript errors about missing fields

**Step 3: Update Item interface**

Modify `src/types/index.ts`:

```typescript
export interface Item {
  id: string
  name: string
  tagIds: string[]

  // Dual-unit tracking
  packageUnit?: string
  measurementUnit?: string
  amountPerPackage?: number

  // Quantity tracking
  targetUnit: 'package' | 'measurement'
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number

  // Consumption
  consumeAmount: number

  // Expiration
  dueDate?: Date
  estimatedDueDays?: number

  // Metadata
  createdAt: Date
  updatedAt: Date
}
```

**Step 4: Update database schema**

Modify `src/db/index.ts`:

```typescript
import Dexie, { type EntityTable } from 'dexie'
import type { Item, Tag, TagType, InventoryLog, ShoppingCart, CartItem } from '@/types'

const db = new Dexie('player1inventory') as Dexie & {
  items: EntityTable<Item, 'id'>
  tags: EntityTable<Tag, 'id'>
  tagTypes: EntityTable<TagType, 'id'>
  inventoryLogs: EntityTable<InventoryLog, 'id'>
  shoppingCarts: EntityTable<ShoppingCart, 'id'>
  cartItems: EntityTable<CartItem, 'id'>
}

db.version(2).stores({
  items: '++id, name, targetUnit, createdAt, updatedAt',
  tags: '++id, name, typeId',
  tagTypes: '++id, name',
  inventoryLogs: '++id, itemId, occurredAt, createdAt',
  shoppingCarts: '++id, status, createdAt, completedAt',
  cartItems: '++id, cartId, itemId',
})

export { db }
```

**Step 5: Run test to verify it passes**

Run: `pnpm test migrations.test.ts --run`

Expected: PASS

**Step 6: Commit**

```bash
git add src/types/index.ts src/db/index.ts src/db/migrations.test.ts
git commit -m "feat(db): add dual-unit tracking fields to Item schema

- Add packageUnit, measurementUnit, amountPerPackage
- Add targetUnit, packedQuantity, unpackedQuantity
- Add consumeAmount for configurable consumption
- Remove old unit field
- Bump db version to 2

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Quantity Calculation Utilities

**Files:**
- Create: `src/lib/quantityUtils.ts`
- Create: `src/lib/quantityUtils.test.ts`

**Step 1: Write failing tests for quantity calculations**

Create `src/lib/quantityUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getCurrentQuantity, normalizeUnpacked } from './quantityUtils'
import type { Item } from '@/types'

describe('getCurrentQuantity', () => {
  it('calculates total for dual-unit item', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    expect(getCurrentQuantity(item as Item)).toBe(2.5)
  })

  it('returns packed quantity for simple tracking', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    expect(getCurrentQuantity(item as Item)).toBe(3)
  })

  it('handles zero quantities', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(getCurrentQuantity(item as Item)).toBe(0)
  })
})

describe('normalizeUnpacked', () => {
  it('converts excess unpacked to packed', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 1,
      unpackedQuantity: 1.5,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0.5)
  })

  it('handles exact package conversion', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 2,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0)
  })

  it('does nothing when unpacked < amountPerPackage', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(1)
    expect(item.unpackedQuantity).toBe(0.5)
  })

  it('does nothing for simple tracking', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(3)
    expect(item.unpackedQuantity).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: FAIL - "Cannot find module './quantityUtils'"

**Step 3: Implement quantity utilities**

Create `src/lib/quantityUtils.ts`:

```typescript
import type { Item } from '@/types'

export function getCurrentQuantity(item: Item): number {
  if (item.packageUnit && item.measurementUnit && item.amountPerPackage) {
    // Dual-unit mode: packed + unpacked
    const packedInMeasurement = item.packedQuantity * item.amountPerPackage
    return packedInMeasurement + item.unpackedQuantity
  }
  // Simple mode: just packed
  return item.packedQuantity
}

export function normalizeUnpacked(item: Item): void {
  if (!item.packageUnit || !item.measurementUnit || !item.amountPerPackage) {
    return
  }

  while (item.unpackedQuantity >= item.amountPerPackage) {
    item.packedQuantity += 1
    item.unpackedQuantity -= item.amountPerPackage
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(lib): add quantity calculation utilities

- getCurrentQuantity: calculates total from packed + unpacked
- normalizeUnpacked: converts excess unpacked to packed
- Handles both dual-unit and simple tracking modes

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Consume Logic

**Files:**
- Modify: `src/lib/quantityUtils.ts`
- Modify: `src/lib/quantityUtils.test.ts`

**Step 1: Write failing tests for consume logic**

Add to `src/lib/quantityUtils.test.ts`:

```typescript
describe('consumeItem', () => {
  it('consumes from unpacked first', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    consumeItem(item as Item, 0.25)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0.25)
  })

  it('breaks package when unpacked insufficient', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.3,
    }

    consumeItem(item as Item, 0.5)

    expect(item.packedQuantity).toBe(1)
    expect(item.unpackedQuantity).toBe(0.8)
  })

  it('handles consuming exactly unpacked amount', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    consumeItem(item as Item, 0.5)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0)
  })

  it('consumes from packed in simple mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    consumeItem(item as Item, 1)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0)
  })

  it('clears expiration date when quantity reaches 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 0.5,
      dueDate: new Date('2026-02-20'),
      estimatedDueDays: 7,
    }

    consumeItem(item as Item, 0.5)

    expect(item.packedQuantity).toBe(0)
    expect(item.unpackedQuantity).toBe(0)
    expect(item.dueDate).toBeUndefined()
    expect(item.estimatedDueDays).toBe(7) // Kept as config
  })

  it('prevents negative quantities', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 0.3,
    }

    consumeItem(item as Item, 1)

    expect(item.packedQuantity).toBe(0)
    expect(item.unpackedQuantity).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: FAIL - "consumeItem is not defined"

**Step 3: Implement consume logic**

Add to `src/lib/quantityUtils.ts`:

```typescript
export function consumeItem(item: Item, amount: number): void {
  if (item.packageUnit && item.amountPerPackage) {
    // Consume from unpacked first
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity -= amount
    } else {
      // Need to break into packed
      const remaining = amount - item.unpackedQuantity
      item.unpackedQuantity = 0

      const packagesToOpen = Math.ceil(remaining / item.amountPerPackage)
      item.packedQuantity -= packagesToOpen

      // Calculate leftover from opened packages
      item.unpackedQuantity = packagesToOpen * item.amountPerPackage - remaining

      // Prevent negative quantities
      if (item.packedQuantity < 0) {
        item.packedQuantity = 0
        item.unpackedQuantity = 0
      }
    }
  } else {
    // Simple mode
    item.packedQuantity -= amount
    if (item.packedQuantity < 0) {
      item.packedQuantity = 0
    }
  }

  // Clear expiration date when quantity reaches 0
  if (getCurrentQuantity(item) === 0) {
    item.dueDate = undefined
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(lib): add consume logic with package breaking

- Consumes from unpacked first, then breaks packages
- Prevents negative quantities
- Clears dueDate when quantity reaches 0
- Preserves estimatedDueDays as configuration

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Logic

**Files:**
- Modify: `src/lib/quantityUtils.ts`
- Modify: `src/lib/quantityUtils.test.ts`

**Step 1: Write failing tests for add logic**

Add to `src/lib/quantityUtils.test.ts`:

```typescript
describe('addItem', () => {
  it('adds 1 to packed quantity', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    addItem(item as Item)

    expect(item.packedQuantity).toBe(3)
    expect(item.unpackedQuantity).toBe(0.5)
  })

  it('works in simple mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    addItem(item as Item)

    expect(item.packedQuantity).toBe(4)
  })

  it('recalculates dueDate when adding to empty item with estimatedDueDays', () => {
    const now = new Date('2026-02-14')
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      packedQuantity: 0,
      unpackedQuantity: 0,
      estimatedDueDays: 7,
    }

    addItem(item as Item, now)

    expect(item.packedQuantity).toBe(1)
    expect(item.dueDate).toEqual(new Date('2026-02-21'))
  })

  it('does not set dueDate when no estimatedDueDays', () => {
    const now = new Date('2026-02-14')
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    addItem(item as Item, now)

    expect(item.packedQuantity).toBe(1)
    expect(item.dueDate).toBeUndefined()
  })

  it('does not overwrite existing dueDate', () => {
    const now = new Date('2026-02-14')
    const existingDate = new Date('2026-02-20')
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: existingDate,
      estimatedDueDays: 7,
    }

    addItem(item as Item, now)

    expect(item.packedQuantity).toBe(2)
    expect(item.dueDate).toEqual(existingDate) // Unchanged
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: FAIL - "addItem is not defined"

**Step 3: Implement add logic**

Add to `src/lib/quantityUtils.ts`:

```typescript
export function addItem(item: Item, purchaseDate: Date = new Date()): void {
  item.packedQuantity += 1

  // Recalculate dueDate if quantity was 0 and estimatedDueDays exists
  if (item.estimatedDueDays && !item.dueDate && getCurrentQuantity(item) > 0) {
    const expirationMs = purchaseDate.getTime() + item.estimatedDueDays * 86400000
    item.dueDate = new Date(expirationMs)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(lib): add addItem logic with expiration recalculation

- Always adds 1 to packedQuantity
- Recalculates dueDate when adding to empty item with estimatedDueDays
- Does not overwrite existing dueDate

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Inactive Status Logic

**Files:**
- Modify: `src/lib/quantityUtils.ts`
- Modify: `src/lib/quantityUtils.test.ts`

**Step 1: Write failing tests for inactive status**

Add to `src/lib/quantityUtils.test.ts`:

```typescript
describe('isInactive', () => {
  it('returns true when both target and current are 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(true)
  })

  it('returns false when target > 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns false when current > 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetQuantity: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns false when unpacked > 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0.5,
    }

    expect(isInactive(item as Item)).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: FAIL - "isInactive is not defined"

**Step 3: Implement inactive status check**

Add to `src/lib/quantityUtils.ts`:

```typescript
export function isInactive(item: Item): boolean {
  return item.targetQuantity === 0 && getCurrentQuantity(item) === 0
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test quantityUtils.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(lib): add inactive status check

Items are inactive when both targetQuantity and currentQuantity are 0.
Uses getCurrentQuantity to handle dual-unit tracking correctly.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Update Database Operations

**Files:**
- Modify: `src/db/operations.ts`
- Modify: `src/db/operations.test.ts`

**Step 1: Write failing tests for updated operations**

Modify `src/db/operations.test.ts` to add tests for new fields:

```typescript
it('creates item with dual-unit tracking', async () => {
  const item = await createItem({
    name: 'Milk',
    packageUnit: 'bottle',
    measurementUnit: 'L',
    amountPerPackage: 1,
    targetUnit: 'measurement',
    targetQuantity: 2,
    refillThreshold: 0.5,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 0.25,
    tagIds: [],
  })

  expect(item.packageUnit).toBe('bottle')
  expect(item.measurementUnit).toBe('L')
  expect(item.amountPerPackage).toBe(1)
  expect(item.targetUnit).toBe('measurement')
  expect(item.consumeAmount).toBe(0.25)
})

it('creates item with simple tracking', async () => {
  const item = await createItem({
    name: 'Eggs',
    packageUnit: 'dozen',
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  expect(item.packageUnit).toBe('dozen')
  expect(item.measurementUnit).toBeUndefined()
  expect(item.packedQuantity).toBe(1)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test operations.test.ts --run`

Expected: FAIL - createItem doesn't accept new fields

**Step 3: Update createItem to handle new fields**

Modify `src/db/operations.ts`:

```typescript
export async function createItem(
  data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Item> {
  const now = new Date()
  const item: Item = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.items.add(item)
  return item
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test operations.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(db): update operations to handle dual-unit fields

createItem now accepts all new Item fields for dual-unit tracking.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Migration Script for Existing Items

**Files:**
- Create: `src/db/migrate.ts`
- Create: `src/db/migrate.test.ts`

**Step 1: Write failing tests for migration**

Create `src/db/migrate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './index'
import { migrateItemsToV2 } from './migrate'

describe('migrateItemsToV2', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('migrates old items with unit field', async () => {
    // Manually add old-style item (simulating v1 data)
    const oldItemId = await db.items.add({
      id: '1',
      name: 'Old Item',
      unit: 'bottle',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    await migrateItemsToV2()

    const item = await db.items.get(oldItemId)
    expect(item).toBeDefined()
    expect(item!.packageUnit).toBe('bottle')
    expect(item!.measurementUnit).toBeUndefined()
    expect(item!.targetUnit).toBe('package')
    expect(item!.packedQuantity).toBe(5)
    expect(item!.unpackedQuantity).toBe(0)
    expect(item!.consumeAmount).toBe(1)
  })

  it('does not modify already migrated items', async () => {
    const newItem = await db.items.add({
      name: 'New Item',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 2,
      refillThreshold: 0.5,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
      consumeAmount: 0.25,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await migrateItemsToV2()

    const item = await db.items.get(newItem)
    expect(item!.packageUnit).toBe('bottle')
    expect(item!.packedQuantity).toBe(1)
    expect(item!.unpackedQuantity).toBe(0.5)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test migrate.test.ts --run`

Expected: FAIL - "Cannot find module './migrate'"

**Step 3: Implement migration script**

Create `src/db/migrate.ts`:

```typescript
import { db } from './index'

export async function migrateItemsToV2(): Promise<void> {
  const items = await db.items.toArray()

  for (const item of items) {
    // Check if already migrated (has packedQuantity field)
    if ('packedQuantity' in item && item.packedQuantity !== undefined) {
      continue
    }

    // Migrate from v1 schema
    const updates: any = {
      targetUnit: 'package',
      packedQuantity: item.targetQuantity || 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    }

    // Map old unit field to packageUnit
    if ('unit' in item && item.unit) {
      updates.packageUnit = item.unit
    }

    await db.items.update(item.id, updates)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test migrate.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add src/db/migrate.ts src/db/migrate.test.ts
git commit -m "feat(db): add migration script for v1 to v2 schema

Migrates existing items to dual-unit tracking schema:
- Maps unit → packageUnit
- Sets packedQuantity = targetQuantity
- Initializes unpackedQuantity = 0
- Sets default consumeAmount = 1
- Preserves already migrated items

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Update ItemProgressBar for Partial Segments

**Files:**
- Modify: `src/components/ItemProgressBar.tsx`
- Modify: `src/components/ItemProgressBar.test.tsx` (if exists, or create)

**Step 1: Write failing tests for partial segment fills**

Create or modify test file:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemProgressBar } from './ItemProgressBar'

describe('ItemProgressBar with partial segments', () => {
  it('renders partial fill in second segment for dual-unit item', () => {
    // Target = 2, Current = 1.7 (1 full + 0.7 partial)
    const { container } = render(
      <ItemProgressBar current={1.7} target={2} status="ok" />
    )

    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(2)

    // First segment should be 100% filled
    expect(segments[0]).toHaveStyle({ width: '100%' })

    // Second segment should be 70% filled
    expect(segments[1]).toHaveAttribute('data-fill', '70')
  })

  it('handles integer quantities in segmented mode', () => {
    const { container } = render(
      <ItemProgressBar current={2} target={5} status="ok" />
    )

    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(5)
  })

  it('uses continuous mode for target > 15', () => {
    const { container} = render(
      <ItemProgressBar current={10.5} target={20} status="ok" />
    )

    // Should use Progress component, not segments
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test ItemProgressBar --run`

Expected: FAIL - segments don't support partial fills yet

**Step 3: Update SegmentedProgressBar to support partial fills**

Modify `src/components/ItemProgressBar.tsx`:

```typescript
function SegmentedProgressBar({ current, target, status }: ProgressBarProps) {
  const segments = Array.from({ length: target }, (_, i) => {
    const segmentStart = i
    const segmentEnd = i + 1

    let fillPercentage = 0
    if (current >= segmentEnd) {
      fillPercentage = 100
    } else if (current > segmentStart) {
      fillPercentage = (current - segmentStart) * 100
    }

    const fillColor =
      status === 'ok'
        ? 'bg-status-ok'
        : status === 'warning'
          ? 'bg-status-warning'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-accessory-emphasized'

    return (
      <div
        key={i}
        data-segment={i}
        data-fill={fillPercentage}
        className={cn(
          'h-2 flex-1 rounded-xs relative overflow-hidden',
          fillPercentage === 0 && 'border border-accessory-emphasized'
        )}
      >
        {fillPercentage > 0 && (
          <div
            className={cn('h-full', fillColor)}
            style={{ width: `${fillPercentage}%` }}
          />
        )}
      </div>
    )
  })

  return <div className="flex gap-0.5">{segments}</div>
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test ItemProgressBar --run`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ItemProgressBar.tsx src/components/ItemProgressBar.test.tsx
git commit -m "feat(ui): support partial segment fills in progress bar

Segments can now show partial fills (e.g., 70% for 0.7L of 1L bottle).
Each segment represents one target unit and fills proportionally.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Update ItemCard Expiration Badge Logic

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Read: `src/lib/quantityUtils.ts` (for getCurrentQuantity import)

**Step 1: Identify current expiration badge code**

Read `src/components/ItemCard.tsx` to find the expiration badge rendering logic (around line 90-95).

**Step 2: Update badge visibility condition**

Modify expiration badge in `src/components/ItemCard.tsx`:

```typescript
// Import getCurrentQuantity if not already imported
import { getCurrentQuantity } from '@/lib/quantityUtils'

// In the component, calculate current quantity
const currentQuantity = getCurrentQuantity(item)

// Update badge rendering condition
{currentQuantity > 0 && estimatedDueDate && (
  <span className="inline-flex gap-1 px-2 py-1 text-xs bg-status-error text-tint">
    <TriangleAlert className="w-4 h-4" />
    {item.estimatedDueDays ? (
      // Relative mode: show "Expires in X days"
      (() => {
        const daysUntilExpiration = Math.ceil(
          (estimatedDueDate.getTime() - Date.now()) / 86400000
        )
        return daysUntilExpiration >= 0
          ? `Expires in ${daysUntilExpiration} days`
          : `Expired ${Math.abs(daysUntilExpiration)} days ago`
      })()
    ) : (
      // Explicit mode: show "Expires on YYYY-MM-DD"
      `Expires on ${estimatedDueDate.toISOString().split('T')[0]}`
    )}
  </span>
)}
```

**Step 3: Test manually**

Run: `pnpm dev`

- Create item with quantity > 0 and expiration → badge should show
- Consume all quantity → badge should disappear
- Add back → badge should reappear (if estimatedDueDays set)

**Step 4: Commit**

```bash
git add src/components/ItemCard.tsx
git commit -m "feat(ui): update expiration badge for dual-unit tracking

- Only show badge when current quantity > 0
- Use getCurrentQuantity for accurate dual-unit calculation
- Show 'Expires in X days' for relative mode
- Show 'Expires on YYYY-MM-DD' for explicit date mode

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Create Item Form with Dual-Unit Fields

**Files:**
- Modify: `src/routes/items/new.tsx` (or wherever item form is)
- Create: `src/components/ItemForm.tsx` (if doesn't exist)

**Step 1: Identify current item form location**

Run: `find src -name "*new*" -o -name "*form*" | grep -i item`

Locate the item creation form.

**Step 2: Add new form fields**

Add these fields to the form:

```typescript
// Package Unit (optional)
<div>
  <label htmlFor="packageUnit">Package unit (optional)</label>
  <input
    id="packageUnit"
    name="packageUnit"
    type="text"
    placeholder="e.g., bottle, pack, box"
  />
</div>

// Measurement Unit (optional)
<div>
  <label htmlFor="measurementUnit">Measurement unit (optional)</label>
  <input
    id="measurementUnit"
    name="measurementUnit"
    type="text"
    placeholder="e.g., L, ml, cups, 根"
  />
</div>

// Amount per Package (conditional)
{packageUnit && measurementUnit && (
  <div>
    <label htmlFor="amountPerPackage">Amount per package</label>
    <input
      id="amountPerPackage"
      name="amountPerPackage"
      type="number"
      step="0.01"
      placeholder="e.g., 1 (for 1L per bottle)"
    />
  </div>
)}

// Target Unit Toggle (conditional)
{packageUnit && measurementUnit && (
  <div>
    <label>Track target in:</label>
    <div>
      <label>
        <input
          type="radio"
          name="targetUnit"
          value="package"
          defaultChecked
        />
        Packages
      </label>
      <label>
        <input
          type="radio"
          name="targetUnit"
          value="measurement"
        />
        Measurement
      </label>
    </div>
  </div>
)}

// Consume Amount
<div>
  <label htmlFor="consumeAmount">Amount per consume</label>
  <input
    id="consumeAmount"
    name="consumeAmount"
    type="number"
    step="0.01"
    defaultValue={1}
    required
  />
  <small>Amount removed with each consume click</small>
</div>

// Smart Expiration Field
<div>
  <label>Expiration</label>
  <div className="flex gap-2">
    <button
      type="button"
      onClick={() => setExpirationMode('date')}
      className={expirationMode === 'date' ? 'active' : ''}
    >
      📅 Date
    </button>
    <button
      type="button"
      onClick={() => setExpirationMode('days')}
      className={expirationMode === 'days' ? 'active' : ''}
    >
      🔢 Days
    </button>
  </div>

  {expirationMode === 'date' && (
    <input
      type="date"
      name="dueDate"
    />
  )}

  {expirationMode === 'days' && (
    <input
      type="number"
      name="estimatedDueDays"
      placeholder="Days until expiration"
    />
  )}
</div>
```

**Step 3: Update form submission handler**

Update the submit handler to include new fields:

```typescript
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault()
  const formData = new FormData(e.target as HTMLFormElement)

  await createItem({
    name: formData.get('name') as string,
    packageUnit: formData.get('packageUnit') as string | undefined,
    measurementUnit: formData.get('measurementUnit') as string | undefined,
    amountPerPackage: formData.get('amountPerPackage')
      ? Number(formData.get('amountPerPackage'))
      : undefined,
    targetUnit: (formData.get('targetUnit') as 'package' | 'measurement') || 'package',
    targetQuantity: Number(formData.get('targetQuantity')),
    refillThreshold: Number(formData.get('refillThreshold')),
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: Number(formData.get('consumeAmount')) || 1,
    dueDate: formData.get('dueDate')
      ? new Date(formData.get('dueDate') as string)
      : undefined,
    estimatedDueDays: formData.get('estimatedDueDays')
      ? Number(formData.get('estimatedDueDays'))
      : undefined,
    tagIds: [], // Or from form
  })
}
```

**Step 4: Test manually**

Run: `pnpm dev`

- Create item with both units → should show all fields
- Create item with only package unit → should hide measurement-related fields
- Test form submission with various configurations

**Step 5: Commit**

```bash
git add src/routes/items/new.tsx src/components/ItemForm.tsx
git commit -m "feat(form): add dual-unit fields to item form

- Package unit and measurement unit inputs (optional)
- Amount per package (conditional)
- Target unit toggle (conditional)
- Consume amount input
- Smart expiration field (date/days toggle)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Update Add/Consume Buttons with New Logic

**Files:**
- Modify: `src/components/PantryItem.tsx` (or wherever Add/Consume buttons are)
- Import: `src/lib/quantityUtils.ts`

**Step 1: Locate Add/Consume button handlers**

Find the current onClick handlers for Add and Consume buttons.

**Step 2: Update Consume button to use new logic**

```typescript
import { consumeItem, getCurrentQuantity } from '@/lib/quantityUtils'

// In the component
const handleConsume = async () => {
  // Get current item state
  const currentItem = await getItem(item.id)

  // Apply consume logic
  consumeItem(currentItem, currentItem.consumeAmount)

  // Update database
  await updateItem(currentItem.id, {
    packedQuantity: currentItem.packedQuantity,
    unpackedQuantity: currentItem.unpackedQuantity,
    dueDate: currentItem.dueDate,
    updatedAt: new Date(),
  })

  // Log inventory change
  await addInventoryLog({
    itemId: item.id,
    delta: -currentItem.consumeAmount,
    quantity: getCurrentQuantity(currentItem),
    occurredAt: new Date(),
  })
}
```

**Step 3: Update Add button to use new logic**

```typescript
import { addItem, getCurrentQuantity, normalizeUnpacked } from '@/lib/quantityUtils'

const handleAdd = async () => {
  // Get current item state
  const currentItem = await getItem(item.id)

  // Apply add logic
  const purchaseDate = new Date()
  addItem(currentItem, purchaseDate)

  // Normalize unpacked (convert excess to packed)
  normalizeUnpacked(currentItem)

  // Update database
  await updateItem(currentItem.id, {
    packedQuantity: currentItem.packedQuantity,
    unpackedQuantity: currentItem.unpackedQuantity,
    dueDate: currentItem.dueDate,
    updatedAt: new Date(),
  })

  // Log inventory change
  await addInventoryLog({
    itemId: item.id,
    delta: 1, // Always adds 1 package
    quantity: getCurrentQuantity(currentItem),
    occurredAt: purchaseDate,
  })
}
```

**Step 4: Test manually**

Run: `pnpm dev`

- Add item → should increase packedQuantity by 1
- Consume → should decrease by consumeAmount
- Consume when unpacked insufficient → should break package
- Verify expiration date clears when quantity reaches 0

**Step 5: Commit**

```bash
git add src/components/PantryItem.tsx
git commit -m "feat(ui): update Add/Consume with dual-unit logic

- Consume uses configured consumeAmount
- Consume breaks packages when unpacked insufficient
- Add always adds 1 package
- Add recalculates dueDate when restocking empty item
- Both update packed/unpacked quantities correctly

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Implement Inactive Items Display

**Files:**
- Modify: `src/routes/index.tsx` (pantry view)
- Import: `src/lib/quantityUtils.ts`

**Step 1: Add state for inactive items visibility**

```typescript
import { isInactive } from '@/lib/quantityUtils'

const [showInactive, setShowInactive] = useState(false)
```

**Step 2: Filter and sort items**

```typescript
// Separate active and inactive items
const activeItems = sortedItems.filter(item => !isInactive(item))
const inactiveItems = sortedItems.filter(item => isInactive(item))
```

**Step 3: Render active items and inactive toggle**

```typescript
<div className="bg-background-base py-px flex flex-col gap-px">
  {activeItems.map((item) => (
    <PantryItem
      key={item.id}
      item={item}
      // ... props
    />
  ))}

  {inactiveItems.length > 0 && (
    <>
      <button
        onClick={() => setShowInactive(!showInactive)}
        className="px-3 py-2 text-sm text-foreground-muted hover:text-foreground"
      >
        {showInactive ? 'Hide' : 'Show'} {inactiveItems.length} inactive item{inactiveItems.length !== 1 ? 's' : ''}
      </button>

      {showInactive && inactiveItems.map((item) => (
        <PantryItem
          key={item.id}
          item={item}
          className="opacity-50"
          // ... props
        />
      ))}
    </>
  )}
</div>
```

**Step 4: Test manually**

Run: `pnpm dev`

- Set item target to 0 and consume all → should move to inactive
- Click "Show X inactive items" → should reveal items
- Click "Hide X inactive items" → should hide again

**Step 5: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(pantry): add inactive items display

Items with target=0 and current=0 are hidden by default.
Toggle button at bottom shows/hides inactive items.
Inactive items rendered with reduced opacity.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Integration Testing

**Files:**
- Modify: `src/routes/index.test.tsx`
- Create: `src/lib/quantityUtils.integration.test.ts`

**Step 1: Write integration tests for dual-unit workflow**

Create `src/lib/quantityUtils.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { addItem, consumeItem, getCurrentQuantity, isInactive } from './quantityUtils'

describe('Dual-unit tracking integration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('handles complete workflow: add, consume, inactive', async () => {
    // Create item
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 2,
      refillThreshold: 0.5,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      estimatedDueDays: 7,
      tagIds: [],
    })

    // Add 2 bottles
    addItem(item)
    addItem(item)
    expect(item.packedQuantity).toBe(2)
    expect(getCurrentQuantity(item)).toBe(2)
    expect(item.dueDate).toBeDefined()

    // Consume 0.25L (from unpacked)
    consumeItem(item, 0.25)
    expect(item.packedQuantity).toBe(1) // Broke one package
    expect(item.unpackedQuantity).toBe(0.75)

    // Consume 1.75L more (empties all)
    consumeItem(item, 1.75)
    expect(item.packedQuantity).toBe(0)
    expect(item.unpackedQuantity).toBe(0)
    expect(item.dueDate).toBeUndefined() // Cleared

    // Set target to 0 → becomes inactive
    item.targetQuantity = 0
    expect(isInactive(item)).toBe(true)
  })
})
```

**Step 2: Write tests for pantry view integration**

Add to `src/routes/index.test.tsx`:

```typescript
it('shows inactive items when toggle clicked', async () => {
  const user = userEvent.setup()

  // Create inactive item
  await createItem({
    name: 'Inactive Item',
    packageUnit: 'pack',
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  // Create active item
  await createItem({
    name: 'Active Item',
    packageUnit: 'pack',
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  renderApp()

  // Inactive item should not be visible initially
  expect(screen.queryByText('Inactive Item')).not.toBeInTheDocument()
  expect(screen.getByText('Active Item')).toBeInTheDocument()

  // Should show toggle button
  const toggleButton = screen.getByText(/show.*inactive/i)
  expect(toggleButton).toBeInTheDocument()

  // Click to show inactive
  await user.click(toggleButton)

  // Now inactive item should be visible
  expect(screen.getByText('Inactive Item')).toBeInTheDocument()
})
```

**Step 3: Run integration tests**

Run: `pnpm test --run`

Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/quantityUtils.integration.test.ts src/routes/index.test.tsx
git commit -m "test: add integration tests for dual-unit tracking

Tests complete workflow: add, consume, partial packages, inactive.
Tests pantry view integration with inactive items toggle.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Update Storybook Stories

**Files:**
- Modify: `src/components/ItemCard.stories.tsx`
- Modify: `src/components/ItemProgressBar.stories.tsx`

**Step 1: Add dual-unit stories to ItemCard**

```typescript
export const DualUnitWithPartial: Story = {
  args: {
    item: {
      id: '1',
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 2,
      refillThreshold: 0.5,
      packedQuantity: 1,
      unpackedQuantity: 0.7,
      consumeAmount: 0.25,
      estimatedDueDays: 7,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    tags: [],
    tagTypes: [],
  },
}

export const ExpiringRelativeMode: Story = {
  args: {
    item: {
      ...DualUnitWithPartial.args.item,
      estimatedDueDays: 2,
    },
    lastPurchaseDate: new Date(Date.now() - 86400000), // 1 day ago
  },
}

export const InactiveItem: Story = {
  args: {
    item: {
      ...DualUnitWithPartial.args.item,
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    },
  },
}
```

**Step 2: Add partial segment stories to ItemProgressBar**

```typescript
export const PartialSegment: Story = {
  args: {
    current: 1.7,
    target: 2,
    status: 'ok',
  },
}

export const MultiplePartials: Story = {
  args: {
    current: 2.3,
    target: 5,
    status: 'warning',
  },
}
```

**Step 3: Build Storybook to verify**

Run: `pnpm build-storybook`

Expected: Builds successfully, stories render correctly

**Step 4: Commit**

```bash
git add src/components/ItemCard.stories.tsx src/components/ItemProgressBar.stories.tsx
git commit -m "docs(storybook): add dual-unit tracking stories

Stories demonstrate:
- Dual-unit items with partial quantities
- Expiration badge in relative mode
- Inactive items
- Progress bar with partial segment fills

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Final Verification

**Files:**
- All modified files

**Step 1: Run all tests**

Run: `pnpm test --run`

Expected: All tests pass (no failures)

**Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No TypeScript errors

**Step 3: Run linter**

Run: `pnpm lint`

Expected: No linting errors

**Step 4: Build Storybook**

Run: `pnpm build-storybook`

Expected: Builds successfully

**Step 5: Run migration on dev database**

In `src/main.tsx` or app entry point, add:

```typescript
import { migrateItemsToV2 } from '@/db/migrate'

// Run migration on app start
db.on('ready', async () => {
  await migrateItemsToV2()
  console.log('Database migration complete')
})
```

**Step 6: Visual verification**

Run: `pnpm dev`

Manually test:
- [ ] Create item with dual units → form shows all fields
- [ ] Create item with single unit → form hides advanced fields
- [ ] Add item → increases packed by 1
- [ ] Consume item → uses configured amount
- [ ] Consume repeatedly → breaks packages correctly
- [ ] Progress bar shows partial fills correctly
- [ ] Expiration badge shows "Expires in X days" for relative mode
- [ ] Expiration badge shows "Expires on YYYY-MM-DD" for explicit mode
- [ ] Expiration badge disappears when quantity = 0
- [ ] Set target to 0 and empty stock → item becomes inactive
- [ ] Click "Show X inactive items" → reveals inactive items
- [ ] Inactive items render at bottom with reduced opacity

**Step 7: Document migration instructions**

Add to `README.md` or `CHANGELOG.md`:

```markdown
## Migration to Dual-Unit Tracking (v2)

Existing items will be automatically migrated:
- Old `unit` field → `packageUnit`
- `targetQuantity` → `packedQuantity`
- New field defaults: `unpackedQuantity = 0`, `consumeAmount = 1`, `targetUnit = 'package'`

No data loss. Backwards compatible with existing workflows.
```

**Step 8: Final commit if fixes needed**

If any issues found during verification:

```bash
git add .
git commit -m "fix(pantry): address issues found in final verification

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary

**Total Tasks:** 15

**Files Created:**
- `src/db/migrations.test.ts`
- `src/lib/quantityUtils.ts`
- `src/lib/quantityUtils.test.ts`
- `src/db/migrate.ts`
- `src/db/migrate.test.ts`
- `src/lib/quantityUtils.integration.test.ts`

**Files Modified:**
- `src/types/index.ts` - Updated Item interface
- `src/db/index.ts` - Bumped schema version
- `src/db/operations.ts` - Handle new fields
- `src/db/operations.test.ts` - Test new fields
- `src/components/ItemProgressBar.tsx` - Partial segment fills
- `src/components/ItemCard.tsx` - Updated expiration badge
- `src/routes/items/new.tsx` - Dual-unit form fields
- `src/components/PantryItem.tsx` - New Add/Consume logic
- `src/routes/index.tsx` - Inactive items display
- `src/routes/index.test.tsx` - Integration tests
- `src/components/ItemCard.stories.tsx` - New stories
- `src/components/ItemProgressBar.stories.tsx` - New stories

**Key Features Implemented:**
- Dual-unit tracking (package + measurement)
- Packed/unpacked quantity management
- Configurable consume amounts
- Smart package breaking logic
- Flexible expiration modes
- Inactive items management
- Progress bar partial fills
- Database migration from v1

**Migration Path:**
Existing items automatically migrated on app start. No manual intervention required.
