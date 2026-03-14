# Player 1 Inventory — Design Document

A grocery and pantry management app. Phase 1 is a frontend-only implementation with IndexedDB; future phases add a GraphQL backend and authentication.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite |
| Framework | React 19 + TypeScript (strict) |
| Routing | TanStack Router |
| Data/State | TanStack Query |
| Local Storage | Dexie.js (IndexedDB) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Code Quality | Biome |
| Testing | Vitest + React Testing Library |

## Architecture

```
Phase 1:  Components → TanStack Query hooks → Dexie.js → IndexedDB
Phase 2:  Components → TanStack Query hooks → graphql-request → GraphQL Server
Phase 3:  + Authentication (Auth0, Clerk, or similar)
```

Components never know where data comes from. TanStack Query is the abstraction boundary.

## Project Structure

```
src/
  components/       # All React components
    ui/             # shadcn/ui components
  hooks/            # TanStack Query hooks
  db/               # Dexie.js schema and database instance
  routes/           # TanStack Router route files
  lib/              # Utility functions
  types/            # Shared TypeScript types
  main.tsx
  App.tsx
```

## Data Model

### Item

Core pantry/grocery item.

```typescript
interface Item {
  id: string
  name: string
  unit?: string               // "gallon", "dozen", "lb"
  tagIds: string[]
  targetQuantity: number      // Desired stock level
  refillThreshold: number     // Restock when below this
  dueDate?: Date              // Explicit expiration
  estimatedDueDays?: number   // Days until expiration (for auto-calc)
  createdAt: Date
  updatedAt: Date
}
```

### Tag

User-defined label for categorization.

```typescript
interface Tag {
  id: string
  name: string      // "Mushrooms", "Protein", "Room temperature"
  typeId: string
  color?: string
}
```

### TagType

Category of tags.

```typescript
interface TagType {
  id: string
  name: string      // "Ingredient type", "Nutrition", "Storage method"
}
```

### InventoryLog

Quantity change record.

```typescript
interface InventoryLog {
  id: string
  itemId: string
  delta: number       // +6 (purchased) or -2 (consumed)
  quantity: number    // Resulting quantity after change
  note?: string
  occurredAt: Date    // When change happened (user-specified for manual entry)
  createdAt: Date     // When record was created
}
```

### ShoppingCart

Draft shopping session.

```typescript
interface ShoppingCart {
  id: string
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  completedAt?: Date
}
```

Only one active cart at a time.

### CartItem

Item in cart before checkout.

```typescript
interface CartItem {
  id: string
  cartId: string
  itemId: string
  quantity: number
}
```

## Computed Values

**Current quantity**: Sum of all `InventoryLog.delta` for an item, or `quantity` from latest log.

**Estimated due date**: For items with `estimatedDueDays` set, computed as: last purchase `occurredAt` (most recent positive delta) + `estimatedDueDays`.

**Needs refill**: Current quantity < `refillThreshold`.

## Routes

| Path | Description |
|------|-------------|
| `/` | Pantry view (home) |
| `/shopping` | Shopping mode |
| `/items/new` | Add new item |
| `/items/:id` | View/edit item |
| `/items/:id/log` | Item history |
| `/settings` | App settings |
| `/settings/tags` | Manage tags and tag types |

## User Flows

### Shopping Mode

1. User taps "Start shopping"
2. System creates ShoppingCart with `status: 'active'` (or reuses existing)
3. Items below `refillThreshold` shown as suggestions
4. User adds items to cart → creates CartItem records
5. User can adjust/remove cart items freely
6. **Checkout**: For each CartItem, create InventoryLog with `delta: +quantity` and `occurredAt: now`. Mark cart `completed`.
7. **Cancel**: Mark cart `abandoned`. No logs written.

Cart changes do not affect inventory until checkout.

### Pantry View

1. Shows all items with current quantity
2. Filterable by tags (grouped by tag type)
3. Visual indicators:
   - Below refill threshold → needs restock
   - Due date approaching → expiring soon
4. **Consume**: Quick -1 or manual amount. Writes InventoryLog immediately with `occurredAt: now`.
5. **Manual increase**: User enters amount AND purchase date. Writes InventoryLog with user-specified `occurredAt`.

### Tag Management

1. User creates TagTypes ("Ingredient type", "Nutrition", etc.)
2. User creates Tags within each type
3. Tags assigned to items during item creation/editing

## Dexie Schema

```typescript
db.version(1).stores({
  items: 'id, name, *tagIds, createdAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt',
  cartItems: 'id, cartId, itemId'
})
```

Indexed fields enable efficient queries:
- `items.tagIds` — filter items by tag
- `inventoryLogs.itemId` — get history for an item
- `shoppingCarts.status` — find active cart
- `cartItems.cartId` — get items in a cart
