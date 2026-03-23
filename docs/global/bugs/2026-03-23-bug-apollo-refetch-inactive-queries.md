# Bug: Apollo refetchQueries Silently Skips Inactive Queries

## Bug Description

When `useUpdateItem` and `useUpdateRecipe` mutations completed, the item count badges
in settings list pages (Tags, Vendors, Recipes) remained stale in cloud mode. The
browser console logged:

> Unknown query named "ItemCountByTag" requested in refetchQueries options.include array
> Unknown query named "ItemCountByVendor" requested in refetchQueries options.include array

## Root Cause

Apollo Client's `refetchQueries` option accepts operation name strings (e.g.
`'ItemCountByTag'`), but only refetches queries that are **currently active** — i.e.,
mounted and subscribed. When the user navigates from the settings list page to the
entity's items tab, the list-page components (`DraggableTagBadge` etc.) unmount,
making their Apollo queries inactive. By the time the mutation's `refetchQueries`
runs, no active `ItemCountByTag` query exists, so Apollo silently does nothing.

This is fundamentally different from TanStack Query's `invalidateQueries`, which
marks cache entries as stale regardless of active subscriptions and refetches on
next mount.

## Fix Applied

Replaced the string-based `refetchQueries` entries with an `onCompleted` callback
using `cache.modify` and the `DELETE` sentinel:

```typescript
onCompleted: () => {
  apolloClient.cache.modify({
    fields: {
      itemCountByTag: (_, { DELETE }) => DELETE,
      itemCountByVendor: (_, { DELETE }) => DELETE,
    },
  })
  apolloClient.cache.gc()
},
```

`cache.modify` with `DELETE` unconditionally removes the field from Apollo's
InMemoryCache regardless of active subscriptions. On next mount, Apollo sees no
cached value and fetches fresh data — matching TanStack Query's stale-on-next-access
behaviour.

Files fixed:
- `apps/web/src/hooks/useItems.ts` — `useUpdateItem` cloud mutation
- `apps/web/src/hooks/useRecipes.ts` — `useUpdateRecipe` cloud mutation

## PR / Commit

- Fix commit: part of `fix(settings): invalidate item counts after tag/vendor/recipe assignment`
- Doc commit: `docs(bugs): document Apollo refetchQueries active-query limitation and cache.modify fix`
- PR: *TBD*
