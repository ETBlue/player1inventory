---
title: Bug — Auto-import dialog stuck after local→cloud switch
date: 2026-04-29
area: settings / import
---

## Bug Description

When switching from offline → cloud mode with "copy data + clear and import":
- The "Copying local data to cloud..." dialog appears
- No visible progress (dialog is a static title, no progress bar)
- All HTTP requests complete (bulk create mutations + resetStore refetches)
- Dialog never disappears

## Root Cause

`usePostLoginMigration` has no `.catch()` on its promise chain:

```ts
fetchLocalPayload()
  .then((payload) => importCloudData(payload, storedStrategy, apolloClient))
  .then(() => {
    localStorage.removeItem(MIGRATION_STRATEGY_KEY)
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')   // ← never called if importCloudData rejects
  })
  // ← no .catch()
```

`importCloudData` calls `client.resetStore()` internally at the end of the "clear" strategy path. `resetStore()` refetches all active Apollo queries; if any refetch returns a GraphQL error, `resetStore()` rejects. `importCloudData` re-throws via its internal try-catch. Because there's no `.catch()` in `usePostLoginMigration`, `setState('done')` is skipped and the `auto-importing` dialog stays open indefinitely.

Secondary gap: the `PostLoginMigrationDialog` for `auto-importing` state renders only a static title — no progress tracking is passed to `importCloudData`, so the user sees no feedback while the import runs.

## Fix Applied

Added a `.catch()` to the auto-import promise chain in `usePostLoginMigration.ts`:

```ts
.catch(() => {
  // Import failed — clean up strategy key and dismiss so the user
  // isn't stuck. MIGRATION_PROMPTED_KEY is intentionally NOT set here
  // so the user can retry after refreshing.
  localStorage.removeItem(MIGRATION_STRATEGY_KEY)
  setState('done')
})
```

`MIGRATION_STRATEGY_KEY` is removed so the failed import doesn't loop on next
page load. `MIGRATION_PROMPTED_KEY` is intentionally NOT set so the user
retains the ability to trigger migration again after the underlying error is
resolved.

## Test Added

`apps/web/src/hooks/usePostLoginMigration.test.ts` — two tests in
`usePostLoginMigration — auto-import path`:

1. **transitions to done even when importCloudData rejects** — verifies that
   the dialog closes (`state === 'done'`), `MIGRATION_STRATEGY_KEY` is
   removed, and `MIGRATION_PROMPTED_KEY` is NOT set when `importCloudData`
   rejects.

2. **transitions to done and sets prompted key when importCloudData succeeds**
   — regression guard for the happy path; verifies `state === 'done'`,
   `MIGRATION_PROMPTED_KEY === '1'`, and `MIGRATION_STRATEGY_KEY` is removed.

## PR / Commit

Part of feature branch `feature/shelf-data-ops`
