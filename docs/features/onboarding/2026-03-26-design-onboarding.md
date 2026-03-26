---
name: Onboarding page design
description: Design document for the onboarding/welcome feature — nested tag types, template data, 5-step flow
type: design
date: 2026-03-26
status: pending
---

# Onboarding Page Design

## Overview

A full-screen onboarding flow shown automatically when all data is empty (items + tags + vendors all empty). Guides users through initial setup by letting them pick from a curated list of template items and vendors. Accessible from Settings after initial use.

---

## Architecture Changes

### 1. Nested Tag Types (schema change)

Add `parentId?: string` to `TagType`:

```ts
// src/types/index.ts
interface TagType {
  id: string
  name: string
  color: TagColor
  parentId?: string   // new — undefined = top-level group
  createdAt: Date
  updatedAt: Date
}
```

**Dexie schema:** bump DB version, add `parentId` index to `tagTypes` table.

**Hierarchy model:**
- Top-level groups (`parentId` undefined): `Food`, `Personal Care`, `Household`, `Pet Supplies`, `Baby`, `Storage Methods`
- Leaf types (`parentId` set): `生鮮`, `熟食`, `零食`… (children of Food), etc.
- Tags are assigned to **leaf** tag types only (same as today)
- Top-level groups are display/filter containers — not directly assignable

**Impact on existing UI:**
- Settings/Tags: render tag types grouped under their parent; drag-and-drop reorder within group
- ItemCard tag badges: unchanged (tags still belong to leaf types)
- Item detail Tags tab: unchanged
- Filter dropdowns: update to support hierarchical selection (parent = show all children's items)

### 2. Template Data Module

Static JSON/TS file at `src/data/template.ts`:

```ts
export const templateTagTypes: TemplateTagType[] = [...]  // nested structure
export const templateItems: TemplateItem[] = [...]         // 30–50 items with tagTypeIds
export const templateVendors: TemplateVendor[] = [...]     // 17 vendors
```

Types:
```ts
interface TemplateTagType {
  key: string           // stable key for referencing in items
  name: string
  nameZh: string
  color: TagColor
  parentKey?: string
}

interface TemplateItem {
  name: string
  nameZh: string
  tagTypeKeys: string[]   // maps to TemplateTagType keys
}

interface TemplateVendor {
  name: string
}
```

### 3. Onboarding Route

New file-based route: `src/routes/onboarding.tsx`

URL: `/onboarding`

Excluded from bottom nav / sidebar visibility rules (same as `/items/*` pattern).

### 4. Empty Data Detection

New hook `useIsDataEmpty` (or inline in `__root.tsx`):
```ts
const isEmpty = items.length === 0 && tags.length === 0 && vendors.length === 0
```

In `__root.tsx`: if `isEmpty && pathname !== '/onboarding'` → redirect to `/onboarding`.

### 5. Settings Entry Point

Add a "Reset & restart onboarding" card or button to `src/routes/settings/index.tsx`. On confirm (destructive dialog) → clear all data → navigate to `/onboarding`.

---

## UI Flow

### Step 1 — Welcome

```
┌─────────────────────────────┐
│  Welcome to Player 1        │
│  Inventory                  │
│                             │
│  [Choose from template  >]  │
│                             │
│  [Import backup         >]  │
│                             │
│  [Start from scratch    >]  │
└─────────────────────────────┘
```

- "Import backup" → opens existing file picker → on success shows "Get started" button
- "Start from scratch" → navigate to `/`

### Step 2 / Step 4 — Template Overview (shared component `<TemplateOverview>`)

```
┌─────────────────────────────┐
│  Set up your pantry         │
│                             │
│  30 template items  0 sel > │
│  17 vendors         0 sel > │
│                             │
│  [Back]         [Confirm]   │
└─────────────────────────────┘
```

- Tapping a row → navigate to Step 3A or 3B
- "Confirm" enabled when at least 1 item OR 1 vendor selected
- After browsing: counts update to "M selected" / "Y selected"

### Step 3A — Template Items Browser

```
┌─────────────────────────────┐
│ ← 12 items selected  [All] [✕]│
│ [Storage ▾] [Category ▾] [🔍]│
│ (search input — optional)   │
│ Showing 15 of 30 [clear]    │
├─────────────────────────────┤
│ ☐ Milk          冷藏 · 生鮮 │
│ ☐ Eggs          冷藏 · 生鮮 │
│ ☑ Chicken       冷凍 · 生鮮 │
│ ...                         │
└─────────────────────────────┘
```

- "Select all visible" selects only items currently passing the filter
- "Clear selection" clears all (not just visible)
- Back → returns to Step 2/4 with updated count

### Step 3B — Template Vendors Browser

```
┌─────────────────────────────┐
│ ← 4 vendors sel.  [All] [✕] │
│ [search input............]  │
│ Showing 8 of 17 [clear]     │
├─────────────────────────────┤
│ ☐ Costco                    │
│ ☑ PX Mart                   │
│ ☐ RT-Mart                   │
│ ...                         │
└─────────────────────────────┘
```

### Step 5 — Progress & Done

```
┌─────────────────────────────┐
│  Setting up your pantry…    │
│  ████████░░░░░░░  60%       │
│                             │
│  (buttons hidden)           │
└─────────────────────────────┘

→ on complete:

│  All done!                  │
│  [Get started →]            │
```

---

## Component Plan

| Component | Location | Notes |
|-----------|----------|-------|
| `OnboardingPage` | `src/routes/onboarding.tsx` | Top-level route, manages step state |
| `OnboardingWelcome` | `src/components/onboarding/OnboardingWelcome/` | Step 1 |
| `TemplateOverview` | `src/components/onboarding/TemplateOverview/` | Steps 2 & 4 (shared) |
| `TemplateItemsBrowser` | `src/components/onboarding/TemplateItemsBrowser/` | Step 3A |
| `TemplateVendorsBrowser` | `src/components/onboarding/TemplateVendorsBrowser/` | Step 3B |
| `OnboardingProgress` | `src/components/onboarding/OnboardingProgress/` | Step 5 |
| `useOnboardingSetup` | `src/hooks/useOnboardingSetup.ts` | Bulk-create items + tags + vendors; reports progress |

**Reused components:**
- `ItemCard` — new prop `variant="template"` hides quantity/expiration controls
- `VendorCard` — new prop `variant="template"` hides count/delete

---

## Data Flow

```
template.ts (static data)
  ↓
TemplateItemsBrowser / TemplateVendorsBrowser
  ↓  (user selections)
OnboardingPage state: { selectedItemKeys: Set, selectedVendorKeys: Set }
  ↓  (on Confirm)
useOnboardingSetup(selections)
  ↓
createTagType() × N  →  createTag() × N  →  createItem() × N  →  createVendor() × N
  ↓
navigate('/')
```

---

## Implementation Phases

### Phase A — Nested tag types (prerequisite)
1. Update `TagType` type + Dexie schema (add `parentId`, bump version)
2. Update Settings/Tags UI to render grouped hierarchy
3. Update filter dropdowns to support parent-selects-all-children
4. Migration: existing flat tag types get `parentId = undefined` (no-op, backward compatible)

### Phase B — Template data & onboarding route
1. Write `src/data/template.ts` with 30–50 items, 17 vendors, nested tag types
2. Create `src/routes/onboarding.tsx` with step state machine
3. Build `OnboardingWelcome` (Step 1)
4. Build `TemplateOverview` (Steps 2 & 4)
5. Build `TemplateItemsBrowser` (Step 3A)
6. Build `TemplateVendorsBrowser` (Step 3B)
7. Build `OnboardingProgress` (Step 5)
8. Wire `useOnboardingSetup` hook
9. Add empty-data redirect in `__root.tsx`

### Phase C — Settings entry point
1. Add "Reset & restart onboarding" to Settings page
2. Destructive confirmation dialog → clear data → redirect to `/onboarding`

---

## Open Questions (for implementation)

- **i18n**: Template item/vendor names need both English and Chinese keys. Will all onboarding UI strings go into `en.json` / `tw.json` as usual?
- **Nested tag types in item detail**: When assigning tags on the item detail Tags tab, should the tag picker also show the nested hierarchy? (Likely yes, for consistency.)
- **Template tag type colors**: Should template leaf tag types have pre-assigned colors, or default to a neutral color?
