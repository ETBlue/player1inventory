# Inactive Item Logic — Design

Date: 2026-02-22

## Summary

Complete two in-progress changes to item "inactive" state: a logic update to `isInactive()` and a visual scoping fix in `ItemCard`, then move all work to an isolated worktree.

## Changes Already Made (Uncommitted on main)

### 1. `isInactive` logic (`src/lib/quantityUtils.ts`)

**Before:** `targetQuantity === 0 && getCurrentQuantity(item) === 0`
**After:** `targetQuantity === 0 && refillThreshold === 0`

An item is now considered inactive when neither a target nor a refill threshold has been configured — i.e., the user isn't tracking the item at all. Previously, having stock on hand would prevent the item from being inactive even if both tracking values were 0.

### 2. `ItemCard` opacity scope (`src/components/ItemCard.tsx`)

**Before:** `opacity-50` on the entire `<Card>` wrapper.
**After:** `opacity-50` on `<CardHeader>` and `<CardContent>` only, leaving shopping-mode controls (checkbox, cart ±buttons) at full opacity.

## Work to Complete

### Tests (`src/lib/quantityUtils.test.ts`)

- Fix `'returns true when both target and current are 0'` — add `refillThreshold: 0` and update description
- Fix `'returns false when current > 0'` — description is misleading; update to reflect that current quantity is no longer part of the check
- Add new test: `targetQuantity === 0 && refillThreshold > 0` → `false` (not inactive when threshold is set)

### Integration test (`src/lib/quantityUtils.integration.test.ts`)

- Add `item.refillThreshold = 0` before the `isInactive` assertion at line 54

### Storybook (`src/components/ItemCard.stories.tsx`)

- Add `refillThreshold: 0` to the `InactiveItem` story args (currently inherits `refillThreshold: 1` from `mockItem`, so the story does not render as inactive with the new logic)

## Execution Plan

1. Stash uncommitted changes on main (`git stash`)
2. Create feature branch `fix/inactive-item-logic`
3. Create worktree at `.worktrees/fix-inactive-item-logic`
4. Apply stash in worktree (`git stash pop`)
5. Fix tests + Storybook in worktree
6. Verify all tests pass (`pnpm test`)
7. Commit everything together
