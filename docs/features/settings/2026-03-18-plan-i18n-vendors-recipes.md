# Plan: i18n for Settings Vendors & Recipes Pages

**Branch:** `feature/i18n-settings-vendors-recipes`
**Date:** 2026-03-18

## Context

Tags, theme, language, data mode, export, and family group settings pages are already fully translated. Only the vendors and recipes management pages still have hardcoded English strings.

## Scope

Translate all hardcoded strings in:
- `routes/settings/vendors/index.tsx`
- `routes/settings/vendors/$id/index.tsx`
- `routes/settings/recipes/index.tsx`
- `routes/settings/recipes/$id/index.tsx`
- `components/vendor/VendorCard/index.tsx`
- `components/recipe/RecipeCard/index.tsx`

**Out of scope:** vendor/recipe items sub-tabs and item-related pages (deferred to a future plan).

## Key Design Decisions

- **Flat key structure** under `settings.vendors` and `settings.recipes` (no sub-namespaces like `vendor.deleteTitle`)
- **Plain strings with quotes**, no `<strong>` bold in deletion dialogs — EN uses `"name"` (double quotes), TW uses `「name」` (already in place for tags)
- **Quote style consistency:** apply `"{{name}}"` quoting to ALL deletion dialog strings — vendors, recipes, AND existing tags deletion strings
- **i18next standard pluralization** with `_one` / `_other` suffixes for item counts and deletion descriptions
- **Reuse existing keys:** `settings.vendors.label` / `settings.recipes.label` for page `<h1>`; `common.delete` for the Delete button trigger

## New Locale Keys

### `settings.vendors` additions

```json
"newButton": "New Vendor",
"empty": "No vendors yet. Add your first vendor.",
"itemCount_one": "· 1 item",
"itemCount_other": "· {{count}} items",
"deleteAriaLabel": "Delete {{name}}",
"deleteTitle": "Delete Vendor?",
"deleteWithItems_one": "\"{{name}}\" will be removed from 1 item.",
"deleteWithItems_other": "\"{{name}}\" will be removed from {{count}} items.",
"deleteNoItems": "No items are assigned to \"{{name}}\"."
```

### `settings.recipes` additions

```json
"newButton": "New Recipe",
"empty": "No recipes yet. Add your first recipe.",
"itemCount_one": "· 1 item",
"itemCount_other": "· {{count}} items",
"deleteAriaLabel": "Delete {{name}}",
"deleteTitle": "Delete Recipe?",
"deleteWithItems_one": "\"{{name}}\" will be deleted. It contains 1 item. Your inventory will not be affected.",
"deleteWithItems_other": "\"{{name}}\" will be deleted. It contains {{count}} items. Your inventory will not be affected.",
"deleteNoItems": "\"{{name}}\" will be deleted. It has no items."
```

### TW translations for `settings.vendors`

```json
"newButton": "新增供應商",
"empty": "還沒建立任何供應商。",
"itemCount_one": "· 1 個品項",
"itemCount_other": "· {{count}} 個品項",
"deleteAriaLabel": "刪除{{name}}",
"deleteTitle": "刪除供應商？",
"deleteWithItems_other": "即將移除「{{name}}」，並移除它與 {{count}} 個品項的關聯。",
"deleteNoItems": "「{{name}}」沒有關聯到任何品項，可以安心刪除。"
```

### TW translations for `settings.recipes`

```json
"newButton": "新增食譜",
"empty": "還沒建立任何食譜。",
"itemCount_one": "· 1 個品項",
"itemCount_other": "· {{count}} 個品項",
"deleteAriaLabel": "刪除{{name}}",
"deleteTitle": "刪除食譜？",
"deleteWithItems_other": "即將刪除「{{name}}」，其中包含 {{count}} 個品項，您的庫存不會受到影響。",
"deleteNoItems": "即將刪除「{{name}}」，此食譜沒有任何品項。"
```

Note: TW has no `_one` variant for plurals — i18next falls back to `_other` for Chinese.

### Existing tags keys to update (add quotes around `{{name}}`)

**EN `settings.tags.tagType`:**
```json
"deleteWithTags_one": "We are about to delete \"{{name}}\" and its 1 associated tag, removing it from all assigned items.",
"deleteWithTags_other": "We are about to delete \"{{name}}\" and its {{count}} associated tags, removing them from all assigned items.",
"deleteNoTags": "It's safe to delete \"{{name}}\" since no tag belongs to it."
```

**EN `settings.tags.tag`:**
```json
"deleteWithItems_one": "We are about to delete \"{{name}}\", removing it from 1 item.",
"deleteWithItems_other": "We are about to delete \"{{name}}\", removing it from {{count}} items.",
"deleteNoItems": "It's safe to delete \"{{name}}\" since no item is using it."
```

TW tags strings already use `「{{name}}」` — no change needed.

## Implementation Steps

### Step 1 — Update `en.json` and `tw.json`

- Add all new vendor and recipe keys (EN + TW)
- Update existing tags deletion keys in EN to add `"quotes"` around `{{name}}`
- TW tags strings already use `「」` — no change needed

**Verification:** Run `pnpm test` — the key parity test (`locales.test.ts`) must pass.

### Step 2 — Update `VendorCard` and `RecipeCard` components

Add `useTranslation` to both components and replace hardcoded strings:

- `· {itemCount} items` → `t('settings.vendors.itemCount', { count: itemCount })`
- `` `Delete ${vendor.name}` `` → `t('settings.vendors.deleteAriaLabel', { name: vendor.name })`
- `"Delete Vendor?"` → `t('settings.vendors.deleteTitle')`
- Deletion dialog JSX (with `<strong>`) → plain `t()` strings with `count`-based plural

Same pattern for `RecipeCard` with `settings.recipes.*` keys.

Update `.stories.tsx` files for both components if they exist.

**Verification gate:** `pnpm lint && pnpm build && pnpm test`

### Step 3 — Update vendor route pages

**`vendors/index.tsx`:**
- Add `useTranslation`
- `<h1>Vendors</h1>` → `<h1>{t('settings.vendors.label')}</h1>`
- `"New Vendor"` → `t('settings.vendors.newButton')`
- `"No vendors yet. Add your first vendor."` → `t('settings.vendors.empty')`

**`vendors/$id/index.tsx`:**
- Add `useTranslation`
- `trigger="Delete"` → `trigger={t('common.delete')}`
- `dialogTitle="Delete Vendor?"` → `dialogTitle={t('settings.vendors.deleteTitle')}`
- `dialogDescription` JSX → plain `t('settings.vendors.deleteWithItems', { name, count })` / `t('settings.vendors.deleteNoItems', { name })`

**Verification gate:** `pnpm lint && pnpm build && pnpm test`

### Step 4 — Update recipe route pages

Same pattern as Step 3 but for recipes:

**`recipes/index.tsx`:**
- `<h1>Recipes</h1>` → `<h1>{t('settings.recipes.label')}</h1>`
- `"New Recipe"` → `t('settings.recipes.newButton')`
- `"No recipes yet. Add your first recipe."` → `t('settings.recipes.empty')`

**`recipes/$id/index.tsx`:**
- `trigger="Delete"` → `trigger={t('common.delete')}`
- `dialogTitle="Delete Recipe?"` → `dialogTitle={t('settings.recipes.deleteTitle')}`
- `dialogDescription` JSX → plain `t('settings.recipes.deleteWithItems', { name, count })` / `t('settings.recipes.deleteNoItems', { name })`

**Verification gate:** `pnpm lint && pnpm build && pnpm test`

### Step 5 — Final verification

Run the full quality gate:

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
pnpm test:e2e --grep "vendors|recipes"
```

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/i18n/locales/en.json` | Add vendor + recipe keys; update tags deletion strings to add `"quotes"` |
| `apps/web/src/i18n/locales/tw.json` | Add vendor + recipe TW translations (tags already use `「」`) |
| `apps/web/src/components/vendor/VendorCard/index.tsx` | Add `useTranslation`, replace hardcoded strings |
| `apps/web/src/components/recipe/RecipeCard/index.tsx` | Add `useTranslation`, replace hardcoded strings |
| `apps/web/src/routes/settings/vendors/index.tsx` | Add `useTranslation`, replace 3 strings |
| `apps/web/src/routes/settings/vendors/$id/index.tsx` | Add `useTranslation`, replace deletion dialog |
| `apps/web/src/routes/settings/recipes/index.tsx` | Add `useTranslation`, replace 3 strings |
| `apps/web/src/routes/settings/recipes/$id/index.tsx` | Add `useTranslation`, replace deletion dialog |
