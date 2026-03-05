# Design: Vendor & Recipe Visual Identity

**Date:** 2026-03-05
**Status:** Approved

## Goal

Give system-defined objects (vendors, recipes) a consistent visual identity so users can distinguish them from user-defined objects (tag types, tags). The `Store` icon represents vendors; `CookingPot` represents recipes — both already established in `ItemCard` badges and navigation.

## Changes

### 1. ItemFilters — Vendor/Recipe Dropdown Triggers

**File:** `src/components/ItemFilters.tsx`

Add the domain icon before the label text in each dropdown trigger button:
- Vendor button: `[Store] Vendors [⌄]`
- Recipe button: `[CookingPot] Recipes [⌄]`

Import `Store` and `CookingPot` from `lucide-react` (alongside existing `ChevronDown`, `Pencil`, `X`).

### 2. ItemFilters — "Edit Tags" Button Reposition and Rename

**File:** `src/components/ItemFilters.tsx`

- **Rename:** `Edit` → `Edit Tags`
- **Reposition:** Move the button from the end of the row to immediately after the last `TagTypeDropdown`, before the vendor dropdown. This clearly scopes the edit action to tags only.

No change to the link destination (`/settings/tags`) or button variant.

### 3. VendorCard — Icon Prefix

**File:** `src/components/VendorCard.tsx`

Add `<Store className="h-4 w-4 text-foreground-muted" />` to the left of the vendor name link, inside the existing `flex items-center gap-2` container.

Import `Store` from `lucide-react`.

### 4. RecipeCard — Icon Prefix

**File:** `src/components/RecipeCard.tsx`

Add `<CookingPot className="h-4 w-4 text-foreground-muted" />` to the left of the recipe name link, inside the existing `flex items-center gap-2` container.

Import `CookingPot` from `lucide-react`.

## Visual Summary

**ItemFilters row (before):**
```
[Diet ⌄] [Storage ⌄]  [Vendors ⌄]  [Recipes ⌄]  [✏ Edit]
```

**ItemFilters row (after):**
```
[Diet ⌄] [Storage ⌄]  [✏ Edit Tags]  [🏪 Vendors ⌄]  [🍳 Recipes ⌄]
```

**VendorCard (before):**
```
Costco · 12 items   [delete]
```

**VendorCard (after):**
```
[🏪] Costco · 12 items   [delete]
```

**RecipeCard (before):**
```
Pasta Night · 4 items   [delete]
```

**RecipeCard (after):**
```
[🍳] Pasta Night · 4 items   [delete]
```

## Icon Reference

| Object  | Icon        | Lucide name   | Existing usage                          |
|---------|-------------|---------------|-----------------------------------------|
| Vendor  | `Store`     | `Store`       | `ItemCard` vendor badge, settings nav   |
| Recipe  | `CookingPot`| `CookingPot`  | `ItemCard` recipe badge, cooking nav    |

## Affected Files

- `src/components/ItemFilters.tsx` — icon imports, trigger buttons, button label, button position
- `src/components/VendorCard.tsx` — icon import, icon before name
- `src/components/RecipeCard.tsx` — icon import, icon before name
