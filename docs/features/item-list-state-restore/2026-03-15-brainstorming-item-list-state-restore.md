# Brainstorming: Item List State Restoration on Back Navigation

**Date:** 2026-03-15

---

## Problem Statement

When the user enters an item detail page and navigates back to a list page (pantry, shopping, tag/vendor/recipe items tabs), the list page state is lost:
- Sort criteria
- Active filters (tags, vendor, recipe)
- Tag visibility
- Filter panel visibility
- Search input value
- Scroll position

---

## Questions & Answers

**Q: Are you experiencing an actual bug where filters/search/sort are being lost on back navigation, or is scroll position the main pain point?**

A: Yes — all of sort, filters, search, tag visibility, filter panel visibility are gone when navigating back from an item page.

**Q: Which pages?**

A: All list pages (pantry, shopping, tag/vendor/recipe item tabs).

**Q: For scroll restoration — restore on back navigation only, or always?**

A: Always restore scroll (option B).

**Q: Scroll restoration scope — item list pages only, or all list pages?**

A: All list pages.

**Q: How should scroll position be scoped?**

A: Per page + per filter state (different filter states have separate scroll positions).

**Q: Cross-page filter carry-over** — currently, visiting shopping after pantry inherits pantry's `?q=` param. Keep or remove?

A: Remove (option B) — each page's state fully independent.

---

## Root Causes Found

### Bug 1: Navigation history stores pathname only

`useNavigationTracker` records only `pathname` (e.g., `/`), not the full URL with search params (e.g., `/?q=milk&f_tag1=abc`).

`goBack()` navigates to the bare path, discarding all URL-param state (sort on some pages, all filter/search/visibility state).

### Bug 2: Shared sessionStorage key causes cross-page bleed

The sessionStorage seeding mechanism (`item-list-search-prefs`) was intended to compensate for Bug 1 but uses a single shared key for ALL list pages. Navigating from pantry to shopping writes shopping's state over pantry's. Back-navigating to pantry restores the wrong state.

### Bug 3: Pantry sort is not saved on change

`index.tsx` (pantry) uses bare `useState` with `loadSortPrefs()` from `lib/sessionStorage.ts` — sort changes are stored only in React state, not persisted to localStorage. The `saveSortPrefs()` function is never called. Other pages (`shopping`, tag/vendor/recipe items tabs) correctly use `useSortFilter`, which persists via `useEffect`.

### Bug 4: Scroll position not tracked

No scroll position saving or restoring logic exists anywhere.

---

## Final Decision

### Core fix: store full URLs in navigation history

Instead of storing `pathname`, store `pathname + search` (full relative URL). Update in place when params change on the same page; append when navigating to a new page. `goBack()` navigates to the full URL.

This makes back navigation naturally restore all URL-param state without needing a separate sessionStorage seeding layer.

### Remove cross-page carry-over

Remove `saveSearchPrefs` writes from `updateParams()` and remove the mount-time seeding `useEffect` from `useUrlSearchAndFilters`. The `item-list-search-prefs` sessionStorage key becomes unused.

### Fix pantry sort persistence

Migrate `index.tsx` from `loadSortPrefs()` + bare `useState` to `useSortFilter('pantry')`, which auto-saves to localStorage.

### Add scroll restoration

New `useScrollRestoration(key)` hook:
- Saves `window.scrollY` to sessionStorage on unmount, keyed by full URL (`pathname+search`)
- Restores scroll after list data loads
- Different filter states → different scroll positions

Use in all list pages (pantry, shopping, tag/vendor/recipe item tabs, vendor list, tags list).

---

## Trade-offs Considered

| Option | Pro | Con |
|--------|-----|-----|
| Store full URLs in nav history | Clean, authoritative, no extra storage layer | Slightly more history entries if user keeps changing params |
| Keep sessionStorage seeding + fix per-page key | Less history churn | More complex, two mechanisms for same problem |

Chose full-URL history as the primary mechanism.
