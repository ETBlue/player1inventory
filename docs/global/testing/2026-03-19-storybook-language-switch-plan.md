# Storybook Language Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a language toolbar toggle (Auto / EN / TW) to Storybook and consolidate per-language story variants into single stories.

**Architecture:** A `withI18n` global decorator in `preview.tsx` reads the `locale` global from the Storybook toolbar and syncs both `i18n.changeLanguage()` and `localStorage` on every story render. Existing per-language story variants (`TraditionalChinese`, `ExplicitEnglish`) are removed in favour of the toolbar switch.

**Tech Stack:** Storybook 8 (`@storybook/react-vite`), `react-i18next`, `i18next`, existing `LANGUAGE_STORAGE_KEY` + `resolveLanguageFromStorage()` from `src/lib/language.ts`. No new packages.

---

## File Structure

| File | Change |
|------|--------|
| `apps/web/.storybook/preview.tsx` | Add `globalTypes`, `initialGlobals`, `withI18n` decorator; change side-effect i18n import to named import |
| `apps/web/src/components/settings/LanguageCard/index.stories.tsx` | Consolidate 3 stories → 1 (`Default`) |
| `apps/web/src/components/settings/LanguageCard/index.stories.test.tsx` | Remove 2 redundant test cases, keep 1 |
| `apps/web/src/routes/settings/index.stories.tsx` | Consolidate 3 stories → 1 (`Default`) |
| `apps/web/src/routes/settings/index.stories.test.tsx` | Remove 2 redundant test cases, keep 1 |

---

## Task 1: Add language toolbar + `withI18n` decorator to preview.tsx

**Files:**
- Modify: `apps/web/.storybook/preview.tsx`

### Context

`preview.tsx` already has a `withDocsTheme` decorator that reads `context.globals.theme`. We follow the same pattern for language. The `i18n` instance is the default export from `src/i18n/index.ts`. The `LANGUAGE_STORAGE_KEY` constant and `resolveLanguageFromStorage()` function are in `src/lib/language.ts`.

The `globalTypes` field defines toolbar items; `initialGlobals` sets the default value.

- [ ] **Step 1: Replace the side-effect i18n import with a named import**

In `apps/web/.storybook/preview.tsx`, change:
```ts
import '../src/i18n'
```
to:
```ts
import i18n from '../src/i18n'
import { LANGUAGE_STORAGE_KEY, resolveLanguageFromStorage } from '../src/lib/language'
```

The named import still initialises i18next as a side-effect (the module runs on import), and also gives us the `i18n` instance to call `changeLanguage()`.

- [ ] **Step 2: Add the `withI18n` decorator**

After the existing `withDocsTheme` declaration, add:

```ts
const withI18n: Decorator = (Story, context) => {
  const locale = (context.globals.locale as string) ?? 'auto'

  if (locale === 'auto') {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    i18n.changeLanguage(resolveLanguageFromStorage())
  } else {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
    i18n.changeLanguage(locale)
  }

  return Story()
}
```

- [ ] **Step 3: Add `globalTypes`, `initialGlobals`, and register the decorator**

In the `preview` object, add `globalTypes` and `initialGlobals` before `parameters`, and append `withI18n` to the `decorators` array:

```ts
const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'Active language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'auto', title: 'Auto' },
          { value: 'en',   title: 'EN' },
          { value: 'tw',   title: 'TW' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    locale: 'auto',
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      theme: themes.light,
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
    withDocsTheme,
    withI18n,
  ],
}
```

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
(cd apps/web && pnpm test --run)
```

Expected: 118 test files pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add apps/web/.storybook/preview.tsx
git commit -m "feat(storybook): add language toolbar toggle with withI18n decorator"
```

---

## Task 2: Consolidate LanguageCard stories + smoke test

**Files:**
- Modify: `apps/web/src/components/settings/LanguageCard/index.stories.tsx`
- Modify: `apps/web/src/components/settings/LanguageCard/index.stories.test.tsx`

### Context

Currently there are 3 stories (`AutoLanguage`, `ExplicitEnglish`, `ExplicitChineseTraditional`) each with manual `localStorage` setup. The toolbar decorator now handles language state, so all three collapse into one `Default` story.

The `LanguageCard` component reads language preference from `localStorage` via `useLanguage`. When the toolbar is set to `tw`, `localStorage` has `i18n-language=tw` before the story renders, so the card will show the TW state.

- [ ] **Step 1: Replace the stories file with a single Default story**

Full replacement for `apps/web/src/components/settings/LanguageCard/index.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { LanguageCard } from '.'

const meta: Meta<typeof LanguageCard> = {
  title: 'Settings/LanguageCard',
  component: LanguageCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof LanguageCard>

export const Default: Story = {}
```

- [ ] **Step 2: Replace the smoke test with a single test**

Full replacement for `apps/web/src/components/settings/LanguageCard/index.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('LanguageCard stories smoke tests', () => {
  it('renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Language')).toBeInTheDocument()
  })
})
```

Note: The test asserts "Language" (EN label) because `composeStories` applies decorators including `withI18n` in Auto mode, which resolves to EN in jsdom (`navigator.language = 'en'`).

- [ ] **Step 3: Run tests**

```bash
(cd apps/web && pnpm test --run src/components/settings/LanguageCard)
```

Expected: 1 test file, 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/LanguageCard/index.stories.tsx \
        apps/web/src/components/settings/LanguageCard/index.stories.test.tsx
git commit -m "refactor(storybook): consolidate LanguageCard stories to single Default"
```

---

## Task 3: Consolidate Settings index stories + smoke test

**Files:**
- Modify: `apps/web/src/routes/settings/index.stories.tsx`
- Modify: `apps/web/src/routes/settings/index.stories.test.tsx`

### Context

Currently there are 3 stories (`Default`, `TraditionalChinese`, `ExplicitEnglish`), each with a separate render function that sets `localStorage` before rendering. The `Default` story already removes the language key; the others set it explicitly. All three are now handled by the toolbar.

The `LanguageCard` inside the settings page calls `useLanguage()` which reads `localStorage` on mount — the `withI18n` decorator sets `localStorage` before the story renders, so the component sees the right value.

- [ ] **Step 1: Replace the stories file with a single Default story**

Full replacement for `apps/web/src/routes/settings/index.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'

const meta = {
  title: 'Routes/Settings',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SettingsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
    context: { queryClient },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export const Default: Story = {
  render: () => <SettingsStory />,
}
```

Changes from before:
- Removed `TraditionalChineseStory` and `ExplicitEnglishStory` functions and their exported stories
- Removed the `localStorage.removeItem(LANGUAGE_STORAGE_KEY)` cleanup `useEffect` — the decorator owns language state now
- Removed the `LANGUAGE_STORAGE_KEY` import (no longer used)
- `SettingsStory` no longer accepts a `setup` prop (language setup removed, but `db.delete()`/`db.open()` is kept for clean DB state)

- [ ] **Step 2: Replace the smoke test with a single test**

Full replacement for `apps/web/src/routes/settings/index.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('Settings index stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
(cd apps/web && pnpm test --run src/routes/settings/index)
```

Expected: 1 test file, 1 test passes.

- [ ] **Step 4: Run full test suite**

```bash
(cd apps/web && pnpm test --run)
```

Expected: 118 test files pass (note: file count may decrease by 0 since we're only modifying existing files, not removing them).

- [ ] **Step 5: Run quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
(cd apps/web && pnpm check)
```

Expected: all pass, no TS6385 warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/settings/index.stories.tsx \
        apps/web/src/routes/settings/index.stories.test.tsx
git commit -m "refactor(storybook): consolidate Settings index stories to single Default"
```

---

## Task 4: Update docs/INDEX.md

**Files:**
- Modify: `docs/INDEX.md`

- [ ] **Step 1: Update the testing row status**

In `docs/INDEX.md`, update the `testing` row notes to mention the language switch:

Change:
```
| [testing](global/testing/) | ⚠️ Partial | Playwright + Storybook smoke tests done; items + tags + vendors + recipes + cooking + state-restore E2E (local + cloud) done; shopping cloud E2E done |
```

To:
```
| [testing](global/testing/) | ⚠️ Partial | Playwright + Storybook smoke tests done; Storybook language toolbar done; items + tags + vendors + recipes + cooking + state-restore E2E (local + cloud) done; shopping cloud E2E done |
```

- [ ] **Step 2: Commit**

```bash
git add docs/INDEX.md
git commit -m "docs: update INDEX.md — Storybook language toolbar done"
```
