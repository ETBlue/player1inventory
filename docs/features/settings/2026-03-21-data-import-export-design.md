# Design: Data Import/Export (Both Modes)

## Overview

Users can export and import their data in both local and cloud mode. The exported file format is identical regardless of mode, enabling migration between local and cloud and use as a general backup tool.

## Export

### Local Mode (existing)
`exportAllData()` in `src/lib/exportData.ts` already fetches all 8 Dexie tables and downloads a JSON file. No changes needed.

### Cloud Mode (new)
A new `exportCloudData(apolloClient)` function fetches all 8 entities via Apollo and downloads the same `ExportPayload` JSON format.

**New Apollo queries required:**
- `inventoryLogs` (all, not per-item — currently only `itemLogs(itemId)` exists)
- `shoppingCarts` (all — currently no "fetch all" query)
- `cartItems` (all — currently no "fetch all" query)

**Existing Apollo queries to reuse:**
- `GetItems`, `GetTags`, `GetTagTypes`, `GetVendors`, `GetRecipes`

### ExportPayload Format (unchanged)

```typescript
interface ExportPayload {
  version: number        // currently 1
  exportedAt: string     // ISO 8601
  items: Item[]
  tags: Tag[]
  tagTypes: TagType[]
  vendors: Vendor[]
  recipes: Recipe[]
  inventoryLogs: InventoryLog[]
  shoppingCarts: ShoppingCart[]
  cartItems: CartItem[]
}
```

**Filename:** `player1inventory-backup-YYYY-MM-DD.json`

---

## Import

### File Input
ImportCard renders a hidden `<input type="file" accept=".json">`. Clicking "Import" triggers the file picker. On file selection, the JSON is parsed and validated against `ExportPayload` shape.

### Conflict Detection
Before writing, compare the incoming payload against existing data:
- **ID match**: incoming entity `id` matches an existing entity's `id`
- **Name match**: incoming entity `name` matches an existing entity's `name` (for items, tags, tagTypes, vendors, recipes)

Conflicts grouped by entity type with matched names listed.

### Conflict Dialog

Shows conflict summary, e.g.:
> **Items (3 conflicts):** Milk (ID match), Eggs (name match), Butter (ID + name match)
> **Vendors (1 conflict):** Costco (name match)

Three action buttons:
| Action | Behavior |
|---|---|
| **Skip conflicts** | Import only non-conflicting entities; existing data untouched |
| **Replace matches** | Overwrite conflicting entities; keep non-conflicting existing data |
| **Clear & import** | Delete all existing data, then import entire payload |

If no conflicts detected, skip the dialog and import directly.

### Local Import
Writes via Dexie:
- **Skip conflicts**: `db.table.add()` only for non-conflicting entities
- **Replace matches**: `db.table.put()` for conflicts, `db.table.add()` for new
- **Clear & import**: `db.table.clear()` all tables, then `db.table.bulkAdd()` all entities

### Cloud Import
Writes via new bulk-insert GraphQL mutations:
- **Skip conflicts**: call `bulkCreate*` with non-conflicting entities only
- **Replace matches**: call `bulkUpdate*` for conflicts, `bulkCreate*` for new
- **Clear & import**: call existing `deleteAll*` or new clear mutations, then `bulkCreate*`

**New GraphQL mutations required (all 8 entities):**
- `bulkCreateItems(items: [ItemInput!]!): [Item!]!`
- `bulkCreateTags(tags: [TagInput!]!): [Tag!]!`
- `bulkCreateTagTypes(tagTypes: [TagTypeInput!]!): [TagType!]!`
- `bulkCreateVendors(vendors: [VendorInput!]!): [Vendor!]!`
- `bulkCreateRecipes(recipes: [RecipeInput!]!): [Recipe!]!`
- `bulkCreateInventoryLogs(logs: [InventoryLogInput!]!): [InventoryLog!]!`
- `bulkCreateShoppingCarts(carts: [ShoppingCartInput!]!): [ShoppingCart!]!`
- `bulkCreateCartItems(cartItems: [CartItemInput!]!): [CartItem!]!`

For replace and clear modes, also need:
- `bulkUpsertItems`, `bulkUpsertTags`, etc. (or use `bulkCreate` with `upsert: true` flag)
- Or separate `clearAll*` mutations per entity

---

## UI Changes

### Settings Page (`src/routes/settings/index.tsx`)
- Remove `mode === 'local'` guard from ExportCard → shown in both modes
- Add `<ImportCard />` below ExportCard in both modes

### ExportCard (update)
- Update description: "Export all data as a JSON backup" (remove "local")
- Call `exportCloudData()` in cloud mode, `exportAllData()` in local mode

### ImportCard (new)
- Location: `src/components/settings/ImportCard/index.tsx`
- Props: none (reads mode internally)
- UI: Upload icon, label "Import data", description, "Import" button
- Hidden file input, triggers on button click
- On file selected: parse → validate → conflict check → dialog or direct import

### ConflictDialog (new)
- Location: `src/components/settings/ConflictDialog/index.tsx`
- Props: `conflicts: ConflictSummary`, `onSkip`, `onReplace`, `onClear`, `onCancel`
- Shows entity-type groups with conflict names and match reasons

---

## File Structure

```
src/
  lib/
    exportData.ts          # existing — add exportCloudData()
    importData.ts          # new — importLocalData(), importCloudData(), detectConflicts()
  components/
    settings/
      ExportCard/          # existing — update for cloud mode
      ImportCard/          # new
        index.tsx
        index.stories.tsx
        index.stories.test.tsx
      ConflictDialog/      # new
        index.tsx
        index.stories.tsx
        index.stories.test.tsx
  apollo/
    operations/
      export.graphql       # new — fetch-all queries for logs, carts, cartItems
      import.graphql       # new — bulk-insert mutations
```

---

## Out of Scope

- Import progress indicator (imports are expected to be fast for personal data scale)
- Partial import (per-entity-type selection)
- Import history / undo
- Server-side validation beyond schema type-checking
