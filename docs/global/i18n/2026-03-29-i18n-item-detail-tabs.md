# i18n: Item Detail Tabs — Implementation Plan

> **For Claude:** Use `superpowers:subagent-driven-development` (or dispatch subagents per step) to implement this plan.

**Goal:** Extract all hardcoded English strings from item detail tab routes into `en.json` / `tw.json`.

**Branch:** `feature/i18n-item-detail-tabs`
**Worktree:** `.worktrees/feature-i18n-item-detail-tabs/`

---

## New Translation Keys

### `items.detail` (new sub-namespace)

```json
"items": {
  "detail": {
    "notFound": "Item not found",
    "tabs": {
      "info": "Item info tab",
      "tags": "Item tags tab",
      "vendors": "Item vendors tab",
      "recipes": "Item recipes tab",
      "history": "Item history tab"
    },
    "deleteDialog": {
      "title": "Delete Item?",
      "description": "Are you sure you want to delete {{name}}? This will permanently remove this item and its history."
    },
    "recipeAdjustDialog": {
      "title": "Update recipe amounts?",
      "description": "Amount per consume changed from {{from}} to {{to}}. The following recipes will be adjusted:",
      "recipeHeader": "Recipe",
      "currentHeader": "Current",
      "newHeader": "New",
      "updateButton": "Update & Save"
    }
  }
}
```

### `items.tags` additions

```json
"newTag": {
  "button": "New Tag",
  "dialogTitle": "Add Tag",
  "submitLabel": "Add Tag",
  "placeholder": "e.g., Dairy, Frozen"
}
```

### `items.vendors` additions

```json
"newVendor": {
  "button": "New Vendor",
  "dialogTitle": "New Vendor",
  "submitLabel": "Add Vendor",
  "placeholder": "e.g., Costco, iHerb"
}
```

### `items.recipes` additions

```json
"newRecipe": {
  "button": "New Recipe",
  "dialogTitle": "New Recipe",
  "submitLabel": "Add Recipe",
  "placeholder": "e.g., Pasta Sauce, Smoothie"
}
```

### `items.history` (new sub-namespace)

```json
"history": {
  "empty": "No history yet."
}
```

---

## Implementation Steps

### Step 1 — Update `en.json` and `tw.json`

**File:** `apps/web/src/i18n/locales/en.json`

Add to the `items` block (after the existing `recipes` key):

```json
"detail": {
  "notFound": "Item not found",
  "tabs": {
    "info": "Item info tab",
    "tags": "Item tags tab",
    "vendors": "Item vendors tab",
    "recipes": "Item recipes tab",
    "history": "Item history tab"
  },
  "deleteDialog": {
    "title": "Delete Item?",
    "description": "Are you sure you want to delete {{name}}? This will permanently remove this item and its history."
  },
  "recipeAdjustDialog": {
    "title": "Update recipe amounts?",
    "description": "Amount per consume changed from {{from}} to {{to}}. The following recipes will be adjusted:",
    "recipeHeader": "Recipe",
    "currentHeader": "Current",
    "newHeader": "New",
    "updateButton": "Update & Save"
  }
},
"history": {
  "empty": "No history yet."
}
```

Add `newTag` to `items.tags`:
```json
"newTag": {
  "button": "New Tag",
  "dialogTitle": "Add Tag",
  "submitLabel": "Add Tag",
  "placeholder": "e.g., Dairy, Frozen"
}
```

Add `newVendor` to `items.vendors`:
```json
"newVendor": {
  "button": "New Vendor",
  "dialogTitle": "New Vendor",
  "submitLabel": "Add Vendor",
  "placeholder": "e.g., Costco, iHerb"
}
```

Add `newRecipe` to `items.recipes`:
```json
"newRecipe": {
  "button": "New Recipe",
  "dialogTitle": "New Recipe",
  "submitLabel": "Add Recipe",
  "placeholder": "e.g., Pasta Sauce, Smoothie"
}
```

**File:** `apps/web/src/i18n/locales/tw.json`

Add all same keys with Traditional Chinese translations:

```json
"detail": {
  "notFound": "找不到品項",
  "tabs": {
    "info": "品項資訊分頁",
    "tags": "標籤分頁",
    "vendors": "供應商分頁",
    "recipes": "食譜分頁",
    "history": "歷史紀錄分頁"
  },
  "deleteDialog": {
    "title": "刪除品項？",
    "description": "確定要刪除 {{name}} 嗎？此操作將永久移除此品項及其歷史紀錄。"
  },
  "recipeAdjustDialog": {
    "title": "更新食譜用量？",
    "description": "每次消耗量已從 {{from}} 更改為 {{to}}。以下食譜將自動調整：",
    "recipeHeader": "食譜",
    "currentHeader": "目前",
    "newHeader": "新值",
    "updateButton": "更新並儲存"
  }
},
"history": {
  "empty": "尚無歷史紀錄。"
}
```

`items.tags.newTag`:
```json
"newTag": {
  "button": "新增標籤",
  "dialogTitle": "新增標籤",
  "submitLabel": "新增標籤",
  "placeholder": "例如：乳製品、冷凍"
}
```

`items.vendors.newVendor`:
```json
"newVendor": {
  "button": "新增供應商",
  "dialogTitle": "新增供應商",
  "submitLabel": "新增供應商",
  "placeholder": "例如：好市多、iHerb"
}
```

`items.recipes.newRecipe`:
```json
"newRecipe": {
  "button": "新增食譜",
  "dialogTitle": "新增食譜",
  "submitLabel": "新增食譜",
  "placeholder": "例如：義大利麵醬、果昔"
}
```

**Verify:** `pnpm test` — the key parity test in `locales.test.ts` must pass.

---

### Step 2 — Update `$id.tsx` (parent layout)

**File:** `apps/web/src/routes/items/$id.tsx`

Add `useTranslation` import and wire `t()`:

1. `<div className="p-4">Item not found</div>` → `t('items.detail.notFound')`
2. `aria-label="Go back"` on the back button → `t('common.goBack')`
3. `<span className="hidden lg:inline ml-1">Back</span>` → `t('common.goBack')`
4. Tab aria-labels (5 links):
   - `"Item info tab"` → `t('items.detail.tabs.info')`
   - `"Item tags tab"` → `t('items.detail.tabs.tags')`
   - `"Item vendors tab"` → `t('items.detail.tabs.vendors')`
   - `"Item recipes tab"` → `t('items.detail.tabs.recipes')`
   - `"Item history tab"` → `t('items.detail.tabs.history')`
5. Unsaved dialog (already has `common.*` keys, just wire them):
   - `"Unsaved changes"` → `t('common.unsavedTitle')`
   - `"You have unsaved changes. Discard changes?"` → `t('common.unsavedDescription')`
   - `"Cancel"` → `t('common.cancel')`
   - `"Discard"` → `t('common.discard')`

---

### Step 3 — Update `$id/index.tsx` (stock/info tab)

**File:** `apps/web/src/routes/items/$id/index.tsx`

Add `useTranslation` import and wire `t()`:

1. `DeleteButton` props:
   - `dialogTitle="Delete Item?"` → `dialogTitle={t('items.detail.deleteDialog.title')}`
   - `dialogDescription={<>Are you sure…</>}` → `dialogDescription={t('items.detail.deleteDialog.description', { name: item.name })}`
2. Recipe adjust dialog:
   - `"Update recipe amounts?"` → `t('items.detail.recipeAdjustDialog.title')`
   - Description (interpolated) → `t('items.detail.recipeAdjustDialog.description', { from: item.consumeAmount, to: pendingFormValues?.consumeAmount })`
   - `"Recipe"` → `t('items.detail.recipeAdjustDialog.recipeHeader')`
   - `"Current"` → `t('items.detail.recipeAdjustDialog.currentHeader')`
   - `"New"` → `t('items.detail.recipeAdjustDialog.newHeader')`
   - `"Update & Save"` → `t('items.detail.recipeAdjustDialog.updateButton')`
3. `"Cancel"` (dialog footer) → `t('common.cancel')`

---

### Step 4 — Update `$id/tags.tsx`

**File:** `apps/web/src/routes/items/$id/tags.tsx`

Wire `t()` (already imports `useTranslation`):

1. `TagTypeSection` component — "New Tag" button text → `t('items.tags.newTag.button')`
   - Note: `TagTypeSection` currently doesn't use `useTranslation`. Add the hook or pass the string as a prop.
   - Preferred: pass as prop `addTagLabel={t('items.tags.newTag.button')}` from `TagsTab`, or add `useTranslation` to `TagTypeSection`.
2. `AddNameDialog` for tag:
   - `title="Add Tag"` → `title={t('items.tags.newTag.dialogTitle')}`
   - `submitLabel="Add Tag"` → `submitLabel={t('items.tags.newTag.submitLabel')}`
   - `placeholder="e.g., Dairy, Frozen"` → `placeholder={t('items.tags.newTag.placeholder')}`

---

### Step 5 — Update `$id/vendors.tsx`

**File:** `apps/web/src/routes/items/$id/vendors.tsx`

Wire `t()` (already imports `useTranslation`):

1. "New Vendor" button text → `t('items.vendors.newVendor.button')`
2. `AddNameDialog`:
   - `title="New Vendor"` → `title={t('items.vendors.newVendor.dialogTitle')}`
   - `submitLabel="Add Vendor"` → `submitLabel={t('items.vendors.newVendor.submitLabel')}`
   - `placeholder="e.g., Costco, iHerb"` → `placeholder={t('items.vendors.newVendor.placeholder')}`

---

### Step 6 — Update `$id/recipes.tsx`

**File:** `apps/web/src/routes/items/$id/recipes.tsx`

Wire `t()` (already imports `useTranslation`):

1. "New Recipe" button text → `t('items.recipes.newRecipe.button')`
2. `AddNameDialog`:
   - `title="New Recipe"` → `title={t('items.recipes.newRecipe.dialogTitle')}`
   - `submitLabel="Add Recipe"` → `submitLabel={t('items.recipes.newRecipe.submitLabel')}`
   - `placeholder="e.g., Pasta Sauce, Smoothie"` → `placeholder={t('items.recipes.newRecipe.placeholder')}`

---

### Step 7 — Update `$id/log.tsx`

**File:** `apps/web/src/routes/items/$id/log.tsx`

Add `useTranslation` import and hook call:

1. `"No history yet."` → `t('items.history.empty')`

---

### Step 8 — Update i18n CLAUDE.md

**File:** `apps/web/src/i18n/CLAUDE.md`

Update the "Page-by-page string extraction" section to include item detail tabs as translated.

---

### Verification Gate (after all steps)

Run from worktree root (`.worktrees/feature-i18n-item-detail-tabs/`):

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Final phase E2E:
```bash
pnpm test:e2e --grep "items|a11y"
```

---

## Commit Plan

Single commit (all changes are part of the same i18n extraction feature):

```
feat(i18n): translate item detail tab strings
```

Covers: `en.json`, `tw.json`, `$id.tsx`, `$id/index.tsx`, `$id/tags.tsx`, `$id/vendors.tsx`, `$id/recipes.tsx`, `$id/log.tsx`, i18n CLAUDE.md.
