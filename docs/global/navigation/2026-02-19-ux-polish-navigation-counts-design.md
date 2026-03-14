# UX Polish: Navigation History and Vendor Counts Design

**Date:** 2026-02-19
**Status:** Approved

## Overview

Polish user experience by adding vendor item counts and implementing smart back navigation that remembers the user's journey within the app.

## Requirements

1. **Show vendor item counts** in shopping page and vendor list page
   - Count all items assigned to each vendor (regardless of stock level)
   - In shopping page, show total counts (ignore tag filters)

2. **Dynamic back navigation** in item detail and vendor detail pages
   - Track navigation within app only (not external sites)
   - Fallback to home (`/`) if no app history

3. **Auto-navigate after form submission**
   - After successful save → go back
   - After successful delete → go back
   - Applies to both item detail and vendor detail pages

## Architecture

### Two New Custom Hooks

**1. `useVendorItemCounts()`** (`src/hooks/useVendorItemCounts.ts`)
- Returns `Map<vendorId, number>` of item counts per vendor
- Uses `useItems()` to get all items
- Memoizes computation with `useMemo`
- Used by shopping page vendor dropdown and vendor list page

**2. `useAppNavigation()`** (`src/hooks/useAppNavigation.ts`)
- Tracks app navigation history in sessionStorage
- Listens to TanStack Router navigation events
- Provides `goBack()` function with fallback to `/`
- Filters out external navigation (only tracks routes starting with `/`)
- Used by item detail and vendor detail pages

### Integration Points

- Shopping page: Display counts in vendor Select options
- Vendor list page: Display counts in VendorCard
- Item detail page: Use `goBack()` for back button + post-save/delete navigation
- Vendor detail page: Use `goBack()` for back button + post-save navigation

## Design Details

### Vendor Item Counts Hook

**Hook signature:**
```tsx
function useVendorItemCounts(): Map<string, number>
```

**Implementation:**
```tsx
export function useVendorItemCounts() {
  const { data: items = [] } = useItems()

  return useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of items) {
      for (const vendorId of item.vendorIds ?? []) {
        counts.set(vendorId, (counts.get(vendorId) ?? 0) + 1)
      }
    }

    return counts
  }, [items])
}
```

**Usage examples:**

Shopping page:
```tsx
const vendorCounts = useVendorItemCounts()

{vendors.map((v) => (
  <SelectItem key={v.id} value={v.id}>
    {v.name} ({vendorCounts.get(v.id) ?? 0})
  </SelectItem>
))}
```

Vendor list page:
```tsx
const vendorCounts = useVendorItemCounts()

<VendorCard
  vendor={vendor}
  itemCount={vendorCounts.get(vendor.id) ?? 0}
  onDelete={...}
/>
```

**Edge cases:**
- Vendor with 0 items: Shows "0"
- Item with multiple vendors: Counted once per vendor
- Items without vendorIds: Skipped (not counted)

### App Navigation History Hook

**Hook signature:**
```tsx
function useAppNavigation(): {
  goBack: () => void
}
```

**SessionStorage key:** `'app-navigation-history'`

**Implementation approach:**

1. Listen to router navigation using TanStack Router's `useRouter()` and `useEffect`
2. Track route changes - push current pathname to history array
3. Filter external navigation - only track paths starting with `/`
4. Limit history size - keep last 50 entries to avoid storage bloat
5. Provide `goBack()` function that:
   - Gets previous path using array indexing (non-destructive)
   - Creates new history array without current page
   - Navigates to previous path
   - Falls back to `/` if history is empty

**Implementation:**
```tsx
export function useAppNavigation() {
  const router = useRouter()
  const navigate = useNavigate()

  // Track navigation
  useEffect(() => {
    const history = loadHistory()
    const currentPath = router.state.location.pathname

    // Only track app routes
    if (currentPath.startsWith('/')) {
      history.push(currentPath)
      // Keep last 50 entries
      if (history.length > 50) history.shift()
      saveHistory(history)
    }
  }, [router.state.location.pathname])

  const goBack = useCallback(() => {
    const history = loadHistory()

    // Get previous page WITHOUT modifying array
    const currentIndex = history.length - 1
    const previousPath = history[currentIndex - 1]

    if (previousPath && previousPath !== router.state.location.pathname) {
      // Remove current page from history before navigating
      const newHistory = history.slice(0, -1)
      saveHistory(newHistory)
      navigate({ to: previousPath })
    } else {
      // No valid previous page - go home
      navigate({ to: '/' })
    }
  }, [navigate, router.state.location.pathname])

  return { goBack }
}
```

**Helper functions in `src/lib/sessionStorage.ts`:**
```tsx
const NAVIGATION_HISTORY_KEY = 'app-navigation-history'

export function loadNavigationHistory(): string[] {
  const stored = sessionStorage.getItem(NAVIGATION_HISTORY_KEY)
  return stored ? JSON.parse(stored) : []
}

export function saveNavigationHistory(history: string[]): void {
  sessionStorage.setItem(NAVIGATION_HISTORY_KEY, JSON.stringify(history))
}
```

**Usage in detail pages:**
```tsx
const { goBack } = useAppNavigation()

// Back button
<button onClick={goBack}>
  <ArrowLeft />
</button>

// After save/delete
updateItem.mutate(data, {
  onSuccess: () => goBack()
})
```

## Component Updates

### 1. Shopping Page (`/shopping`)

Add vendor counts to dropdown:
```tsx
const vendorCounts = useVendorItemCounts()

<SelectItem key={v.id} value={v.id}>
  {v.name} ({vendorCounts.get(v.id) ?? 0})
</SelectItem>
```

### 2. Vendor List Page (`/settings/vendors/index.tsx`)

Pass counts to VendorCard:
```tsx
const vendorCounts = useVendorItemCounts()

<VendorCard
  vendor={vendor}
  itemCount={vendorCounts.get(vendor.id) ?? 0}
  onDelete={...}
/>
```

### 3. VendorCard Component

Add optional itemCount prop and display:
```tsx
interface VendorCardProps {
  vendor: Vendor
  itemCount?: number
  onDelete: () => void
}

// Display as: "{vendor.name} · {itemCount} items" (only if count provided)
```

### 4. Item Detail Page (`/items/$id.tsx`)

Replace hardcoded back navigation:
```tsx
const { goBack } = useAppNavigation()

// Back button - replace Link with button + onClick
<button onClick={goBack}>
  <ArrowLeft />
</button>

// After delete
deleteItem.mutate(id, {
  onSuccess: () => goBack() // Was: navigate({ to: '/' })
})

// Back button respects dirty state guard:
// - Show discard dialog if dirty
// - Otherwise call goBack()
```

### 5. Item Detail Form (`/items/$id/index.tsx`)

Add navigation after save:
```tsx
const { goBack } = useAppNavigation()

updateItem.mutateAsync({...}, {
  onSuccess: () => goBack()
})
```

### 6. Vendor Detail Page (`/settings/vendors/$id.tsx`)

Replace hardcoded back navigation:
```tsx
const { goBack } = useAppNavigation()

// Back button
<button onClick={goBack}>
  <ArrowLeft />
</button>

// Back button respects dirty state guard
```

### 7. Vendor Detail Form (`/settings/vendors/$id/index.tsx`)

Add navigation after save:
```tsx
const { goBack } = useAppNavigation()

updateVendor.mutate({...}, {
  onSuccess: () => goBack()
})
```

## Testing Strategy

### Hook Tests

**`useVendorItemCounts.test.ts`:**
- Returns empty Map when no items
- Counts items correctly for single vendor
- Counts items correctly for multiple vendors
- Handles items with multiple vendors (counts once per vendor)
- Handles items without vendorIds (doesn't count)
- Memoizes computation (doesn't recalculate unless items change)

**`useAppNavigation.test.ts`:**
- Tracks navigation history in sessionStorage
- `goBack()` navigates to previous page
- `goBack()` falls back to `/` when history empty
- Limits history to 50 entries (removes oldest when exceeds)
- Only tracks app routes (ignores external URLs)
- Doesn't add duplicate consecutive entries

### Component Integration Tests

**Shopping page** (`shopping.test.tsx`):
- Vendor dropdown shows item counts
- Counts remain constant when tag filters change

**Vendor list** (`vendors.test.tsx`):
- Vendor cards display item counts
- Count updates when items assigned/unassigned

**Item detail** (`items/$id.test.tsx`):
- Back button navigates to previous page
- After save, navigates back
- After delete, navigates back
- Back button respects dirty state guard

**Vendor detail** (`vendors/$id.test.tsx`):
- Back button navigates to previous page
- After save, navigates back
- Back button respects dirty state guard

**Testing approach:**
- Unit tests for hooks using `renderHook` from `@testing-library/react`
- Integration tests for components using existing test patterns
- Mock sessionStorage in tests with jsdom

## Implementation Checklist

- [ ] Create `useVendorItemCounts` hook with tests
- [ ] Create `useAppNavigation` hook with tests
- [ ] Add sessionStorage helpers for navigation history
- [ ] Update VendorCard component to display item count
- [ ] Update shopping page to show vendor counts
- [ ] Update vendor list page to show vendor counts
- [ ] Update item detail page back button with navigation hook
- [ ] Update item detail form to navigate back after save
- [ ] Update vendor detail page back button with navigation hook
- [ ] Update vendor detail form to navigate back after save
- [ ] Verify all tests pass
- [ ] Update CLAUDE.md if needed

## Trade-offs and Considerations

**Chosen:** SessionStorage for navigation history
**Why:** Persists across page reloads, simple implementation
**Alternative:** In-memory state (lost on reload)

**Chosen:** 50-entry history limit
**Why:** Prevents unbounded growth while keeping enough history
**Alternative:** Unlimited history (could hit storage limits)

**Chosen:** Count all items per vendor (ignore filters in shopping page)
**Why:** Consistent information, simpler to understand
**Alternative:** Show filtered counts (would change as filters change)

**Chosen:** Array slicing for non-destructive history reading
**Why:** Avoids mutation bugs, clearer intent
**Alternative:** Pop operations (destructive, harder to reason about)
