# Default Package Unit: Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Standardise the fallback label shown when `item.packageUnit` is empty. Currently `ItemCard` and the inventory log tab show `"units"` while `ItemForm` already uses `"pack"`. Unify all three under a single exported constant.

## Design

### Constant

Add to `src/types/index.ts`, alongside the `Item` interface that owns `packageUnit`:

```ts
export const DEFAULT_PACKAGE_UNIT = 'pack'
```

### Files to Update

| File | Change |
|---|---|
| `src/types/index.ts` | Add `export const DEFAULT_PACKAGE_UNIT = 'pack'` |
| `src/components/ItemCard.tsx` | `item.packageUnit ?? 'units'` → `item.packageUnit ?? DEFAULT_PACKAGE_UNIT` |
| `src/routes/items/$id.log.tsx` | `item?.packageUnit ?? 'units'` → `item?.packageUnit ?? DEFAULT_PACKAGE_UNIT` |
| `src/components/ItemForm.tsx` (×5) | `packageUnit \|\| 'pack'` → `packageUnit \|\| DEFAULT_PACKAGE_UNIT` |

`src/routes/cooking.tsx` uses `?? ''` intentionally (blank reads cleanly inline with a quantity) — left unchanged.
