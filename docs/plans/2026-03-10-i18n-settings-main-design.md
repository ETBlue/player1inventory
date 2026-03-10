# i18n: Settings Main Page Design

## Overview

Extract all hardcoded strings from `src/routes/settings/index.tsx` into EN and TW translation keys. This is the first page-by-page migration following the i18n infrastructure PR.

## Scope

**In scope:** `src/routes/settings/index.tsx` only — 12 strings across the page title, Theme card, and Tags/Vendors/Recipes navigation cards.

**Out of scope:** Settings sub-pages (Tags, Vendors, Recipes detail/list/items pages) — deferred to future PRs.

## Translation Keys

Added under the existing `settings` object in both locale files.

### en.json additions

```json
"settings": {
  "title": "Settings",
  "theme": {
    "label": "Theme",
    "description": "Choose light, dark, or system theme",
    "light": "Light",
    "system": "System",
    "dark": "Dark"
  },
  "tags": { "label": "Tags", "description": "Manage tag types and tags" },
  "vendors": { "label": "Vendors", "description": "Manage vendors" },
  "recipes": { "label": "Recipes", "description": "Manage recipes" },
  "language": { ... }
}
```

### tw.json additions

```json
"settings": {
  "title": "設定",
  "theme": {
    "label": "佈景",
    "description": "選擇淺色、深色佈景，或依系統設定",
    "light": "淺色",
    "system": "依系統設定",
    "dark": "深色"
  },
  "tags": { "label": "標籤", "description": "管理標籤與其分類" },
  "vendors": { "label": "供應商", "description": "管理供應商" },
  "recipes": { "label": "食譜", "description": "管理食譜" },
  "language": { ... }
}
```

## Component Change

`src/routes/settings/index.tsx` already calls `useLanguage()`. Add `useTranslation()` and replace all 12 hardcoded strings with `t('settings.*')` calls. No logic changes.

## Testing

- Parity test (`src/i18n/locales/locales.test.ts`) auto-validates both locale files stay in sync — no new test file needed
- Existing Settings page stories (Default, ExplicitEnglish, TraditionalChinese) naturally show translated strings without changes
