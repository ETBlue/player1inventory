# Inline Import Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `OnboardingProgress` full-screen step. Instead, trigger the import mutation directly from `TemplateOverview`, show a loading spinner on the Confirm button, auto-navigate to `/` on success, and show an inline error message with retry on failure.

---

## File Structure

| File | Action |
|------|--------|
| `apps/web/src/components/onboarding/TemplateOverview/index.tsx` | Modify — add `isLoading`, `error` props |
| `apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.tsx` | Modify — add `Loading`, `WithError` stories |
| `apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.test.tsx` | Modify — fix stale heading + add new smoke tests |
| `apps/web/src/i18n/locales/en.json` | Modify — add `importError` key |
| `apps/web/src/i18n/locales/tw.json` | Modify — add `importError` key |
| `apps/web/src/routes/onboarding.tsx` | Modify — remove progress step, wire mutation inline |
| `apps/web/src/components/onboarding/OnboardingProgress/index.tsx` | Delete |
| `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.tsx` | Delete |
| `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.test.tsx` | Delete |
| `e2e/pages/OnboardingPage.ts` | Modify — remove progress methods, add `waitForPantryPage` |
| `e2e/tests/onboarding.spec.ts` | Modify — rewrite template completion test |

---

## Task 1: Update `TemplateOverview` with loading/error UI + i18n

**Files:**
- Modify: `apps/web/src/components/onboarding/TemplateOverview/index.tsx`
- Modify: `apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.tsx`
- Modify: `apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/tw.json`

- [ ] **Step 1: Add `importError` i18n keys**

In `apps/web/src/i18n/locales/en.json`, add inside `onboarding.templateOverview`:
```json
"importError": "Something went wrong. Please try again."
```

In `apps/web/src/i18n/locales/tw.json`, add inside `onboarding.templateOverview`:
```json
"importError": "匯入失敗，請再試一次。"
```

- [ ] **Step 2: Update `TemplateOverview/index.tsx`**

Read the file first. Then apply these changes:

1. Add `Loader2` to the lucide-react import.
2. Add `isLoading?: boolean` and `error?: Error | null` to `TemplateOverviewProps`.
3. Add both to the destructure with defaults `isLoading = false, error = null`.
4. Update the Confirm button — disabled when `isConfirmDisabled || isLoading`, show spinner when loading:

```tsx
<Button
  type="button"
  variant="primary"
  className="flex-1"
  onClick={onConfirm}
  disabled={isConfirmDisabled || isLoading}
>
  {isLoading ? (
    <Loader2 className="animate-spin" />
  ) : (
    <Check />
  )}
  {t('onboarding.templateOverview.confirm')}
</Button>
```

5. Add inline error message below the action buttons div (when `error` is non-null):

```tsx
{error && (
  <p className="text-sm text-destructive text-center">
    {t('onboarding.templateOverview.importError')}
  </p>
)}
```

- [ ] **Step 3: Update `TemplateOverview.stories.tsx`**

Add two new stories after `SomeSelected`:

```tsx
export const Loading: Story = {
  args: {
    selectedItemCount: 12,
    selectedVendorCount: 4,
    isLoading: true,
  },
}

export const WithError: Story = {
  args: {
    selectedItemCount: 12,
    selectedVendorCount: 4,
    error: new Error('Import failed'),
  },
}
```

- [ ] **Step 4: Update `TemplateOverview.stories.test.tsx`**

Full replacement (fixes stale heading `'Set up your pantry'` → `'Choose from template'`, adds new smoke tests):

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateOverview.stories'

const { NothingSelected, SomeSelected, Loading, WithError } =
  composeStories(stories)

describe('TemplateOverview stories smoke tests', () => {
  describe('NothingSelected', () => {
    it('renders the heading', () => {
      render(<NothingSelected />)
      expect(
        screen.getByRole('heading', { name: 'Choose from template' }),
      ).toBeInTheDocument()
    })
  })

  describe('SomeSelected', () => {
    it('renders the heading', () => {
      render(<SomeSelected />)
      expect(
        screen.getByRole('heading', { name: 'Choose from template' }),
      ).toBeInTheDocument()
    })
  })

  describe('Loading', () => {
    it('renders the Confirm button as disabled', () => {
      render(<Loading />)
      expect(
        screen.getByRole('button', { name: /confirm/i }),
      ).toBeDisabled()
    })
  })

  describe('WithError', () => {
    it('renders the error message', () => {
      render(<WithError />)
      expect(
        screen.getByText(/something went wrong/i),
      ).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 5: Run smoke tests**

```bash
(cd apps/web && pnpm test TemplateOverview.stories.test)
```

Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web/src/components/onboarding/TemplateOverview/index.tsx \
  apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.tsx \
  apps/web/src/components/onboarding/TemplateOverview/TemplateOverview.stories.test.tsx \
  apps/web/src/i18n/locales/en.json \
  apps/web/src/i18n/locales/tw.json
git commit -m "feat(onboarding): add loading and error states to TemplateOverview"
```

---

## Task 2: Update `onboarding.tsx`, delete `OnboardingProgress`, update E2E

**Files:**
- Modify: `apps/web/src/routes/onboarding.tsx`
- Delete: `apps/web/src/components/onboarding/OnboardingProgress/index.tsx`
- Delete: `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.tsx`
- Delete: `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.test.tsx`
- Modify: `e2e/pages/OnboardingPage.ts`
- Modify: `e2e/tests/onboarding.spec.ts`

- [ ] **Step 1: Replace `onboarding.tsx`**

Full replacement:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OnboardingWelcome } from '@/components/onboarding/OnboardingWelcome'
import { TemplateItemsBrowser } from '@/components/onboarding/TemplateItemsBrowser'
import { TemplateOverview } from '@/components/onboarding/TemplateOverview'
import { TemplateVendorsBrowser } from '@/components/onboarding/TemplateVendorsBrowser'
import { templateItems, templateVendors } from '@/data/template'
import { useOnboardingSetup } from '@/hooks'

// Step state machine for the onboarding flow
type OnboardingStep =
  | { type: 'welcome' }
  | { type: 'template-overview' }
  | { type: 'items-browser' }
  | { type: 'vendors-browser' }

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>({
    type: 'welcome',
  })
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(
    new Set(),
  )
  const [selectedVendorKeys, setSelectedVendorKeys] = useState<Set<string>>(
    new Set(),
  )
  const setupMutation = useOnboardingSetup()

  const handleNavigate = (step: OnboardingStep) => {
    setCurrentStep(step)
  }

  // Auto-navigate to pantry when import completes
  useEffect(() => {
    if (setupMutation.isSuccess) {
      localStorage.removeItem('onboarding-dismissed')
      navigate({ to: '/' })
    }
  }, [setupMutation.isSuccess, navigate])

  return (
    <div className="min-h-screen">
      {currentStep.type === 'welcome' && (
        <OnboardingWelcome
          onChooseTemplate={() => handleNavigate({ type: 'template-overview' })}
          onStartFromScratch={() => {
            localStorage.setItem('onboarding-dismissed', 'true')
            navigate({ to: '/' })
          }}
        />
      )}
      {currentStep.type === 'template-overview' && (
        <TemplateOverview
          selectedItemCount={selectedItemKeys.size}
          selectedVendorCount={selectedVendorKeys.size}
          totalItemCount={templateItems.length}
          totalVendorCount={templateVendors.length}
          onEditItems={() => handleNavigate({ type: 'items-browser' })}
          onEditVendors={() => handleNavigate({ type: 'vendors-browser' })}
          onBack={() => handleNavigate({ type: 'welcome' })}
          onConfirm={() => {
            setupMutation.mutate({
              itemKeys: [...selectedItemKeys],
              vendorKeys: [...selectedVendorKeys],
            })
          }}
          isLoading={setupMutation.isPending}
          error={setupMutation.isError ? (setupMutation.error as Error) : null}
        />
      )}
      {currentStep.type === 'items-browser' && (
        <TemplateItemsBrowser
          selectedKeys={selectedItemKeys}
          onSelectionChange={setSelectedItemKeys}
          onBack={() => handleNavigate({ type: 'template-overview' })}
        />
      )}
      {currentStep.type === 'vendors-browser' && (
        <TemplateVendorsBrowser
          selectedKeys={selectedVendorKeys}
          onSelectionChange={setSelectedVendorKeys}
          onBack={() => handleNavigate({ type: 'template-overview' })}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete `OnboardingProgress` files**

```bash
rm apps/web/src/components/onboarding/OnboardingProgress/index.tsx
rm apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.tsx
rm apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.test.tsx
```

- [ ] **Step 3: Update `e2e/pages/OnboardingPage.ts`**

Remove `clickGetStarted()` and `waitForProgressComplete()`. Add `waitForPantryPage()`.

Full replacement:

```ts
import type { Page } from '@playwright/test'

export class OnboardingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/onboarding')
    await this.page.waitForLoadState('networkidle')
  }

  async waitForWelcomeScreen() {
    // OnboardingWelcome heading: t('appName') = "Player 1 Inventory"
    // (src/components/onboarding/OnboardingWelcome/index.tsx)
    await this.page.getByRole('heading', { name: 'Player 1 Inventory' }).waitFor()
  }

  async waitForPantryPage() {
    // After import completes, onboarding auto-navigates to '/'
    // (src/routes/onboarding.tsx)
    await this.page.waitForURL('/', { timeout: 15000 })
  }

  async clickStartFromScratch() {
    // t('onboarding.welcome.startFromScratch') = "Start from scratch"
    // (src/components/onboarding/OnboardingWelcome/index.tsx)
    await this.page.getByRole('button', { name: 'Start from scratch' }).click()
  }

  async clickChooseTemplate() {
    // t('onboarding.welcome.chooseTemplate') = "Choose from template"
    // (src/components/onboarding/OnboardingWelcome/index.tsx)
    await this.page.getByRole('button', { name: 'Choose from template' }).click()
  }

  async clickConfirm() {
    // t('onboarding.templateOverview.confirm') = "Confirm"
    // (src/components/onboarding/TemplateOverview/index.tsx)
    await this.page.getByRole('button', { name: 'Confirm' }).click()
  }

  async selectFirstTemplateItems(count = 3) {
    // TemplateItemsBrowser renders checkboxes — click the first N
    // (src/components/onboarding/TemplateItemsBrowser/index.tsx)
    const checkboxes = this.page.getByRole('checkbox')
    const all = await checkboxes.all()
    const toSelect = all.slice(0, count)
    for (const checkbox of toSelect) {
      await checkbox.check()
    }
  }

  async clickBackFromBrowser() {
    // Back button in TemplateItemsBrowser/TemplateVendorsBrowser uses
    // t('onboarding.templateOverview.back') = "Back"
    // (src/components/onboarding/TemplateItemsBrowser/index.tsx)
    await this.page.getByRole('button', { name: 'Back' }).click()
  }
}
```

- [ ] **Step 4: Update `e2e/tests/onboarding.spec.ts`**

Rewrite the third test — remove `waitForProgressComplete`, `clickGetStarted`, and stale i18n references. Replace with `waitForPantryPage`. Also update the heading and button name references that changed with the i18n update.

Full replacement:

```ts
import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { OnboardingPage } from '../pages/OnboardingPage'

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from MongoDB via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }
  // Local mode for onboarding tests: clear all object stores within the DB
  // WITHOUT deleting the database itself.
  //
  // Rationale: the standard teardown (indexedDB.deleteDatabase) causes Dexie to
  // recreate the database on next load and fire the `populate` event, which seeds
  // default tag-type and tag data. That seeded data makes isEmpty=false, so the
  // onboarding redirect never fires. By clearing stores but keeping the DB, the
  // next test starts with a truly empty database and the redirect fires correctly.
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    const DB_NAME = 'Player1Inventory'
    const STORE_NAMES = [
      'items',
      'tags',
      'tagTypes',
      'inventoryLogs',
      'shoppingCarts',
      'cartItems',
      'vendors',
      'recipes',
    ]
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(STORE_NAMES, 'readwrite')
        for (const storeName of STORE_NAMES) {
          try {
            tx.objectStore(storeName).clear()
          } catch {
            // Store may not exist in this schema version — skip
          }
        }
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      req.onerror = () => reject(req.error)
    })
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user sees onboarding when app data is empty', async ({ page }) => {
  // Given the app has no items, tags, or vendors (clean state)

  // When the user navigates to the root
  await page.goto('/')

  // Then the user is redirected to the onboarding page
  // Use waitForURL with timeout to handle the async redirect from useEffect
  await page.waitForURL('**/onboarding', { timeout: 10000 })

  // And the app name heading is visible
  await expect(
    page.getByRole('heading', { name: 'Player 1 Inventory' }),
  ).toBeVisible()
})

test('user can start from scratch and land on pantry page', async ({ page }) => {
  const onboarding = new OnboardingPage(page)

  // Given the user is on the onboarding page
  await onboarding.navigateTo()
  await onboarding.waitForWelcomeScreen()

  // When the user clicks "Start from scratch"
  await onboarding.clickStartFromScratch()

  // Then the user is navigated directly to the pantry page
  // (no progress step — onboarding-dismissed flag is set and navigate({ to: '/' }) is called)
  await expect(page).toHaveURL('/')
})

test('user can select template items and complete onboarding', async ({ page }) => {
  const onboarding = new OnboardingPage(page)

  // Given the user is on the onboarding page
  await onboarding.navigateTo()
  await onboarding.waitForWelcomeScreen()

  // When the user chooses the template path
  await onboarding.clickChooseTemplate()

  // Then the template overview is shown
  await expect(
    page.getByRole('heading', { name: 'Choose from template' }),
  ).toBeVisible()

  // When the user opens the items browser
  await page.getByRole('button', { name: /sample items/i }).click()
  await page.waitForLoadState('networkidle')

  // And selects a few items
  // TemplateItemRow checkboxes use aria-label "Add <item name>"
  // (src/components/onboarding/TemplateItemsBrowser/TemplateItemRow.tsx)
  const addButtons = page.getByRole('checkbox', { name: /^Add /i })
  const first = addButtons.first()
  await first.check()

  // When the user goes back to the template overview
  await onboarding.clickBackFromBrowser()

  // And confirms
  await onboarding.clickConfirm()

  // Then the user is automatically redirected to the pantry
  // (no "Get started" step — onboarding auto-navigates on import success)
  await onboarding.waitForPantryPage()
  await expect(page).toHaveURL('/')
})
```

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

All tests must pass. The template completion test now waits for `waitForURL('/')` instead of the "All done!" heading.

- [ ] **Step 7: Commit**

```bash
git add \
  apps/web/src/routes/onboarding.tsx \
  e2e/pages/OnboardingPage.ts \
  e2e/tests/onboarding.spec.ts
git rm \
  apps/web/src/components/onboarding/OnboardingProgress/index.tsx \
  apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.tsx \
  apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.test.tsx
git commit -m "refactor(onboarding): replace progress screen with inline loading on TemplateOverview"
```
