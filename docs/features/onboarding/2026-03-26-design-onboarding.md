---
name: Onboarding page design
description: Design document for the onboarding/welcome feature — nested tags, template data, 5-step flow
type: design
date: 2026-03-26
status: pending
---

# Onboarding Page Design

## Overview

A full-screen onboarding flow shown automatically when all data is empty (items + tags + vendors all empty). Guides users through initial setup by letting them pick from a curated list of template items and vendors. Accessible from Settings after initial use.

---

## Architecture Changes

### 1. Nested Tags (schema change)

Add `parentId?: string` to `Tag` (not `TagType` — tag types stay flat):

```ts
// src/types/index.ts
interface Tag {
  id: string
  name: string
  typeId: string
  parentId?: string   // new — undefined = top-level tag within its type
  createdAt: Date
  updatedAt: Date
}
```

**Dexie schema:** bump DB version, add `parentId` index to `tags` table.

**Hierarchy model:**

```
TagType: "category"
  Tag: "Food"              (parentId: undefined)
    Tag: "生鮮"            (parentId: Food.id)
    Tag: "熟食"
    Tag: "零食"
    Tag: "飲料"
    Tag: "穀類主食"
    Tag: "調味料"
    Tag: "營養補充"
  Tag: "Personal Care"     (parentId: undefined)
    Tag: "身體清潔"
    Tag: "衛生用品"
    Tag: "身體保養"
    Tag: "醫療保健"
  Tag: "Household"
    Tag: "家庭清潔"
    Tag: "廚房耗材"
  Tag: "Pet Supplies"      (leaf — no children)
  Tag: "Baby"              (leaf — no children)

TagType: "storage"
  Tag: "room temperature"  (parentId: undefined, no children)
  Tag: "refrigerated"
  Tag: "frozen"
```

**Assignment:** Items can be tagged at **any level** — "Food" for broad classification, "生鮮" for specific. Both are valid on the same item.

**Filter behavior:** Filtering by a parent tag (e.g. "Food") shows items tagged with Food **or any of its descendants** (生鮮, 熟食, etc.). Implemented via a `getTagAndDescendantIds(tagId, allTags)` helper.

**Impact on existing UI:**
- Settings/Tags: render tags nested under their parent within each tag type section; drag-and-drop reorder within group
- ItemCard tag badges: show tag name regardless of level — unchanged rendering
- Item detail Tags tab: tag picker groups top-level tags with expandable children
- Filter dropdowns: parent selection expands to include descendants

### 2. Template Data Module

Static file at `src/data/template.ts`:

```ts
export const templateTags: TemplateTag[] = [...]    // nested structure
export const templateItems: TemplateItem[] = [...]   // 30–50 items with tagKeys
export const templateVendors: TemplateVendor[] = [...] // 17 vendors
```

Types:
```ts
interface TemplateTag {
  key: string           // stable key for referencing (e.g. "food", "fresh")
  i18nKey: string       // e.g. "template.tags.food" → looked up in en.json/tw.json
  typeKey: string       // "category" | "storage"
  parentKey?: string    // references another TemplateTag key
}

interface TemplateItem {
  key: string           // stable key
  i18nKey: string       // e.g. "template.items.milk"
  tagKeys: string[]     // can include parent and/or child tag keys
}

interface TemplateVendor {
  name: string          // vendor names are not translated (intentional casing)
}
```

**Vendor list (17):** Costco, PX Mart, Simple Mart, RT-Mart, Carrefour, I-Mei Food, Lopia, City Super, Mia C'bon, Jasons Market Place, Poya, Nitori, Ikea, Cosmed, Watsons, FamilyMart, 7-Eleven

**Item count:** 30–50, developer-defined only.

### 3. Onboarding Route

New file-based route: `src/routes/onboarding.tsx`

URL: `/onboarding`

Excluded from bottom nav / sidebar (same pattern as `/items/*`).

### 4. Empty Data Detection

New hook `useIsDataEmpty`:
```ts
const isEmpty = items.length === 0 && tags.length === 0 && vendors.length === 0
```

In `__root.tsx`: if `isEmpty && pathname !== '/onboarding'` → redirect to `/onboarding`.

### 5. Settings Entry Point

Add "Reset & restart onboarding" to `src/routes/settings/index.tsx`. Destructive confirmation dialog → clear all data → navigate to `/onboarding`.

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
│ ← 12 items selected [All][✕]│
│ [Storage ▾] [Category ▾] [🔍]│
│ (search input — optional)   │
│ Showing 15 of 30  [clear]   │
├─────────────────────────────┤
│ ☐ Milk        冷藏 · 生鮮   │
│ ☐ Eggs        冷藏 · 生鮮   │
│ ☑ Chicken     冷凍 · 生鮮   │
│ ...                         │
└─────────────────────────────┘
```

- Storage filter: flat list (room temperature / refrigerated / frozen)
- Category filter: flat list of ALL category tags (Food, 生鮮, Personal Care, 身體清潔…) — selecting a parent auto-includes descendants
- "Select all visible": selects only items passing current filter
- "Clear selection": clears all regardless of filter
- Tag badges on ItemCard show pre-assigned tags (any level)
- Back → Step 2/4 with updated count

### Step 3B — Template Vendors Browser

```
┌─────────────────────────────┐
│ ← 4 vendors sel.  [All] [✕] │
│ [search input............]  │
│ Showing 8 of 17  [clear]    │
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
| `useOnboardingSetup` | `src/hooks/useOnboardingSetup.ts` | Bulk-creates tags + items + vendors; reports progress |

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
createTagType() × 2  →  createTag() × N (respecting parentId)  →  createItem() × M  →  createVendor() × Y
  ↓
navigate('/')
```

**Tag creation order:** top-level tags first, then children (so parentId references resolve correctly).

---

## Implementation Phases

### Phase A — Nested tags (prerequisite)
1. Add `parentId?: string` to `Tag` type + Dexie schema (bump version)
2. Add `getTagAndDescendantIds(tagId, allTags)` helper in `src/lib/`
3. Update Settings/Tags UI to render tags nested under parents
4. Update filter dropdowns to expand parent selection to descendants
5. Backward compatible — existing tags get `parentId = undefined` (no migration needed)

### Phase B — Template data & onboarding route
1. Write `src/data/template.ts` with 30–50 items, 17 vendors, nested tags
2. Create `src/routes/onboarding.tsx` with step state machine
3. Build `OnboardingWelcome` (Step 1)
4. Build `TemplateOverview` (Steps 2 & 4)
5. Build `TemplateItemsBrowser` (Step 3A) with storage + category filters
6. Build `TemplateVendorsBrowser` (Step 3B)
7. Build `OnboardingProgress` (Step 5)
8. Wire `useOnboardingSetup` hook
9. Add empty-data redirect in `__root.tsx`

### Phase C — Settings entry point
1. Add "Reset & restart onboarding" to Settings page
2. Destructive confirmation dialog → clear data → redirect to `/onboarding`

---

## Resolved Design Decisions

- **i18n for template data**: All template item/tag/vendor names go through `en.json` / `tw.json` (keys like `template.tags.food`, `template.items.milk`). `template.ts` stores i18n keys, not raw strings.
- **Tag colors**: Template tags inherit their tag type's single color. No per-tag color in `template.ts`.
- **Category filter UI**: Flat list with **visual indent** to show hierarchy. Supports **multiple selection** within the dropdown. Selecting a parent does not auto-select children — each tag is an independent filter option that expands to include its descendants when matched against items.
