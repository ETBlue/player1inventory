# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Player 1 Inventory — a grocery and pantry management app. Designed by ETBlue.

## Commands

```bash
pnpm dev          # Start development server (Vite)
pnpm build        # Build for production
pnpm test         # Run tests (Vitest)
pnpm test:watch   # Run tests in watch mode
pnpm test:ui      # Run tests with UI browser interface
pnpm test:e2e      # Run E2E tests with Playwright (headless)
pnpm test:e2e:ui   # Run E2E tests with Playwright UI (interactive)
pnpm test:e2e:debug # Debug E2E tests step-by-step
pnpm lint         # Lint with Biome
pnpm format       # Format with Biome
pnpm check        # Run all Biome checks
pnpm storybook    # Start Storybook
```

## Tech Stack

- **Build**: Vite
- **Framework**: React 19 + TypeScript (strict)
- **Routing**: TanStack Router (file-based)
- **Data/State**: TanStack Query + Dexie.js (IndexedDB)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Code Quality**: Biome
- **Testing**: Vitest + React Testing Library

## Architecture

```
Components → TanStack Query hooks → Dexie.js → IndexedDB
```

Components never access the database directly — they use Query hooks from `src/hooks/`.

## Project Structure

```
src/
  components/       # React components
    ui/             # shadcn/ui components
  hooks/            # TanStack Query hooks
  db/               # Dexie.js database and operations
  routes/           # TanStack Router file-based routes
  lib/              # Utilities (cn helper)
  types/            # TypeScript types
  test/             # Test setup
```

## Key Patterns

- **Data types** defined in `src/types/index.ts`
- **Database operations** in `src/db/operations.ts` with tests in `src/db/operations.test.ts`
- **Query hooks** wrap database operations and handle cache invalidation
- **Routes** auto-generate `src/routeTree.gen.ts` on dev server start

## Shared Components

**`Toolbar`** (`src/components/Toolbar/index.tsx`) — shared wrapper for list-page toolbars. Provides `bg-background-surface`, `border-b-2 border-accessory-default`, `px-3 py-2`, `flex items-center gap-2`. Used by shopping (cart toolbar), vendor list, and tags pages. Accepts optional `className` for layout overrides (e.g. `justify-between`, `flex-wrap`).

**`AddNameDialog`** (`src/components/AddNameDialog/index.tsx`) — generic name-input dialog used by Tags, Vendors, and Recipes tabs for inline entity creation. Props: `open`, `title`, `submitLabel`, `name`, `placeholder?`, `onNameChange`, `onAdd`, `onClose`. Cancel button uses `neutral-outline`. Name input is `autoFocus`.

**`ItemListToolbar`** (`src/components/item/ItemListToolbar/index.tsx`) — unified toolbar for all item list pages (pantry, shopping, tag/vendor/recipe items tabs). Wraps `<Toolbar>` (Row 1) with filter, tags-toggle, sort dropdown, sort-direction, and search buttons; plus collapsible Row 2 (search), Row 3 (`ItemFilters`), Row 4 (`FilterStatus`). Search/filter/UI-visibility state is stored in URL params via `useUrlSearchAndFilters`. Sort preferences are managed by `useSortFilter` (localStorage). Accepts `leading` (left slot), `children` (right slot), `isTagsToggleEnabled`, `onSearchSubmit` (called when Enter pressed with no exact match), `onCreateFromSearch` (same trigger — shows a Create button; pass `hasExactMatch` so the toolbar knows when to suppress it). Escape clears the search value but keeps the input row open.

Note: Fixed nav bars (item detail, vendor detail) use `bg-background-elevated` and are not using this component — they are positioned overlays, not scrolling toolbars.

**`CookingControlBar`** (`src/components/recipe/CookingControlBar/index.tsx`) — second-row toolbar for the cooking page. Props: `allExpanded`, `onExpandAll`, `onCollapseAll`. Reads/writes `?sort` (`name|recent|count`), `?dir` (`asc|desc`), `?q` directly via `Route.useSearch()` and `useNavigate()`. Row 1: sort Select, direction button, expand/collapse button, spacer, search toggle. Row 2 (conditional): search input with Create/Clear buttons. `searchVisible` is local state initialized from `!!q`.

### Settings Cards

Self-contained card components for the settings page. Each lives in `src/components/settings/` and accepts no props — all state is read from hooks internally.

**`DataModeCard`** (`src/components/settings/DataModeCard/index.tsx`) — data mode toggle card (local ↔ cloud). No props. Uses `useDataMode`. Renders different content for local vs cloud mode. Cloud mode includes a multi-step disable flow with confirmation dialogs.

**`FamilyGroupCard`** (`src/components/settings/FamilyGroupCard/index.tsx`) — family group management card. No props. Cloud mode only (rendered conditionally by the settings page).

**`ThemeCard`** (`src/components/settings/ThemeCard/index.tsx`) — theme selector card. No props. Uses `useTheme`. Renders Sun/Moon icon and three segmented buttons (Light / System / Dark).

**`LanguageCard`** (`src/components/settings/LanguageCard/index.tsx`) — language selector card. No props. Uses `useLanguage`. Renders Globe icon and a Select dropdown (Auto / English / 繁體中文).

**`ExportCard`** (`src/components/settings/ExportCard/index.tsx`) — data export card. No props. Local mode only (rendered conditionally by the settings page). Renders a Download button that calls `exportAllData()`.

**`SettingsNavCard`** (`src/components/settings/SettingsNavCard/index.tsx`) — navigation link card for settings list items. Props: `icon: LucideIcon`, `label: string`, `description: string`, `to: string`. Renders a TanStack Router Link wrapping a Card with icon, label, description, and ChevronRight.

## Custom Hooks

**Navigation:**
- `useAppNavigation()` (`src/hooks/useAppNavigation.ts`) - Tracks navigation history in sessionStorage, provides `goBack()` function for smart back navigation to previous app page (fallback to home). Uses `router.history.push(previousUrl)` to preserve full URL (including search params) when going back.
- `useNavigationTracker()` (`src/hooks/useNavigationTracker.ts`) - Global hook (used in `__root.tsx`) that records every page visit as a full URL (`pathname + searchStr`) in sessionStorage. When params change on the same page, updates the last entry in place rather than appending a new one.

**Item List State:**
- `useUrlSearchAndFilters()` (`src/hooks/useUrlSearchAndFilters.ts`) - Manages search query, tag filter state, vendor/recipe filter state, and UI visibility (filters panel, tags visible) via URL params (`?q=`, `?f_<typeId>=`, `?f_vendor=id1,id2`, `?f_recipe=id1,id2`, `?filters=1`, `?tags=1`). Uses `router.history.replace` to update params in place (same history entry). Note: `filterState` only contains tag type filters — `vendor` and `recipe` keys are reserved and excluded from `filterState`. Exposes `selectedVendorIds: string[]`, `selectedRecipeIds: string[]`, `toggleVendorId(id)`, `toggleRecipeId(id)`, `clearVendorIds()`, `clearRecipeIds()`.
- `useSortFilter(storageKey)` (`src/hooks/useSortFilter.ts`) - Manages sort field and direction via localStorage key `${storageKey}-sort-prefs`. Used by all item list pages for per-page sort persistence. Accepts optional `defaultSortBy` option (defaults to `'name'`).
- `useScrollRestoration(key)` (`src/hooks/useScrollRestoration.ts`) - Saves/restores `window.scrollY` for a given key (typically the full URL). Saves scroll on component unmount (SPA navigation away); restores after data loads. Usage: call with `currentUrl` from `useRouterState`, then call `restoreScroll()` in a `useEffect` conditioned on `!isLoading`.

**Data Utilities:**
- `useVendorItemCounts()` (`src/hooks/useVendorItemCounts.ts`) - Returns `Map<vendorId, number>` of item counts per vendor, memoized with useMemo for performance
- `useItemSortData(items)` (`src/hooks/useItemSortData.ts`) - Returns `{ quantities, expiryDates, purchaseDates }` for sort operations on item lists. `quantities` is a `useMemo` (synchronous, no race condition). `expiryDates` and `purchaseDates` are TanStack Query queries under the `['sort', ...]` key namespace, using items-derived queryKeys so cache entries invalidate automatically when items update. Used by all five item list pages (pantry, shopping, tag/vendor/recipe items tabs). Checkout explicitly invalidates `['sort', 'purchaseDates']` after purchase.

## Features

> Feature documentation lives in sub-directory CLAUDE.md files co-located with the routes:
> - `apps/web/src/routes/CLAUDE.md` — filter pipeline, shopping, cooking
> - `apps/web/src/routes/items/CLAUDE.md` — item form, manual quantity input
> - `apps/web/src/routes/settings/CLAUDE.md` — cascade deletion
> - `apps/web/src/routes/settings/tags/CLAUDE.md` — tag management
> - `apps/web/src/routes/settings/vendors/CLAUDE.md` — vendor management
> - `apps/web/src/routes/settings/recipes/CLAUDE.md` — recipe management

## Design Tokens

Token system for theme, colors, shadows, and borders:

```
src/design-tokens/
  ├── theme.css      # Shadcn semantic colors (background, primary, etc.)
  ├── shadows.css    # Shadow scale
  ├── borders.css    # Border definitions
  ├── index.css      # Imports all
  └── index.ts       # TypeScript exports
```

**Theme system:**
- `:root` defines HSL values for light mode semantic colors
- `.dark` overrides for dark mode
- `@theme inline` maps CSS variables to Tailwind utilities (bg-background, text-foreground, etc.)
- Two-layer approach preserves theming flexibility

**Background layers:**
Three-level system for surface elevation hierarchy:
- `--background-base` / `bg-background`: Base page background
- `--background-surface` / `bg-background-surface` / `bg-card`: Cards, panels, list items
- `--background-elevated` / `bg-background-elevated`: Toolbars, headers, elevated elements

Light mode: 100% → 95% → 90% (progressively darker)
Dark mode: 3.9% → 10% → 15% (progressively lighter)

**Usage:**
```tsx
// Theme colors (from theme.css)
<div className="bg-background text-foreground">
<Button className="bg-primary text-primary-foreground">

// Background layers
<div className="bg-background"> {/* Page base */}
  <Card> {/* Uses bg-card internally (alias for surface layer) */}
    <CardHeader className="bg-background-elevated">
      Toolbar
    </CardHeader>
  </Card>
</div>

// Tag colors (from theme.css)
import { colors, colorUtils } from '@/design-tokens'

<Badge style={{
  backgroundColor: colors.red.tint,
  color: colorUtils.dark
}}>
  Tag (light tint)
</Badge>

<Badge style={{
  backgroundColor: colors.red.default,
  color: colorUtils.tint
}}>
  Tag (bold)
</Badge>
```

**Button color variants:**

The Button component supports 20 color variants matching the Badge color palette:
- Solid variants (14): red, orange, amber, yellow, green, teal, blue, indigo, purple, pink, brown, lime, cyan, rose
- Tint variants (14): red-tint, orange-tint, amber-tint, yellow-tint, green-tint, teal-tint, blue-tint, indigo-tint, purple-tint, pink-tint, brown-tint, lime-tint, cyan-tint, rose-tint

Usage:
```tsx
<Button variant="teal-tint">Teal Button</Button>
<Button variant="red">Red Button</Button>
```

These variants are used in tag type filter triggers (`TagTypeDropdown`) to display tag type colors when filters are selected.

**Token categories:**
- **Theme**: Semantic colors (background, foreground, primary, card, destructive, etc.) - defined in theme.css
- **Background layers**: base (page, 100% light / 3.9% dark) / surface (cards, 95% light / 10% dark) / elevated (toolbars, 90% light / 15% dark) - defined in theme.css
- **Status colors**: ok, warning, error, inactive (with tint variants) - defined in theme.css
- **Colors**: 14 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink, brown, lime, cyan, rose) - defined in theme.css
- **Color variants**: tint (light background) / default (bold, high contrast)
- **Inventory states**: lowStock, expiring, inStock, outOfStock - defined in theme.css
- **Shadows**: sm, md, lg - defined in shadows.css
- **Borders**: default (1px), thick (2px) - defined in borders.css

## Name Display Convention

Entity names are displayed in title case using Tailwind's `capitalize` class (`text-transform: capitalize`). This is purely visual — stored values are unchanged, so search and comparison logic is unaffected.

**Applies to:** item names, tag names, recipe names — in list cards, detail page headers, name input fields, and tag type dropdowns.

**Vendor names are excluded** — vendors may use intentional casing (e.g. "iHerb", "7-Eleven"). Vendor displays render names as stored. Vendor badges (in `ItemCard` and the item vendors tab) explicitly add `normal-case` to override the Badge component's built-in `capitalize`.

**Already covered by Badge base class:** tag badges and recipe badges. Vendor badges override with `normal-case`.

## Theme System

Three-state theme system (light/dark/system) with automatic OS preference detection and manual override.

**Hook:**
```tsx
import { useTheme } from '@/hooks/useTheme'

function MyComponent() {
  const { preference, theme, setPreference } = useTheme()
  // preference: 'light' | 'dark' | 'system' (user's choice)
  // theme: 'light' | 'dark' (actual applied theme)
  // setPreference: (pref) => void (updates localStorage and DOM)
}
```

**How it works:**
- Inline script in `index.html` applies theme before React loads (prevents flash)
- Theme stored in localStorage as `theme-preference`
- System preference detected via `matchMedia('(prefers-color-scheme: dark)')`
- `dark` class applied to `<html>` element when dark theme active
- Existing `:root` and `.dark` CSS variables in `src/index.css` handle colors

**Component variants:**
```tsx
// Card component supports status-aware variants with left indicator bar
<Card variant="default">   // elevated background, no status indicator
<Card variant="ok">        // green tint background with green left bar
<Card variant="warning">   // orange tint background with orange left bar
<Card variant="error">     // red tint background with red left bar
<Card variant="inactive">  // gray tint background with gray left bar
```

**Guidelines:**
- Use semantic Tailwind colors (`bg-card`, `text-foreground`, etc.) that adapt to theme
- Avoid hardcoded colors like `bg-white` or `bg-gray-900`
- Test components in both light and dark modes
- Use `dark:` prefix for dark-mode-specific styles when needed

## Internationalization (i18n)

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

**Page-by-page string extraction:** Translated pages so far: settings main page (title, theme, tags/vendors/recipes nav cards, language selector); settings tags pages (tags list, tag detail layout, tag info tab, tag items tab); settings vendors pages (vendor list, vendor detail layout, vendor info tab, VendorCard, VendorNameForm); settings recipes pages (recipe list, recipe detail layout, recipe info tab, RecipeCard, RecipeNameForm); shopping page (toolbar, vendor filter, dialogs, log notes); cooking page (toolbar, recipe cards, dialogs, log notes) + CookingControlBar (sort labels, aria-labels, search placeholder). All other pages still use hardcoded English strings — they will be migrated page-by-page in follow-up PRs. Missing keys fall back to English automatically.

**Common i18n keys:** `common.*` covers `cancel`, `delete`, `deleting`, `nameLabel`, `save`, `saving`, `discard`, `goBack`, `unsavedTitle`, `unsavedDescription`, `done`, `back`, `confirm` — reuse these instead of adding entity-specific duplicates.

## AI Agent SOP

### Documentation Updates

Before creating a PR, update all relevant documentation:

1. **CLAUDE.md** - Update if architecture, commands, or patterns change
2. **Design docs** (`docs/global/<area>/` or `docs/features/<area>/`) - Update if implementation diverges from plan
3. **Inline comments** - Ensure code comments reflect the changes
4. **Brainstorming logs** (same folder as the design doc for that topic) - Create when brainstorming leads to decisions
5. **`docs/INDEX.md`** - Update the status column when creating new plans (🔲 Pending) or completing implementations (✅)

### Component Development

**Always create Storybook stories for new components:**
- Every new component should have a corresponding `.stories.tsx` file
- Include multiple stories showing different states and variants
- Use realistic data that demonstrates the component's purpose

**Smoke tests:** every `.stories.tsx` has a matching `.stories.test.tsx` using `composeStories` + React Testing Library. Assert a key UI element (role, text, heading) — not `container.firstChild` or `'Loading...'`.

**Apollo context in route stories:** stories that render routes calling Apollo hooks with `skip:true` (e.g. local-mode guards) need `<ApolloProvider client={noopApolloClient}>` around the `RouterProvider`. Tests pass without it because `setup.ts` stubs all Apollo hooks via `vi.mock`. Import the shared stub:
```ts
import { noopApolloClient } from '@/test/apolloStub'
import { ApolloProvider } from '@apollo/client/react'
```

**Before committing feature code:**
1. **Check Storybook** - Update existing stories if component API changed
2. **Check Tests** - Update or add tests for new functionality
3. **Verify both pass** - Run `pnpm storybook` and `pnpm test` to ensure no breakage

**Commit together:**
- Commit feature code, Storybook stories, and tests in the same commit when possible
- This keeps the codebase in a consistent state where stories and tests match the code
- Exception: Large refactors may need separate commits, but stories/tests should follow immediately

### Bug Fixes

When the user reports a bug (post-implementation or otherwise), treat it as **substantive** unless it is clearly a typo or cosmetic-only change. Required sequence — no shortcuts:

1. Invoke `superpowers:systematic-debugging` to diagnose the root cause before proposing any fix
2. Invoke `superpowers:test-driven-development` to write a **failing test** that reproduces the bug before writing the fix
3. Implement the fix until the test passes

This applies even when the fix seems obvious. The test serves as a regression guard.

### Verification Gate

After each implementation phase (each numbered step in an implementation plan), run the full quality gate. **Each command must be run with an explicit path** — do not rely on `cd` persisting between Bash tool calls:

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

**Final phase only** — after all steps are complete, also run related E2E tests:

```bash
pnpm test:e2e --grep "<feature-areas>"
```

Identify `<feature-areas>` from the routes/components touched (e.g. `shopping`, `cooking`, `items`, `tags`, `vendors`, `settings`). Combine multiple areas with a pipe: `--grep "shopping|tags"`. Playwright's `webServer` config handles server startup automatically.

**Rules:**
- If any command fails → stop and fix all errors before proceeding to the next step
- After `pnpm build`, run `grep 'TS6385' /tmp/p1i-build.log` to check for `@deprecated` warnings — any match is a failure even if the build exit code is 0
- All four commands must pass and `grep` must return no matches before moving on
- E2E failures on the final phase are also a hard stop — fix before finishing the branch

**Applies to:** all implementation workflows and any session where code changes are made, regardless of whether a formal plan exists.

### Always Commit Before Done

Before responding to a completed task, step, or session wrap-up, **all changes must be committed** — no exceptions:

- Code files (including any updated inline comments)
- Storybook stories
- Tests
- CLAUDE.md updates
- Design docs and brainstorming logs (`docs/global/<area>/` or `docs/features/<area>/`)
- `docs/INDEX.md` status update

Run `git status` to confirm the working tree is clean. If any uncommitted changes remain, commit them first.

See also: **Before Finishing a Branch** (in the Workflow section below) for branch-level wrap-up steps.

### Commit Splitting

Every time the agent commits — whether triggered by "commit my changes", at the end of a task, or any other moment — split the diff into logical groups and make **one commit per group**.

**Grouping algorithm:**

1. Run `git diff HEAD` to survey all pending changes (staged and unstaged combined)
2. Identify distinct logical concerns — each purpose becomes one commit:
   - Bug fix → one commit
   - New feature (code + its tests + its stories) → one commit
   - Config or docs update → one commit
   - Refactor → one commit
3. Tests and stories for a feature travel in the **same commit** as the feature code — do not split by file type or layer
4. **Best-effort when inseparable:** if changes genuinely span concerns (e.g. a refactor that also fixes an incidental bug in a touched file), combine them into one commit whose message explains the mix — e.g. `refactor(items): extract helper — also fixes off-by-one in quantity calc`

**When uncertain:** lean toward more commits rather than fewer. A commit that does one thing is always better than one that does several.

**Large refactors:** size alone is not a reason to split. A refactor touching 30 files for one purpose is still one commit.

**Mid-task atomicity:** Do not apply this rule within a TDD red/green cycle — those commits are intentionally atomic and should not be split.

### Human Code Changes

When the user asks the AI agent to commit code they wrote manually (e.g. "commit my changes", "commit this"):

1. Run `git diff HEAD` to review exactly what changed (staged and unstaged combined)
2. For each modified component or behavior: check if tests exist and are up to date — add or update tests as needed
3. For each modified component: check if Storybook stories exist and are up to date — add or update stories as needed
4. Update `CLAUDE.md` and inline comments if architecture or patterns changed
5. Apply the **Commit Splitting** rule — survey all staged changes and split into one commit per logical concern. Tests and stories for a feature go in the same commit as the feature code.

Human code changes receive the same completeness audit as agent-authored changes. There is no "just commit it" shortcut.

**Exceptions:** Changes to non-code files only (docs, config, assets) do not require a test/Storybook audit.

### CSS Variable Renames

When you detect or perform a CSS variable rename:

1. **Search the entire project** for all occurrences of the obsolete CSS variable
2. **Replace all instances** with the new variable name
3. **Check all file types**:
   - CSS files (`.css`)
   - TypeScript/TSX files (`.ts`, `.tsx`)
   - Test files (`.test.ts`, `.test.tsx`)
   - Storybook files (`.stories.tsx`)
   - Current documentation (`.md`) - CLAUDE.md, README.md, etc.
   - **Do NOT update** historical docs in `docs/global/` or `docs/features/`

Use Grep to find all references:
```bash
# Example: search for old variable name
grep --pattern="--old-var-name" --glob="**/*.{css,ts,tsx,md}"
```

This ensures the design token system remains consistent across the entire codebase.

### Brainstorming Logs

**When to create:**
- When brainstorming leads to implementation/design decisions
- Not needed for exploratory discussions without decisions

**Format:**
- Location: same folder as the design doc for the topic
  - Global concerns → `docs/global/<area>/` (e.g. `docs/global/ai-sop/`)
  - Feature-specific → `docs/features/<area>/` (e.g. `docs/features/cooking/`)
- Naming: `YYYY-MM-DD-brainstorming-<topic>.md`
- Date: Session date (when brainstorming occurred)

**Content:**
- Questions asked and user answers
- Final decision/recommendation
- Rationale and trade-offs discussed

### Workflow

**Branch Management:**

After completing a brainstorming session and before writing the design document, create a new branch and worktree, then enter the worktree. All feature work happens inside the worktree from this point on:
- The design document
- The brainstorming log
- Implementation plans
- The actual code implementation

The timing is important: create the branch and worktree after brainstorming is complete but before writing the design document. This keeps all related work in one place and ensures the entire feature history (docs + code) lives in the worktree.

**Default Workflow: Git Worktrees**

Use git worktrees by default for feature work. Create isolated workspaces in `.worktrees/` directory. See "Advanced: Git Worktrees" section below for setup details.

**Worktree before implementation (mandatory):** After brainstorming is complete and the branch name is derived, before writing the design doc, always create a git worktree using `superpowers:using-git-worktrees` (or follow the manual steps in "Advanced: Git Worktrees" below if the skill is unavailable). All subsequent work — design doc, implementation plan, and code — happens inside the worktree. Branch name is derived from the brainstorming topic: choose `feature/`, `fix/`, `refactor/`, or `docs/` prefix based on context, then add a short kebab-case topic (e.g. brainstorming about cooking expand/collapse → `feature/cooking-expand`).

**Absorbing upstream changes: always rebase, never merge**

When a feature branch needs to incorporate changes from `main`, use rebase:
```bash
git rebase origin/main
```
Never use `git merge origin/main` on a feature branch. Rebase keeps history linear and avoids merge commits.

**Alternative: Regular Branches**

For GUI tool users (GitHub Desktop, VS Code) or when worktrees are not suitable, use standard git branches instead.

**Branch Naming:**

Choose the branch prefix based on the primary purpose of the work:
- `docs/` - for documentation-heavy changes
- `feature/` - for new functionality
- `refactor/` - for code restructuring
- `chore/` - for maintenance tasks
- `fix/` - for bug fixes
- Other prefixes as appropriate to the mission

Use descriptive names: `docs/design-tokens`, `feature/dark-mode`, `refactor/component-extraction`

**Branch Cleanup:**

Always delete branches after their PR is merged. This keeps the repository clean and prevents confusion about which branches are active.

Recommended approach using GitHub CLI:
```bash
gh pr merge <number> --merge --delete-branch
```

This automatically deletes the remote branch after merging. Alternative approaches are fine as long as the branch gets deleted.

Local cleanup after the remote branch is deleted:
```bash
git branch -d <branch-name>
```

If using git worktrees, also remove the worktree:
```bash
git worktree remove <worktree-path>
```

**Exceptions:**

For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main. This applies to:
- Small bug fixes
- Typo corrections
- Simple configuration changes
- Other trivial updates

Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.

**Design docs and brainstorming logs must always go through a branch — never committed directly to `main`:**
- `docs/global/` — always requires a branch or worktree
- `docs/features/` — always requires a branch or worktree

This applies even for minor additions. The CLAUDE.md typo exception does not extend to these directories.

**General Rule:** If the work involves brainstorming, design decisions, or implementation planning, it should go through the full branch workflow. If it's a quick fix or minor adjustment, check with the user about their preference.

**Before Finishing a Branch:**

Always check for uncommitted changes before completing work:

```bash
git status
```

**If there are uncommitted changes:**
1. Review what's uncommitted - common culprits:
   - Design documents in `docs/global/<area>/` or `docs/features/<area>/`
   - Brainstorming logs (same folders as design docs)
   - Implementation plans
   - Test files or Storybook stories
2. Commit all relevant changes with appropriate commit messages
3. Verify `git status` shows a clean working tree
4. Only then proceed with merge/PR/cleanup

**Why this matters:**
- Uncommitted work can be lost during branch cleanup
- Design docs and plans are part of the feature and should be in the PR
- A clean working tree ensures nothing is left behind

**Completeness audit (mandatory):** When the `finishing-a-development-branch` skill is invoked, it automatically audits 5 areas using the branch diff: (1) CLAUDE.md — architecture/pattern updates; (2) Storybook stories — `.stories.tsx` for new/modified components and page-level routes (`.tsx` files in `src/routes/` that render visible UI, excluding layout wrappers and generated files); (3) Tests — `.test.ts`/`.test.tsx` for new/modified behaviors; (4) Design docs — whether implementation matches the plan (N/A if no plan file); (5) Inline comments — no stale references. Gaps must be fixed or explicitly skipped (type "skip") before merge/PR/cleanup options are presented.

**Advanced: Git Worktrees**

For CLI users who want to work on multiple branches simultaneously without switching, git worktrees provide isolated workspaces.

**Setup:**
```bash
# Create worktree in .worktrees/ directory
# Use dashes instead of slashes in the directory name (e.g. feature-xxx, not feature/xxx)
git worktree add .worktrees/<feature-xxx> -b <branch-name>

# Copy .env files from repo root into the worktree (run before cd — paths are relative to root)
# Skip silently if a file doesn't exist
cp apps/web/.env.local .worktrees/<feature-xxx>/apps/web/.env.local 2>/dev/null || true
cp apps/server/.env .worktrees/<feature-xxx>/apps/server/.env 2>/dev/null || true

cd .worktrees/<feature-xxx>
```

Note: The `EnterWorktree` tool triggers the `WorktreeCreate` hook which copies `.env` files automatically. The manual `cp` step above is only needed when using raw `git worktree add`.

**Directory Convention:**
Use `.worktrees/` directory for git worktrees (project-local, hidden). Ensure it's in `.gitignore`. Use dashes instead of slashes in directory names (e.g. `feature-xxx`, not `feature/xxx`) to avoid creating subfolders.

**Cleanup:**
```bash
# After branch is merged and deleted
git worktree remove .worktrees/<feature-xxx>
```

**Note:** Git worktrees are not supported in GitHub Desktop. If you use GUI tools, stick with regular branches.

### Test Format

**Feature/integration tests** - Use "user can ..." naming with Given-When-Then comments:

```ts
it('user can create an item', async () => {
  // Given valid item data
  const itemData = { name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 }

  // When user creates the item
  const item = await createItem(itemData)

  // Then item is persisted with id and timestamps
  expect(item.id).toBeDefined()
  expect(item.createdAt).toBeInstanceOf(Date)
})
```

**Unit tests** - Keep simple naming (existing style is fine)

### E2E Test Format

E2E tests use Playwright. The `e2e/` directory lives at the **monorepo root** (not inside `apps/web/`) because e2e tests cover the full stack. Test files live in `e2e/tests/`, page objects in `e2e/pages/`, config at `e2e/playwright.config.ts`.

**Page objects** — one class per page, encapsulating selectors and actions. Include a comment on each method citing the aria-label string and source file location:

```ts
// e2e/pages/CookingPage.ts
export class CookingPage {
  constructor(readonly page: Page) {}

  async navigateTo() { await this.page.goto('/cooking') }

  async checkRecipe(name: string) {
    // Recipe checkbox: aria-label={recipe.name}, role="checkbox" (src/routes/cooking.tsx:438)
    // Use getByRole to avoid strict-mode conflict with the "Expand {name}" button
    await this.page.getByRole('checkbox', { name }).click()
  }
}
```

**Test setup** — two strategies:

1. **UI-driven** (default): Navigate through the app to create test data. Use for simple setup (1–5 steps).
2. **`page.evaluate()` seeding**: Seed IndexedDB directly for complex multi-entity setup. Navigate to `/` first so Dexie initialises the schema, then open `indexedDB.open('Player1Inventory')` and use `readwrite` transactions. Use when UI setup would require 10+ steps (e.g. creating items + linking them to a recipe).

**`afterEach` teardown** — always clear IndexedDB, localStorage, and sessionStorage. See the root `e2e/tests/shopping.spec.ts` or `e2e/tests/cooking.spec.ts` for the canonical teardown block.

**Test naming** — same "user can ..." convention with Given-When-Then comments as unit tests.

### Commits

Always include scope in commit messages:

- `feat(cart): add checkout confirmation`
- `fix(tags): prevent duplicate tag names`
- `docs(readme): update setup instructions`

Apply the **Commit Splitting** rule — one commit per logical concern. See `### Commit Splitting` (in AI Agent SOP, above).

### Pull Requests

Include these sections in PR description:

```
## Summary
- <bullet points of what changed>

## Test Plan
- [ ] <verification steps>
```

After creating the PR, attach it to the relevant milestone:

```bash
gh pr edit <number> --milestone "<milestone title>"
```

Match the milestone to the feature area being worked on (e.g. `v0.2.0 — Cloud Foundation` for cloud work). If no milestone fits, skip this step.
