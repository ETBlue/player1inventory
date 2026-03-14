# Design: Apply Toolbar to New Vendor and New Recipe Pages

## Overview

Apply the shared `<Toolbar>` component to the "New Vendor" and "New Recipe" pages, replacing their current raw inline div headers. Also align the New Vendor page to use `useAppNavigation` for consistent smart back navigation.

## Motivation

Both pages have a hand-rolled `<div className="flex items-center gap-2">` that duplicates the styling already provided by `<Toolbar>`. Using the component keeps styling centralized and consistent with other in-flow toolbars (vendor list, tags page, shopping cart toolbar).

Additionally, the New Vendor page uses `navigate({ to: '/settings/vendors' })` (hardcoded), while the New Recipe page already uses `useAppNavigation`. Aligning both to `useAppNavigation` ensures consistent smart back navigation across all "new" pages.

## Changes

### `src/routes/settings/vendors/new.tsx`

- Import `Toolbar` from `@/components/Toolbar`
- Import `useAppNavigation` from `@/hooks/useAppNavigation`
- Replace `<div className="flex items-center gap-2">` with `<Toolbar>`
- Replace `navigate({ to: '/settings/vendors' })` with `goBack()` from `useAppNavigation('/settings/vendors')`

### `src/routes/settings/recipes/new.tsx`

- Import `Toolbar` from `@/components/Toolbar`
- Replace `<div className="flex items-center gap-2">` with `<Toolbar>`
- Back navigation already uses `useAppNavigation` — no change

## Non-Changes

- No new components
- No layout structure changes (pages remain in-flow, not fixed)
- No test changes required (tests don't assert on toolbar markup)
- No visual changes to the user (Toolbar provides the same flex/gap/border/bg styling)
