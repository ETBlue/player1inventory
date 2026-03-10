# i18n: Settings Tags Pages Design

## Overview

Extract all hardcoded strings from the settings tags section into EN and TW translation keys. Covers all 4 files: tags list page, tag detail layout, tag info tab, and tag items tab.

## Scope

**Files:**
- `src/routes/settings/tags/index.tsx` — tags list page
- `src/routes/settings/tags/$id.tsx` — tag detail layout
- `src/routes/settings/tags/$id/index.tsx` — tag info tab
- `src/routes/settings/tags/$id/items.tsx` — tag items tab

## Key Structure

Keys grouped by semantic category under `settings.tags.*`. Delete-dialog strings shared between list page and info tab (same text, one translation). Deletion keys follow consistent format: generic title (no `{{name}}`), `{{name}}` only in descriptions.

## Translation Keys

### settings.tags.tagType

| Key | EN | TW |
|---|---|---|
| `colorLabel` | Color | 顏色 |
| `nameLabel` | Name | 名稱 |
| `namePlaceholder` | e.g., Ingredient type, Storage method | 例：食材類別、保存方式 |
| `newButton` | New Tag Type | 新增標籤分類 |
| `deleteTitle` | Delete Tag Type? | 刪除標籤分類？ |
| `deleteWithTags_one` | We are about to delete {{name}} and its 1 associated tag, removing it from all assigned items. | — |
| `deleteWithTags_other` | We are about to delete {{name}} and its {{count}} associated tags, removing them from all assigned items. | 即將刪除「{{name}}」與底下的 {{count}} 個標籤，並移除標籤與品項的關聯。 |
| `deleteNoTags` | It's safe to delete {{name}} since no tag belongs to it. | 「{{name}}」底下沒有任何標籤，可以安心刪除。 |

### settings.tags.tag

| Key | EN | TW |
|---|---|---|
| `newButton` | New Tag | 新增標籤 |
| `addTitle` | Add Tag | 新增標籤 |
| `addSubmit` | Add Tag | 新增 |
| `addPlaceholder` | e.g., Dairy, Frozen | 例：乳製品、冷凍食品 |
| `typeLabel` | Tag Type | 標籤分類 |
| `nameLabel` | Name | 名稱 |
| `deleteTitle` | Delete Tag? | 刪除標籤？ |
| `deleteWithItems_one` | We are about to delete {{name}}, removing it from 1 item. | — |
| `deleteWithItems_other` | We are about to delete {{name}}, removing it from {{count}} items. | 即將刪除「{{name}}」，並移除它與 {{count}} 個品項的關聯。 |
| `deleteNoItems` | It's safe to delete {{name}} since no item is using it. | 「{{name}}」沒有關聯到任何品項，可以安心刪除。 |

### settings.tags.toast

| Key | EN | TW |
|---|---|---|
| `moveFailed` | Failed to move tag | 移動標籤失敗了... |
| `moveSuccess` | Moved {{name}} to {{newType}} | 已將「{{name}}」移至「{{newType}}」 |
| `undo` | Undo | 剛剛的不算 |
| `undoFailed` | Failed to undo | 復原失敗了... |

### settings.tags.detail

| Key | EN | TW |
|---|---|---|
| `notFound` | Tag not found | 查無此標籤 |
| `goBack` | Go back | 回上一頁 |
| `unsavedTitle` | Unsaved changes | 未存檔的變更 |
| `unsavedDescription` | You have unsaved changes. Discard changes? | 您還沒存檔喔。要丟掉改到一半的東西嗎？ |
| `cancel` | Cancel | 取消 |
| `discard` | Discard | 丟掉 |
| `save` | Save | 存檔 |
| `saving` | Saving... | 存檔中... |

### settings.tags.items

| Key | EN | TW |
|---|---|---|
| `empty` | No items yet. | 還沒建立任何品項。 |
| `emptyFiltered` | No items match the current filters. | 沒有符合篩選條件的品項。 |

## Pluralization

EN uses i18next `_one`/`_other` suffixes for count-bearing strings (`deleteWithTags`, `deleteWithItems`). TW has no plural forms — a single key handles all counts.

## Testing

Parity test (`src/i18n/locales/locales.test.ts`) auto-validates that `en.json` and `tw.json` have identical key structure. No new test file needed.
