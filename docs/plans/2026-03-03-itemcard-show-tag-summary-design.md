# ItemCard: showTagSummary Prop Design

Date: 2026-03-03

## Summary

Add `showTagSummary?: boolean` (default `true`) to `ItemCard`. Controls whether the collapsed count summary ("N tags · N vendors · N recipes") appears when `showTags={false}`.

## Behavior Matrix

| showTags | showTagSummary | Result |
|----------|---------------|--------|
| true | (any) | Badges show, count never shows |
| false | true (default) | Count shows — pantry collapsed state |
| false | false | Nothing shows — clean card |

## Design

**Condition change in `ItemCard`:**

```tsx
// Before:
!showTags && (tags.length > 0 || vendors.length > 0 || recipes.length > 0)

// After:
!showTags && showTagSummary && (tags.length > 0 || vendors.length > 0 || recipes.length > 0)
```

**Call sites to update:**
- `src/routes/shopping.tsx` — add `showTagSummary={false}`
- `src/routes/cooking.tsx` — add `showTagSummary={false}`

All other call sites (pantry, assignment pages) omit the prop — default `true` preserves current behavior.

## Files Affected

- `src/components/ItemCard.tsx` — add prop, update count condition
- `src/components/ItemCard.test.tsx` — add tests
- `src/routes/shopping.tsx` — pass `showTagSummary={false}`
- `src/routes/cooking.tsx` — pass `showTagSummary={false}`
