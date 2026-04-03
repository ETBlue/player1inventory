---
date: 2026-04-03
area: items
status: fixed
---

# Bug: Expiration message not rendered in ItemCard

## Bug Description

ItemCard does not show the expiration countdown/warning for items that have `estimatedDueDays` set but no `expirationMode` stored. The `estimatedDueDate` computed value is `undefined` even when `lastPurchase` and `estimatedDueDays` are both available.

## Root Cause

`expirationMode` was added in DB version 7 (no migration callback — "prototype mode, single user"). Existing items have `estimatedDueDays` set but `expirationMode` is `undefined`.

`computeExpiryDate` (`src/lib/expiration.ts`) checks `!mode || mode === 'disabled'` first and returns `undefined` immediately when `expirationMode` is `undefined`, without falling back to infer the mode from `estimatedDueDays` or `dueDate`.

The item detail form (`src/routes/items/$id/index.tsx:45-51`) already has correct inference:
```ts
expirationMode:
  item.expirationMode ??
  (item.estimatedDueDays != null ? 'days from purchase' : item.dueDate ? 'date' : 'disabled')
```

But `computeExpiryDate` does not.

## Fix Applied

Added the same inference logic to `computeExpiryDate` in `src/lib/expiration.ts`. When `expirationMode` is `undefined`, the function now infers mode from data before gating:
- `estimatedDueDays != null` → `'days from purchase'`
- `dueDate` exists → `'date'`
- otherwise → `'disabled'`

## Test Added

Updated `src/lib/expiration.test.ts`:
- Changed the "treats undefined as disabled" test to only assert disabled when no expiration data is present
- Added two new cases: `undefined` mode + `estimatedDueDays` set, and `undefined` mode + `dueDate` set

## PR / Commit

696421d — fix(expiration): infer mode from data when expirationMode is undefined
