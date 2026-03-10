# i18n: Settings Main Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract 12 hardcoded strings from `src/routes/settings/index.tsx` into EN and TW translation keys.

**Architecture:** Add keys to both locale JSON files under the existing `settings` object, then replace hardcoded strings in the component with `t()` calls. No logic changes — the component already has `useTranslation()` imported and called.

**Tech Stack:** react-i18next (`t()`), Vitest (parity test), Biome (lint)

---

## Task 1: Add Translation Keys to Locale Files

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/tw.json`

**Step 1: Replace `src/i18n/locales/en.json` with the full updated content**

```json
{
  "settings": {
    "title": "Settings",
    "theme": {
      "label": "Theme",
      "description": "Choose light, dark, or system theme",
      "light": "Light",
      "system": "System",
      "dark": "Dark"
    },
    "tags": {
      "label": "Tags",
      "description": "Manage tag types and tags"
    },
    "vendors": {
      "label": "Vendors",
      "description": "Manage vendors"
    },
    "recipes": {
      "label": "Recipes",
      "description": "Manage recipes"
    },
    "language": {
      "label": "Language",
      "description": "Choose your preferred language",
      "auto": "Auto (Browser)",
      "autoDetected": "Auto-detected: {{language}}",
      "languages": {
        "en": "English",
        "tw": "Traditional Chinese"
      }
    }
  }
}
```

**Step 2: Replace `src/i18n/locales/tw.json` with the full updated content**

```json
{
  "settings": {
    "title": "設定",
    "theme": {
      "label": "佈景",
      "description": "選擇淺色、深色佈景，或依系統設定",
      "light": "淺色",
      "system": "依系統設定",
      "dark": "深色"
    },
    "tags": {
      "label": "標籤",
      "description": "管理標籤與其分類"
    },
    "vendors": {
      "label": "供應商",
      "description": "管理供應商"
    },
    "recipes": {
      "label": "食譜",
      "description": "管理食譜"
    },
    "language": {
      "label": "語言",
      "description": "選擇您偏好的語言",
      "auto": "自動（瀏覽器）",
      "autoDetected": "自動偵測：{{language}}",
      "languages": {
        "en": "English",
        "tw": "繁體中文"
      }
    }
  }
}
```

**Step 3: Run the parity test to verify keys match**

```bash
pnpm test src/i18n/locales/locales.test.ts --run
```

Expected: 1 test PASS — "en.json and tw.json have the same translation keys"

**Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/tw.json
git commit -m "feat(i18n): add settings main page translation keys for EN and TW"
```

---

## Task 2: Replace Hardcoded Strings in Settings Component

**Files:**
- Modify: `src/routes/settings/index.tsx`

The component already imports `useTranslation` and calls `const { t } = useTranslation()` at line 37. You only need to replace the hardcoded string values.

**Step 1: Replace the page title (line 42)**

Current:
```tsx
<h1 className="px-3 py-2">Settings</h1>
```

New:
```tsx
<h1 className="px-3 py-2">{t('settings.title')}</h1>
```

**Step 2: Replace the Theme card label and description (lines 56-59)**

Current:
```tsx
<p className="font-medium">Theme</p>
<p className="text-sm text-foreground-muted">
  Choose light, dark, or system theme
</p>
```

New:
```tsx
<p className="font-medium">{t('settings.theme.label')}</p>
<p className="text-sm text-foreground-muted">
  {t('settings.theme.description')}
</p>
```

**Step 3: Replace the theme buttons (lines 69, 78, 85)**

Current:
```tsx
>
  Light
</Button>
```
```tsx
>
  System
</Button>
```
```tsx
>
  Dark
</Button>
```

New:
```tsx
>
  {t('settings.theme.light')}
</Button>
```
```tsx
>
  {t('settings.theme.system')}
</Button>
```
```tsx
>
  {t('settings.theme.dark')}
</Button>
```

**Step 4: Replace the Tags card label and description (lines 139-142)**

Current:
```tsx
<p className="font-medium">Tags</p>
<p className="text-sm text-foreground-muted">
  Manage tag types and tags
</p>
```

New:
```tsx
<p className="font-medium">{t('settings.tags.label')}</p>
<p className="text-sm text-foreground-muted">
  {t('settings.tags.description')}
</p>
```

**Step 5: Replace the Vendors card label and description (lines 157-160)**

Current:
```tsx
<p className="font-medium">Vendors</p>
<p className="text-sm text-foreground-muted">
  Manage vendors
</p>
```

New:
```tsx
<p className="font-medium">{t('settings.vendors.label')}</p>
<p className="text-sm text-foreground-muted">
  {t('settings.vendors.description')}
</p>
```

**Step 6: Replace the Recipes card label and description (lines 175-178)**

Current:
```tsx
<p className="font-medium">Recipes</p>
<p className="text-sm text-foreground-muted">
  Manage recipes
</p>
```

New:
```tsx
<p className="font-medium">{t('settings.recipes.label')}</p>
<p className="text-sm text-foreground-muted">
  {t('settings.recipes.description')}
</p>
```

**Step 7: Run lint to verify no issues**

```bash
pnpm check
```

Expected: no errors (one pre-existing warning in `useUrlSearchAndFilters.ts` is acceptable).

**Step 8: Run the full test suite**

```bash
pnpm test --run
```

Expected: all tests pass (629+).

**Step 9: Commit**

```bash
git add src/routes/settings/index.tsx
git commit -m "feat(i18n): replace hardcoded strings in settings main page with t() calls"
```
