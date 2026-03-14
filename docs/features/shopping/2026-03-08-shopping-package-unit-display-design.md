# Shopping Page: Package Unit Display

**Date:** 2026-03-08
**Status:** Approved

## Problem

On the shopping page, dual-unit items (those with both `packageUnit` and `measurementUnit`) currently display quantities in measurement units (e.g. "750g / 2000g"). When shopping, users think in terms of packages they pick up at the store — not grams or milliliters. Additionally, checkout adds purchased quantity to `unpackedQuantity`, which is semantically wrong when the user is buying whole packages.

## Goals

- Shopping page ItemCards always display quantities in package units for all items.
- Checkout adds purchased quantity to `packedQuantity` instead of `unpackedQuantity`.

## Design

### 1. ItemCard — `isPackageDisplay` prop

Add `isPackageDisplay?: boolean` to `ItemCard`. When true:

- **Current quantity base**: `packedQuantity`
- **Unpacked display**: If `unpackedQuantity > 0` and `measurementUnit` exists, show `{packed} (+{unpacked}{measurementUnit})`. Otherwise just `{packed}`.
- **Target quantity**: If `targetUnit === 'measurement'` and `amountPerPackage` exists, convert: `Math.ceil(targetQuantity / amountPerPackage)`. Otherwise use `targetQuantity` as-is.
- **Unit label**: Use `packageUnit` if available (e.g. "3 (+250g) / 4 packs").
- **Progress bar**: Pass package-normalized values to `ItemProgressBar` so fill reflects package count.

### 2. Shopping page

Pass `isPackageDisplay={true}` to all `ItemCard` instances in `src/routes/shopping.tsx`.

### 3. Checkout logic

In `src/db/operations.ts`, change the inventory update so `cartItem.quantity` is added to `item.packedQuantity` instead of `item.unpackedQuantity`. Applies to all items uniformly.

## Testing

- **ItemCard stories**: Add stories with `isPackageDisplay={true}` — dual-unit items (with and without unpacked quantity) and single-unit items.
- **Checkout tests** (`src/db/operations.test.ts`): Update to assert `packedQuantity` increases on checkout (not `unpackedQuantity`).
- **Shopping page tests** (`src/routes/shopping.test.tsx`): Add tests verifying `isPackageDisplay` is passed and quantity display uses package units.

## Files Affected

- `src/components/ItemCard.tsx` — add `isPackageDisplay` prop and display logic
- `src/components/ItemCard.stories.tsx` — add `isPackageDisplay` stories
- `src/db/operations.ts` — update checkout to add to `packedQuantity`
- `src/db/operations.test.ts` — update checkout tests
- `src/routes/shopping.tsx` — pass `isPackageDisplay={true}`
- `src/routes/shopping.test.tsx` — add package unit display tests
