# Brainstorming — URL State Preservation for Cooking & Shopping

**Date:** 2026-03-21

## Context

Two UX problems were raised:
- Cooking page: expand/collapse state of recipe cards resets when the user navigates to an item/recipe detail page and comes back
- Shopping page: selected vendor filter resets when the user navigates to an item detail page and comes back

Both happen because the state lives in `useState` — which resets on component remount.

## Questions & Answers

**Q1: Persistence scope — session only (sessionStorage) or across refreshes (localStorage)?**
A: URL search params. Both pages already use URL params for other persistent UI state (sort, dir, q). Storing in the URL is free — `useAppNavigation.goBack()` restores the full previous URL including search params.

**Q2: When should the state reset?**
A: Never (stays in URL until user navigates away fresh). Exception: vendor selection clears after checkout or cart abandonment.

**Q3: Should `?expanded=id1,id2,...` go into the cooking URL?**
A: Yes. Acceptable even for many open recipes.

**Q4: Should search auto-expanded state also be remembered?**
A: Not separately needed. `?q` is already in the URL; `CookingControlBar` initializes `searchVisible` from `!!q`; and the cooking page already computes `isExpanded = searchMatchedItemIds ? true : expandedRecipeIds.has(recipe.id)` as an overlay. Navigating back with `?q` intact restores search-auto-expand automatically.

**Q5: Should going back to the shopping page restore the exact vendor selection?**
A: Yes, via URL search param.

**Q6: Should vendor selection reset after checkout or cart abandonment?**
A: Yes — clear `?vendor` param on checkout/abandon success.

## Decision

Use URL search params for both:

- **Cooking:** add `?expanded=id1,id2` to the `/cooking` route's `validateSearch`
- **Shopping:** add `?vendor=<id>` to the `/shopping` route's `validateSearch`

Both use `navigate({ search: (prev) => ({ ...prev, key: value }) }, { replace: true })` to avoid polluting history.
