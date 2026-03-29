# i18n: ItemListToolbar, ItemFilters, TagTypeDropdown

**Date:** 2026-03-29
**Branch:** `feature/i18n-item-list-toolbar`
**Status:** 🔲 Pending

## Goal

Extract all hardcoded English strings from three components into `en.json` / `tw.json`, then replace each string with a `t()` call.

**Components in scope:**
- `src/components/item/ItemListToolbar/index.tsx`
- `src/components/item/ItemFilters/index.tsx`
- `src/components/tag/TagTypeDropdown/index.tsx`

---

## Key Design

### Reuse existing keys (no new keys needed)

| String | Existing key |
|---|---|
| "Vendors" | `settings.vendors.label` |
| "Recipes" | `settings.recipes.label` |

### New `common.*` keys

| Key | EN | TW |
|---|---|---|
| `common.clear` | "Clear" | "清除" |
| `common.manage` | "Manage" | "管理" |
| `common.asc` | "Asc" | "升冪" |
| `common.desc` | "Desc" | "降冪" |
| `common.search` | "Search" | "搜尋" |
| `common.tags` | "Tags" | "標籤" |
| `common.filters` | "Filters" | "篩選條件" |

### New `itemFilters.*` keys

| Key | EN | TW |
|---|---|---|
| `itemFilters.editTags` | "Edit Tags" | "編輯標籤" |

### New `itemListToolbar.*` keys

| Key | EN | TW | Notes |
|---|---|---|---|
| `itemListToolbar.sortBy` | "Sort by" | "排序依" | |
| `itemListToolbar.sortByCriteria` | "Sort by criteria" | "選擇排序依據" | aria-label |
| `itemListToolbar.sortExpiringSoon` | "Expiring soon" | "快到期了" | Unifies old "Expiring" (button) and "Expiring soon" (dropdown) |
| `itemListToolbar.sortName` | "Name" | "名稱" | |
| `itemListToolbar.sortStock` | "Stock" | "庫存量" | |
| `itemListToolbar.sortLastPurchased` | "Last purchased" | "最近買的" | Unifies old "Purchased" (button) and "Last purchased" (dropdown) |
| `itemListToolbar.toggleSortDirection` | "Toggle sort direction" | "切換排序方向" | aria-label |
| `itemListToolbar.toggleTags` | "Toggle tags" | "顯示/隱藏標籤" | aria-label |
| `itemListToolbar.toggleFilters` | "Toggle filters" | "顯示/隱藏篩選條件" | aria-label |
| `itemListToolbar.toggleSearch` | "Toggle search" | "顯示/隱藏搜尋框" | aria-label |
| `itemListToolbar.searchPlaceholder` | "Search items..." | "搜尋品項..." | |
| `itemListToolbar.clearSearch` | "Clear search" | "清除搜尋" | aria-label |
| `itemListToolbar.create` | "Create" | "新增" | |
| `itemListToolbar.createItem` | "Create item" | "新增品項" | aria-label |

---

## Implementation Plan

### Step 1 — Add new keys to translation files

Files: `apps/web/src/i18n/locales/en.json`, `apps/web/src/i18n/locales/tw.json`

- Add `common.clear`, `common.manage`, `common.asc`, `common.desc`, `common.search`, `common.tags`, `common.filters` to both files
- Add `itemFilters` namespace with `editTags` key to both files
- Add `itemListToolbar` namespace with all 14 keys to both files
- Run `pnpm test` to confirm locales parity test passes

### Step 2 — Update `TagTypeDropdown`

File: `apps/web/src/components/tag/TagTypeDropdown/index.tsx`

- Add `useTranslation` import
- Replace `"Clear"` → `{t('common.clear')}`

Update stories if they assert on this text.

### Step 3 — Update `ItemFilters`

File: `apps/web/src/components/item/ItemFilters/index.tsx`

- Add `useTranslation` import
- Replace strings:
  - `"Vendors"` → `{t('settings.vendors.label')}`
  - `"Recipes"` → `{t('settings.recipes.label')}`
  - `"Clear"` (×2) → `{t('common.clear')}`
  - `"Manage"` (×2) → `{t('common.manage')}`
  - `"Edit Tags"` → `{t('itemFilters.editTags')}`

Update stories if they assert on these texts.

### Step 4 — Update `ItemListToolbar`

File: `apps/web/src/components/item/ItemListToolbar/index.tsx`

- Add `useTranslation` import
- Replace the `sortLabels` record with a `t()`-based lookup:
  ```ts
  const sortLabels: Record<SortField, string> = {
    expiring: t('itemListToolbar.sortExpiringSoon'),
    name: t('itemListToolbar.sortName'),
    stock: t('itemListToolbar.sortStock'),
    purchased: t('itemListToolbar.sortLastPurchased'),
  }
  ```
- Replace all remaining hardcoded strings:
  - `"Sort by"` label → `{t('itemListToolbar.sortBy')}`
  - `aria-label="Sort by criteria"` → `aria-label={t('itemListToolbar.sortByCriteria')}`
  - `"Expiring soon"` dropdown item → `{t('itemListToolbar.sortExpiringSoon')}`
  - `"Name"` dropdown item → `{t('itemListToolbar.sortName')}`
  - `"Stock"` dropdown item → `{t('itemListToolbar.sortStock')}`
  - `"Last purchased"` dropdown item → `{t('itemListToolbar.sortLastPurchased')}`
  - `aria-label="Toggle sort direction"` → `aria-label={t('itemListToolbar.toggleSortDirection')}`
  - `"Asc"` / `"Desc"` → `{t('common.asc')}` / `{t('common.desc')}`
  - `aria-label="Toggle tags"` → `aria-label={t('itemListToolbar.toggleTags')}`
  - `"Tags"` label → `{t('common.tags')}`
  - `aria-label="Toggle filters"` → `aria-label={t('itemListToolbar.toggleFilters')}`
  - `"Filters"` label → `{t('common.filters')}`
  - `aria-label="Toggle search"` → `aria-label={t('itemListToolbar.toggleSearch')}`
  - `"Search"` label → `{t('common.search')}`
  - `placeholder="Search items..."` → `placeholder={t('itemListToolbar.searchPlaceholder')}`
  - `aria-label="Clear search"` → `aria-label={t('itemListToolbar.clearSearch')}`
  - `aria-label="Create item"` → `aria-label={t('itemListToolbar.createItem')}`
  - `"Create"` button label → `{t('itemListToolbar.create')}`

Update stories if they assert on these texts.

### Step 5 — Verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All must pass before finishing the branch.

---

## Files to Modify

| File | Change |
|---|---|
| `apps/web/src/i18n/locales/en.json` | Add 22 new keys |
| `apps/web/src/i18n/locales/tw.json` | Add 22 new keys |
| `apps/web/src/components/tag/TagTypeDropdown/index.tsx` | Use `t('common.clear')` |
| `apps/web/src/components/item/ItemFilters/index.tsx` | Use `t()` for 5 distinct strings |
| `apps/web/src/components/item/ItemListToolbar/index.tsx` | Use `t()` for 16 strings; fix sort label mismatch |
| Stories for the above components (if any assert on translated text) | Update assertions |
