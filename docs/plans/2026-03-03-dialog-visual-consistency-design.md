# Dialog Visual Consistency Design

**Date:** 2026-03-03

## Problem

The project has two dialog systems — `Dialog` (dismissible, for forms) and `AlertDialog` (non-dismissible, for confirmations) — which are intentionally separate. However, their visual styles have diverged unnecessarily:

- Footer button placement is inconsistent: `DialogFooter` right-aligns all buttons; `AlertDialogFooter` left-aligns them together; `DeleteButton` hacks a `flex-1` spacer to force left/right split
- `DialogHeader` has no bottom border; `AlertDialogHeader` has `border-b border-accessory-default pb-2`
- `DialogTitle` uses `text-base font-semibold leading-none`; `AlertDialogTitle` uses `font-semibold`

## Goal

Standardize the visual appearance across both dialog types:

1. Cancel button consistently on the left, confirm button on the right
2. Header with bottom border separator in all dialogs
3. Title and description with matching text styles

## Design

### Base Component Changes

**`DialogFooter`** (`src/components/ui/dialog.tsx`)
- Before: `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`
- After: `flex justify-between gap-2`

**`AlertDialogFooter`** (`src/components/ui/alert-dialog.tsx`)
- Before: `flex gap-2`
- After: `flex justify-between gap-2`

**`DialogHeader`** (`src/components/ui/dialog.tsx`)
- Before: `flex flex-col space-y-1.5 text-center sm:text-left`
- After: `flex flex-col space-y-1.5 text-center sm:text-left border-b border-accessory-default pb-2`

**`DialogTitle`** (`src/components/ui/dialog.tsx`)
- Before: `text-base font-semibold leading-none`
- After: `font-semibold`

`DialogDescription` already matches `AlertDialogDescription` (`text-sm text-foreground-muted`) — no change.

### Callsite Cleanups

**`DeleteButton.tsx`** — remove `<div className="flex-1" />` spacer (now redundant)

**`TagDetailDialog.tsx`** — remove `className="flex justify-between"` override on `DialogFooter` (now the default)

### Stories

Update `dialog.stories.tsx` and `alert-dialog.stories.tsx` to reflect the new layouts.

## Rationale

- Changes at the base component level means all current and future dialogs get consistent behavior automatically
- `justify-between` naturally places cancel (first in DOM) on the left and confirm (last in DOM) on the right without any per-callsite hacks
- Removing mobile column-stacking (`flex-col-reverse`) aligns with the left/right placement intent
- Adding the header border to `DialogHeader` creates visual separation between header and body in form dialogs, matching the confirmation dialog pattern
