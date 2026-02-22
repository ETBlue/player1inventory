# Hide Nav Bar on Tag and Vendor Pages

**Date:** 2026-02-23

## Problem

The bottom navigation bar is hidden on `/items/` routes (item detail and new item pages), where a fixed top bar handles navigation. Tag and vendor detail/list pages use the same fixed top bar pattern but still show the bottom nav bar, creating an inconsistency.

## Goal

Hide the bottom nav bar (and remove its reserved padding) on all `/settings/tags` and `/settings/vendors` routes, matching the behavior of item pages.

## Design

### Approach

Extend the existing path-based checks in `Navigation.tsx` and `Layout.tsx` to include tag and vendor routes. Rename the variable `isItemPage` to `isFullscreenPage` to accurately reflect the broader set of routes it covers.

### Changes

**`src/components/Navigation.tsx`:**
- Rename `isItemPage` → `isFullscreenPage`
- Expand condition: `pathname.startsWith('/items/') || pathname.startsWith('/settings/tags') || pathname.startsWith('/settings/vendors')`
- Update comment to reflect the new meaning

**`src/components/Layout.tsx`:**
- Same rename and condition expansion for the `pb-20` padding removal

### Scope

All routes under `/settings/tags` and `/settings/vendors` — both list pages and detail pages.

### No other changes needed

Tag and vendor detail pages already use the fixed top bar pattern identical to item pages. They just weren't opting out of the bottom nav bar.
