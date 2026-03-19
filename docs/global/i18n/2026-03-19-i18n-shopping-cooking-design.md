# i18n: Shopping & Cooking Pages Design

## Overview

Extract all hardcoded English strings from the shopping and cooking features into EN and TW translation keys. Covers the shopping page, cooking page, and CookingControlBar component.

## Scope

**Files:**
- `apps/web/src/routes/shopping.tsx` — shopping page
- `apps/web/src/routes/cooking.tsx` — cooking page
- `apps/web/src/components/recipe/CookingControlBar/index.tsx` — cooking toolbar component

**Not included:** `ItemListToolbar` — deferred to next i18n plan (item list pages).

## Approach

- Use i18next plurals (`key_one` / `key_other`) for all count-dependent strings
- Reuse existing `common.*` keys where possible; add new `common.*` keys for shared actions
- Translate log note strings (stored in checkout/cooking logs)
- Translate aria-labels

## Translation Keys

### common (additions)

| Key | EN | TW |
|---|---|---|
| `done` | Done | 完成 |
| `back` | Back | 返回 |
| `confirm` | Confirm | 確認 |

### shopping.toolbar

| Key | EN | TW |
|---|---|---|
| `cartCount_one` | {{count}} pack in cart | 購物車裡有 {{count}} 包 |
| `cartCount_other` | {{count}} packs in cart | 購物車裡有 {{count}} 包 |

### shopping.vendorFilter

| Key | EN | TW |
|---|---|---|
| `allVendors` | All vendors | 所有商店 |
| `manageVendors` | Manage vendors... | 管理商店... |

### shopping.inactiveItems

| Key | EN | TW |
|---|---|---|
| `inactiveItems_one` | {{count}} inactive item | {{count}} 個停用品項 |
| `inactiveItems_other` | {{count}} inactive items | {{count}} 個停用品項 |

### shopping.abandonDialog

| Key | EN | TW |
|---|---|---|
| `title` | Abandon this shopping trip? | 放棄這次購物？ |
| `description` | All items will be removed from the cart. | 所有品項將從購物車中移除。 |
| `abandon` | Abandon | 放棄 |

### shopping.checkoutDialog

| Key | EN | TW |
|---|---|---|
| `title` | Complete shopping trip? | 完成購物？ |
| `description` | Quantities will be updated based on your cart. | 品項數量將根據購物車更新。 |

### shopping.log

| Key | EN | TW |
|---|---|---|
| `purchasedAt` | purchased at {{vendor}} | 購自 {{vendor}} |
| `purchased` | purchased | 已購買 |

### cooking.toolbar

| Key | EN | TW |
|---|---|---|
| `servingCount_one` | {{count}} serving cooked | 烹調了 {{count}} 份 |
| `servingCount_other` | {{count}} servings cooked | 烹調了 {{count}} 份 |

### cooking.emptyState

| Key | EN | TW |
|---|---|---|
| `emptyState` | No recipes yet. Create your first recipe to get started. | 還沒有食譜，新增第一個食譜來開始吧。 |

### cooking.recipe

| Key | EN | TW |
|---|---|---|
| `itemCount_one` | {{count}} item selected | 已選 {{count}} 項 |
| `itemCount_other` | {{count}} items selected | 已選 {{count}} 項 |
| `noItems` | No items in this recipe. | 這個食譜裡還沒有品項。 |

### cooking.log

| Key | EN | TW |
|---|---|---|
| `consumedVia` | consumed via {{recipes}} | 透過 {{recipes}} 消耗 |
| `consumedViaRecipe` | consumed via recipe | 透過食譜消耗 |

### cooking.doneDialog

| Key | EN | TW |
|---|---|---|
| `title_one` | Consume from {{names}} recipe? | 從「{{names}}」食譜消耗？ |
| `title_other` | Consume from {{names}} recipes? | 從「{{names}}」等食譜消耗？ |
| `description` | This will reduce your inventory. | 這將減少你的庫存。 |
| `warningHeader` | Warning — insufficient stock: | 警告 — 庫存不足： |
| `requested` | requested | 需要 |
| `available` | available | 現有 |

### cooking.cancelDialog

| Key | EN | TW |
|---|---|---|
| `title` | Discard all selections? | 放棄所有選擇？ |
| `description` | All recipe selections and amount adjustments will be reset. | 所有食譜選擇與用量調整將重置。 |

### cookingControlBar.sort

| Key | EN | TW |
|---|---|---|
| `name` | Name | 名稱 |
| `recent` | Last Cooked | 最近烹調 |
| `count` | Item Count | 品項數量 |

### cookingControlBar (aria-labels & search)

| Key | EN | TW |
|---|---|---|
| `sortAscending` | Sort ascending | 升冪排列 |
| `sortDescending` | Sort descending | 降冪排列 |
| `collapseAll` | Collapse all | 全部收合 |
| `expandAll` | Expand all | 全部展開 |
| `toggleSearch` | Toggle search | 切換搜尋 |
| `searchPlaceholder` | Search recipes or items... | 搜尋食譜或品項... |

## Implementation Plan

### Step 1: Add translation keys to locale files
- Add `common.done`, `common.back`, `common.confirm` to `en.json` and `tw.json`
- Add `shopping.*` keys to `en.json` and `tw.json`
- Add `cooking.*` keys to `en.json` and `tw.json`
- Add `cookingControlBar.*` keys to `en.json` and `tw.json`
- Run parity test: `pnpm test -- locales`

### Step 2: Wire up shopping.tsx
- Import `useTranslation`
- Replace all hardcoded strings with `t()` calls
- Use `t('key', { count })` for plurals
- Reuse `common.cancel`, `common.goBack`, `common.discard`, and new `common.done`

### Step 3: Wire up cooking.tsx + CookingControlBar
- Import `useTranslation` in both files
- Replace all hardcoded strings with `t()` calls
- Use `t('key', { count, names })` for the done dialog title
- Reuse `common.cancel`, `common.back`, `common.confirm`, and `common.discard`

### Step 4: Verification
- `pnpm test` — parity test must pass
- `pnpm build` — no TS errors
- `pnpm lint` — no lint errors
- Visual check: switch language in settings and verify shopping/cooking pages update
