# RWD Improvements — Design Doc

**Branch:** `refactor/rwd-improvements`
**Date:** 2026-03-24
**Status:** ✅ Implemented

---

## Goal

Improve responsive web design consistency across multiple pages:
1. Standardise empty state styling
2. Replace the tags-tab empty state with an actionable button
3. Center-align content areas in wide viewports (item detail tabs, recipe/vendor/tag info + items tabs)

---

## Task 1 — Standardise Empty State Style

### Pattern (from pantry page)

```jsx
<div className="text-center py-12 text-foreground-muted">
  <p>{title}</p>
  <p className="text-sm mt-1">{description}</p>
</div>
```

### Extract `EmptyState` component

**Location:** `src/components/EmptyState/index.tsx`

**Props:**
```ts
interface EmptyStateProps {
  title: string
  description: string
  className?: string
}
```

### Pages to update

| Page / Tab | Title | Description |
|---|---|---|
| Cooking page | `t('cooking.empty.title')` | `t('cooking.empty.description')` |
| Settings > Recipes list | `t('settings.recipes.empty.title')` | `t('settings.recipes.empty.description')` |
| Settings > Vendors list | `t('settings.vendors.empty.title')` | `t('settings.vendors.empty.description')` |
| Tag detail > Items tab | `t('settings.tags.items.empty.title')` | `t('settings.tags.items.empty.description')` |
| Vendor detail > Items tab | `t('settings.vendors.items.empty.title')` | `t('settings.vendors.items.empty.description')` |
| Recipe detail > Items tab | `t('settings.recipes.items.empty.title')` | `t('settings.recipes.items.empty.description')` |

### i18n strings to add

**EN (`en.json`)**
```json
"cooking": {
  "empty": {
    "title": "No recipes yet.",
    "description": "Add recipes in Settings to get started."
  }
}
"settings": {
  "recipes": {
    "empty": {
      "title": "No recipes yet.",
      "description": "Tap + to add your first recipe."
    }
  },
  "vendors": {
    "empty": {
      "title": "No vendors yet.",
      "description": "Tap + to add your first vendor."
    }
  },
  "tags": {
    "items": {
      "empty": {
        "title": "No items yet.",
        "description": "Items tagged here will appear in this list."
      }
    }
  },
  "vendors": {
    "items": {
      "empty": {
        "title": "No items yet.",
        "description": "Items assigned to this vendor will appear here."
      }
    }
  },
  "recipes": {
    "items": {
      "empty": {
        "title": "No items yet.",
        "description": "Items linked to this recipe will appear here."
      }
    }
  }
}
```

> Note: existing single-key `settings.recipes.empty` and `settings.vendors.empty` string keys will be replaced with `settings.recipes.empty.title` / `settings.vendors.empty.title` (plus a new `.description`). Update all call sites and both locale files.

---

## Task 2 — Tags Tab: Replace Empty State with Action Button

**File:** `src/routes/items/$id/tags.tsx`

**Condition:** `tagTypes.length === 0`

**Behaviour:**
- Show `EmptyState` with title + description explaining no tag types exist
- Plus a "New Tag Type" button below that opens a creation dialog in place

**Dialog:** Reuse `AddNameDialog` component with:
- `title`: `t('items.tags.newTagType.dialogTitle')` → "New Tag Type"
- `submitLabel`: `t('common.add')` → "Add"
- On submit: call `useAddTagType` mutation hook (check if it exists; if not, create it)

**i18n strings to add:**
```json
"items": {
  "tags": {
    "empty": {
      "title": "No tag types yet.",
      "description": "Create a tag type to start organizing your items."
    },
    "newTagType": {
      "button": "New Tag Type",
      "dialogTitle": "New Tag Type"
    }
  }
}
```

**Hook:** Verify `useAddTagType()` exists in `src/hooks/`. If not, create it following the same dual-mode pattern as other mutation hooks.

---

## Task 3 — Center-Align Item Detail Tabs (Wide Viewport)

**Approach:** Add `mx-auto` to the existing `max-w-2xl` containers. For the log tab (which has no max-width today), wrap the content in `max-w-2xl mx-auto`.

| File | Current | After |
|---|---|---|
| `src/routes/items/$id/tags.tsx` | `max-w-2xl` | `max-w-2xl mx-auto` |
| `src/routes/items/$id/vendors.tsx` | `max-w-2xl` | `max-w-2xl mx-auto` |
| `src/routes/items/$id/recipes.tsx` | `max-w-2xl` | `max-w-2xl mx-auto` |
| `src/routes/items/$id/log.tsx` | none | wrap with `max-w-2xl mx-auto` |

---

## Task 4 — Center-Align Info Tabs (Recipe/Vendor/Tag Detail + New Pages)

**Approach:** `p-4` on outer wrapper, `max-w-2xl mx-auto` on inner content container.

| File | Current outer | After outer | After inner |
|---|---|---|---|
| `src/routes/settings/tags/$id/index.tsx` | `px-6 pb-6 pt-4` on form | `p-4` on wrapper div | `max-w-2xl mx-auto` on form |
| `src/routes/settings/vendors/$id/index.tsx` | `px-6 py-4` on wrapper | `p-4` on wrapper | `max-w-2xl mx-auto` on inner div |
| `src/routes/settings/recipes/$id/index.tsx` | `px-6 py-4` on wrapper | `p-4` on wrapper | `max-w-2xl mx-auto` on inner div |
| `src/routes/settings/tags/new.tsx` | (check) | `p-4` wrapper | `max-w-2xl mx-auto` inner |
| `src/routes/settings/vendors/new.tsx` | `px-6 py-4` | `p-4` wrapper | `max-w-2xl mx-auto` inner |
| `src/routes/settings/recipes/new.tsx` | `px-6 py-4` | `p-4` wrapper | `max-w-2xl mx-auto` inner |

---

## Task 5 — Center-Align Items Tabs (Tag/Vendor/Recipe Detail)

**Approach:** Add `mx-auto` to the existing `max-w-2xl` containers.

| File | Current | After |
|---|---|---|
| `src/routes/settings/tags/$id/items.tsx` | `max-w-2xl` | `max-w-2xl mx-auto` |
| `src/routes/settings/vendors/$id/items.tsx` | `max-w-2xl` | `max-w-2xl mx-auto` |
| `src/routes/settings/recipes/$id/items.tsx` | `max-w-2xl` | `max-w-2xl mx-auto` |

---

## Implementation Order

1. Create `EmptyState` component + stories + smoke test
2. Add i18n strings (en + tw)
3. Apply Task 1 — update empty states across cooking, settings lists, detail items tabs
4. Apply Task 2 — tags tab actionable button + dialog
5. Apply Task 3 — center-align item detail tabs
6. Apply Task 4 — center-align info tabs in recipe/vendor/tag detail + new pages
7. Apply Task 5 — center-align items tabs in tag/vendor/recipe detail

**Verification gate** after each step: `pnpm lint`, `pnpm build`, `pnpm build-storybook`, `pnpm check`.

**Final phase:** `pnpm test:e2e --grep "cooking|items|tags|vendors|recipes|settings"`
