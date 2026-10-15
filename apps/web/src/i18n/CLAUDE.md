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

**`pantry.detail.*` keys** (the empty-state block in the three pantry group detail views — `VendorDetailView`, `RecipeDetailView`, `ShelfDetailView`). Added 2026-10-13 with the issue #267 fix; before that all ten strings in those three blocks were hardcoded English, so the whole block rendered in English for a TW user. **16 keys** in `en.json` and the same 16 in `tw.json` — 13 on 2026-10-13, 14 on 2026-10-14, 16 on 2026-10-15. Count them rather than quote this.

| Key | English |
|---|---|
| `noItems` | `"No items"` — the shared title of the empty-GROUP state, used by all three views |
| `vendor.allAssigned` / `vendor.noneAssigned` | `"All items are assigned to vendors"` / `"No items are assigned to this vendor"` |
| `recipe.allAssigned` / `recipe.noneAssigned` | `"All items are assigned to recipes"` / `"No items are assigned to this recipe"` |
| `shelf.allAssigned` / `shelf.noFilterMatch` / `shelf.searchToAdd` | `"All items are assigned to shelves"` / `"No items match the filter"` / `"Search to add items to this shelf"` |
| `noMatch.title` | `"No matching items"` — the title of the NO-MATCH state, shared by all three views |
| `noMatch.vendor` / `noMatch.recipe` / `noMatch.shelf` | the per-view sentence for a REAL group, e.g. `"No item matching your search is assigned to this vendor"` |
| `noMatch.vendorUnsorted` | `"No item matching your search is without a vendor"` — `VendorDetailView`'s `unsorted` ("No vendor") page, search case. Added 2026-10-15 |
| `noMatch.recipeUnsorted` | `"No item matching your search is without a recipe"` — `RecipeDetailView`'s `unsorted` ("Not added to recipe") page, search case. Added 2026-10-15 |
| `noMatch.shelfUnsorted` | `"No item matching your search is without a shelf"` — `ShelfDetailView`'s `unsorted` page, search case |
| `noMatch.shelfUnsortedFilters` | `"No item matching the filter is without a shelf"` — `ShelfDetailView`'s `unsorted` page, where the filters narrow the list with no search running |

Four things to keep in mind when editing these:

- **The empty-group state and the no-match state are different states, and their titles must stay different strings.** `noItems` is `"No items"` and `noMatch.title` is `"No matching items"`. Several tests assert one is absent while the other is present, using exact string matching, so making them equal would make those assertions meaningless.
- **A `noMatch.*` sentence and its empty-group partner are a matched pair. They must differ only by the qualifier, and the qualifier goes on the subject.** Revised 2026-10-13. The relationship clause stays the same in both, so `vendor.noneAssigned` is `"No items are assigned to this vendor"` and `noMatch.vendor` is `"No item matching your search is assigned to this vendor"`. Traditional Chinese follows the same shape: 沒有 + qualifier + 品項 + relationship clause, with 任何 for the empty case and 符合搜尋條件的 / 符合篩選條件的 for the no-match case. The real-shelf key uses "is on this shelf" to match TW's 放上 verb and `shelf.searchToAdd` (`"Search to add items to this shelf"`). **The four `*Unsorted` keys pair with their view's `allAssigned` value instead**, because the `unsorted` page lists the items in no group at all. So they say "is without a {group}" and, in TW, insert the qualifier into that value's own shape with 且, keeping that view's own verb:

  | `*Unsorted` key | Partner | English | TW |
  |---|---|---|---|
  | `noMatch.vendorUnsorted` | `vendor.allAssigned` (沒有未指定供應商的品項) | is without a vendor | 沒有符合搜尋條件且未指定供應商的品項 |
  | `noMatch.recipeUnsorted` | `recipe.allAssigned` (沒有未加入食譜的品項) | is without a recipe | 沒有符合搜尋條件且未加入食譜的品項 |
  | `noMatch.shelfUnsorted` | `shelf.allAssigned` (沒有未放上貨架的品項) | is without a shelf | 沒有符合搜尋條件且未放上貨架的品項 |
  | `noMatch.shelfUnsortedFilters` | the same partner | is without a shelf | 沒有符合篩選條件且未放上貨架的品項 |

  Do not rewrite one half of a pair on its own. **The four TW `*Unsorted` values are drafts.** No test asserts a TW string, and the owner rewrote this copy three times in two days, so treat them as unreviewed.
- **All three no-match branches are mode-aware on `isUnsorted`. Do not collapse any of them.** Each of the three views renders two pages: a real group, listing the items in it, and the `unsorted` page, listing the items in **no** group. On the `unsorted` page a message naming "this vendor" / "this recipe" / "this shelf" is false about every row. The reachable cases:

  | View | Page | Trigger | Key |
  |---|---|---|---|
  | `VendorDetailView` | a real vendor | search | `noMatch.vendor` |
  | `VendorDetailView` | `unsorted` ("No vendor") | search | `noMatch.vendorUnsorted` |
  | `RecipeDetailView` | a real recipe | search | `noMatch.recipe` |
  | `RecipeDetailView` | `unsorted` ("Not added to recipe") | search | `noMatch.recipeUnsorted` |
  | `ShelfDetailView` | a real shelf | search | `noMatch.shelf` |
  | `ShelfDetailView` | `unsorted` | search | `noMatch.shelfUnsorted` |
  | `ShelfDetailView` | `unsorted` | filters, no search | `noMatch.shelfUnsortedFilters` |

  **Only `ShelfDetailView` has a filter case, so only it needs a third key.** Its toolbar is `hideFiltersToggle={!isUnsorted}`, so on the `unsorted` page the tag / vendor / recipe filters can empty the list with no search running. A real shelf has no filters toggle, and with no search text and `!isUnsorted` the `displayedInShelfItems` memo returns `sortedInShelfItems` unchanged, so an empty displayed list implies an empty source list and takes the empty-group branch instead. The other two views pass `hideFiltersToggle={true}` on **both** pages and their `displayedItems` memo returns `sortedItems` unchanged with no search text, so their filter case cannot be reached — two keys each, not three.

  History: `ShelfDetailView` read `trimmedSearch` alone until 2026-10-14, and the other two read nothing at all until 2026-10-15, so all three said "this {group}" on a page where that is false about every row.
- **None of these keys interpolates an entity name**, so none needs the `capitalize` span the naming rule above describes. `"No items are assigned to this vendor"` says *this vendor*, not the vendor's name, on purpose.

**`pantry.emptyFiltered.*` keys** (the *filtered* empty state in `PantryListView`, the flat pantry list with no `?groupBy`). Added 2026-10-15. **2 keys** — `title` and `description` — in `en.json` and the same 2 in `tw.json`. Before that both strings were hardcoded English in `PantryListView.tsx`, so a TW user saw English there.

| Key | English | TW |
|---|---|---|
| `title` | `"No items match the current filters"` | 沒有符合篩選條件的品項 |
| `description` | `"Try adjusting or clearing your filters"` | 可以調整或清除篩選條件 |

Three things to keep in mind when editing these:

- **They are `pantry.empty.*`'s sibling, not part of `pantry.detail.*`.** `pantry.empty.*` is the state for a pantry with no items at all; this is the state for a pantry that HAS items which the current filters exclude. The two render from one ternary chain in `PantryListView.tsx`, `items.length === 0` first. The naming copies `shopping.empty.*` / `shopping.emptyFiltered.*`, which is the same pair on the cart page. `pantry.detail.*` belongs to the three group detail views and is a different block.
- **The English dropped its two full stops when it moved into these keys.** It was `"No items match the current filters."` and `"Try adjusting or clearing your filters."` in the source. The same sentence already existed in two other keys without a stop — `shopping.emptyFiltered.title` and `settings.tags.items.emptyFiltered` — and so do all 16 `pantry.detail.*` values and `pantry.empty.title`, so keeping it would have made one key differ from its twins by one character.
- **Both TW values are drafts.** No test asserts a TW string, and the owner rewrote this branch's Chinese four times, so treat them as unreviewed. `title` reuses `settings.tags.items.emptyFiltered`'s existing value word for word. `description` is new copy — there was no Chinese for it anywhere, because `shopping.emptyFiltered.description` is an empty string.

**`items.searchTail.*` keys** (unified item search — `ItemSearchTail` and its callers): `rowAction` (`"{{action}}: {{name}}"` — every row's accessible name, since the visible label is identical down a section), `addToLocation` (`"Add to {{location}}"` — bucket 3's button on every surface), `applyVendor` (`"Apply {{vendor}}"` — bucket 2 on the cart page and, since PR C, on vendor detail), `inVendors` (`"In {{vendors}}"` — the inert `groupNote` on both the no-vendor cart and vendor detail's "No vendor" page, `normal-case` per the vendor-name display rule), `addToRecipe` (`"Add to recipe"` / `"加入食譜"` — recipe detail's bucket-2 action, PR C; it takes **no** interpolation, unlike `applyVendor`, because the recipe's name is already the page heading), `inRecipes` (`"In {{recipes}}"` / `"屬於 {{recipes}}"` — the inert `groupNote` on recipe detail's "Not added to recipe" page, PR C; rendered `capitalize`, the mirror image of `inVendors`' `normal-case`, since recipe names *are* subject to the title-case convention), `addToShelf` (`"Add to shelf"` — a selection shelf's bucket-2 action, PR B; also a satisfiable filter shelf's `groupAction` label since PR D — same key, same visible text, both shelf types append the item to their own list) and `notMatchingShelf` (`"Doesn't match this shelf's filters"` — a filter shelf's inert `groupNote`, PR B; narrowed by PR D to only an **unsatisfiable** shelf, one whose `filterConfig` names a vendor or recipe axis with no live entity left to satisfy it — every other filter shelf gets the real `groupAction` above instead).

**`items.searchTail.filterPicks.*` keys** (PR D's `ShelfFilterPicksDialog`, the per-axis picker a filter shelf's `groupAction` always opens — since a 2026-08-28 designer ruling reversed the original direct-apply bypass, it opens even when every axis offers just one pre-selected option): `title` (`"Add {{name}} to {{shelf}}"` — the dialog heading), `vendorAxis` / `recipeAxis` (`"Vendor"` / `"Recipe"` — labels for those two axis kinds; a tag axis is labelled by its own tag type's name instead, read directly off `FilterAxis.typeName` rather than translated), `met` (`"Already set: {{name}}"` — the read-only line for an axis the item already satisfies), `error` (`"Couldn't add to this shelf. Try again."` — shown inline on a rejected `onConfirm`, dialog stays open), `confirm` (`"Add"`) and `cancel` (`"Cancel"`).

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
