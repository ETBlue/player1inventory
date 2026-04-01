# Bug: Expiration badge shows error visual when expirationThreshold is null

## Bug description

An item with `expirationThreshold: null` (no threshold configured) shows its expiration badge with error styling ("bg-status-error" background + TriangleAlert icon). The badge text "Expires in 6 days" is correct, but the visual state is wrong — it should render as a plain muted text badge, not an error warning.

## Root cause

`ItemCard/index.tsx` (lines 244–246) computes `isWarning` as:

```tsx
const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
const isWarning = daysUntilExpiration <= threshold
```

When `expirationThreshold` is `null`, the fallback is `Infinity`. Since any finite number is `<= Infinity`, `isWarning` is always `true` for items with no threshold — making every expiration badge render in error style regardless of urgency.

The correct behavior: when `expirationThreshold` is `null`, the user has not defined a warning threshold, so `isWarning` should be `false`.

## Fix applied

In `apps/web/src/components/item/ItemCard/index.tsx` (lines 244–246), replaced:

```tsx
const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
const isWarning = daysUntilExpiration <= threshold
```

with:

```tsx
const isWarning =
  item.expirationThreshold != null &&
  daysUntilExpiration <= item.expirationThreshold
```

The unused `threshold` variable was removed. Using `!= null` catches both `null` (cloud DB) and `undefined` (unset field).

## Test added

`apps/web/src/components/item/ItemCard/ItemCard.test.tsx` — two new rendering tests in the `ItemCard - Tag Sorting` describe block:

- **"shows plain muted badge (no error style) when expirationThreshold is null"** — item with `null` threshold expiring in 6 days renders with `text-foreground-muted`, no `bg-status-error`, no TriangleAlert icon.
- **"shows error style badge when threshold is set and item is within it"** — item with `expirationThreshold: 3` expiring in 2 days renders with `bg-status-error` + TriangleAlert (regression guard).

Also updated the four unit-level logic tests in `ItemCard - Expiration Warning Logic` to use the corrected `!= null` guard instead of the old `?? Infinity` pattern.

## PR / commit

Commit `2f5fb58` — `fix(items): suppress expiration warning badge when threshold is null`
