# Shopping Mode Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign shopping mode to use pantry-style item cards, vendor filtering, and a checkbox-based cart interaction model.

**Architecture:** Add a `Vendor` entity to Dexie.js (v3 schema), add `vendorIds?` to `Item`, extend `ItemCard` with a `mode` prop for shopping behavior (checkbox + stepper), and restructure `shopping.tsx` to show all items sorted by stock percentage with a pinned cart section.

**Tech Stack:** React 19 + TypeScript, Dexie.js (IndexedDB), TanStack Query, Tailwind CSS, shadcn/ui (`Checkbox`, `Select`, `Button`), Vitest + React Testing Library, Storybook.

---

### Task 1: Create feature branch

**Files:** none

**Step 1: Create and switch to branch**

```bash
git checkout -b feature/shopping-mode-redesign
```

**Step 2: Verify clean state**

```bash
git status
```
Expected: `nothing to commit, working tree clean`

---

### Task 2: Add Vendor type and vendorIds to Item

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add Vendor interface and vendorIds to Item**

Open `src/types/index.ts`. Make two changes:

**2a.** Add `vendorIds?: string[]` to the `Item` interface, after `tagIds`:

```ts
export interface Item {
  id: string
  name: string
  tagIds: string[]
  vendorIds?: string[]   // ← add this line
  // ... rest unchanged
}
```

**2b.** Add the `Vendor` interface after `CartItem` at the end of the file:

```ts
export interface Vendor {
  id: string
  name: string
  createdAt: Date
}
```

**Step 2: Run type check**

```bash
pnpm tsc --noEmit
```
Expected: No errors (vendorIds is optional, existing code is unaffected).

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Vendor interface and optional vendorIds to Item"
```

---

### Task 3: Bump DB schema to v3 with vendors table

**Files:**
- Modify: `src/db/index.ts`

**Step 1: Update the db type and add version 3**

Open `src/db/index.ts`. Make two changes:

**3a.** Add `Vendor` to the import at the top:

```ts
import type {
  CartItem,
  InventoryLog,
  Item,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,      // ← add this
} from '@/types'
```

**3b.** Add `vendors` to the db type:

```ts
const db = new Dexie('Player1Inventory') as Dexie & {
  items: EntityTable<Item, 'id'>
  tags: EntityTable<Tag, 'id'>
  tagTypes: EntityTable<TagType, 'id'>
  inventoryLogs: EntityTable<InventoryLog, 'id'>
  shoppingCarts: EntityTable<ShoppingCart, 'id'>
  cartItems: EntityTable<CartItem, 'id'>
  vendors: EntityTable<Vendor, 'id'>  // ← add this
}
```

**3c.** Append a version 3 block after the existing `db.version(2)` block:

```ts
// Version 3: Add vendors table
db.version(3).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
})
```

**Step 2: Run existing migration tests to verify schema change doesn't break them**

```bash
pnpm test -- src/db/migrations.test.ts
```
Expected: PASS (these tests delete and reopen the DB, so they'll get v3 fresh).

**Step 3: Commit**

```bash
git add src/db/index.ts
git commit -m "feat(db): bump schema to v3 with vendors table"
```

---

### Task 4: Add getVendors() operation and tests

**Files:**
- Modify: `src/db/operations.ts`
- Modify: `src/db/operations.test.ts`

**Step 1: Write the failing test first**

Open `src/db/operations.test.ts`. Add a new describe block at the end of the file:

```ts
describe('Vendor operations', () => {
  beforeEach(async () => {
    await db.vendors.clear()
  })

  it('user can get all vendors', async () => {
    // Given two vendors seeded directly
    await db.vendors.bulkAdd([
      { id: 'v1', name: 'Costco', createdAt: new Date() },
      { id: 'v2', name: 'Trader Joe\'s', createdAt: new Date() },
    ])

    // When fetching all vendors
    const vendors = await getVendors()

    // Then both vendors are returned
    expect(vendors).toHaveLength(2)
    expect(vendors.map(v => v.name)).toContain('Costco')
    expect(vendors.map(v => v.name)).toContain('Trader Joe\'s')
  })

  it('user gets empty array when no vendors exist', async () => {
    const vendors = await getVendors()
    expect(vendors).toEqual([])
  })
})
```

Also add `getVendors` to the import at the top of the test file:

```ts
import {
  // ... existing imports ...
  getVendors,
} from './operations'
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- src/db/operations.test.ts
```
Expected: FAIL — `getVendors is not a function` (or import error).

**Step 3: Implement getVendors()**

Open `src/db/operations.ts`. Add the import for `Vendor`:

```ts
import type {
  CartItem,
  InventoryLog,
  Item,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,       // ← add this
} from '@/types'
```

Append at the end of the file:

```ts
// Vendor operations
export async function getVendors(): Promise<Vendor[]> {
  return db.vendors.toArray()
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test -- src/db/operations.test.ts
```
Expected: PASS — all tests green including the new vendor tests.

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(db): add getVendors operation with tests"
```

---

### Task 5: Add useVendors hook

**Files:**
- Create: `src/hooks/useVendors.ts`
- Modify: `src/hooks/index.ts`

**Step 1: Create the hook**

Create `src/hooks/useVendors.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getVendors } from '@/db/operations'

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: getVendors,
  })
}
```

**Step 2: Export from hooks index**

Open `src/hooks/index.ts`. Add:

```ts
export * from './useVendors'
```

**Step 3: Run type check**

```bash
pnpm tsc --noEmit
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/hooks/useVendors.ts src/hooks/index.ts
git commit -m "feat(hooks): add useVendors hook"
```

---

### Task 6: Add shopping mode to ItemCard

**Files:**
- Modify: `src/components/ItemCard.tsx`

**Step 1: Plan the changes**

In `shopping` mode, the card changes as follows:
- A **checkbox** appears at the left of the `CardHeader` (before the name link). Checked = item is in cart.
- The pantry **+/- buttons** are replaced by a **stepper** `[−] qty [+]` when in cart. When not in cart, no action buttons show.
- In `pantry` mode (the default), behavior is completely unchanged.

**Step 2: Update the interface and imports**

Open `src/components/ItemCard.tsx`.

Add `CartItem` to the type import:
```ts
import type { CartItem, Item, Tag, TagType } from '@/types'
```

Add `Checkbox` to component imports (after existing imports):
```ts
import { Checkbox } from '@/components/ui/checkbox'
```

Update the `ItemCardProps` interface:
```ts
interface ItemCardProps {
  item: Item
  quantity: number
  tags: Tag[]
  tagTypes: TagType[]
  estimatedDueDate?: Date
  onConsume: () => void
  onAdd: () => void
  onTagClick?: (tagId: string) => void
  showTags?: boolean
  // Shopping mode props
  mode?: 'pantry' | 'shopping'
  cartItem?: CartItem
  onToggleCart?: () => void
  onUpdateCartQuantity?: (qty: number) => void
}
```

Update the function signature to destructure the new props:
```ts
export function ItemCard({
  item,
  quantity,
  tags,
  tagTypes,
  estimatedDueDate,
  onConsume,
  onAdd,
  onTagClick,
  showTags = true,
  mode = 'pantry',
  cartItem,
  onToggleCart,
  onUpdateCartQuantity,
}: ItemCardProps) {
```

**Step 3: Update the CardHeader JSX**

Replace the entire `<CardHeader ...>` block (lines 50–111 in the original) with:

```tsx
<CardHeader className="flex flex-row items-start justify-between gap-2">
  {mode === 'shopping' && (
    <Checkbox
      checked={!!cartItem}
      onCheckedChange={() => onToggleCart?.()}
      aria-label={
        cartItem
          ? `Remove ${item.name} from cart`
          : `Add ${item.name} to cart`
      }
      className="mt-1 shrink-0"
    />
  )}
  <Link
    to="/items/$id"
    params={{ id: item.id }}
    className="flex-1 min-w-0"
  >
    <CardTitle className="flex gap-1 items-baseline justify-between">
      <div className="flex gap-1 min-w-0">
        <h3 className="truncate">{item.name}</h3>
        <span className="text-xs font-normal">
          (
          {item.targetUnit === 'measurement' && item.measurementUnit
            ? item.measurementUnit
            : (item.packageUnit ?? 'units')}
          )
        </span>
      </div>
      <span className="text-xs font-normal text-foreground-muted whitespace-nowrap">
        {item.unpackedQuantity > 0
          ? `${displayPacked} (+${item.unpackedQuantity})/${item.targetQuantity}`
          : `${currentQuantity}/${item.targetQuantity}`}
      </span>
    </CardTitle>
    <ItemProgressBar
      current={quantity}
      target={item.targetQuantity}
      status={status}
      targetUnit={item.targetUnit}
      packed={displayPacked}
      unpacked={item.unpackedQuantity}
      {...(item.measurementUnit
        ? { measurementUnit: item.measurementUnit }
        : {})}
    />
  </Link>
  <div className="flex items-center">
    {mode === 'shopping' ? (
      cartItem ? (
        <>
          <Button
            className="rounded-tr-none rounded-br-none"
            variant="neutral-outline"
            size="icon"
            onClick={(e) => {
              e.preventDefault()
              if (cartItem.quantity > 1) {
                onUpdateCartQuantity?.(cartItem.quantity - 1)
              }
            }}
            aria-label={`Decrease quantity of ${item.name} in cart`}
            disabled={cartItem.quantity <= 1}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm text-center min-w-[2rem]">
            {cartItem.quantity}
          </span>
          <Button
            className="-ml-px rounded-tl-none rounded-bl-none"
            variant="neutral-outline"
            size="icon"
            onClick={(e) => {
              e.preventDefault()
              onUpdateCartQuantity?.(cartItem.quantity + 1)
            }}
            aria-label={`Increase quantity of ${item.name} in cart`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </>
      ) : null
    ) : (
      <>
        <Button
          className="rounded-tr-none rounded-br-none"
          variant="neutral-outline"
          size="icon"
          onClick={(e) => {
            e.preventDefault()
            onConsume()
          }}
          disabled={quantity <= 0}
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
            onAdd()
          }}
          aria-label={`Add ${item.name}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </>
    )}
  </div>
</CardHeader>
```

**Step 4: Run existing ItemCard tests**

```bash
pnpm test -- src/components/ItemCard.test.tsx
```
Expected: PASS — all existing tests pass (pantry mode is the default, no change there).

**Step 5: Commit**

```bash
git add src/components/ItemCard.tsx
git commit -m "feat(ItemCard): add shopping mode with checkbox and cart stepper"
```

---

### Task 7: Add ItemCard tests for shopping mode

**Files:**
- Modify: `src/components/ItemCard.test.tsx`

**Step 1: Write the failing tests**

Open `src/components/ItemCard.test.tsx`. Add a new describe block at the end:

```ts
describe('ItemCard - Shopping mode', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Milk',
    packageUnit: 'gallon',
    targetUnit: 'package',
    tagIds: [],
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockCartItem: CartItem = {
    id: 'ci-1',
    cartId: 'cart-1',
    itemId: 'item-1',
    quantity: 2,
  }

  it('shows unchecked checkbox when not in cart (shopping mode)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={1}
        tags={[]}
        tagTypes={[]}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
        mode="shopping"
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Add Milk to cart/i,
    })
    expect(checkbox).not.toBeChecked()
  })

  it('shows checked checkbox when item is in cart (shopping mode)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={1}
        tags={[]}
        tagTypes={[]}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
        mode="shopping"
        cartItem={mockCartItem}
        onToggleCart={vi.fn()}
        onUpdateCartQuantity={vi.fn()}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Remove Milk from cart/i,
    })
    expect(checkbox).toBeChecked()
  })

  it('shows stepper with quantity when item is in cart (shopping mode)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={1}
        tags={[]}
        tagTypes={[]}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
        mode="shopping"
        cartItem={mockCartItem}
        onToggleCart={vi.fn()}
        onUpdateCartQuantity={vi.fn()}
      />,
    )

    expect(screen.getByText('2')).toBeInTheDocument() // cart quantity
    expect(
      screen.getByRole('button', { name: /Decrease quantity of Milk/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Increase quantity of Milk/i }),
    ).toBeInTheDocument()
  })

  it('calls onToggleCart when checkbox is clicked', async () => {
    const user = userEvent.setup()
    const onToggleCart = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={1}
        tags={[]}
        tagTypes={[]}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
        mode="shopping"
        onToggleCart={onToggleCart}
      />,
    )

    await user.click(screen.getByRole('checkbox'))
    expect(onToggleCart).toHaveBeenCalledOnce()
  })

  it('calls onUpdateCartQuantity with incremented value when + clicked', async () => {
    const user = userEvent.setup()
    const onUpdateCartQuantity = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={1}
        tags={[]}
        tagTypes={[]}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
        mode="shopping"
        cartItem={mockCartItem}
        onToggleCart={vi.fn()}
        onUpdateCartQuantity={onUpdateCartQuantity}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /Increase quantity of Milk/i }),
    )
    expect(onUpdateCartQuantity).toHaveBeenCalledWith(3) // 2 + 1
  })

  it('does not call onUpdateCartQuantity when - clicked at quantity 1', async () => {
    const user = userEvent.setup()
    const onUpdateCartQuantity = vi.fn()
    const cartItemQty1 = { ...mockCartItem, quantity: 1 }

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={1}
        tags={[]}
        tagTypes={[]}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
        mode="shopping"
        cartItem={cartItemQty1}
        onToggleCart={vi.fn()}
        onUpdateCartQuantity={onUpdateCartQuantity}
      />,
    )

    // Minus is disabled at qty=1, so click should not fire
    const minusBtn = screen.getByRole('button', {
      name: /Decrease quantity of Milk/i,
    })
    expect(minusBtn).toBeDisabled()
  })

  it('does not show checkbox in pantry mode (default)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={1}
        tags={[]}
        tagTypes={[]}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
      />,
    )

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
```

Add `CartItem` to the import at the top:
```ts
import type { CartItem, Item, Tag, TagType } from '@/types'
```

Add `userEvent` to the import:
```ts
import { userEvent } from '@testing-library/user-event'
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/components/ItemCard.test.tsx
```
Expected: FAIL — the new shopping mode tests fail because the feature isn't implemented yet.

Wait — you already implemented it in Task 6. Run tests and they should PASS:

```bash
pnpm test -- src/components/ItemCard.test.tsx
```
Expected: PASS — all tests including the new shopping mode tests pass.

**Step 3: Commit**

```bash
git add src/components/ItemCard.test.tsx
git commit -m "test(ItemCard): add shopping mode tests for checkbox and stepper"
```

---

### Task 8: Add ItemCard Storybook stories for shopping mode

**Files:**
- Modify: `src/components/ItemCard.stories.tsx`

**Step 1: Read the existing stories file to understand structure**

Open `src/components/ItemCard.stories.tsx` and read its full content.

**Step 2: Add shopping mode stories**

In the stories file, find the existing mock data (e.g. `mockItem`, `mockTags`, `mockTagTypes`). After the last existing story export, add:

```ts
const mockCartItem: CartItem = {
  id: 'ci-1',
  cartId: 'cart-1',
  itemId: '1',
  quantity: 3,
}

export const ShoppingModeNotInCart: Story = {
  name: 'Shopping Mode — Not in cart',
  args: {
    item: mockItem,
    quantity: 1,
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
    onToggleCart: () => console.log('Toggle cart'),
  },
}

export const ShoppingModeInCart: Story = {
  name: 'Shopping Mode — In cart',
  args: {
    item: mockItem,
    quantity: 1,
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    cartItem: mockCartItem,
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
    onToggleCart: () => console.log('Toggle cart'),
    onUpdateCartQuantity: (qty) => console.log('Update qty:', qty),
  },
}
```

Add `CartItem` to the import at the top of the stories file:
```ts
import type { CartItem } from '@/types'
```

**Step 3: Verify Storybook compiles**

```bash
pnpm storybook --ci --smoke-test
```
Or just run:
```bash
pnpm tsc --noEmit
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/ItemCard.stories.tsx
git commit -m "docs(storybook): add shopping mode stories to ItemCard"
```

---

### Task 9: Restructure the shopping route

**Files:**
- Modify: `src/routes/shopping.tsx`

This is the largest task. Replace the entire file content.

**Step 1: Write the new shopping route**

Replace `src/routes/shopping.tsx` entirely with:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ItemCard } from '@/components/ItemCard'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useAbandonCart,
  useActiveCart,
  useAddToCart,
  useCartItems,
  useCheckout,
  useItems,
  useRemoveFromCart,
  useUpdateCartItem,
  useVendors,
} from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { getCurrentQuantity, isInactive } from '@/lib/quantityUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/shopping')({
  component: Shopping,
})

function getStockPercent(item: Item): number {
  if (item.targetQuantity === 0) return Number.POSITIVE_INFINITY
  return getCurrentQuantity(item) / item.targetQuantity
}

function Shopping() {
  const navigate = useNavigate()
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: vendors = [] } = useVendors()
  const { data: cart } = useActiveCart()
  const { data: cartItems = [] } = useCartItems(cart?.id)
  const addToCart = useAddToCart()
  const updateCartItem = useUpdateCartItem()
  const removeFromCart = useRemoveFromCart()
  const checkout = useCheckout()
  const abandonCart = useAbandonCart()

  const [selectedVendorId, setSelectedVendorId] = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)

  // Build a lookup map: itemId → cartItem
  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  // Apply vendor filter
  const vendorFiltered =
    selectedVendorId
      ? items.filter((item) =>
          (item.vendorIds ?? []).includes(selectedVendorId),
        )
      : items

  // Split into active (not inactive) and inactive
  const activeItems = vendorFiltered.filter((item) => !isInactive(item))
  const inactiveItems = vendorFiltered.filter((item) => isInactive(item))

  // Cart section: all items (active + inactive) currently in cart
  const cartSectionItems = vendorFiltered.filter((item) =>
    cartItemMap.has(item.id),
  )

  // Pending section: active items NOT in cart, sorted by stock % ascending
  const pendingItems = activeItems
    .filter((item) => !cartItemMap.has(item.id))
    .sort((a, b) => getStockPercent(a) - getStockPercent(b))

  const cartTotal = cartItems.reduce((sum, ci) => sum + ci.quantity, 0)

  function handleToggleCart(item: Item) {
    const ci = cartItemMap.get(item.id)
    if (ci) {
      removeFromCart.mutate(ci.id)
    } else if (cart) {
      addToCart.mutate({ cartId: cart.id, itemId: item.id, quantity: 1 })
    }
  }

  function handleUpdateCartQuantity(item: Item, qty: number) {
    const ci = cartItemMap.get(item.id)
    if (ci) {
      updateCartItem.mutate({ cartItemId: ci.id, quantity: qty })
    }
  }

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
          cartItem={ci}
          onToggleCart={() => handleToggleCart(item)}
          onUpdateCartQuantity={(qty) => handleUpdateCartQuantity(item, qty)}
          onConsume={() => {}}
          onAdd={() => {}}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {vendors.length > 0 && (
          <Select
            value={selectedVendorId}
            onValueChange={setSelectedVendorId}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {cartItems.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (cart && confirm('Abandon this shopping trip?')) {
                  abandonCart.mutate(cart.id, {
                    onSuccess: () => navigate({ to: '/' }),
                  })
                }
              }}
            >
              Abandon
            </Button>
          )}
          <Button
            disabled={cartItems.length === 0}
            onClick={() => {
              if (cart) {
                checkout.mutate(cart.id, {
                  onSuccess: () => navigate({ to: '/' }),
                })
              }
            }}
          >
            Checkout ({cartTotal} packs)
          </Button>
        </div>
      </div>

      {/* Cart section */}
      {cartSectionItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium text-foreground-muted">In Cart</h2>
          {cartSectionItems.map((item) => renderItemCard(item))}
        </div>
      )}

      {/* Pending items section */}
      {pendingItems.length > 0 && (
        <div className="space-y-2">
          {cartSectionItems.length > 0 && (
            <h2 className="font-medium text-foreground-muted">Add to Cart</h2>
          )}
          {pendingItems.map((item) => renderItemCard(item))}
        </div>
      )}

      {/* Inactive section */}
      {inactiveItems.length > 0 && (
        <div className="bg-background-surface">
          <button
            type="button"
            onClick={() => setShowInactive(!showInactive)}
            className="w-full px-3 py-2 text-sm text-foreground-muted hover:text-foreground"
          >
            {showInactive ? 'Hide' : 'Show'} {inactiveItems.length} inactive
            item{inactiveItems.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
      {showInactive &&
        inactiveItems.map((item) => renderItemCard(item, 'opacity-50'))}
    </div>
  )
}
```

**Step 2: Run type check**

```bash
pnpm tsc --noEmit
```
Expected: No errors.

**Step 3: Run all tests**

```bash
pnpm test
```
Expected: All tests pass (the old shopping tests no longer exist, and we'll add new ones in Task 10).

**Step 4: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat(shopping): restructure route with sorted items, cart section, vendor filter"
```

---

### Task 10: Add shopping route tests

**Files:**
- Create: `src/routes/shopping.test.tsx`

**Step 1: Write the tests**

Create `src/routes/shopping.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, getOrCreateActiveCart } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Shopping page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.vendors.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShopping = () => {
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see all active items sorted by stock percentage', async () => {
    // Given three items with different stock levels
    await createItem({
      name: 'Eggs',
      tagIds: [],
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 2,   // 20% — should be first
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await createItem({
      name: 'Bread',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,   // 75% — should be last
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 1,   // 25% — should be second
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })

    renderShopping()

    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument()
    })

    const cards = screen.getAllByRole('heading', { level: 3 })
    const names = cards.map((el) => el.textContent)
    expect(names.indexOf('Eggs')).toBeLessThan(names.indexOf('Milk'))
    expect(names.indexOf('Milk')).toBeLessThan(names.indexOf('Bread'))
  })

  it('user can add item to cart by checking checkbox', async () => {
    // Given an item
    await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await getOrCreateActiveCart()

    renderShopping()

    await waitFor(() => {
      expect(screen.getByText('Butter')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    const checkbox = screen.getByRole('checkbox', { name: /Add Butter to cart/i })
    await user.click(checkbox)

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Butter from cart/i }),
      ).toBeChecked()
    })
  })

  it('user can remove item from cart by unchecking checkbox', async () => {
    // Given an item already in cart
    const item = await createItem({
      name: 'Cheese',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    renderShopping()

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Cheese from cart/i }),
      ).toBeChecked()
    })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('checkbox', { name: /Remove Cheese from cart/i }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Add Cheese to cart/i }),
      ).not.toBeChecked()
    })
  })

  it('user can see inactive items when toggling the section', async () => {
    // Given an inactive item (targetQuantity=0, currentQuantity=0)
    await createItem({
      name: 'Seasonal Jam',
      tagIds: [],
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })

    renderShopping()

    await waitFor(() => {
      expect(screen.getByText(/1 inactive item/i)).toBeInTheDocument()
    })

    expect(screen.queryByText('Seasonal Jam')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByText(/Show 1 inactive item/i))

    expect(screen.getByText('Seasonal Jam')).toBeInTheDocument()
  })

  it('checkout button is disabled when cart is empty', async () => {
    renderShopping()

    await waitFor(() => {
      const checkoutBtn = screen.getByRole('button', {
        name: /Checkout/i,
      })
      expect(checkoutBtn).toBeDisabled()
    })
  })
})
```

**Step 2: Run tests to verify they pass**

```bash
pnpm test -- src/routes/shopping.test.tsx
```
Expected: PASS — all 5 tests green.

**Step 3: Run full test suite**

```bash
pnpm test
```
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/routes/shopping.test.tsx
git commit -m "test(shopping): add integration tests for redesigned shopping route"
```

---

### Task 11: Final verification and cleanup

**Step 1: Run full test suite**

```bash
pnpm test
```
Expected: All tests pass.

**Step 2: Run type check**

```bash
pnpm tsc --noEmit
```
Expected: No errors.

**Step 3: Run linter**

```bash
pnpm check
```
Expected: No errors. If Biome reports fixable issues, run `pnpm format` then `pnpm check` again.

**Step 4: Check git status**

```bash
git status
```
Expected: Clean working tree.

**Step 5: Delete old shopping components (now unused)**

Check if `ShoppingItemCard.tsx` and `ShoppingItemWithQuantity.tsx` are still referenced anywhere:

```bash
grep -r "ShoppingItemCard\|ShoppingItemWithQuantity" src/
```

If no references found, delete them:

```bash
git rm src/components/ShoppingItemCard.tsx src/components/ShoppingItemWithQuantity.tsx
git commit -m "chore(shopping): remove obsolete ShoppingItemCard and ShoppingItemWithQuantity components"
```

**Step 6: Invoke finishing skill**

> **Note:** When all tests pass and the working tree is clean, use the `superpowers:finishing-a-development-branch` skill to complete the feature branch (merge, PR, or cleanup).
