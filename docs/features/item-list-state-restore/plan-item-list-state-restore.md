# Implementation Plan: Item List State Restoration on Back Navigation

**Branch:** `feature/item-list-state-restore`
**Status:** ✅ Complete

---

## Goal

When the user navigates from a list page to an item detail page and back, the list page should look exactly the same:
- Same sort criteria
- Same active filters
- Same tag visibility
- Same filter panel visibility
- Same search input visibility
- Same search input value
- Same vertical scroll position

---

## Affected Files

- `apps/web/src/hooks/useNavigationTracker.ts`
- `apps/web/src/hooks/useAppNavigation.ts`
- `apps/web/src/hooks/useUrlSearchAndFilters.ts`
- `apps/web/src/hooks/useScrollRestoration.ts` *(new)*
- `apps/web/src/routes/index.tsx` (pantry)
- `apps/web/src/routes/shopping.tsx`
- `apps/web/src/routes/settings/tags/$id/items.tsx`
- `apps/web/src/routes/settings/vendors/$id/items.tsx`
- `apps/web/src/routes/settings/recipes/$id/items.tsx`
- `apps/web/src/routes/settings/vendors/index.tsx` (vendor list)
- `apps/web/src/routes/settings/tags/index.tsx` (tags list)
- Unit tests for changed hooks
- E2E tests for back-navigation scenario

---

## Step 1 — Fix navigation history to store full URLs

**Files:** `useNavigationTracker.ts`, `useAppNavigation.ts`

### 1a. `useNavigationTracker` — store `pathname + search`

Change from tracking `state.location.pathname` to tracking the full relative URL (`pathname + search`).

Update deduplication logic: instead of "skip if last entry === current path", use "update last entry in place if same pathname, append if different pathname".

```ts
// Before: stores pathname only
const currentPath = useRouterState({ select: (s) => s.location.pathname })

// After: stores full URL
const currentUrl = useRouterState({
  select: (s) => s.location.pathname + (s.location.search ?? ''),
})
```

Dedup logic:
```ts
const lastEntry = history[history.length - 1]
const lastPathname = lastEntry?.split('?')[0]
if (lastPathname === currentPathname) {
  history[history.length - 1] = currentUrl  // update params in place
} else {
  history.push(currentUrl)
}
```

### 1b. `isSamePage` — accept full URLs, compare pathnames only

```ts
// Extract pathname before comparing
function getPathname(urlOrPath: string): string {
  return urlOrPath.split('?')[0]
}
```

Update all pattern matches in `isSamePage` to call `getPathname()` on both inputs first.

### 1c. `goBack()` — navigate to full URL

```ts
// Before
navigate({ to: previousPath })

// After — previousPath is now a full URL like "/?q=milk&f_tag1=abc"
router.history.push(previousPath)
```

Using `router.history.push` (instead of TanStack Router's `navigate`) to push the exact URL string including search params without any sanitization.

**Tests to add:**
- `isSamePage` handles full URLs correctly (existing tests use pathnames — update them)
- `goBack()` navigates to full URL including search params
- History tracker updates in place when same-page params change
- History tracker appends when navigating to a new page

---

## Step 2 — Remove cross-page filter carry-over

**Files:** `useUrlSearchAndFilters.ts`

Remove:
1. The `saveSearchPrefs(str)` call inside `updateParams()`
2. The mount-time seeding `useEffect` (lines 66–82)
3. The `loadSearchPrefs` export (no longer needed externally)
4. The `STORAGE_KEY` constant `'item-list-search-prefs'`

Keep:
- `saveSearchPrefs` and `loadSearchPrefs` can be deleted entirely, or kept as dead code until confirmed safe to remove

After this change, each list page's URL params are fully independent. Filter/search state only persists via URL (which navigation history now preserves as full URLs).

**Tests to add:**
- Verify `updateParams` no longer writes to sessionStorage
- Verify mount no longer seeds from sessionStorage

---

## Step 3 — Fix pantry sort persistence

**Files:** `apps/web/src/routes/index.tsx`

Replace old sort state management:
```ts
// Remove these imports
import { loadSortPrefs, type SortDirection, type SortField } from '@/lib/sessionStorage'

// Remove these useState calls
const [sortBy, setSortBy] = useState<SortField>(() => loadSortPrefs().sortBy)
const [sortDirection, setSortDirection] = useState<SortDirection>(() => loadSortPrefs().sortDirection)
```

Add `useSortFilter`:
```ts
import { useSortFilter } from '@/hooks/useSortFilter'

const { sortBy, sortDirection, setSortBy, setSortDirection } = useSortFilter('pantry')
```

The `useSortFilter` hook:
- Reads initial value from `localStorage` key `pantry-sort-prefs`
- Saves to `localStorage` in a `useEffect` on every change
- Pantry default is `'expiring'` — confirm `useSortFilter` comment says "Pantry page defaults to 'expiring' — it has its own persistence in sessionStorage.ts." Update that comment to remove the outdated note.

**Note:** `useSortFilter.ts` has a comment saying pantry uses `sessionStorage.ts` directly — update this comment.

**Tests to add:**
- Pantry sort survives unmount/remount (reads from localStorage)
- Sort changes are persisted to `pantry-sort-prefs` in localStorage

---

## Step 4 — Add `useScrollRestoration` hook

**File:** `apps/web/src/hooks/useScrollRestoration.ts` *(new)*

```ts
// Saves and restores window.scrollY for a given key.
// Key should include the full URL (pathname + search) so different
// filter states have independent scroll positions.
export function useScrollRestoration(key: string) {
  const storageKey = `scroll-pos:${key}`

  // Restore scroll after content renders
  const restoreScroll = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved !== null) {
        const y = Number(saved)
        if (!Number.isNaN(y)) window.scrollTo({ top: y, behavior: 'instant' })
      }
    } catch {}
  }, [storageKey])

  // Save scroll on unmount
  useEffect(() => {
    return () => {
      try {
        sessionStorage.setItem(storageKey, String(Math.round(window.scrollY)))
      } catch {}
    }
  }, [storageKey])

  return { restoreScroll }
}
```

**Design notes:**
- `behavior: 'instant'` avoids visible scroll animation on page restore
- Key includes full URL so pantry at `/?q=milk` has a different scroll slot than pantry at `/`
- `restoreScroll` is returned so the caller can trigger it at the right moment (after data loads)

**Tests to add:**
- Saves `scrollY` to sessionStorage on unmount
- `restoreScroll` reads from sessionStorage and calls `window.scrollTo`
- Different keys are independent

---

## Step 5 — Wire scroll restoration into all list pages

For each list page, add:
1. Read the current full URL (`pathname + search`) — use `useRouterState`
2. Call `useScrollRestoration(fullUrl)` to get `restoreScroll`
3. Call `restoreScroll()` inside a `useEffect` that depends on `isLoading` becoming `false` (or the data array length changing from 0 to non-zero on first load)

**Pages to update:**
- `apps/web/src/routes/index.tsx` (pantry) — `isLoading` from `useItems()`
- `apps/web/src/routes/shopping.tsx` — `isLoading` from `useItems()`
- `apps/web/src/routes/settings/tags/$id/items.tsx`
- `apps/web/src/routes/settings/vendors/$id/items.tsx`
- `apps/web/src/routes/settings/recipes/$id/items.tsx`
- `apps/web/src/routes/settings/vendors/index.tsx` (vendor list)
- `apps/web/src/routes/settings/tags/index.tsx` (tags list)

Pattern for each page:
```ts
const currentUrl = useRouterState({
  select: (s) => s.location.pathname + (s.location.search ?? ''),
})
const { restoreScroll } = useScrollRestoration(currentUrl)

// After data loads, restore scroll
useEffect(() => {
  if (!isLoading) restoreScroll()
}, [isLoading, restoreScroll])
```

**Note:** The `restoreScroll` function is idempotent — calling it when there's nothing saved is a no-op.

---

## Step 6 — E2E test: back navigation state preservation

**File:** `e2e/tests/item-list-state-restore.spec.ts` *(new)*

Test scenarios:
1. **Filters preserved on back** — set filters on pantry, navigate to item detail, back → filters still active
2. **Search preserved on back** — type search query, navigate to item detail, back → search still active
3. **Sort preserved on back** — change sort on pantry, navigate to item, back → sort unchanged
4. **Scroll preserved on back** — scroll down pantry list, navigate to item, back → scrolled to same position
5. **Pages are independent** — set filters on pantry, navigate to shopping → shopping starts clean

Use `page.evaluate()` seeding to create enough items for meaningful scroll tests (20+ items).

---

## Verification Gate (after each step)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
```

---

## Cleanup (after all steps pass)

- Delete unused exports from `lib/sessionStorage.ts`: `saveFilters`, `loadFilters`, `saveUiPrefs`, `loadUiPrefs`, `saveSortPrefs`, `loadSortPrefs` if no longer referenced (audit with grep first)
- Update the stale comment in `useSortFilter.ts` about pantry using `sessionStorage.ts`
- Update `docs/INDEX.md` status to ✅
