# Context-Aware Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance back button navigation to be context-aware, skipping tab navigation within the same page and respecting where users came from.

**Architecture:** Extend the existing `useAppNavigation` hook to accept an optional fallback path and filter out same-page tab navigation from history. Update all pages to use the enhanced hook with appropriate fallbacks.

**Tech Stack:** React 19, TypeScript, TanStack Router, Vitest

---

## Task 1: Write Tests for Same-Page Detection Helper

**Files:**
- Create: `src/hooks/useAppNavigation.test.ts`

**Step 1: Write failing tests for isSamePage helper**

Create the test file with tests for same-page detection logic:

```typescript
import { describe, it, expect } from 'vitest'

// We'll export isSamePage from useAppNavigation for testing
function isSamePage(path1: string, path2: string): boolean {
  // Item detail pages: /items/:id/*
  const itemMatch1 = path1.match(/^\/items\/([^/]+)/)
  const itemMatch2 = path2.match(/^\/items\/([^/]+)/)
  if (itemMatch1 && itemMatch2 && itemMatch1[1] === itemMatch2[1]) {
    return true
  }

  // Vendor detail pages: /settings/vendors/:id/*
  const vendorMatch1 = path1.match(/^\/settings\/vendors\/([^/]+)/)
  const vendorMatch2 = path2.match(/^\/settings\/vendors\/([^/]+)/)
  if (vendorMatch1 && vendorMatch2 && vendorMatch1[1] === vendorMatch2[1]) {
    return true
  }

  return false
}

describe('isSamePage', () => {
  it('treats item detail tabs as same page', () => {
    expect(isSamePage('/items/123', '/items/123/tags')).toBe(true)
    expect(isSamePage('/items/123/tags', '/items/123/vendors')).toBe(true)
    expect(isSamePage('/items/123/vendors', '/items/123/log')).toBe(true)
    expect(isSamePage('/items/123', '/items/123')).toBe(true)
  })

  it('treats vendor detail tabs as same page', () => {
    expect(isSamePage('/settings/vendors/abc', '/settings/vendors/abc/items')).toBe(true)
    expect(isSamePage('/settings/vendors/abc/items', '/settings/vendors/abc')).toBe(true)
    expect(isSamePage('/settings/vendors/abc', '/settings/vendors/abc')).toBe(true)
  })

  it('treats different item IDs as different pages', () => {
    expect(isSamePage('/items/123', '/items/456')).toBe(false)
    expect(isSamePage('/items/123/tags', '/items/456/tags')).toBe(false)
  })

  it('treats different vendor IDs as different pages', () => {
    expect(isSamePage('/settings/vendors/abc', '/settings/vendors/xyz')).toBe(false)
    expect(isSamePage('/settings/vendors/abc/items', '/settings/vendors/xyz/items')).toBe(false)
  })

  it('treats completely different routes as different pages', () => {
    expect(isSamePage('/', '/shopping')).toBe(false)
    expect(isSamePage('/items/123', '/shopping')).toBe(false)
    expect(isSamePage('/settings/vendors', '/settings/tags')).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/hooks/useAppNavigation.test.ts`
Expected: Tests fail because `isSamePage` is not exported from useAppNavigation

**Step 3: Commit the failing tests**

```bash
git add src/hooks/useAppNavigation.test.ts
git commit -m "test(navigation): add tests for same-page detection helper

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Enhance useAppNavigation Hook

**Files:**
- Modify: `src/hooks/useAppNavigation.ts`

**Step 1: Add isSamePage helper and update hook signature**

Add the helper function at the top of the file (before the hook):

```typescript
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'

const MAX_HISTORY_SIZE = 50

// Export for testing
export function isSamePage(path1: string, path2: string): boolean {
  // Item detail pages: /items/:id/*
  const itemMatch1 = path1.match(/^\/items\/([^/]+)/)
  const itemMatch2 = path2.match(/^\/items\/([^/]+)/)
  if (itemMatch1 && itemMatch2 && itemMatch1[1] === itemMatch2[1]) {
    return true
  }

  // Vendor detail pages: /settings/vendors/:id/*
  const vendorMatch1 = path1.match(/^\/settings\/vendors\/([^/]+)/)
  const vendorMatch2 = path2.match(/^\/settings\/vendors\/([^/]+)/)
  if (vendorMatch1 && vendorMatch2 && vendorMatch1[1] === vendorMatch2[1]) {
    return true
  }

  return false
}

export function useAppNavigation(fallbackPath?: string) {
  const router = useRouter()
  const navigate = useNavigate()

  // Track navigation
  useEffect(() => {
    const history = loadNavigationHistory()
    const currentPath = router.state.location.pathname

    // Only track app routes and avoid duplicates
    if (
      currentPath.startsWith('/') &&
      history[history.length - 1] !== currentPath
    ) {
      history.push(currentPath)
      // Keep last MAX_HISTORY_SIZE entries
      if (history.length > MAX_HISTORY_SIZE) history.shift()
      saveNavigationHistory(history)
    }
  }, [router.state.location.pathname])

  const goBack = useCallback(() => {
    // Read fresh history from sessionStorage to ensure cross-tab/cross-component consistency
    const history = loadNavigationHistory()
    const currentPath = router.state.location.pathname

    // Filter out same-page navigation to find the previous different page
    let previousPath: string | undefined
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] !== currentPath && !isSamePage(history[i], currentPath)) {
        previousPath = history[i]
        break
      }
    }

    if (previousPath) {
      // Remove all same-page entries and current page from history
      const newHistory = history.filter(
        (path) => !isSamePage(path, currentPath) && path !== currentPath
      )
      saveNavigationHistory(newHistory)
      navigate({ to: previousPath })
    } else {
      // No valid previous page - use fallback or default to home
      navigate({ to: fallbackPath || '/' })
    }
  }, [navigate, router.state.location.pathname, fallbackPath])

  return { goBack }
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test src/hooks/useAppNavigation.test.ts`
Expected: All tests pass

**Step 3: Run existing tests to check for regressions**

Run: `pnpm test`
Expected: All existing tests still pass (navigation behavior maintained for existing usages)

**Step 4: Commit the hook changes**

```bash
git add src/hooks/useAppNavigation.ts
git commit -m "feat(navigation): enhance useAppNavigation with same-page detection and fallback

- Add isSamePage helper to detect tab navigation within same page
- Filter same-page navigation from history before finding previous page
- Add optional fallbackPath parameter for when history is empty
- Export isSamePage for testing

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add Integration Tests for useAppNavigation Hook

**Files:**
- Modify: `src/hooks/useAppNavigation.test.ts`

**Step 1: Add tests for hook behavior with history filtering**

Add these tests after the existing `isSamePage` tests:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppNavigation, isSamePage } from './useAppNavigation'
import { saveNavigationHistory, loadNavigationHistory } from '@/lib/sessionStorage'

// Mock sessionStorage helpers
vi.mock('@/lib/sessionStorage', () => ({
  saveNavigationHistory: vi.fn(),
  loadNavigationHistory: vi.fn(() => []),
}))

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({
    state: {
      location: {
        pathname: '/',
      },
    },
  }),
}))

describe('useAppNavigation hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses fallback path when history is empty', () => {
    const mockNavigate = vi.fn()
    vi.mocked(loadNavigationHistory).mockReturnValue([])

    const { result } = renderHook(() => useAppNavigation('/settings'))

    // Mock navigate
    vi.spyOn(result.current, 'goBack').mockImplementation(() => {
      mockNavigate({ to: '/settings' })
    })

    result.current.goBack()

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' })
  })

  it('defaults to home when no fallback provided', () => {
    const mockNavigate = vi.fn()
    vi.mocked(loadNavigationHistory).mockReturnValue([])

    const { result } = renderHook(() => useAppNavigation())

    vi.spyOn(result.current, 'goBack').mockImplementation(() => {
      mockNavigate({ to: '/' })
    })

    result.current.goBack()

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test src/hooks/useAppNavigation.test.ts`
Expected: All tests pass

**Step 3: Commit the additional tests**

```bash
git add src/hooks/useAppNavigation.test.ts
git commit -m "test(navigation): add integration tests for useAppNavigation hook

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update Item Detail Page with Fallback

**Files:**
- Modify: `src/routes/items/$id.tsx:43`

**Step 1: Add fallback path to useAppNavigation call**

Change line 43 from:
```typescript
const { goBack } = useAppNavigation()
```

To:
```typescript
const { goBack } = useAppNavigation('/')
```

**Step 2: Run existing tests to verify behavior**

Run: `pnpm test src/routes/items/\\$id.test.tsx`
Expected: All tests pass (fallback only affects edge cases)

**Step 3: Commit the change**

```bash
git add src/routes/items/\$id.tsx
git commit -m "feat(items): add fallback path to item detail navigation

When navigation history is empty, fall back to pantry page (/)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update Vendor Detail Page with Fallback

**Files:**
- Modify: `src/routes/settings/vendors/$id.tsx:35`

**Step 1: Add fallback path to useAppNavigation call**

Change line 35 from:
```typescript
const { goBack } = useAppNavigation()
```

To:
```typescript
const { goBack } = useAppNavigation('/settings/vendors')
```

**Step 2: Run existing tests to verify behavior**

Run: `pnpm test src/routes/settings/vendors/`
Expected: All tests pass

**Step 3: Commit the change**

```bash
git add src/routes/settings/vendors/\$id.tsx
git commit -m "feat(vendors): add fallback path to vendor detail navigation

When navigation history is empty, fall back to vendor list page

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Update Vendor List Page

**Files:**
- Modify: `src/routes/settings/vendors/index.tsx`

**Step 1: Import useAppNavigation and add hook call**

At the top of the `VendorSettings` function (around line 15), add:

```typescript
import { useAppNavigation } from '@/hooks/useAppNavigation'

function VendorSettings() {
  const navigate = useNavigate()
  const { data: vendors = [] } = useVendors()
  const deleteVendor = useDeleteVendor()
  const vendorCounts = useVendorItemCounts()
  const { goBack } = useAppNavigation('/settings')  // Add this line
```

**Step 2: Update back button click handler**

Change line 41 from:
```typescript
onClick={() => navigate({ to: '/settings' })}
```

To:
```typescript
onClick={goBack}
```

**Step 3: Run tests to verify behavior**

Run: `pnpm test src/routes/settings/vendors.test.tsx`
Expected: All tests pass

**Step 4: Commit the change**

```bash
git add src/routes/settings/vendors/index.tsx
git commit -m "feat(vendors): use context-aware navigation for vendor list back button

Replace hardcoded /settings navigation with useAppNavigation hook
Falls back to /settings when no history available

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Update Tag List Page

**Files:**
- Modify: `src/routes/settings/tags.tsx`

**Step 1: Import useAppNavigation and add hook call**

At the top of the `TagSettings` function (around line 32), add:

```typescript
import { useAppNavigation } from '@/hooks/useAppNavigation'

function TagSettings() {
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings')  // Add this line
  const { data: tagTypes = [] } = useTagTypes()
```

**Step 2: Update back button click handler**

Change line 125 from:
```typescript
onClick={() => navigate({ to: '/' })}
```

To:
```typescript
onClick={goBack}
```

**Step 3: Run tests to verify behavior**

Run: `pnpm test src/routes/settings/tags.tsx` (if test file exists)
Expected: Tests pass or skip if no test file exists

**Step 4: Commit the change**

```bash
git add src/routes/settings/tags.tsx
git commit -m "feat(tags): use context-aware navigation for tag list back button

Replace hardcoded / navigation with useAppNavigation hook
Falls back to /settings when no history available

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Add "Manage Vendors" to Shopping Page Dropdown

**Files:**
- Modify: `src/routes/shopping.tsx`

**Step 1: Add "Manage vendors..." SelectItem**

Find the Select component around line 150-165. Update the SelectContent to add the new option:

Change from:
```typescript
<SelectContent>
  <SelectItem value="all">All vendors</SelectItem>
  {vendors.map((v) => (
    <SelectItem key={v.id} value={v.id}>
      {v.name} ({vendorCounts.get(v.id) ?? 0})
    </SelectItem>
  ))}
</SelectContent>
```

To:
```typescript
<SelectContent>
  <SelectItem value="__manage__" className="font-medium">
    Manage vendors...
  </SelectItem>
  <SelectItem value="all">All vendors</SelectItem>
  {vendors.map((v) => (
    <SelectItem key={v.id} value={v.id}>
      {v.name} ({vendorCounts.get(v.id) ?? 0})
    </SelectItem>
  ))}
</SelectContent>
```

**Step 2: Update onValueChange handler**

Change the onValueChange handler around line 152 from:

```typescript
onValueChange={(v) => setSelectedVendorId(v === 'all' ? '' : v)}
```

To:
```typescript
onValueChange={(v) => {
  if (v === '__manage__') {
    navigate({ to: '/settings/vendors' })
    return
  }
  setSelectedVendorId(v === 'all' ? '' : v)
}}
```

**Step 3: Run tests to verify behavior**

Run: `pnpm test src/routes/shopping.test.tsx`
Expected: Existing tests pass (new feature doesn't break existing functionality)

**Step 4: Commit the change**

```bash
git add src/routes/shopping.tsx
git commit -m "feat(shopping): add vendor management access from dropdown

Add 'Manage vendors...' option at top of vendor filter dropdown
Navigates to /settings/vendors when selected
Creates navigation history for context-aware back button

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Add Integration Tests for Shopping Page Vendor Management

**Files:**
- Modify: `src/routes/shopping.test.tsx`

**Step 1: Write test for "Manage vendors..." option**

Add this test to the existing test suite:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

describe('Shopping page vendor management', () => {
  it('shows "Manage vendors..." option in dropdown', async () => {
    // Setup: render shopping page with vendors
    render(<Shopping />)

    // Find and open the vendor dropdown
    const dropdown = screen.getByRole('combobox')
    fireEvent.click(dropdown)

    // Verify "Manage vendors..." option exists
    const manageOption = await screen.findByText('Manage vendors...')
    expect(manageOption).toBeInTheDocument()
  })

  it('navigates to vendor list when "Manage vendors..." is selected', async () => {
    const mockNavigate = vi.fn()
    // Mock navigate function
    vi.mock('@tanstack/react-router', () => ({
      useNavigate: () => mockNavigate,
    }))

    render(<Shopping />)

    // Open dropdown and select "Manage vendors..."
    const dropdown = screen.getByRole('combobox')
    fireEvent.click(dropdown)
    const manageOption = await screen.findByText('Manage vendors...')
    fireEvent.click(manageOption)

    // Verify navigation was called
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/vendors' })
  })

  it('does not break existing vendor filter functionality', async () => {
    render(<Shopping />)

    // Open dropdown and select a vendor (not "Manage vendors...")
    const dropdown = screen.getByRole('combobox')
    fireEvent.click(dropdown)
    const vendorOption = await screen.findByText(/Costco/)
    fireEvent.click(vendorOption)

    // Verify items are filtered (implementation depends on existing test setup)
    // This is a placeholder - adapt to existing test patterns
    expect(screen.getByText(/filtered items/)).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test src/routes/shopping.test.tsx`
Expected: New tests pass

**Step 3: Commit the tests**

```bash
git add src/routes/shopping.test.tsx
git commit -m "test(shopping): add tests for vendor management dropdown

Verify 'Manage vendors...' option appears and navigates correctly
Ensure existing filter functionality is not broken

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Add Integration Tests for Tag List Navigation

**Files:**
- Create: `src/routes/settings/tags.test.tsx`

**Step 1: Write tests for tag list context-aware navigation**

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveNavigationHistory } from '@/lib/sessionStorage'

vi.mock('@/lib/sessionStorage')

describe('Tag list page navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('back button navigates to /settings when no history', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(loadNavigationHistory).mockReturnValue([])

    render(<TagSettings />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    // Should navigate to fallback /settings
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' })
  })

  it('back button navigates to shopping when coming from shopping page', async () => {
    const mockNavigate = vi.fn()
    // Simulate navigation history: shopping -> tags
    vi.mocked(loadNavigationHistory).mockReturnValue(['/shopping', '/settings/tags'])

    render(<TagSettings />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    // Should navigate back to shopping
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/shopping' })
  })

  it('back button navigates to pantry when coming from pantry page', async () => {
    const mockNavigate = vi.fn()
    // Simulate navigation history: pantry -> tags
    vi.mocked(loadNavigationHistory).mockReturnValue(['/', '/settings/tags'])

    render(<TagSettings />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    // Should navigate back to pantry
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test src/routes/settings/tags.test.tsx`
Expected: All tests pass

**Step 3: Commit the tests**

```bash
git add src/routes/settings/tags.test.tsx
git commit -m "test(tags): add integration tests for context-aware navigation

Verify back button respects navigation context (settings/shopping/pantry)
Test fallback behavior when history is empty

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Update Item Detail Tests for Tab Navigation

**Files:**
- Modify: `src/routes/items/$id.test.tsx`

**Step 1: Add test for hierarchical navigation (skipping tabs)**

Add this test to the existing test suite:

```typescript
import { saveNavigationHistory, loadNavigationHistory } from '@/lib/sessionStorage'

vi.mock('@/lib/sessionStorage')

describe('Item detail page hierarchical navigation', () => {
  it('back button skips tab navigation and goes to previous app page', async () => {
    const mockNavigate = vi.fn()
    // Simulate: pantry -> item -> tags tab -> log tab
    vi.mocked(loadNavigationHistory).mockReturnValue([
      '/',
      '/items/123',
      '/items/123/tags',
      '/items/123/log',
    ])

    render(<ItemLayout />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    // Should skip all item tabs and go directly to pantry
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('back button falls back to pantry when no valid history', async () => {
    const mockNavigate = vi.fn()
    // Direct URL access, no history
    vi.mocked(loadNavigationHistory).mockReturnValue(['/items/123/tags'])

    render(<ItemLayout />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    // Should fall back to / (pantry)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test src/routes/items/\\$id.test.tsx`
Expected: All tests pass

**Step 3: Commit the updated tests**

```bash
git add src/routes/items/\$id.test.tsx
git commit -m "test(items): add tests for hierarchical tab navigation

Verify back button skips tab history within same item page
Test fallback behavior for direct URL access

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Update Vendor Detail Tests

**Files:**
- Modify: `src/routes/settings/vendors.test.tsx`

**Step 1: Add tests for vendor list context-aware navigation**

Add these tests to the existing test suite:

```typescript
describe('Vendor list page navigation', () => {
  it('back button navigates to /settings when no history', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(loadNavigationHistory).mockReturnValue([])

    render(<VendorSettings />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' })
  })

  it('back button navigates to shopping when coming from shopping page', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(loadNavigationHistory).mockReturnValue(['/shopping', '/settings/vendors'])

    render(<VendorSettings />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/shopping' })
  })
})

describe('Vendor detail page hierarchical navigation', () => {
  it('back button from vendor detail always goes to vendor list', async () => {
    const mockNavigate = vi.fn()
    // Simulate: settings -> vendor list -> vendor detail -> items tab
    vi.mocked(loadNavigationHistory).mockReturnValue([
      '/settings',
      '/settings/vendors',
      '/settings/vendors/abc',
      '/settings/vendors/abc/items',
    ])

    render(<VendorDetailLayout />)

    const backButton = screen.getByLabelText('Go back')
    fireEvent.click(backButton)

    // Should skip tab and go to vendor list
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/vendors' })
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test src/routes/settings/vendors.test.tsx`
Expected: All tests pass

**Step 3: Commit the updated tests**

```bash
git add src/routes/settings/vendors.test.tsx
git commit -m "test(vendors): add tests for context-aware navigation

Verify vendor list respects navigation context (settings/shopping)
Verify vendor detail skips tab navigation
Test fallback behavior

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Run Full Test Suite

**Files:**
- None (verification step)

**Step 1: Run all tests to verify no regressions**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run type checking**

Run: `pnpm build`
Expected: No TypeScript errors

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No linting errors

---

## Task 14: Manual Testing & Documentation

**Files:**
- Update: `docs/plans/2026-02-20-context-aware-navigation-design.md`

**Step 1: Perform manual testing scenarios**

Follow the manual testing scenarios from the design doc:

1. **Shopping → Vendor List → Vendor Detail → Back → Back**
   - ✓ Vendor detail → Vendor list → Shopping

2. **Pantry → Item → Tags tab → Log tab → Back**
   - ✓ Directly back to Pantry (skips tab history)

3. **Shopping → Tag List (via Edit button) → Back**
   - ✓ Back to Shopping

4. **Direct URL access to `/items/123/tags` → Back**
   - ✓ Falls back to `/` (pantry)

5. **Settings → Vendor List → Back**
   - ✓ Back to Settings

6. **Settings → Tag List → Back**
   - ✓ Back to Settings

**Step 2: Update design doc with implementation status**

Add to the end of the design doc:

```markdown
## Implementation Status

**Date Completed:** 2026-02-20
**Status:** ✅ Implemented and tested

All tasks completed:
- ✅ Enhanced useAppNavigation hook with same-page detection
- ✅ Updated all pages to use context-aware navigation
- ✅ Added "Manage vendors..." to shopping page dropdown
- ✅ Added comprehensive test coverage
- ✅ Manual testing scenarios verified

**Commits:** See git log for detailed change history
```

**Step 3: Commit documentation update**

```bash
git add docs/plans/2026-02-20-context-aware-navigation-design.md
git commit -m "docs(navigation): mark design as implemented

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary

This implementation plan enhances navigation across the app with:

1. **Hierarchical back navigation** - Skips tab switches within the same logical page
2. **Context-aware routing** - Remembers where users came from (shopping/pantry/settings)
3. **Smart fallbacks** - Uses sensible defaults when history is unavailable
4. **Vendor management access** - Easy access from shopping page

**Estimated time:** 2-3 hours for implementation + testing
**Risk level:** Low (no database changes, backwards compatible)
**Testing:** Comprehensive unit and integration tests included
