# Hide Nav Bar on Recipe Settings Pages

**Date:** 2026-02-23

## Problem

The bottom navigation bar is hidden on `/items/`, `/settings/tags`, and `/settings/vendors` routes, where a fixed top bar handles navigation. The `/settings/recipes` pages use the same fixed top bar pattern but still show the bottom nav bar, creating an inconsistency.

## Goal

Hide the bottom nav bar (and remove its reserved padding) on all `/settings/recipes` routes, matching the behavior of tags and vendors settings pages.

## Design

### Approach

Extend the existing `isFullscreenPage` condition in `Navigation.tsx` and `Layout.tsx` to also match `/settings/recipes`.

### Changes

**`src/components/Navigation.tsx`:**
- Add `location.pathname.startsWith('/settings/recipes')` to the `isFullscreenPage` condition
- Update the comment to include "recipes"

**`src/components/Layout.tsx`:**
- Same addition to the `isFullscreenPage` condition

### Scope

All routes under `/settings/recipes`: list page, new page, and detail pages.

### No other changes needed

The recipe settings pages already use the fixed top bar layout identical to tags and vendors pages.
