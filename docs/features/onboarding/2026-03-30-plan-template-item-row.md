# TemplateItemRow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ItemCard` in `TemplateItemsBrowser` with a purpose-built `TemplateItemRow` that renders `[checkbox outside card] [item name] [tag badges]` without any pantry/shopping/cooking overhead.

**Architecture:** A new co-located component `TemplateItemRow.tsx` handles the row layout; `TemplateItemsBrowser/index.tsx` is updated to use it, removing the `templateItemToItem` adapter, the `tagsVisible` state, and the Tags toggle button. Tags are always visible. After removing `ItemCard` (the only component that needed a router `<Link>`), the browser stories no longer need router context — only `QueryClientProvider` remains (for `TagBadge`'s `useItemCountByTag` hook).

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui (`Card`, `CardHeader`, `Checkbox`), existing `TagBadge` component, Vitest + React Testing Library + composeStories, Storybook

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.tsx` | Create | Row layout: checkbox outside card, name, tag badges |
| `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.tsx` | Create | Storybook stories for Unchecked / Checked states |
| `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.test.tsx` | Create | Smoke tests via composeStories |
| `apps/web/src/components/onboarding/TemplateItemsBrowser/index.tsx` | Modify | Swap ItemCard → TemplateItemRow, remove tagsVisible + Tags button + templateItemToItem |
| `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.tsx` | Modify | Simplify providers: drop router context, keep only QueryClientProvider |
| `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.test.tsx` | Modify | Remove Tags-toggle assertion; add Filters+Search assertion |

---

## Task 1: Create `TemplateItemRow` with stories and smoke tests

**Files:**
- Create: `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.tsx`
- Create: `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.tsx`
- Create: `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.test.tsx`

- [ ] **Step 1: Write the smoke test file (will fail — component doesn't exist yet)**

Create `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateItemRow.stories'

const { Unchecked, Checked } = composeStories(stories)

describe('TemplateItemRow stories smoke tests', () => {
  describe('Unchecked', () => {
    it('renders the item name', () => {
      render(<Unchecked />)
      expect(screen.getByText('Rice')).toBeInTheDocument()
    })
  })

  describe('Checked', () => {
    it('renders the checkbox as checked', () => {
      render(<Checked />)
      expect(
        screen.getByRole('checkbox', { name: /remove rice/i }),
      ).toBeChecked()
    })
  })
})
```

- [ ] **Step 2: Run the test — confirm it fails with "Cannot find module"**

```bash
(cd apps/web && pnpm test TemplateItemRow.stories.test)
```

Expected: FAIL — module `./TemplateItemRow.stories` not found.

- [ ] **Step 3: Create the component**

Create `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.tsx`:

```tsx
import { TagBadge } from '@/components/tag/TagBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { Tag, TagType } from '@/types'

interface TemplateItemRowProps {
  name: string
  tags: Tag[]
  tagTypes: TagType[]
  isChecked: boolean
  onToggle: () => void
}

export function TemplateItemRow({
  name,
  tags,
  tagTypes,
  isChecked,
  onToggle,
}: TemplateItemRowProps) {
  return (
    <div className="relative">
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggle}
        aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
        className="absolute -ml-10 mt-2"
      />
      <Card className="ml-10">
        <CardHeader className="flex flex-row items-center gap-2 min-h-8">
          <span className="flex-1 truncate min-w-0 capitalize">{name}</span>
          {tags.map((tag) => {
            const tagType = tagTypes.find((tt) => tt.id === tag.typeId)
            if (!tagType) return null
            return <TagBadge key={tag.id} tag={tag} tagType={tagType} />
          })}
        </CardHeader>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Create the stories file**

Create `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.tsx`:

```tsx
import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagColor } from '@/types'
import { TemplateItemRow } from './TemplateItemRow'

// TagBadge uses useItemCountByTag — requires QueryClientProvider.
// No router context needed (TemplateItemRow has no <Link>).
const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { queries: { retry: false } } })
    }
  >
    <Story />
  </QueryClientProvider>
)

const mockTagTypes = [
  { id: 'category', name: 'Category', color: TagColor.lime },
  { id: 'preservation', name: 'Preservation', color: TagColor.cyan },
]

const mockTags = [
  { id: 'grain', name: 'Grain', typeId: 'category' },
  { id: 'room-temperature', name: 'Room temperature', typeId: 'preservation' },
]

const meta: Meta<typeof TemplateItemRow> = {
  title: 'Components/Onboarding/TemplateItemRow',
  component: TemplateItemRow,
  decorators: [withQueryClient],
  args: {
    name: 'Rice',
    tags: [],
    tagTypes: mockTagTypes,
    isChecked: false,
    onToggle: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateItemRow>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: {
    isChecked: true,
    tags: mockTags,
  },
}
```

- [ ] **Step 5: Run the test — confirm it passes**

```bash
(cd apps/web && pnpm test TemplateItemRow.stories.test)
```

Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.tsx \
        apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.tsx \
        apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.stories.test.tsx
git commit -m "feat(onboarding): add TemplateItemRow component with stories and smoke tests"
```

---

## Task 2: Update `TemplateItemsBrowser` to use `TemplateItemRow`

**Files:**
- Modify: `apps/web/src/components/onboarding/TemplateItemsBrowser/index.tsx`
- Modify: `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.tsx`
- Modify: `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.test.tsx`

- [ ] **Step 1: Replace `index.tsx` with the updated version**

Full replacement for `apps/web/src/components/onboarding/TemplateItemsBrowser/index.tsx`:

```tsx
import { ArrowLeft, Check, Filter, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemFilters } from '@/components/item/ItemFilters'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type TemplateItem,
  type TemplateTag,
  templateItems,
  templateTags,
  templateTagTypes,
} from '@/data/template'
import { buildDepthFirstTagList } from '@/lib/tagUtils'
import type { Tag, TagColor, TagType } from '@/types'
import { TemplateItemRow } from './TemplateItemRow'

// ---------------------------------------------------------------------------
// Helpers — build mock tag/tagType data for ItemFilters and TemplateItemRow
// ---------------------------------------------------------------------------

function buildMockTag(templateTag: TemplateTag, resolvedName: string): Tag {
  return {
    id: templateTag.key,
    name: resolvedName,
    typeId: templateTag.typeKey,
    ...(templateTag.parentKey !== undefined
      ? { parentId: templateTag.parentKey }
      : {}),
  }
}

function buildMockTagType(key: string, name: string, color: TagColor): TagType {
  return { id: key, name, color }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateItemsBrowserProps {
  selectedKeys: Set<string>
  onSelectionChange: (keys: Set<string>) => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateItemsBrowser({
  selectedKeys,
  onSelectionChange,
  onBack,
}: TemplateItemsBrowserProps) {
  const { t } = useTranslation()

  // Unified filter state: tagTypeId → selected tag ids
  const [filterState, setFilterState] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')

  // Toggle visibility — all start closed
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)

  // ---------------------------------------------------------------------------
  // Build resolved mock tag & tagType data (translated)
  // ---------------------------------------------------------------------------
  const mockTagTypes: TagType[] = useMemo(
    () =>
      templateTagTypes.map((tt) =>
        buildMockTagType(tt.key, t(tt.i18nKey), tt.color),
      ),
    [t],
  )

  const mockTagMap = useMemo(
    () =>
      new Map<string, Tag>(
        templateTags.map((tag) => [tag.key, buildMockTag(tag, t(tag.i18nKey))]),
      ),
    [t],
  )

  const mockTags: Tag[] = useMemo(
    () => templateTags.map((tag) => buildMockTag(tag, t(tag.i18nKey))),
    [t],
  )

  const mockTagsWithDepth = useMemo(
    () => buildDepthFirstTagList(mockTags),
    [mockTags],
  )

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()

    return templateItems.filter((item) => {
      if (q) {
        const name = t(item.i18nKey).toLowerCase()
        if (!name.includes(q)) return false
      }

      for (const [tagTypeId, selectedTagIds] of Object.entries(filterState)) {
        if (selectedTagIds.length === 0) continue

        const hasMatch = item.tagKeys.some((k) => {
          if (selectedTagIds.includes(k)) return true
          const tag = templateTags.find((tt) => tt.key === k)
          if (!tag || tag.typeKey !== tagTypeId) return false
          let parent = tag.parentKey
          while (parent !== undefined) {
            if (selectedTagIds.includes(parent)) return true
            const parentTag = templateTags.find((tt) => tt.key === parent)
            parent = parentTag?.parentKey
          }
          return false
        })
        if (!hasMatch) return false
      }

      return true
    })
  }, [search, filterState, t])

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------
  const handleSelectAllVisible = () => {
    const next = new Set(selectedKeys)
    for (const item of visibleItems) {
      next.add(item.key)
    }
    onSelectionChange(next)
  }

  const handleClearSelection = () => {
    onSelectionChange(new Set())
  }

  const handleClearFilters = () => {
    setFilterState({})
    setSearch('')
  }

  const isFiltered =
    Object.values(filterState).some((ids) => ids.length > 0) || !!search.trim()

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
          {t('onboarding.itemsBrowser.selected', {
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
          {t('onboarding.itemsBrowser.clearSelection')}
        </Button>
      </Toolbar>

      {/* Row 2: Filters / Search / Select All */}
      <Toolbar className="bg-transparent border-none">
        <Button
          size="icon"
          variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => setFiltersVisible((v) => !v)}
          aria-label={t('common.filters')}
          className="lg:w-auto lg:px-3"
        >
          <Filter />
          <span className="hidden lg:inline">{t('common.filters')}</span>
        </Button>

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
          {t('onboarding.itemsBrowser.selectAll')}
        </Button>
      </Toolbar>

      {/* Filters panel (conditional) */}
      {filtersVisible && (
        <>
          <div className="h-px bg-accessory-default" />
          <ItemFilters
            items={[]}
            tagTypes={mockTagTypes}
            tags={mockTags}
            tagsWithDepth={mockTagsWithDepth}
            filterState={filterState}
            onFilterStateChange={setFilterState}
            hideVendorFilter
            hideRecipeFilter
            hideEditTagsLink
          />
        </>
      )}

      {/* Filter status (conditional) */}
      {isFiltered && (
        <>
          <div className="h-px bg-accessory-default" />
          <div className="flex items-center justify-between gap-2 px-3 py-1">
            <span className="text-xs text-foreground-muted">
              {t('onboarding.itemsBrowser.showing', {
                count: visibleItems.length,
                total: templateItems.length,
              })}
            </span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              {t('onboarding.itemsBrowser.clearFilter')}
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
              placeholder={t('onboarding.itemsBrowser.title')}
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

      {/* Item list */}
      <div className="flex-1 mb-2 space-y-px">
        {visibleItems.map((templateItem) => {
          const resolvedName = t(templateItem.i18nKey)
          const tags = templateItem.tagKeys
            .map((key) => mockTagMap.get(key))
            .filter((tag): tag is Tag => tag !== undefined)
          const isChecked = selectedKeys.has(templateItem.key)

          return (
            <TemplateItemRow
              key={templateItem.key}
              name={resolvedName}
              tags={tags}
              tagTypes={mockTagTypes}
              isChecked={isChecked}
              onToggle={() => {
                const next = new Set(selectedKeys)
                if (isChecked) {
                  next.delete(templateItem.key)
                } else {
                  next.add(templateItem.key)
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

Note: `items={[]}` is passed to `ItemFilters` — the mock items are only needed for vendor/recipe filter counts, which are both hidden (`hideVendorFilter hideRecipeFilter`). Tag filtering runs against `templateItems` directly in the browser's own filter logic.

- [ ] **Step 2: Update `TemplateItemsBrowser.stories.tsx` — remove router context**

Full replacement for `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.tsx`:

```tsx
import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateItemsBrowser } from '.'

// TemplateItemRow uses TagBadge which calls useItemCountByTag — needs QueryClient.
// Router context is no longer needed (TemplateItemRow has no <Link>).
const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { queries: { retry: false } } })
    }
  >
    <Story />
  </QueryClientProvider>
)

const meta: Meta<typeof TemplateItemsBrowser> = {
  title: 'Components/Onboarding/TemplateItemsBrowser',
  component: TemplateItemsBrowser,
  decorators: [withQueryClient],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSelectionChange: () => {},
    onBack: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateItemsBrowser>

export const AllItems: Story = {
  args: {
    selectedKeys: new Set(),
  },
}

export const WithSelections: Story = {
  args: {
    selectedKeys: new Set(['rice', 'eggs', 'milk', 'toothpaste', 'dish-soap']),
  },
}
```

- [ ] **Step 3: Update `TemplateItemsBrowser.stories.test.tsx` — remove Tags-toggle assertion**

Full replacement for `apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateItemsBrowser.stories'

const { AllItems, WithSelections } = composeStories(stories)

describe('TemplateItemsBrowser stories smoke tests', () => {
  describe('AllItems', () => {
    it('renders the back button', () => {
      render(<AllItems />)
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    it('renders Filters and Search toggle buttons', () => {
      render(<AllItems />)
      expect(
        screen.getByRole('button', { name: 'Filters' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    })
  })

  describe('WithSelections', () => {
    it('shows the selected item count', () => {
      render(<WithSelections />)
      expect(screen.getByText(/5 items selected/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: Run the updated smoke tests — confirm they pass**

```bash
(cd apps/web && pnpm test TemplateItemsBrowser.stories.test)
```

Expected: PASS — 3 tests pass (back button, Filters+Search toggles, item count).

- [ ] **Step 5: Run the full verification gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All must pass with no errors.

- [ ] **Step 6: Run E2E tests**

```bash
pnpm test:e2e --grep "onboarding|a11y"
```

The onboarding E2E tests use `getByRole('checkbox', { name: /^Add /i })` which still matches — `TemplateItemRow` uses the same aria-label pattern as `ItemCard`. All tests should pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/onboarding/TemplateItemsBrowser/index.tsx \
        apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.tsx \
        apps/web/src/components/onboarding/TemplateItemsBrowser/TemplateItemsBrowser.stories.test.tsx
git commit -m "refactor(onboarding): replace ItemCard with TemplateItemRow in TemplateItemsBrowser"
```
