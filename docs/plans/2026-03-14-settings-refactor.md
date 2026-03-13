# Settings Page Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the inline Theme, Language, Export, and nav-link cards from `settings/index.tsx` into standalone components, each with Storybook stories and unit tests, following the existing `DataModeCard` pattern.

**Architecture:** Four new components are added to `src/components/settings/`: `ThemeCard`, `LanguageCard`, `ExportCard` (each use hooks internally), and `SettingsNavCard` (purely presentational, props-driven). The page becomes a thin composition with no inline card JSX. Existing theme tests from `settings/index.test.tsx` move to `ThemeCard/index.test.tsx`.

**Tech Stack:** React 19, TypeScript strict, Vitest + React Testing Library, Storybook, TanStack Router (`Link`), react-i18next (`useTranslation`), shadcn/ui (`Card`, `Button`, `Select`), Lucide icons.

---

### Task 1: SettingsNavCard component

**Files:**
- Create: `apps/web/src/components/settings/SettingsNavCard/index.tsx`
- Create: `apps/web/src/components/settings/SettingsNavCard/index.test.tsx`
- Create: `apps/web/src/components/settings/SettingsNavCard/index.stories.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/settings/SettingsNavCard/index.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Tags } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNavCard } from '.'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode
      to: string
      [key: string]: unknown
    }) => <a href={to} {...props}>{children}</a>,
  }
})

describe('SettingsNavCard', () => {
  const defaultProps = {
    icon: Tags,
    label: 'Tags',
    description: 'Manage your tags',
    to: '/settings/tags',
  }

  it('renders label and description', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then label and description are shown
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Manage your tags')).toBeInTheDocument()
  })

  it('renders as a link to the correct route', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then it links to the correct route
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/settings/tags')
  })

  it('renders a chevron icon', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then the card renders (chevron is a decorative svg, confirm card is present)
    expect(screen.getByText('Tags').closest('a')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
(cd apps/web && pnpm test src/components/settings/SettingsNavCard/index.test.tsx)
```

Expected: FAIL — `Cannot find module '.'`

**Step 3: Implement the component**

Create `apps/web/src/components/settings/SettingsNavCard/index.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface SettingsNavCardProps {
  icon: LucideIcon
  label: string
  description: string
  to: string
}

export function SettingsNavCard({
  icon: Icon,
  label,
  description,
  to,
}: SettingsNavCardProps) {
  return (
    <Link to={to} className="block">
      <Card>
        <CardContent className="px-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-foreground-muted" />
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-sm text-foreground-muted">{description}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-foreground-muted" />
        </CardContent>
      </Card>
    </Link>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
(cd apps/web && pnpm test src/components/settings/SettingsNavCard/index.test.tsx)
```

Expected: PASS (3 tests)

**Step 5: Write Storybook stories**

Create `apps/web/src/components/settings/SettingsNavCard/index.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { CookingPot, Store, Tags } from 'lucide-react'
import { routeTree } from '@/routeTree.gen'
import { SettingsNavCard } from '.'

// SettingsNavCard uses TanStack Router's Link, which requires a router context.
// Wrap with RouterProvider using a memory history so links render correctly.

function withRouter(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
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

const meta: Meta<typeof SettingsNavCard> = {
  title: 'Settings/SettingsNavCard',
  component: SettingsNavCard,
  decorators: [
    (Story, context) =>
      withRouter(<Story {...context.args} />),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof SettingsNavCard>

export const TagsLink: Story = {
  args: {
    icon: Tags,
    label: 'Tags',
    description: 'Manage your tags',
    to: '/settings/tags',
  },
}

export const VendorsLink: Story = {
  args: {
    icon: Store,
    label: 'Vendors',
    description: 'Manage vendors',
    to: '/settings/vendors',
  },
}

export const RecipesLink: Story = {
  args: {
    icon: CookingPot,
    label: 'Recipes',
    description: 'Manage your recipes',
    to: '/settings/recipes',
  },
}
```

**Step 6: Commit**

```bash
git add apps/web/src/components/settings/SettingsNavCard/
git commit -m "feat(settings): add SettingsNavCard component with stories and tests"
```

---

### Task 2: ThemeCard component (move existing tests)

**Files:**
- Create: `apps/web/src/components/settings/ThemeCard/index.tsx`
- Create: `apps/web/src/components/settings/ThemeCard/index.test.tsx`
- Create: `apps/web/src/components/settings/ThemeCard/index.stories.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/settings/ThemeCard/index.test.tsx` by moving all theme tests from `settings/index.test.tsx`. These are the tests in the `'Settings Page'` describe block that test theme behavior:

```tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeCard } from '.'

vi.mock('@/hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({
    preference: 'system',
    theme: 'light',
    setPreference: vi.fn(),
  })),
}))

const { useTheme } = await import('@/hooks/useTheme')

describe('ThemeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders theme control card', () => {
    // Given the theme card
    render(<ThemeCard />)

    // Then the card heading and description are shown
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(
      screen.getByText('Choose light, dark, or system theme'),
    ).toBeInTheDocument()
  })

  it('renders all three theme buttons', () => {
    // Given the theme card
    render(<ThemeCard />)

    // Then all three preference buttons are rendered
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
  })

  it('displays sun icon when theme is light', () => {
    // Given light theme
    vi.mocked(useTheme).mockReturnValue({
      preference: 'light',
      theme: 'light',
      setPreference: vi.fn(),
    })

    render(<ThemeCard />)

    // Then the card renders (sun icon is a decorative svg)
    expect(screen.getByText('Theme').closest('[class*="px-"]')).toBeInTheDocument()
  })

  it('displays moon icon when theme is dark', () => {
    // Given dark theme
    vi.mocked(useTheme).mockReturnValue({
      preference: 'dark',
      theme: 'dark',
      setPreference: vi.fn(),
    })

    render(<ThemeCard />)

    // Then the card renders (moon icon is a decorative svg)
    expect(screen.getByText('Theme').closest('[class*="px-"]')).toBeInTheDocument()
  })

  it('user can select light theme', async () => {
    // Given system preference
    const setPreference = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      preference: 'system',
      theme: 'light',
      setPreference,
    })
    render(<ThemeCard />)
    const user = userEvent.setup()

    // When user clicks Light button
    await user.click(screen.getByRole('button', { name: 'Light' }))

    // Then setPreference is called with 'light'
    expect(setPreference).toHaveBeenCalledWith('light')
  })

  it('user can select system theme', async () => {
    // Given light preference
    const setPreference = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      preference: 'light',
      theme: 'light',
      setPreference,
    })
    render(<ThemeCard />)
    const user = userEvent.setup()

    // When user clicks System button
    await user.click(screen.getByRole('button', { name: 'System' }))

    // Then setPreference is called with 'system'
    expect(setPreference).toHaveBeenCalledWith('system')
  })

  it('user can select dark theme', async () => {
    // Given system preference
    const setPreference = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      preference: 'system',
      theme: 'light',
      setPreference,
    })
    render(<ThemeCard />)
    const user = userEvent.setup()

    // When user clicks Dark button
    await user.click(screen.getByRole('button', { name: 'Dark' }))

    // Then setPreference is called with 'dark'
    expect(setPreference).toHaveBeenCalledWith('dark')
  })

  it('highlights active preference button', () => {
    // Given dark preference
    vi.mocked(useTheme).mockReturnValue({
      preference: 'dark',
      theme: 'dark',
      setPreference: vi.fn(),
    })

    render(<ThemeCard />)

    // Then dark button is filled and others are outlined
    const darkButton = screen.getByRole('button', { name: 'Dark' })
    const lightButton = screen.getByRole('button', { name: 'Light' })
    const systemButton = screen.getByRole('button', { name: 'System' })

    expect(darkButton.className).toContain('bg-neutral')
    expect(darkButton.className).toContain('border-transparent')
    expect(lightButton.className).toContain('border-neutral')
    expect(lightButton.className).not.toContain('bg-neutral')
    expect(systemButton.className).toContain('border-neutral')
    expect(systemButton.className).not.toContain('bg-neutral')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
(cd apps/web && pnpm test src/components/settings/ThemeCard/index.test.tsx)
```

Expected: FAIL — `Cannot find module '.'`

**Step 3: Implement the component**

Create `apps/web/src/components/settings/ThemeCard/index.tsx` — extract verbatim from `settings/index.tsx` lines 53–95:

```tsx
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTheme } from '@/hooks/useTheme'

export function ThemeCard() {
  const { preference, theme, setPreference } = useTheme()
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="px-3 pb-1 space-y-2">
        <div className="flex items-center gap-3">
          {theme === 'dark' ? (
            <Moon className="h-5 w-5 text-foreground-muted" />
          ) : (
            <Sun className="h-5 w-5 text-foreground-muted" />
          )}
          <div>
            <p className="font-medium">{t('settings.theme.label')}</p>
            <p className="text-sm text-foreground-muted">
              {t('settings.theme.description')}
            </p>
          </div>
        </div>

        <div className="flex">
          <Button
            variant={preference === 'light' ? 'neutral' : 'neutral-outline'}
            onClick={() => setPreference('light')}
            className="flex-1 rounded-tr-none rounded-br-none"
          >
            {t('settings.theme.light')}
          </Button>
          <Button
            variant={
              preference === 'system' ? 'neutral' : 'neutral-outline'
            }
            onClick={() => setPreference('system')}
            className="flex-1 rounded-none -ml-px -mr-px"
          >
            {t('settings.theme.system')}
          </Button>
          <Button
            variant={preference === 'dark' ? 'neutral' : 'neutral-outline'}
            onClick={() => setPreference('dark')}
            className="flex-1 rounded-tl-none rounded-bl-none"
          >
            {t('settings.theme.dark')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
(cd apps/web && pnpm test src/components/settings/ThemeCard/index.test.tsx)
```

Expected: PASS (8 tests)

**Step 5: Write Storybook stories**

Create `apps/web/src/components/settings/ThemeCard/index.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ThemeCard } from '.'

const meta: Meta<typeof ThemeCard> = {
  title: 'Settings/ThemeCard',
  component: ThemeCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ThemeCard>

export const LightPreference: Story = {
  beforeEach() {
    localStorage.setItem('theme-preference', 'light')
    return () => localStorage.removeItem('theme-preference')
  },
}

export const DarkPreference: Story = {
  beforeEach() {
    localStorage.setItem('theme-preference', 'dark')
    return () => localStorage.removeItem('theme-preference')
  },
}

export const SystemPreference: Story = {
  beforeEach() {
    localStorage.removeItem('theme-preference')
  },
}
```

**Step 6: Commit**

```bash
git add apps/web/src/components/settings/ThemeCard/
git commit -m "feat(settings): add ThemeCard component with stories and tests"
```

---

### Task 3: LanguageCard component

**Files:**
- Create: `apps/web/src/components/settings/LanguageCard/index.tsx`
- Create: `apps/web/src/components/settings/LanguageCard/index.test.tsx`
- Create: `apps/web/src/components/settings/LanguageCard/index.stories.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/settings/LanguageCard/index.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageCard } from '.'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: vi.fn(() => ({
    preference: 'auto',
    language: 'en',
    setPreference: vi.fn(),
  })),
}))

const { useLanguage } = await import('@/hooks/useLanguage')

describe('LanguageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders language control card', () => {
    // Given the language card
    render(<LanguageCard />)

    // Then the label is shown
    expect(screen.getByText('Language')).toBeInTheDocument()
  })

  it('shows auto-detected description when preference is auto', () => {
    // Given auto preference detecting English
    vi.mocked(useLanguage).mockReturnValue({
      preference: 'auto',
      language: 'en',
      setPreference: vi.fn(),
    })
    render(<LanguageCard />)

    // Then auto-detected description is shown
    expect(
      screen.getByText(/Auto-detected:/i),
    ).toBeInTheDocument()
  })

  it('shows generic description when preference is explicit', () => {
    // Given explicit English preference
    vi.mocked(useLanguage).mockReturnValue({
      preference: 'en',
      language: 'en',
      setPreference: vi.fn(),
    })
    render(<LanguageCard />)

    // Then the generic description is shown
    expect(
      screen.getByText('Choose your preferred language'),
    ).toBeInTheDocument()
  })

  it('renders language select with current preference', () => {
    // Given Traditional Chinese preference
    vi.mocked(useLanguage).mockReturnValue({
      preference: 'tw',
      language: 'tw',
      setPreference: vi.fn(),
    })
    render(<LanguageCard />)

    // Then the select displays the current value
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
(cd apps/web && pnpm test src/components/settings/LanguageCard/index.test.tsx)
```

Expected: FAIL — `Cannot find module '.'`

**Step 3: Implement the component**

Create `apps/web/src/components/settings/LanguageCard/index.tsx` — extract verbatim from `settings/index.tsx` lines 97–136:

```tsx
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/hooks/useLanguage'
import type { LanguagePreference } from '@/lib/language'

export function LanguageCard() {
  const { preference, language, setPreference } = useLanguage()
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="px-3 pb-1 space-y-2">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-foreground-muted" />
          <div>
            <p className="font-medium">{t('settings.language.label')}</p>
            <p className="text-sm text-foreground-muted">
              {preference === 'auto'
                ? t('settings.language.autoDetected', {
                    language: t(`settings.language.languages.${language}`),
                  })
                : t('settings.language.description')}
            </p>
          </div>
        </div>

        <Select
          value={preference}
          onValueChange={(val) =>
            setPreference(val as LanguagePreference)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              {t('settings.language.auto')}
            </SelectItem>
            <SelectItem value="en">
              {t('settings.language.languages.en')}
            </SelectItem>
            <SelectItem value="tw">
              {t('settings.language.languages.tw')}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
(cd apps/web && pnpm test src/components/settings/LanguageCard/index.test.tsx)
```

Expected: PASS (4 tests)

**Step 5: Write Storybook stories**

Create `apps/web/src/components/settings/LanguageCard/index.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { LANGUAGE_STORAGE_KEY } from '@/lib/language'
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

export const AutoLanguage: Story = {
  beforeEach() {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  },
}

export const ExplicitEnglish: Story = {
  beforeEach() {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    return () => localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  },
}

export const ExplicitChineseTraditional: Story = {
  beforeEach() {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')
    return () => localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  },
}
```

**Step 6: Commit**

```bash
git add apps/web/src/components/settings/LanguageCard/
git commit -m "feat(settings): add LanguageCard component with stories and tests"
```

---

### Task 4: ExportCard component

**Files:**
- Create: `apps/web/src/components/settings/ExportCard/index.tsx`
- Create: `apps/web/src/components/settings/ExportCard/index.test.tsx`
- Create: `apps/web/src/components/settings/ExportCard/index.stories.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/settings/ExportCard/index.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportCard } from '.'

vi.mock('@/lib/exportData', () => ({
  exportAllData: vi.fn(),
}))

const { exportAllData } = await import('@/lib/exportData')

describe('ExportCard', () => {
  it('renders export card', () => {
    // Given the export card
    render(<ExportCard />)

    // Then label, description, and button are shown
    expect(screen.getByText('Download my data')).toBeInTheDocument()
    expect(
      screen.getByText('Export all local data as a JSON backup'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('user can click download button to export data', async () => {
    // Given the export card
    render(<ExportCard />)
    const user = userEvent.setup()

    // When user clicks the Download button
    await user.click(screen.getByRole('button', { name: 'Download' }))

    // Then exportAllData is called
    expect(exportAllData).toHaveBeenCalledOnce()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
(cd apps/web && pnpm test src/components/settings/ExportCard/index.test.tsx)
```

Expected: FAIL — `Cannot find module '.'`

**Step 3: Implement the component**

Create `apps/web/src/components/settings/ExportCard/index.tsx` — extract verbatim from `settings/index.tsx` lines 144–160:

```tsx
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { exportAllData } from '@/lib/exportData'

export function ExportCard() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="px-3 flex items-center gap-3">
        <Download className="h-5 w-5 text-foreground-muted" />
        <div className="flex-1">
          <p className="font-medium">{t('settings.export.label')}</p>
          <p className="text-sm text-foreground-muted">
            {t('settings.export.description')}
          </p>
        </div>
        <Button variant="neutral-outline" onClick={exportAllData}>
          {t('settings.export.button')}
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
(cd apps/web && pnpm test src/components/settings/ExportCard/index.test.tsx)
```

Expected: PASS (2 tests)

**Step 5: Write Storybook stories**

Create `apps/web/src/components/settings/ExportCard/index.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ExportCard } from '.'

const meta: Meta<typeof ExportCard> = {
  title: 'Settings/ExportCard',
  component: ExportCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ExportCard>

export const Default: Story = {}
```

**Step 6: Commit**

```bash
git add apps/web/src/components/settings/ExportCard/
git commit -m "feat(settings): add ExportCard component with stories and tests"
```

---

### Task 5: Update `settings/index.tsx` to use new components

**Files:**
- Modify: `apps/web/src/routes/settings/index.tsx`

**Step 1: Replace the settings page with the thin composition**

Replace the full content of `apps/web/src/routes/settings/index.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { CookingPot, Store, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataModeCard } from '@/components/settings/DataModeCard'
import { ExportCard } from '@/components/settings/ExportCard'
import { FamilyGroupCard } from '@/components/settings/FamilyGroupCard'
import { LanguageCard } from '@/components/settings/LanguageCard'
import { SettingsNavCard } from '@/components/settings/SettingsNavCard'
import { ThemeCard } from '@/components/settings/ThemeCard'
import { Toolbar } from '@/components/Toolbar'
import { useDataMode } from '@/hooks/useDataMode'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  const { mode } = useDataMode()
  const { t } = useTranslation()

  return (
    <div>
      <Toolbar>
        <h1 className="px-3 py-2">{t('settings.title')}</h1>
      </Toolbar>

      <div className="space-y-px">
        <ThemeCard />
        <LanguageCard />
        <DataModeCard />
        {mode === 'cloud' && <FamilyGroupCard />}
        {mode === 'local' && <ExportCard />}
        <SettingsNavCard
          icon={Tags}
          label={t('settings.tags.label')}
          description={t('settings.tags.description')}
          to="/settings/tags"
        />
        <SettingsNavCard
          icon={Store}
          label={t('settings.vendors.label')}
          description={t('settings.vendors.description')}
          to="/settings/vendors"
        />
        <SettingsNavCard
          icon={CookingPot}
          label={t('settings.recipes.label')}
          description={t('settings.recipes.description')}
          to="/settings/recipes"
        />
      </div>
    </div>
  )
}
```

**Step 2: Run the full test suite to check nothing broke**

```bash
(cd apps/web && pnpm test)
```

Expected: All tests pass (the theme tests in `index.test.tsx` still exist — they'll fail if the mocks no longer match; that's expected — they get cleaned up in Task 6)

**Step 3: Commit**

```bash
git add apps/web/src/routes/settings/index.tsx
git commit -m "refactor(settings): slim settings page to thin composition of extracted cards"
```

---

### Task 6: Clean up `settings/index.test.tsx`

**Files:**
- Modify: `apps/web/src/routes/settings/index.test.tsx`

**Step 1: Replace with a minimal smoke test**

The theme tests have moved to `ThemeCard/index.test.tsx`. The vendors link card test is covered by `SettingsNavCard/index.test.tsx`. Replace the full content of `apps/web/src/routes/settings/index.test.tsx` with a single smoke test that confirms the page composes correctly:

```tsx
import { render, screen } from '@testing-library/react'
import type * as React from 'react'
import { beforeEach, describe, it, vi } from 'vitest'

// Mock all child cards so the page test stays focused on composition only
vi.mock('@/components/settings/ThemeCard', () => ({
  ThemeCard: () => <div data-testid="theme-card" />,
}))
vi.mock('@/components/settings/LanguageCard', () => ({
  LanguageCard: () => <div data-testid="language-card" />,
}))
vi.mock('@/components/settings/DataModeCard', () => ({
  DataModeCard: () => <div data-testid="data-mode-card" />,
}))
vi.mock('@/components/settings/FamilyGroupCard', () => ({
  FamilyGroupCard: () => <div data-testid="family-group-card" />,
}))
vi.mock('@/components/settings/ExportCard', () => ({
  ExportCard: () => <div data-testid="export-card" />,
}))
vi.mock('@/components/settings/SettingsNavCard', () => ({
  SettingsNavCard: ({ label }: { label: string }) => (
    <div data-testid="settings-nav-card">{label}</div>
  ),
}))
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      children,
      ...props
    }: {
      children: React.ReactNode
      [key: string]: unknown
    }) => <a {...props}>{children}</a>,
  }
})

import { Route } from './index'

const Settings = Route.options.component as () => JSX.Element

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the settings page title', () => {
    // Given the settings page
    render(<Settings />)

    // Then the title is shown
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders all three nav cards', () => {
    // Given the settings page
    render(<Settings />)

    // Then Tags, Vendors, Recipes nav cards are rendered (via mocked SettingsNavCard)
    const navCards = screen.getAllByTestId('settings-nav-card')
    expect(navCards).toHaveLength(3)
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Recipes')).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test src/routes/settings/index.test.tsx)
```

Expected: PASS (2 tests)

**Step 3: Run the full test suite**

```bash
(cd apps/web && pnpm test)
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/web/src/routes/settings/index.test.tsx
git commit -m "refactor(settings): update settings page test to composition smoke test"
```

---

### Task 7: Verification gate

**Step 1: Run the full quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All four commands must pass and `grep` must return no matches.

**Step 2: Fix any issues before proceeding**

If any command fails, fix the errors and re-run. Do not proceed until everything is green.

**Step 3: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(settings): address quality gate issues"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Shared Components section in CLAUDE.md**

The `DataModeCard` and `FamilyGroupCard` entries are already documented. Add entries for the four new components under the existing "Shared Components" section — or add a "Settings Cards" subsection if it's cleaner. Include:

- `ThemeCard` — standalone theme selector card; uses `useTheme`
- `LanguageCard` — standalone language selector card; uses `useLanguage`
- `ExportCard` — download-data card for local mode; calls `exportAllData()`
- `SettingsNavCard` — nav link card for settings list items; props: `icon`, `label`, `description`, `to`

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(settings): document new settings card components in CLAUDE.md"
```
