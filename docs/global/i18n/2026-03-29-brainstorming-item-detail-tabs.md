# Brainstorming: i18n — Item Detail Tabs

**Date:** 2026-03-29
**Topic:** Extract hardcoded English strings from item detail tabs to i18n translation files
**Branch:** `feature/i18n-item-detail-tabs`

## Questions & Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Scope — translate all item detail tab strings, or a subset? | All strings in all tabs |
| 2 | Chinese translations — provided or machine-translated? | Machine-translated (TW placeholder strings OK) |
| 3 | Aria-labels — translate those too? | Yes |
| 4 | Key grouping — follow existing `items.tags.*` / `items.vendors.*` / `items.recipes.*` structure? | Yes, follow existing structure |
| 5 | Order of work — all tabs in one PR? | Yes, one PR |

## Scope: Files & Strings Found

| File | Hardcoded Strings |
|------|-------------------|
| `routes/items/$id.tsx` | "Item not found", back button ("Go back" / "Back"), 5 tab aria-labels, unsaved dialog (use existing `common.*` keys) |
| `routes/items/$id/index.tsx` | Delete dialog (title + description with `{{name}}`), recipe adjustment dialog (title, description with `{{from}}/{{to}}`, 3 table headers, update button) |
| `routes/items/$id/tags.tsx` | "New Tag" button, Add Tag dialog (title, submitLabel, placeholder) |
| `routes/items/$id/vendors.tsx` | "New Vendor" button, New Vendor dialog (title, submitLabel, placeholder) |
| `routes/items/$id/recipes.tsx` | "New Recipe" button, New Recipe dialog (title, submitLabel, placeholder) |
| `routes/items/$id/log.tsx` | "No history yet." |

## Key Structure Decisions

- Tab navigation and layout strings → `items.detail.*` (new sub-namespace)
- Delete / recipe-adjust dialogs → `items.detail.deleteDialog.*` and `items.detail.recipeAdjustDialog.*`
- Tab content strings → under existing `items.tags.*`, `items.vendors.*`, `items.recipes.*`
- History empty state → `items.history.empty` (new sub-namespace)
- Unsaved dialog in `$id.tsx` → reuse existing `common.unsavedTitle`, `common.unsavedDescription`, `common.cancel`, `common.discard`
- Back button → reuse existing `common.goBack`

## Final Decision

One PR extracting all ~22 hardcoded strings across 6 files. No new components. Changes:
1. Add keys to `en.json` + `tw.json`
2. Wire `useTranslation()` + `t()` in each file
