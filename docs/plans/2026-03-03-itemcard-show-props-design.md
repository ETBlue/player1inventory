# ItemCard: showTags / showExpiration Prop-Based Visibility Design

Date: 2026-03-03

## Summary

Move ItemCard's UI visibility from implicit mode-based logic to explicit boolean props. Add a new `showExpiration` prop, and purify `showTags` so it is the sole authority on tag/vendor/recipe badge visibility (removing the internal mode check).

**Motivation:** The current design uses `mode` for two unrelated concerns — behavioral logic (amount controls, ±buttons) and UI visibility (tags, expiration). Splitting them makes the component contract explicit and predictable.

## Desired Visibility Per Page

| Page | Tags | Expiration |
|------|------|------------|
| Pantry (`index.tsx`) | user-controlled via `isTagsVisible` | ✅ show |
| Shopping (`shopping.tsx`) | ❌ hide | ❌ hide |
| Cooking (`cooking.tsx`) | ❌ hide | ✅ show |
| Tag/Vendor/Recipe assignment pages | user-controlled via `isTagsVisible` | ❌ hide |

## Design

### `ItemCard` component changes

**Add `showExpiration` prop** (default `true`):
```ts
showExpiration?: boolean  // default: true
```

Wrap the expiration block with `showExpiration &&`.

**Remove the internal mode check** for tag/vendor/recipe badge sections. Change from:
```tsx
!['shopping', 'cooking'].includes(mode) && showTags
```
to:
```tsx
showTags
```

`mode` retains its current role for behavioral logic only:
- `isAmountControllable` (shopping, recipe-assignment, cooking)
- Pantry ±buttons

### Call site changes

| File | Change |
|------|--------|
| `src/routes/shopping.tsx` | Add `showTags={false}` + `showExpiration={false}` |
| `src/routes/cooking.tsx` | Add `showTags={false}` (expiration stays default `true`) |
| `src/routes/settings/tags/$id/items.tsx` | Add `showExpiration={false}` |
| `src/routes/settings/vendors/$id/items.tsx` | Add `showExpiration={false}` |
| `src/routes/settings/recipes/$id/items.tsx` | Add `showExpiration={false}` |
| `src/routes/index.tsx` | No change (both default to `true`) |

## Files Affected

- `src/components/ItemCard.tsx` — add `showExpiration` prop, remove mode-based tag gate
- `src/routes/shopping.tsx` — pass `showTags={false} showExpiration={false}`
- `src/routes/cooking.tsx` — pass `showTags={false}`
- `src/routes/settings/tags/$id/items.tsx` — pass `showExpiration={false}`
- `src/routes/settings/vendors/$id/items.tsx` — pass `showExpiration={false}`
- `src/routes/settings/recipes/$id/items.tsx` — pass `showExpiration={false}`
- `src/components/ItemCard.test.tsx` — update/add tests
- `src/components/ItemCard.stories.tsx` — update stories
