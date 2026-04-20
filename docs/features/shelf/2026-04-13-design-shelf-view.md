# Design — Shelf View

**Date:** 2026-04-13
**Status:** 🔲 Pending
**Branch:** `feature/shelf-view`

---

## Overview

Add a **Shelf View** to the pantry, giving users a way to organize items into persistent, named groups with custom order. The existing List View is unchanged. Users switch between views via a toggle in the top bar.

---

## Routes

| Route | Page | Description |
|---|---|---|
| `/` | PantryPage (List View) | Existing item list with sort/filter pipeline |
| `/shelves` | ShelvesPage (Shelf View) | Grid/list of shelf cards |
| `/shelves/$shelfId` | ShelfDetailPage | Item list for one shelf |
| `/settings/shelves` | ShelfSettingsPage | Shelf management (rename, delete, reorder, edit) |

---

## Data Model

### `Shelf` (new entity)

```ts
interface Shelf {
  id: string
  name: string
  type: 'filter' | 'selection'
  order: number                  // for drag-drop reordering
  filterConfig?: FilterConfig    // only when type === 'filter'
  itemIds?: string[]             // ordered, only when type === 'selection'
  createdAt: Date
  updatedAt: Date
}

interface FilterConfig {
  tagIds?: string[]
  vendorIds?: string[]
  recipeIds?: string[]
}

// sortBy and sortDir are top-level Shelf fields (not inside FilterConfig)
// They apply to all shelf types and persist independently of filter changes.
```

### "Unsorted" virtual shelf

Not stored in the database. Computed at render time as all items that:
- Are not referenced in any selection shelf's `itemIds`, AND
- Do not match any filter shelf's `filterConfig`

Sort preference for Unsorted shelf stored separately in `localStorage` (`unsortedShelf.sortBy` / `unsortedShelf.sortDir`). For all other shelves, `sortBy`/`sortDir` are top-level fields on the `Shelf` object.

### Persistence

- **Offline mode**: IndexedDB via Dexie (`shelves` table)
- **Cloud mode**: PostgreSQL via Prisma + GraphQL (same dual-mode pattern as Items/Tags/Vendors/Recipes)

---

## Top Bar

### List View (`/`)

```
[≡ List | ⊞ Shelf]   (sort) (filter) (tags)   [+ Add Item]
─────────────────────────────────────────────────────────
(sort dropdown) (sort dir) (tags toggle) (filter toggle)
(search bar + filter status)
```

- View toggle on the **left**
- `+` button = **Add Item** only (no dropdown)
- Second row (sort/filter controls) visible only in list view

### Shelf View (`/shelves`)

```
[≡ List | ⊞ Shelf]                             [+ Add Shelf]
```

- View toggle on the **left**
- `+` button = **Add Shelf** only (no dropdown)
- No second row

---

## Shelf View (`/shelves`)

### Layout

Vertical list of shelf cards. Drag-drop to reorder (Unsorted is pinned last, cannot be moved).

### ShelfCard

Displays:
- **Shelf name** (title-case via `capitalize`)
- **Item count** (total items in the shelf)
- **Type badge**: "Filter" or "Selection"
- **Filter summary** (filter shelves only): compact list of applied tags/vendors/recipes (e.g. "Dairy · Costco")
- Arrow/chevron to indicate it's tappable

### Add Shelf flow

Clicking `+ Add Shelf` opens a dialog:

1. **Name** input
2. **Type** selector: Filter or Selection
3. If **Filter**:
   - Tag picker (multi-select)
   - Vendor picker (multi-select)
   - Recipe picker (multi-select)
   - Sort by dropdown + direction
4. If **Selection**: just name, no further config

On confirm: shelf created, user navigates to the new shelf's detail page.

---

## Shelf Detail (`/shelves/$shelfId`)

### Header

```
← Back    [Shelf Name]    ⚙ Settings
```

- Back button: navigates back (browser history)
- Settings link: navigates to `/settings/shelves` (or directly to that shelf's edit form)

### Below header — per type

**Filter shelf:**
- Filter chips row: each active filter shown as a chip (tag/vendor/recipe name)
- Sort dropdown (editable inline, persists to `shelf.sortBy`/`shelf.sortDir`)

**Selection shelf:**
- Type badge: "Selection"

**Unsorted shelf:**
- Sort dropdown (editable inline, persists to `localStorage`)

### Search bar (all types)

Full-width search input, same position as in list view.

Search result behavior:

| Item state | Display |
|---|---|
| In this shelf + matches search | Normal ItemCard |
| In system, not in this shelf, matches search | Compact AddBlock (name + Add button) |
| Not in system, matches search | "Create & Add" row (same as current create-on-search) |

- **Selection shelf**: Add button adds item to `itemIds`; newly created item is also appended to `itemIds`
- **Filter shelf**: Add button is read-only/disabled — shows "Matches filter" indicator instead; newly created item that satisfies the filter appears automatically on next render
- **Unsorted shelf**: Add button adds item to a new selection shelf (TBD — or just shows that item is already in Unsorted)

### Item list

- **Filter shelf**: items derived from `filterConfig`; sorted by `shelf.sortBy`/`shelf.sortDir`; no manual reorder
- **Selection shelf**: items in `itemIds` order; drag-drop to reorder
- **Unsorted shelf**: all unassigned items; sorted by Unsorted sort preference

Uses existing **ItemCard** component.

---

## Shelf Settings (`/settings/shelves`)

Accessible via:
- Navigation from `/settings`
- "⚙ Settings" link in shelf detail header

### Features

- **Rename** any shelf (except Unsorted)
- **Delete** shelf (items return to Unsorted; confirmation dialog)
- **Reorder** shelves via drag-drop (same as shelf view)
- **Edit filter config** (filter shelves): tags/vendors/recipes pickers + sort criteria
- **Edit item list** (selection shelves): add items to or remove items from the shelf's `itemIds`

### Back button

Context-aware: uses browser history (`navigate(-1)`), so it returns to wherever the user came from — shelf detail page or `/settings` index.

---

## View Preference Persistence

Stored in `localStorage` key `pantryViewPreference`:
- `'list'` → navigate to `/`
- `'shelf'` → navigate to `/shelves`

Default for fresh users (no stored preference): `'shelf'`.

---

## Open Risks

### Mobile drag-drop

`@dnd-kit` supports pointer/touch sensors, making drag-drop work on mobile in principle. However, long-press-to-start can conflict with native scroll gestures. **Decision: try @dnd-kit with touch sensor first.** If the UX is poor on mobile, design a fallback (long-press handle or up/down arrows) — to be tackled together with tag settings drag-drop (same underlying issue).

### Unsorted shelf: add button behavior

When the user taps "Add" for an item in the Unsorted shelf's search results, the item is already in Unsorted (since it's unassigned). The Add button's meaning is ambiguous here. Options:
- Hide the Add button in Unsorted (items outside the Unsorted shelf would be items in other shelves — still show them as read-only)
- Show "Move to Unsorted" only for items currently in shelves (remove from those shelves)

**Decision deferred to implementation phase.**
