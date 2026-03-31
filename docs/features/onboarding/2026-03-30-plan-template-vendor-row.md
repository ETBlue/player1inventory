# TemplateVendorRow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `VendorCard variant="template"` in `TemplateVendorsBrowser` with a purpose-built `TemplateVendorRow`, align the vendor browser toolbar to use the shared `<Toolbar>` component with a togglable search (matching `TemplateItemsBrowser`), and remove the now-unused `template` variant from `VendorCard`.

**Architecture:** `TemplateVendorRow` is co-located in `TemplateVendorsBrowser/`, exactly mirroring `TemplateItemRow` in `TemplateItemsBrowser/`. Vendor rows have no tags, so the component is simpler: checkbox outside card + name only. After removing `VendorCard` (which used `<Link>`), the browser stories need no providers at all.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui (`Card`, `CardHeader`, `Checkbox`), shared `<Toolbar>` component, Vitest + React Testing Library + composeStories, Storybook

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.tsx` | Create | Row layout: checkbox outside card, vendor name only |
| `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.tsx` | Create | Storybook stories for Unchecked / Checked states |
| `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.test.tsx` | Create | Smoke tests via composeStories |
| `apps/web/src/components/onboarding/TemplateVendorsBrowser/index.tsx` | Modify | Swap VendorCard → TemplateVendorRow, replace custom header with Toolbar, make search togglable |
| `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.tsx` | Modify | Drop router context — no providers needed |
| `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.test.tsx` | Modify | Add Search button assertion to match new toolbar |
| `apps/web/src/components/vendor/VendorCard/index.tsx` | Modify | Remove template variant, selected, onToggle |
| `apps/web/src/components/vendor/VendorCard/VendorCard.stories.tsx` | Modify | Remove TemplateVariant and TemplateVariantSelected stories |
| `apps/web/src/components/vendor/VendorCard/VendorCard.stories.test.tsx` | Modify | Remove TemplateVariant and TemplateVariantSelected tests |

---

## Task 1: Create `TemplateVendorRow` with stories and smoke tests

**Files:**
- Create: `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.tsx`
- Create: `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.tsx`
- Create: `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.test.tsx`

- [ ] **Step 1: Write the smoke test file (will fail — component doesn't exist yet)**

Create `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateVendorRow.stories'

const { Unchecked, Checked } = composeStories(stories)

describe('TemplateVendorRow stories smoke tests', () => {
  describe('Unchecked', () => {
    it('renders the vendor name', () => {
      render(<Unchecked />)
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
  })

  describe('Checked', () => {
    it('renders the checkbox as checked', () => {
      render(<Checked />)
      expect(
        screen.getByRole('checkbox', { name: /remove costco/i }),
      ).toBeChecked()
    })
  })
})
```

- [ ] **Step 2: Run the test — confirm it fails with "Cannot find module"**

```bash
(cd apps/web && pnpm test TemplateVendorRow.stories.test)
```

Expected: FAIL — module `./TemplateVendorRow.stories` not found.

- [ ] **Step 3: Create the component**

Create `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.tsx`:

```tsx
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

interface TemplateVendorRowProps {
  name: string
  isChecked: boolean
  onToggle: () => void
}

export function TemplateVendorRow({
  name,
  isChecked,
  onToggle,
}: TemplateVendorRowProps) {
  return (
    <Card className="ml-10 px-3 py-2">
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggle}
        aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
        className="absolute -ml-10 mt-[2px]"
      />
      <CardHeader className="truncate">{name}</CardHeader>
    </Card>
  )
}
```

Note: No `capitalize` on vendor name — vendors may use intentional casing (e.g. "7-Eleven", "iHerb").

- [ ] **Step 4: Create the stories file**

Create `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { TemplateVendorRow } from './TemplateVendorRow'

// TemplateVendorRow has no hooks — no provider needed.
const meta: Meta<typeof TemplateVendorRow> = {
  title: 'Components/Onboarding/TemplateVendorRow',
  component: TemplateVendorRow,
  args: {
    name: 'Costco',
    isChecked: false,
    onToggle: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateVendorRow>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: {
    isChecked: true,
  },
}
```

- [ ] **Step 5: Run the test — confirm it passes**

```bash
(cd apps/web && pnpm test TemplateVendorRow.stories.test)
```

Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.tsx \
        apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.tsx \
        apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorRow.stories.test.tsx
git commit -m "feat(onboarding): add TemplateVendorRow component with stories and smoke tests"
```

---

## Task 2: Update `TemplateVendorsBrowser` to use `TemplateVendorRow`

**Files:**
- Modify: `apps/web/src/components/onboarding/TemplateVendorsBrowser/index.tsx`
- Modify: `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.tsx`
- Modify: `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.test.tsx`

- [ ] **Step 1: Replace `index.tsx` with the updated version**

Full replacement for `apps/web/src/components/onboarding/TemplateVendorsBrowser/index.tsx`:

```tsx
import { ArrowLeft, Check, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { templateVendors } from '@/data/template'
import { TemplateVendorRow } from './TemplateVendorRow'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateVendorsBrowserProps {
  selectedKeys: Set<string>
  onSelectionChange: (keys: Set<string>) => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateVendorsBrowser({
  selectedKeys,
  onSelectionChange,
  onBack,
}: TemplateVendorsBrowserProps) {
  const { t } = useTranslation()

  const [search, setSearch] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const visibleVendors = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templateVendors
    return templateVendors.filter((vendor) =>
      t(vendor.i18nKey).toLowerCase().includes(q),
    )
  }, [search, t])

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------
  const handleSelectAllVisible = () => {
    const next = new Set(selectedKeys)
    for (const vendor of visibleVendors) {
      next.add(vendor.key)
    }
    onSelectionChange(next)
  }

  const handleClearSelection = () => {
    onSelectionChange(new Set())
  }

  const handleClearFilter = () => {
    setSearch('')
  }

  const isFiltered = search.trim().length > 0

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen">
      {/* Row 1: Toolbar */}
      <Toolbar className="sticky top-0 z-10">
        <Button
          type="button"
          variant="neutral-ghost"
          size="icon"
          className="lg:w-auto lg:mr-3"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden lg:inline">
            {t('onboarding.templateOverview.back')}
          </span>
        </Button>

        <span className="text-foreground-muted">
          {t('onboarding.vendorsBrowser.selected', {
            count: selectedKeys.size,
          })}
        </span>

        <span className="flex-1" />

        <Button
          type="button"
          variant="neutral-outline"
          onClick={handleClearSelection}
        >
          <X />
          {t('onboarding.vendorsBrowser.clearSelection')}
        </Button>
      </Toolbar>

      {/* Row 2: Search / Select All */}
      <Toolbar className="bg-transparent border-none">
        <Button
          size="icon"
          variant={searchVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => {
            if (searchVisible) setSearch('')
            setSearchVisible((v) => !v)
          }}
          aria-label={t('common.search')}
          className="lg:w-auto lg:px-3"
        >
          <Search />
          <span className="hidden lg:inline">{t('common.search')}</span>
        </Button>

        <span className="flex-1" />

        <Button
          type="button"
          variant="neutral-outline"
          onClick={handleSelectAllVisible}
        >
          <Check />
          {t('onboarding.vendorsBrowser.selectAll')}
        </Button>
      </Toolbar>

      {/* Filter status (conditional) */}
      {isFiltered && (
        <>
          <div className="h-px bg-accessory-default" />
          <div className="flex items-center justify-between gap-2 px-3 py-1">
            <span className="text-xs text-foreground-muted">
              {t('onboarding.vendorsBrowser.showing', {
                count: visibleVendors.length,
                total: templateVendors.length,
              })}
            </span>
            <button
              type="button"
              onClick={handleClearFilter}
              className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              {t('onboarding.vendorsBrowser.clearFilter')}
            </button>
          </div>
        </>
      )}

      {/* Search input (conditional) */}
      {searchVisible && (
        <>
          <div className="h-px bg-accessory-default" />
          <div className="flex items-center gap-2 px-3">
            <Input
              placeholder={t('onboarding.vendorsBrowser.title')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearch('')
              }}
              className="border-none shadow-none bg-transparent h-auto py-2 text-sm"
              autoFocus
            />
            {search && (
              <Button
                size="icon"
                variant="neutral-ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => setSearch('')}
                aria-label={t('itemListToolbar.clearSearch')}
              >
                <X />
              </Button>
            )}
          </div>
        </>
      )}

      <div className="h-px bg-accessory-default" />

      {/* Vendor list */}
      <div className="flex-1 mb-2 space-y-px">
        {visibleVendors.map((templateVendor) => {
          const resolvedName = t(templateVendor.i18nKey)
          const isChecked = selectedKeys.has(templateVendor.key)

          return (
            <TemplateVendorRow
              key={templateVendor.key}
              name={resolvedName}
              isChecked={isChecked}
              onToggle={() => {
                const next = new Set(selectedKeys)
                if (isChecked) {
                  next.delete(templateVendor.key)
                } else {
                  next.add(templateVendor.key)
                }
                onSelectionChange(next)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `TemplateVendorsBrowser.stories.tsx` — drop all providers**

Full replacement for `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { TemplateVendorsBrowser } from '.'

// TemplateVendorRow has no hooks — no provider needed.
const meta: Meta<typeof TemplateVendorsBrowser> = {
  title: 'Components/Onboarding/TemplateVendorsBrowser',
  component: TemplateVendorsBrowser,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSelectionChange: () => {},
    onBack: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateVendorsBrowser>

export const AllVendors: Story = {
  args: {
    selectedKeys: new Set(),
  },
}

export const WithSelections: Story = {
  args: {
    selectedKeys: new Set(['costco', 'family-mart', '7-eleven', 'watsons']),
  },
}
```

- [ ] **Step 3: Update `TemplateVendorsBrowser.stories.test.tsx` — add Search button assertion**

Full replacement for `apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateVendorsBrowser.stories'

const { AllVendors, WithSelections } = composeStories(stories)

describe('TemplateVendorsBrowser stories smoke tests', () => {
  describe('AllVendors', () => {
    it('renders the back button', () => {
      render(<AllVendors />)
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    it('renders the Search toggle button', () => {
      render(<AllVendors />)
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    })
  })

  describe('WithSelections', () => {
    it('shows the selected vendor count', () => {
      render(<WithSelections />)
      expect(screen.getByText(/4 vendors selected/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: Run the updated smoke tests — confirm they pass**

```bash
(cd apps/web && pnpm test TemplateVendorsBrowser.stories.test)
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run the full verification gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All must pass with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/onboarding/TemplateVendorsBrowser/index.tsx \
        apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.tsx \
        apps/web/src/components/onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser.stories.test.tsx
git commit -m "refactor(onboarding): replace VendorCard with TemplateVendorRow in TemplateVendorsBrowser"
```

---

## Task 3: Remove `template` variant from `VendorCard`

**Files:**
- Modify: `apps/web/src/components/vendor/VendorCard/index.tsx`
- Modify: `apps/web/src/components/vendor/VendorCard/VendorCard.stories.tsx`
- Modify: `apps/web/src/components/vendor/VendorCard/VendorCard.stories.test.tsx`

- [ ] **Step 1: Update `VendorCard/index.tsx`**

Remove:
- `variant?: 'default' | 'template'` prop (entire prop — no other values remain)
- `selected?: boolean` prop
- `onToggle?: () => void` prop
- `variant = 'default'`, `selected = false`, `onToggle` destructure defaults
- `const isTemplate = variant === 'template'`
- The `{isTemplate && <Checkbox ... />}` block
- The `!isTemplate &&` guard on the item count span (keep the span, just remove the guard)
- The `!isTemplate &&` guard on the `<DeleteButton>` (keep the button, just remove the guard)

- [ ] **Step 2: Update `VendorCard.stories.tsx`**

Remove:
- `TemplateVariant` story export and its args
- `TemplateVariantSelected` story export and its args

- [ ] **Step 3: Update `VendorCard.stories.test.tsx`**

Remove:
- `TemplateVariant` and `TemplateVariantSelected` from the `composeStories` destructure
- The `'TemplateVariant renders vendor name'` test
- The `'TemplateVariantSelected renders vendor name'` test

- [ ] **Step 4: Run the smoke tests — confirm they pass**

```bash
(cd apps/web && pnpm test VendorCard.stories.test)
```

Expected: PASS — 3 tests pass (Default, WithItemCount, WithNoItems).

- [ ] **Step 5: Run the full verification gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

- [ ] **Step 6: Run E2E tests**

```bash
pnpm test:e2e --grep "onboarding|a11y"
```

All tests should pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/vendor/VendorCard/index.tsx \
        apps/web/src/components/vendor/VendorCard/VendorCard.stories.tsx \
        apps/web/src/components/vendor/VendorCard/VendorCard.stories.test.tsx
git commit -m "refactor(vendor): remove unused template variant from VendorCard"
```
