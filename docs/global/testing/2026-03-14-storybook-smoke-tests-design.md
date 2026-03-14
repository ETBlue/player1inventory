# Storybook Smoke Tests — Design Spec

**Date:** 2026-03-14
**Topic:** Add smoke tests for all 46 Storybook story files
**Status:** Approved

---

## Problem

Storybook story pages can break silently — a regression may cause a story to render the wrong UI or render nothing at all without throwing a JavaScript error. Currently, only 6 of 46 story files have smoke tests. The remaining 40 require manual human verification to catch regressions.

## Goal

Add automated smoke tests for all 46 story files so that story regressions surface in CI without human review.

---

## Approach

**One `.stories.test.tsx` file per `.stories.tsx` file**, co-located in the same directory. Every exported story in each file gets its own test case with a meaningful assertion.

This follows the convention established by the 6 existing story test files.

---

## File Naming Convention

| Story file | Test file |
|---|---|
| `Foo/index.stories.tsx` | `Foo/index.stories.test.tsx` |
| `Foo/Foo.stories.tsx` | `Foo/Foo.stories.test.tsx` |
| `routes/bar.stories.tsx` | `routes/bar.stories.test.tsx` |

---

## Test Pattern

Each test file uses this structure:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, Variant } = composeStories(stories)

describe('<ComponentName> stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('Variant renders without error', () => {
    render(<Variant />)
    expect(screen.getByText('Expected text')).toBeInTheDocument()
  })
})
```

When localStorage setup is involved, also import `afterEach, beforeEach` from `'vitest'`.

`composeStories()` automatically applies all story decorators (providers, theme, router, etc.) — no manual wrappers needed. **Important:** `composeStories()` does NOT run Storybook's story-level `beforeEach` hooks. Any state setup in story-level `beforeEach` must be replicated as Vitest `beforeEach`/`afterEach` blocks in the test file (see `DataModeCard` pattern).

---

## Assertion Tiers

Tests use the most specific assertion available for each story:

**Tier 1 — Simple components** (most story files):
- Assert on visible text unique to the story's state: `screen.getByText('Offline Mode')`
- Or semantic role + name: `screen.getByRole('button', { name: /save/i })`
- Or ARIA label: `screen.getByLabelText('...')`

**Tier 2 — Async/router components** (e.g. `CookingControlBar`, route stories with async init):
```tsx
const { container } = render(<Default />)
await waitFor(() => expect(container.firstChild).not.toBeNull())
```

**Tier 3 — Page routes with Dexie seeding** (page-level stories that show "Loading..." during setup):
```tsx
render(<Default />)
expect(screen.getByText('Loading...')).toBeInTheDocument()
```

**Priority order** (most → least specific):
1. Unique text string for that story's state
2. Semantic role + accessible name
3. ARIA label
4. `container.firstChild` not null (async fallback only)

The assertion must catch a story rendering the wrong thing or nothing — not merely "no JS error thrown."

---

## Scope

### Already covered — 5 existing tests (no changes needed)

| Story file | Existing test file |
|---|---|
| `settings/DataModeCard/index.stories.tsx` | `index.stories.test.tsx` |
| `settings/FamilyGroupCard/index.stories.tsx` | `index.stories.test.tsx` |
| `recipe/RecipeCard/RecipeCard.stories.tsx` | `RecipeCard.stories.test.tsx` |
| `recipe/CookingControlBar/index.stories.tsx` | `index.stories.test.tsx` |
| `vendor/VendorCard/VendorCard.stories.tsx` | `VendorCard.stories.test.tsx` |

### Needs update — 1 existing test with incomplete coverage

| Story file | Existing test file | Issue |
|---|---|---|
| `routes/cooking.stories.tsx` | `cooking.stories.test.tsx` | File exports 8 stories; existing test only covers 5. Missing: `WithCheckedRecipe`, `WithExpandedRecipe`, `WithActiveToolbar`. |

Add the 3 missing story tests to the existing file. All 3 use the same Tier 3 pattern as the existing 5: `expect(screen.getByText('Loading...')).toBeInTheDocument()`.

### New — 40 test files to create

**Shared components (5):**
1. `components/AddNameDialog/AddNameDialog.stories.tsx`
2. `components/ColorSelect/ColorSelect.stories.tsx`
3. `components/DeleteButton/DeleteButton.stories.tsx`
4. `components/FilterStatus/FilterStatus.stories.tsx`
5. `components/Toolbar/Toolbar.stories.tsx`

**Item components (9):**
6. `components/item/ItemCard/ItemCard.assignment.stories.tsx`
7. `components/item/ItemCard/ItemCard.cooking.stories.tsx`
8. `components/item/ItemCard/ItemCard.pantry.stories.tsx`
9. `components/item/ItemCard/ItemCard.shopping.stories.tsx`
10. `components/item/ItemCard/ItemCard.variants.stories.tsx`
11. `components/item/ItemFilters/ItemFilters.stories.tsx`
12. `components/item/ItemForm/ItemForm.stories.tsx`
13. `components/item/ItemListToolbar/ItemListToolbar.stories.tsx`
14. `components/item/ItemProgressBar/ItemProgressBar.stories.tsx`

**Tag components (5):**
15. `components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.tsx`
16. `components/tag/TagBadge/TagBadge.stories.tsx`
17. `components/tag/TagDetailDialog/TagDetailDialog.stories.tsx`
18. `components/tag/TagNameForm/TagNameForm.stories.tsx`
19. `components/tag/TagTypeDropdown/TagTypeDropdown.stories.tsx`

**Recipe components (1):**
20. `components/recipe/RecipeNameForm/RecipeNameForm.stories.tsx`

**Vendor components (1):**
21. `components/vendor/VendorNameForm/VendorNameForm.stories.tsx`

**Settings components (4):**
22. `components/settings/ExportCard/index.stories.tsx`
23. `components/settings/LanguageCard/index.stories.tsx`
24. `components/settings/SettingsNavCard/index.stories.tsx`
25. `components/settings/ThemeCard/index.stories.tsx`

**UI primitives (11):**
26. `components/ui/alert-dialog.stories.tsx`
27. `components/ui/badge.stories.tsx`
28. `components/ui/button.stories.tsx`
29. `components/ui/card.stories.tsx`
30. `components/ui/confirm-dialog.stories.tsx`
31. `components/ui/dialog.stories.tsx`
32. `components/ui/dropdown-menu.stories.tsx`
33. `components/ui/input.stories.tsx`
34. `components/ui/label.stories.tsx`
35. `components/ui/progress.stories.tsx`
36. `components/ui/select.stories.tsx`

**Page-level routes (3):**
37. `routes/settings/index.stories.tsx`
38. `routes/settings/tags/index.stories.tsx`
39. `routes/settings/tags/$id/index.stories.tsx`

**Design tokens (1):**
40. `stories/Colors.stories.tsx`

---

## Implementation Notes

- Read each story file before writing its test to identify the best assertion for each exported story
- Use `beforeEach`/`afterEach` for localStorage/IndexedDB cleanup when stories depend on persistent state (follow `DataModeCard` pattern)
- All 40 new test files + 1 update are created in one implementation pass — no phased rollout needed
- Run `pnpm test` after all files are created to verify green

**Special cases:**

- **`LanguageCard` and `ThemeCard`** — these story files use Storybook-native story-level `beforeEach` to set localStorage. `composeStories()` does not run these hooks. Replicate the localStorage setup as Vitest `beforeEach`/`afterEach` blocks in the test (same pattern as `DataModeCard`).

- **Dialog-trigger stories** (`AddNameDialog`, `EditTagTypeDialog`, `TagDetailDialog`, `confirm-dialog`, `alert-dialog`, `dialog`) — dialogs are closed by default. Assert on the trigger button, not dialog content (which isn't in the DOM until opened). Example: `screen.getByRole('button', { name: /open/i })`.

- **`Colors.stories.tsx`** — exports a single story named `AllColors` (not `Default`). Color value strings (HSL) are computed asynchronously via `useEffect` and start as empty strings. Assert on static headings like `screen.getByText('Colors by Hue')` instead. Destructure as `const { AllColors } = composeStories(stories)`.

- **ItemCard story files** — five story files live in the same `ItemCard/` directory as siblings. All import shared fixture data from `ItemCard.stories.fixtures.tsx`. Test files import from the story file directly, not the fixture file.

- **`SettingsNavCard`** — its story decorator injects a router context via `getRouterContext()`. This is handled automatically by `composeStories()`. Verify the render is synchronous and use Tier 1 assertions (the card renders immediately without async setup).
