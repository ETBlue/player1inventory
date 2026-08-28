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

**Entity names stay out of the translated string.** A title like `Update <span className="capitalize">{item.name}</span>` translates only the surrounding words (`pantry.quickUpdate.title` = `"Update"` / `"更新"`) and keeps the name in its own `capitalize` span. Interpolating the name into one key (`"Update {{name}}"`) forces `capitalize` onto the whole title, which title-cases the translated word too and breaks the repo-wide Name Display Convention (root `CLAUDE.md`). Pinned by the "title" test in `QuickUpdateDialog.test.tsx`.

**Adding new translation keys:**
1. Add key to `src/i18n/locales/en.json`
2. Add the same key with TW translation to `src/i18n/locales/tw.json`
3. The parity test (`src/i18n/locales/locales.test.ts`) will fail if keys don't match — this is intentional

**Plural keys need both forms in every locale.** A counted string must ship `<key>_one` **and** `<key>_other` in `en.json` *and* `tw.json` — even where the two forms are byte-identical (as they are throughout TW). A missing `_one` does **not** fall back to that locale's own `_other`; i18next falls back to another *language*, so a TW user sees English at count 1. The parity test enforces this, since `_one`/`_other` are ordinary leaf keys to it.

**Locale-aware onboarding:** On first app launch (empty IndexedDB), `__root.tsx` detects all three data stores are empty and redirects to `/onboarding`. The onboarding flow (Phase B) lets the user choose a language before selecting template items/vendors, then calls `useOnboardingSetup` to bulk-create the data in the chosen language. `seedDefaultData` in `src/db/operations.ts` still exists for testing and manual seeding but is no longer called automatically from `db.on('populate')`.

**Settings UI:** Language selector card in `/settings` with Globe icon and Select dropdown (Auto/English/繁體中文). Positioned between Theme and Tags cards.

**Page-by-page string extraction:** Translated pages so far: settings main page (title, theme, tags/vendors/recipes nav cards, language selector); settings tags pages (tags list, tag detail layout, tag info tab, tag items tab); settings vendors pages (vendor list, vendor detail layout, vendor info tab, VendorCard, VendorInfoForm); settings recipes pages (recipe list, recipe detail layout, recipe info tab, RecipeCard, RecipeInfoForm); shopping page (toolbar, vendor filter, dialogs, log notes); cooking page (toolbar, recipe cards, dialogs, log notes) + CookingControlBar (sort labels, aria-labels, search placeholder); shared item components: ItemListToolbar (sort, direction, tags/filters/search controls, search input, create button), ItemFilters (vendors/recipes/edit-tags buttons, clear and manage actions), TagTypeDropdown (clear action); QuickUpdateDialog (`pantry.quickUpdate.*` — title, Packed/Unpacked/Target/Refill below row labels and their per-control `aria-label`s, Pack/Unpack, submit; the Fill to Full hint reuses the promoted `common.fillToFull`; also reuses `common.clear`, `common.cancel`, and — for its conditional "Expires on" field — `common.expiresOn` / `common.expiresOnHint`); item detail tabs ($id.tsx layout, $id/index.tsx stock tab, $id/tags.tsx, $id/vendors.tsx, $id/recipes.tsx, $id/log.tsx); **`ItemForm`** (`items.form.*` — every label, hint, placeholder, `Select`/switch option and per-field stepper `aria-label` in both the info and stock sections: stock settings headings, package unit, consume amount, track-in-measurement, measurement unit, amount per package, expiration mode/threshold, target quantity, refill threshold, packed/unpacked quantity + their decrease/increase labels, pack/unpack button text; shared with `NewItemDialog`, which renders the same info section; the submit label falls back to the promoted `common.save`; the Stock tab's progress row reuses `common.clear` / `common.fillToFull`, the same keys `QuickUpdateDialog` reuses; the Stock tab's conditional "Expires on" date field reuses the promoted `common.expiresOn` / `common.expiresOnHint` — formerly `items.form.expirationDueDate.*`, retired 2026-08-27 once `QuickUpdateDialog` needed the same string and a second copy in a different namespace would have duplicated it). All other pages still use hardcoded English strings — they will be migrated page-by-page in follow-up PRs. Missing keys fall back to English automatically.

**Common i18n keys:** `common.*` covers `cancel`, `delete`, `deleting`, `nameLabel`, `save`, `saving`, `discard`, `goBack`, `unsavedTitle`, `unsavedDescription`, `done`, `back`, `confirm`, `add`, `edit`, `clear`, `fillToFull`, `manage`, `asc`, `desc`, `search`, `tags`, `filters`, `notStockedHere` (plural, the group-list divider label), `notInThisList` (plural, `ItemSearchTail`'s in-location divider label), `expiresOn` / `expiresOnHint` (the per-location due-date field's label/hint, shared by `ItemForm`'s Stock tab and `QuickUpdateDialog` — promoted 2026-08-27 from `items.form.expirationDueDate.*` once a second caller needed the same string) — reuse these instead of adding entity-specific duplicates.

**`items.searchTail.*` keys** (unified item search — `ItemSearchTail` and its callers): `rowAction` (`"{{action}}: {{name}}"` — every row's accessible name, since the visible label is identical down a section), `addToLocation` (`"Add to {{location}}"` — bucket 3's button on every surface), `applyVendor` (`"Apply {{vendor}}"` — bucket 2 on the cart page and, since PR C, on vendor detail), `inVendors` (`"In {{vendors}}"` — the inert `groupNote` on both the no-vendor cart and vendor detail's "No vendor" page, `normal-case` per the vendor-name display rule), `addToRecipe` (`"Add to recipe"` / `"加入食譜"` — recipe detail's bucket-2 action, PR C; it takes **no** interpolation, unlike `applyVendor`, because the recipe's name is already the page heading), `inRecipes` (`"In {{recipes}}"` / `"屬於 {{recipes}}"` — the inert `groupNote` on recipe detail's "Not added to recipe" page, PR C; rendered `capitalize`, the mirror image of `inVendors`' `normal-case`, since recipe names *are* subject to the title-case convention), `addToShelf` (`"Add to shelf"` — a selection shelf's bucket-2 action, PR B; also a satisfiable filter shelf's `groupAction` label since PR D — same key, same visible text, both shelf types append the item to their own list) and `notMatchingShelf` (`"Doesn't match this shelf's filters"` — a filter shelf's inert `groupNote`, PR B; narrowed by PR D to only an **unsatisfiable** shelf, one whose `filterConfig` names a vendor or recipe axis with no live entity left to satisfy it — every other filter shelf gets the real `groupAction` above instead).

**`items.searchTail.filterPicks.*` keys** (PR D's `ShelfFilterPicksDialog`, the per-axis picker a filter shelf's `groupAction` opens when at least one axis offers more than one option): `title` (`"Add {{name}} to {{shelf}}"` — the dialog heading), `vendorAxis` / `recipeAxis` (`"Vendor"` / `"Recipe"` — labels for those two axis kinds; a tag axis is labelled by its own tag type's name instead, read directly off `FilterAxis.typeName` rather than translated), `met` (`"Already set: {{name}}"` — the read-only line for an axis the item already satisfies), `error` (`"Couldn't add to this shelf. Try again."` — shown inline on a rejected `onConfirm`, dialog stays open), `confirm` (`"Add"`) and `cancel` (`"Cancel"`).

**Dynamic inventory log descriptions (`logKey`/`logParams` pattern):**

Inventory log entries store a translation key + params instead of a pre-translated string, so descriptions re-render in the current language regardless of when the log was created.

- `InventoryLog.logKey?: string` — i18n key, e.g. `'shopping.log.purchasedAt'`
- `InventoryLog.logParams?: Record<string, string>` — interpolation params, e.g. `{ vendor: 'Costco' }`

**Write:** Pass `logKey`/`logParams` to `addInventoryLog()` / `checkout()` / `consumeRecipesBatch()` instead of a translated `note`. For the cloud path (GraphQL), also pass `note` (pre-translated) as GraphQL only has the `note` field.

**Read:** In `items/$id/log.tsx`, resolve the description as:
```ts
log.logKey ? t(log.logKey, log.logParams) : log.note
```
Legacy entries (pre-deploy) with only `note` continue to display their stored string.

**Applies to:** shopping checkout (`shopping.log.purchasedAt`, `shopping.log.purchased`) and cooking consumption (`cooking.log.consumedVia`, `cooking.log.consumedViaRecipe`).
