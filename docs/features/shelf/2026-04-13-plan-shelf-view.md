# Implementation Plan — Shelf View

**Date:** 2026-04-13
**Design doc:** `2026-04-13-design-shelf-view.md`
**Branch:** `feature/shelf-view`

---

## Phase Overview

| Phase | Area | Description |
|---|---|---|
| A | Data model | `Shelf` type + Dexie schema + DB operations + Query hooks |
| B | Routing + top bar | New routes, view toggle, `+` button changes |
| C | Shelf view (`/shelves`) | ShelfCard, list, drag-drop, Add Shelf dialog |
| D | Shelf detail (`/shelves/$shelfId`) | Header, type-specific UI, search, item list |
| E | Settings (`/settings/shelves`) | Shelf management page |
| F | Cloud persistence | Prisma schema + GraphQL + dual-mode hooks |
| G | E2E + A11y | Playwright tests + axe scan |

---

## Phase A — Data Model

### A1. Add `Shelf` type to `packages/types/src/index.ts`

```ts
export interface FilterConfig {
  tagIds?: string[]
  vendorIds?: string[]
  recipeIds?: string[]
  sortBy?: 'name' | 'stock' | 'expiring' | 'lastPurchased'
  sortDir?: 'asc' | 'desc'
}

export interface Shelf {
  id: string
  name: string
  type: 'filter' | 'selection'
  order: number
  filterConfig?: FilterConfig
  itemIds?: string[]
  createdAt: Date
  updatedAt: Date
}
```

### A2. Add `shelves` table to Dexie schema

In `apps/web/src/db/database.ts`:
- Bump schema version
- Add `shelves: '++id, name, type, order'`

### A3. Add DB operations in `apps/web/src/db/operations.ts`

- `listShelves(): Promise<Shelf[]>` — ordered by `order`
- `getShelf(id: string): Promise<Shelf | undefined>`
- `createShelf(data: CreateShelfInput): Promise<Shelf>`
- `updateShelf(id: string, data: UpdateShelfInput): Promise<Shelf>`
- `deleteShelf(id: string): Promise<void>`
- `reorderShelves(orderedIds: string[]): Promise<void>` — bulk update `order` field
- `reorderShelfItems(shelfId: string, orderedItemIds: string[]): Promise<void>` — update `itemIds` in place

### A4. Add TanStack Query hooks in `apps/web/src/hooks/`

- `useShelvesQuery()` — list all shelves
- `useShelfQuery(id: string)` — single shelf
- `useCreateShelfMutation()` — invalidates shelves list
- `useUpdateShelfMutation()` — invalidates shelf + list
- `useDeleteShelfMutation()` — invalidates shelves list
- `useReorderShelvesMutation()` — optimistic update
- `useReorderShelfItemsMutation()` — optimistic update

### A5. Tests

Add `apps/web/src/db/operations.test.ts` tests covering:
- create, read, update, delete shelf
- reorder shelves (verify `order` values update)
- reorder shelf items (verify `itemIds` order)
- filter shelf filterConfig round-trip
- selection shelf itemIds round-trip

**Verification gate:** `pnpm lint` + `pnpm build` + `pnpm check`

---

## Phase B — Routing + Top Bar

### B1. Create route files

- `apps/web/src/routes/shelves.tsx` — ShelvesPage (shelf view)
- `apps/web/src/routes/shelves.$shelfId.tsx` — ShelfDetailPage

### B2. View toggle + persistence

- Add `pantryViewPreference` key to localStorage utilities
- Default: `'shelf'` (fresh users land on shelf view)
- ViewToggle component: two segments (List / Shelf), navigates `/` ↔ `/shelves`, reads/writes preference

### B3. Update top bar per view

In `apps/web/src/routes/index.tsx` (list view):
- Add ViewToggle on the left
- Change `+` button to "Add Item" only (remove any dropdown if present)

In `apps/web/src/routes/shelves.tsx` (shelf view):
- Add ViewToggle on the left
- Add `+` button = "Add Shelf" only
- No second row (no sort/filter controls)

### B4. Storybook stories

- `ViewToggle.stories.tsx`
- `ShelvesPage.stories.tsx` (empty state + with shelves)

**Verification gate**

---

## Phase C — Shelf View UI (`/shelves`)

### C1. ShelfCard component

`apps/web/src/components/shelf/ShelfCard.tsx`

Displays:
- Shelf name
- Item count
- Type badge ("Filter" / "Selection")
- Filter summary (filter shelves): tags/vendors/recipes as compact chips
- Chevron/arrow

Tapping navigates to `/shelves/$shelfId`.

### C2. ShelfList with drag-drop

- Install `@dnd-kit/core` and `@dnd-kit/sortable` (if not already present)
- `ShelfList` renders `SortableShelfCard` items
- Unsorted shelf card always rendered last, drag handle disabled
- On drag end: call `useReorderShelvesMutation` with new order

### C3. Add Shelf dialog

`AddShelfDialog` component:
- Name input
- Type radio: Filter / Selection
- If Filter: tag picker, vendor picker, recipe picker, sort dropdown + direction
- If Selection: no further config
- On confirm: `useCreateShelfMutation`, then navigate to new shelf detail

### C4. Storybook stories

- `ShelfCard.stories.tsx` (filter shelf, selection shelf, unsorted, empty)
- `AddShelfDialog.stories.tsx` (filter type, selection type)

**Verification gate**

---

## Phase D — Shelf Detail UI (`/shelves/$shelfId`)

### D1. ShelfDetailHeader

- Back button (`navigate(-1)`)
- Shelf name (editable inline? TBD — or just display)
- Settings link → `/settings/shelves` (or `?edit=shelfId`)

### D2. Type-specific sub-header

**Filter shelf:**
- `FilterChips`: one chip per active tag/vendor/recipe, read-only
- `SortDropdown`: editable, calls `useUpdateShelfMutation` on change

**Selection shelf:**
- Type badge: "Selection"

**Unsorted shelf:**
- `SortDropdown`: editable, reads/writes `localStorage` unsorted sort pref

### D3. Search bar (all types)

Reuse or adapt existing search input component.

Result rendering:
- In-shelf items matching search → ItemCard
- System items outside shelf matching search → `AddToShelfBlock` (name + Add button)
  - Selection shelf: Add appends to `itemIds`
  - Filter shelf: shows read-only "Matches filter" indicator if item satisfies filter; otherwise hidden
  - Unsorted shelf: items in other shelves shown as read-only (already organized)
- No system match → "Create & Add" row (create item → auto-append to `itemIds` for selection shelf)

### D4. Item list

- Filter shelf: items from `useItemsQuery` filtered by `filterConfig`, sorted by `filterConfig.sortBy/Dir`
- Selection shelf: items by `itemIds` order (lookup each itemId); `@dnd-kit` drag-drop to reorder, calls `useReorderShelfItemsMutation`
- Unsorted shelf: all items not in any selection shelf's `itemIds` and not matching any filter shelf's `filterConfig`; sorted by Unsorted sort pref

### D5. Storybook stories

- `ShelfDetailPage.stories.tsx` (filter, selection, unsorted, empty, search active)
- `AddToShelfBlock.stories.tsx`

**Verification gate**

---

## Phase E — Settings (`/settings/shelves`)

### E1. Create settings route

`apps/web/src/routes/settings/shelves.tsx` — ShelfSettingsPage

### E2. Shelf list with management actions

- List all shelves (Unsorted last, no edit/delete for Unsorted)
- Per shelf: rename (inline edit), delete (confirmation dialog), drag-drop reorder
- Calls `useUpdateShelfMutation`, `useDeleteShelfMutation`, `useReorderShelvesMutation`

### E3. Filter shelf editor

- Edit tags/vendors/recipes (same pickers as Add Shelf dialog)
- Edit sort criteria (sort dropdown + direction)

### E4. Selection shelf editor

- Item list: current items with remove button
- Add items: search input that shows all items not yet in shelf, with add button

### E5. Navigation

- Link to `/settings/shelves` from `/settings` index page
- Back button in ShelfSettingsPage: `navigate(-1)`
- Link from ShelfDetailHeader `⚙ Settings` → `/settings/shelves`

### E6. Storybook stories

- `ShelfSettingsPage.stories.tsx`

**Verification gate**

---

## Phase F — Cloud Persistence

### F1. Prisma schema

Add `Shelf` model to `apps/api/prisma/schema.prisma`:

```prisma
model Shelf {
  id           String    @id @default(cuid())
  userId       String
  name         String
  type         ShelfType
  order        Int
  filterConfig Json?     // serialized FilterConfig
  itemIds      String[]  // for selection type
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  user         User      @relation(fields: [userId], references: [id])
}

enum ShelfType {
  filter
  selection
}
```

### F2. GraphQL schema + resolvers

- Queries: `shelves`, `shelf(id)`
- Mutations: `createShelf`, `updateShelf`, `deleteShelf`, `reorderShelves`, `reorderShelfItems`
- Resolvers in `apps/api/src/resolvers/`

### F3. Dual-mode hooks

Update all shelf hooks to use dual-mode pattern (same as items/tags/vendors):
- Local mode: Dexie operations
- Cloud mode: GraphQL mutations/queries

**Verification gate**

---

## Phase G — E2E + A11y

### G1. Page objects

`e2e/pages/ShelvesPage.ts` and `e2e/pages/ShelfDetailPage.ts`

### G2. E2E tests in `e2e/tests/shelves.spec.ts`

- User can create a filter shelf and see auto-populated items
- User can create a selection shelf and manually add items
- User can reorder shelves (drag-drop)
- User can reorder items in a selection shelf
- User can search within a shelf and add an outside item
- User can create & add a new item from shelf search
- User can rename and delete a shelf from settings
- View preference persists across page reload
- Unsorted shelf is always last and shows unassigned items

### G3. A11y

Add new pages to `e2e/tests/a11y.spec.ts`:
- `/shelves` in light + dark mode
- `/shelves/$shelfId` (filter shelf) in light + dark mode
- `/shelves/$shelfId` (selection shelf) in light + dark mode
- `/settings/shelves` in light + dark mode

Run: `pnpm test:e2e --grep "shelves|a11y"`

---

## Commit Order

Each phase = one commit (or split into sub-commits per CLAUDE.md commit-splitting rule):

```
feat(shelf): add Shelf type, Dexie schema, DB operations, Query hooks  [Phase A]
feat(shelf): add /shelves and /shelves/$shelfId routes, view toggle    [Phase B]
feat(shelf): add ShelfCard, ShelfList drag-drop, AddShelfDialog        [Phase C]
feat(shelf): add ShelfDetail with type UI, search, item list           [Phase D]
feat(shelf): add /settings/shelves management page                     [Phase E]
feat(shelf): add cloud persistence (Prisma + GraphQL + dual-mode)      [Phase F]
test(shelf): add E2E tests and a11y coverage for shelf pages           [Phase G]
docs(shelf): update docs/INDEX.md                                      [cleanup]
```
