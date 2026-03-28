# Internationalization (i18n)

Supported languages: **EN** (English) and **TW** (Traditional Chinese / 繁體中文). JP is deferred.

**Library:** `react-i18next` + `i18next` + `i18next-browser-languagedetector`

**Files:**
```
src/
  i18n/
    index.ts              # i18next initialization (import as first import in main.tsx)
    locales/
      en.json             # English strings
      tw.json             # Traditional Chinese strings
      locales.test.ts     # Key parity test (CI guard — en.json ≡ tw.json keys)
  lib/
    language.ts           # LanguagePreference type, Language type, LANGUAGE_STORAGE_KEY,
                          # LANGUAGE_LOCALE map, resolveLanguageFromStorage(), detectBrowserLanguage()
    formatDate.ts         # formatDate(date, language) — Intl.DateTimeFormat
    formatRelativeTime.ts # formatRelativeTime(date, language) — Intl.RelativeTimeFormat
  hooks/
    useLanguage.ts        # Language preference hook (mirrors useTheme pattern)
```

**Language detection order:**
1. `localStorage` key `i18n-language` (user's explicit choice)
2. `navigator.language` — `zh*` → `tw`; else → `en`

**`useLanguage()` hook** (`src/hooks/useLanguage.ts`):
```tsx
const { preference, language, setPreference } = useLanguage()
// preference: 'auto' | 'en' | 'tw' (user's stored choice)
// language: 'en' | 'tw' (resolved)
// setPreference: stores to localStorage ('auto' clears the key)
```
Called in `src/routes/__root.tsx` (side-effect only) to sync i18next on mount. Also called in `src/routes/settings/index.tsx` to power the Language selector.

**Date/time formatting utilities:**
```tsx
import { formatDate } from '@/lib/formatDate'
import { formatRelativeTime } from '@/lib/formatRelativeTime'

formatDate(date, language)         // EN: "Mar 9, 2026"  TW: "2026年3月9日"
formatRelativeTime(date, language) // EN: "yesterday"    TW: "昨天"
```
Both use native `Intl` APIs — no extra library dependency.

**Translation usage in components:**
```tsx
import { useTranslation } from 'react-i18next'

const { t } = useTranslation()
<p>{t('settings.language.label')}</p>
<p>{t('settings.language.autoDetected', { language: t('settings.language.languages.tw') })}</p>
```

**Adding new translation keys:**
1. Add key to `src/i18n/locales/en.json`
2. Add the same key with TW translation to `src/i18n/locales/tw.json`
3. The parity test (`src/i18n/locales/locales.test.ts`) will fail if keys don't match — this is intentional

**Locale-aware default tag types:** On first app launch (empty IndexedDB), `db.on('populate')` in `src/db/index.ts` calls `seedDefaultData(language)` from `src/db/operations.ts` to seed tag types appropriate for the user's language (EN or TW defaults).

**Settings UI:** Language selector card in `/settings` with Globe icon and Select dropdown (Auto/English/繁體中文). Positioned between Theme and Tags cards.

**Page-by-page string extraction:** Translated pages so far: settings main page (title, theme, tags/vendors/recipes nav cards, language selector); settings tags pages (tags list, tag detail layout, tag info tab, tag items tab); settings vendors pages (vendor list, vendor detail layout, vendor info tab, VendorCard, VendorInfoForm); settings recipes pages (recipe list, recipe detail layout, recipe info tab, RecipeCard, RecipeInfoForm); shopping page (toolbar, vendor filter, dialogs, log notes); cooking page (toolbar, recipe cards, dialogs, log notes) + CookingControlBar (sort labels, aria-labels, search placeholder). All other pages still use hardcoded English strings — they will be migrated page-by-page in follow-up PRs. Missing keys fall back to English automatically.

**Common i18n keys:** `common.*` covers `cancel`, `delete`, `deleting`, `nameLabel`, `save`, `saving`, `discard`, `goBack`, `unsavedTitle`, `unsavedDescription`, `done`, `back`, `confirm` — reuse these instead of adding entity-specific duplicates.
