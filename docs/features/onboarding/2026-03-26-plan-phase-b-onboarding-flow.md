# Phase B Implementation Plan — Onboarding Flow

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Build the full 5-step onboarding flow — template data, route, all step components, and the empty-data auto-redirect.

**Design doc:** `docs/features/onboarding/2026-03-26-design-onboarding.md`

**Prerequisite:** Phase A (nested tags) must be merged first.

**Tech stack:** React, TanStack Router (file-based), TanStack Query, Dexie.js operations, i18n (react-i18next), Tailwind CSS, shadcn/ui, existing `ItemCard` and `VendorCard` components.

**TDD approach:** Write failing test → implement → green. Every step ends with the full verification gate.

---

## Verification Gate (run after every step)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-phase-b.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-phase-b.log && echo "FAIL: deprecated imports" || echo "OK"
```

Final step only — also run:
```bash
pnpm test:e2e --grep "onboarding|a11y"
```

---

## Step 1 — Add `variant="template"` to ItemCard and VendorCard

**Files:**
- Modify: `apps/web/src/components/item/ItemCard/index.tsx`
- Modify: `apps/web/src/components/item/ItemCard/ItemCard.stories.tsx`
- Modify: `apps/web/src/components/item/ItemCard/ItemCard.stories.test.tsx`
- Modify: `apps/web/src/components/vendor/VendorCard/index.tsx`
- Modify: `apps/web/src/components/vendor/VendorCard/VendorCard.stories.tsx`
- Modify: `apps/web/src/components/vendor/VendorCard/VendorCard.stories.test.tsx`

**What to do:**

In `ItemCard`, add an optional `variant?: 'default' | 'template'` prop:
- `variant="template"`: hides quantity controls (`isAmountControllable` forced false), hides expiration display, hides the +/- buttons, shows tag badges normally
- `variant="default"` (or undefined): existing behavior unchanged

In `VendorCard`, add an optional `variant?: 'default' | 'template'` prop:
- `variant="template"`: hides item count badge, hides delete button, adds a checkbox or selected visual state via a `selected?: boolean` + `onToggle?: () => void` prop
- `variant="default"`: existing behavior unchanged

**Stories:**
- `ItemCard`: add `TemplateVariant` story
- `VendorCard`: add `TemplateVariant` story and `TemplateVariantSelected` story

**Commit:** `feat(cards): add template variant to ItemCard and VendorCard`

---

## Step 2 — Write template data module

**Files:**
- Create: `apps/web/src/data/template.ts`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/tw.json`

**What to do:**

Create `src/data/template.ts` with three exports:

```ts
export const templateTagTypes: TemplateTagType[]
export const templateTags: TemplateTag[]
export const templateItems: TemplateItem[]
export const templateVendors: TemplateVendor[]
```

Types:
```ts
interface TemplateTagType {
  key: string       // e.g. "category", "storage"
  i18nKey: string   // e.g. "template.tagTypes.category"
  color: TagColor
}

interface TemplateTag {
  key: string       // e.g. "food", "fresh-produce"
  i18nKey: string   // e.g. "template.tags.food"
  typeKey: string   // references TemplateTagType.key
  parentKey?: string
}

interface TemplateItem {
  key: string       // e.g. "milk", "eggs"
  i18nKey: string   // e.g. "template.items.milk"
  tagKeys: string[] // references TemplateTag.key
}

interface TemplateVendor {
  name: string      // untranslated
}
```

**Template tag types (2):**
- `category` (color: choose a neutral or green)
- `storage` (color: choose blue or cyan)

**Template tags — category type:**
- Top-level: `food`, `personal-care`, `household`, `pet-supplies`, `baby`
- Under food: `fresh-produce`, `cooked-food`, `snacks`, `beverages`, `grains`, `condiments`, `nutrition`
- Under personal-care: `body-cleansing`, `hygiene`, `skincare`, `healthcare`
- Under household: `cleaning`, `kitchen-supplies`

**Template tags — storage type:**
- `room-temperature`, `refrigerated`, `frozen`

**Template items (aim for 30–50):** Common Taiwanese pantry staples. Examples:
- Milk (refrigerated, fresh-produce)
- Eggs (refrigerated, fresh-produce)
- Rice (room-temperature, grains)
- Soy sauce (room-temperature, condiments)
- Tofu (refrigerated, fresh-produce)
- Chicken breast (frozen, fresh-produce)
- Instant noodles (room-temperature, grains)
- Cooking oil (room-temperature, condiments)
- Salt (room-temperature, condiments)
- Sugar (room-temperature, condiments)
- Shampoo (personal-care, body-cleansing)
- Body wash (personal-care, body-cleansing)
- Toothpaste (personal-care, hygiene)
- Toilet paper (household, hygiene)
- Dish soap (household, cleaning)
- Laundry detergent (household, cleaning)
- Garbage bags (household, kitchen-supplies)
- … (continue to 30–50 total)

**Template vendors (17):** Vendor names are bilingual — use i18n keys like all other template data.

| key | EN name | TW name |
|-----|---------|---------|
| costco | Costco | 好市多 |
| px-mart | PX Mart | 全聯福利中心 |
| simple-mart | Simple Mart | 美廉社 |
| rt-mart | RT-Mart | 大潤發 |
| carrefour | Carrefour | 家樂福 |
| i-mei | I-Mei Food | 義美食品 |
| lopia | Lopia | Lopia |
| city-super | City Super | City Super |
| mia-cbon | Mia C'bon | Mia C'bon |
| jasons | Jasons Market Place | Jasons Market Place |
| poya | Poya | 寶雅 |
| nitori | Nitori | 宜得利 |
| ikea | Ikea | IKEA |
| cosmed | Cosmed | 康是美 |
| watsons | Watsons | 屈臣氏 |
| family-mart | FamilyMart | 全家便利商店 |
| 7-11 | 7-Eleven | 7-ELEVEN |

Add `template.vendors.*` keys to `en.json` and `tw.json`. Update `TemplateVendor` interface to use `i18nKey` instead of `name`.

**i18n keys to add to en.json and tw.json:**
```json
{
  "template": {
    "tagTypes": { "category": "Category", "storage": "Storage" },
    "tags": {
      "food": "Food",
      "fresh-produce": "Fresh Produce",
      "cooked-food": "Cooked Food",
      ...
    },
    "items": {
      "milk": "Milk",
      "eggs": "Eggs",
      ...
    }
  },
  "onboarding": {
    "welcome": { "title": "Welcome to Player 1 Inventory", ... },
    "template": { "title": "Set up your pantry", ... },
    ...
  }
}
```

Chinese translations go in `tw.json`.

**Commit:** `feat(onboarding): add template data module and i18n keys`

---

## Step 3 — Create `useOnboardingSetup` hook

**Files:**
- Create: `apps/web/src/hooks/useOnboardingSetup.ts`
- Create: `apps/web/src/hooks/useOnboardingSetup.test.ts`

**What to do:**

```ts
function useOnboardingSetup() {
  return useMutation({
    mutationFn: async (selections: {
      itemKeys: string[]
      vendorKeys: string[]
    }) => { ... },
    onSuccess: () => { /* invalidate all queries */ }
  })
}
```

The `mutationFn` bulk-creates in this order:
1. Create the 2 tag types from `templateTagTypes`
2. Create all tags from `templateTags` — top-level first (no `parentKey`), then children (sorted by depth)
3. Create only the selected items (matched by `itemKeys`), each with their resolved tag IDs
4. Create only the selected vendors (matched by `vendorKeys`)

Progress reporting: accept an `onProgress?: (pct: number) => void` callback. Calculate percentage based on total entities to create vs created so far.

**Tests:**
- `useOnboardingSetup creates tag types, tags, items, and vendors in order`
- `useOnboardingSetup calls onProgress with increasing percentages`
- `useOnboardingSetup only creates selected items and vendors`
- `useOnboardingSetup assigns correct tagIds to items`

**Commit:** `feat(onboarding): add useOnboardingSetup hook`

---

## Step 4 — Create onboarding route and step state machine

**Files:**
- Create: `apps/web/src/routes/onboarding.tsx`
- Create: `apps/web/src/routes/onboarding.stories.tsx`
- Create: `apps/web/src/routes/onboarding.stories.test.tsx`

**What to do:**

Create `src/routes/onboarding.tsx` with `createFileRoute('/onboarding')`.

Step state machine (local state, no URL params needed):
```ts
type OnboardingStep =
  | { type: 'welcome' }
  | { type: 'template-overview' }
  | { type: 'items-browser' }
  | { type: 'vendors-browser' }
  | { type: 'progress' }
```

Selections state:
```ts
const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set())
const [selectedVendorKeys, setSelectedVendorKeys] = useState<Set<string>>(new Set())
```

The route renders the appropriate component based on current step, passing `onNavigate(step)`, `selectedItemKeys`, `selectedVendorKeys`, and setters as props.

Exclude from bottom nav / sidebar: add `/onboarding` to the `isFullscreenPage` check in `Layout` (or wherever that's computed — currently `location.pathname.startsWith('/items/')` etc.).

**Stories:** `Welcome` story (step 1), `TemplateOverview` story (step 2 with 0 selected).

**Story test:** assert the welcome heading is visible.

**Commit:** `feat(onboarding): add onboarding route and step state machine`

---

## Step 5 — Build OnboardingWelcome (Step 1)

**Files:**
- Create: `apps/web/src/components/onboarding/OnboardingWelcome/index.tsx`
- Create: `apps/web/src/components/onboarding/OnboardingWelcome/OnboardingWelcome.stories.tsx`
- Create: `apps/web/src/components/onboarding/OnboardingWelcome/OnboardingWelcome.stories.test.tsx`

**What to do:**

Props:
```ts
interface OnboardingWelcomeProps {
  onChooseTemplate: () => void
  onStartFromScratch: () => void
}
```

Layout (full-screen centered):
```
[App logo / name]
[Welcome heading]
[Subtext]

[Language selector]        ← appears ABOVE the 3 options; reuse existing LanguageCard/useLanguage

[Choose from template  >]  ← large card-style button, primary
[Import backup         >]  ← large card-style button, neutral
[Start from scratch    >]  ← large card-style button, neutral-ghost
```

**Language selector:** Reuse `useLanguage` hook and the same segmented button pattern from `LanguageCard` in settings. Changing language here immediately switches the app language so template item/vendor names render in the correct locale before the user proceeds.

Import backup: reuse the existing import logic from `ImportCard` (`src/components/settings/ImportCard/index.tsx`). On successful import, navigate to `/` (skip the rest of onboarding).

**Stories:** `Default` (normal state), `ImportSuccess` (after file upload succeeds, shows "Get started" button).

**Commit:** `feat(onboarding): build OnboardingWelcome step`

---

## Step 6 — Build TemplateOverview (Steps 2 & 4)

**Files:**
- Create: `apps/web/src/components/onboarding/TemplateOverview/index.tsx`
- Create: `apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.tsx`
- Create: `apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.test.tsx`

**What to do:**

Props:
```ts
interface TemplateOverviewProps {
  selectedItemCount: number
  selectedVendorCount: number
  totalItemCount: number
  totalVendorCount: number
  onEditItems: () => void
  onEditVendors: () => void
  onBack: () => void
  onConfirm: () => void
}
```

Layout:
```
[Title: "Set up your pantry"]

[Row: "N template items  M selected  >"]  ← tappable, navigates to items browser
[Row: "N template vendors  Y selected  >"] ← tappable, navigates to vendors browser

[Back]                [Confirm]
```

"Confirm" disabled when `selectedItemCount === 0 && selectedVendorCount === 0`.

**Stories:** `NothingSelected` (0/0), `SomeSelected` (12 items, 4 vendors selected).

**Commit:** `feat(onboarding): build TemplateOverview step`

---

## Step 7 — Build TemplateItemsBrowser (Step 3A)

**Files:**
- Create: `apps/web/src/components/onboarding/TemplateItemsBrowser/index.tsx`
- Create: `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.tsx`
- Create: `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.test.tsx`

**What to do:**

Props:
```ts
interface TemplateItemsBrowserProps {
  selectedKeys: Set<string>
  onSelectionChange: (keys: Set<string>) => void
  onBack: () => void
}
```

Internal state: `storageFilter: string[]`, `categoryFilter: string[]`, `search: string`, `searchVisible: boolean`.

Filter behavior:
- Storage dropdown: flat list of storage tags with checkboxes
- Category dropdown: indented flat list (all category tags at all depths) with checkboxes; use `getTagDepth` for `pl-{depth*4}` indent
- Filtering: an item passes if it has a tag matching ANY selected storage tag (or its descendants) AND ANY selected category tag (or its descendants). If a filter is empty (nothing selected), it passes all.
- "Select all visible": adds all currently visible item keys to `selectedKeys`
- "Clear selection": empties `selectedKeys` entirely

Item list: render `ItemCard variant="template"` for each visible template item. Checkbox controlled by whether item key is in `selectedKeys`.

The component resolves i18n display names for template items using `useTranslation`.

**Stories:** `AllItems`, `FilteredByStorage`, `FilteredByCategory`, `WithSearch`, `WithSelections`.

**Commit:** `feat(onboarding): build TemplateItemsBrowser step`

---

## Step 8 — Build TemplateVendorsBrowser (Step 3B)

**Files:**
- Create: `apps/web/src/components/onboarding/TemplateVendorsBrowser/index.tsx`
- Create: `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.tsx`
- Create: `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.test.tsx`

**What to do:**

Props:
```ts
interface TemplateVendorsBrowserProps {
  selectedKeys: Set<string>
  onSelectionChange: (keys: Set<string>) => void
  onBack: () => void
}
```

Internal state: `search: string`.

Layout:
- Header: [← Back] `N vendors selected` [Select all visible] [Clear selection]
- Search input (always visible, no toggle)
- "Showing X of Y vendors" + [clear filter] button
- Vendor list: `VendorCard variant="template"` for each visible vendor

**Stories:** `AllVendors`, `WithSearch`, `WithSelections`.

**Commit:** `feat(onboarding): build TemplateVendorsBrowser step`

---

## Step 9 — Build OnboardingProgress (Step 5)

**Files:**
- Create: `apps/web/src/components/onboarding/OnboardingProgress/index.tsx`
- Create: `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.tsx`
- Create: `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.test.tsx`

**What to do:**

Props:
```ts
interface OnboardingProgressProps {
  progress: number          // 0–100
  isComplete: boolean
  onGetStarted: () => void
}
```

Layout while in progress:
```
[Title: "Setting up your pantry…"]
[Progress bar: shadcn/ui <Progress value={progress} />]
```

Layout when complete:
```
[Title: "All done!"]
[Subtitle: "Your pantry is ready."]
[Button: "Get started →"]
```

Buttons are hidden during progress. "Get started" only appears when `isComplete` is true.

Wire into `onboarding.tsx`: when step is `progress`, call `useOnboardingSetup` mutation with selections, pass `progress` state to this component, navigate to `/` on "Get started".

**Stories:** `InProgress` (50%), `Complete`.

**Commit:** `feat(onboarding): build OnboardingProgress step`

---

## Step 10 — Wire empty-data redirect in `__root.tsx`

**Files:**
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/hooks/index.ts` (export new `useIsDataEmpty` hook if created separately)

**What to do:**

In `__root.tsx`, after data hooks resolve:
```ts
const { data: items = [] } = useItems()
const { data: tags = [] } = useTags()
const { data: vendors = [] } = useVendors()
const isEmpty = items.length === 0 && tags.length === 0 && vendors.length === 0

const navigate = useNavigate()
const location = useLocation()

useEffect(() => {
  if (isEmpty && !isLoading && location.pathname !== '/onboarding') {
    navigate({ to: '/onboarding' })
  }
}, [isEmpty, isLoading, location.pathname])
```

Guard: only redirect after all three queries have resolved (not loading). Avoid redirect loop by checking `pathname !== '/onboarding'`.

Also add `/onboarding` to the `isFullscreenPage` check so bottom nav and sidebar hide on the onboarding page.

**Tests:** Update `__root.tsx` tests (if any) or integration tests to cover redirect behavior.

**E2E test:** Add `e2e/tests/onboarding.spec.ts`:
- `user sees onboarding when app data is empty`
- `user can start from scratch and land on pantry page`
- `user can select template items and vendors and complete onboarding`
- Add onboarding page to `e2e/tests/a11y.spec.ts` (light + dark mode)

**Commit:** `feat(onboarding): add empty-data redirect and hide nav on onboarding route`

---

## Final E2E check

```bash
pnpm test:e2e --grep "onboarding|a11y"
```

Fix any failures before marking Phase B complete.
