# Brainstorming Log

This document captures the planning conversation for Player 1 Inventory (grocery/pantry management app).

## Project Goals

- Build a grocery list app, frontend first
- Use IndexedDB initially, migrate to a real backend later
- Future: user authentication
- Showcase modern 2026 tech stack for job applications (startup / full-stack or larger company / frontend-specialist roles)

## Tech Stack Decisions

**Build & Dev**: Vite
- Chose over Next.js — client-first app with IndexedDB doesn't need SSR complexity

**Routing**: TanStack Router
- Chose over React Router v7 — better type-safety, first-class search param support, pairs well with TanStack Query

**Styling**: Tailwind CSS v4 + shadcn/ui
- Evaluated: Tailwind, Mantine, Material UI, shadcn/ui, Chakra UI, Radix UI
- Chose shadcn/ui — trendy in 2026, own-your-code model, great portfolio signal

**Data Fetching / State**: TanStack Query
- Will treat IndexedDB as "server" in Phase 1
- Supports GraphQL via graphql-request for Phase 2
- Components never know where data comes from — clean abstraction boundary

**Local Storage**: Dexie.js
- Chose over idb or raw IndexedDB — clean API, reactive queries, good TypeScript support

**Code Quality**: Biome
- Chose over ESLint + Prettier — single fast tool, trendy in 2026
- Note: embedded GraphQL in tagged templates not fully supported yet, but standalone .graphql files work

**Testing**: Vitest + React Testing Library
- Natural pairing with Vite
- Will add Playwright for E2E in Phase 2

## Architecture

**Phase 1**: Frontend with local data
```
Components → TanStack Query hooks → Dexie.js → IndexedDB
```

**Phase 2**: Backend migration
```
Components → TanStack Query hooks → graphql-request → GraphQL Server
```

**Phase 3**: Authentication via provider (Auth0, Clerk, etc.)

## Project Structure

Chose flat/simple structure over feature-based — grocery list app will stay focused.

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

**Item** — Core pantry/grocery item
- id, name, unit (optional)
- tagIds — links to user-defined tags
- targetQuantity — desired quantity in pantry
- refillThreshold — trigger refill when below this
- dueDate (optional) — explicit expiration
- estimatedDueDays (optional) — for auto-calculating expiration
- createdAt, updatedAt

**Tag** — User-defined tag (e.g., "Mushrooms", "Protein", "Room temperature")
- id, name, typeId, color (optional)

**TagType** — Category of tags (e.g., "Ingredient type", "Nutrition", "Storage method")
- id, name

**InventoryLog** — Quantity change record
- id, itemId
- delta — change amount (+6 for purchase, -2 for consumption)
- quantity — resulting quantity after change
- note (optional)
- occurredAt — when the change actually happened (user-specified for manual increases)
- createdAt — when the record was created in the system

**ShoppingCart** — Draft shopping session
- id, status ('active' | 'completed' | 'abandoned')
- createdAt, completedAt (optional)
- Only one active cart at a time

**CartItem** — Items in cart before checkout
- id, cartId, itemId, quantity

Key design decisions:
- Current quantity is computed from latest InventoryLog, not stored on Item
- Estimated due date is computed: last purchase date (occurredAt of last positive delta) + estimatedDueDays
- Tags have types to support multiple classification systems (ingredient, nutrition, storage, etc.)
- Skipped updatedAt on Tag/TagType — minimal metadata, easy to add later if needed
- Shopping cart is a draft state — changes don't affect inventory until checkout
- Manual pantry increases require user to enter purchase date (occurredAt)

## User Flows

**Shopping mode**
- "Start shopping" creates/reuses active ShoppingCart
- Shows items below refillThreshold as suggestions
- Add/remove CartItems freely (draft state)
- "Checkout" writes InventoryLogs for all CartItems, marks cart completed
- "Cancel" marks cart abandoned, no logs written

**Pantry view (home)**
- Shows all items with current quantity (computed from InventoryLog)
- Filterable by tags and tag types
- Visual indicators for low stock and expiring soon
- Quick consume (-1) or manual decrease — writes InventoryLog immediately
- Manual increase — user enters amount AND purchase date, writes InventoryLog

**Tag management**
- CRUD for TagTypes and Tags
- Assign tags to items during item creation/editing

## Routes

```
/                    # Pantry view (home)
/shopping            # Shopping mode
/items/new           # Add new item
/items/:id           # View/edit item details
/items/:id/log       # View item's inventory history
/settings            # App settings
/settings/tags       # Manage tags and tag types
```
