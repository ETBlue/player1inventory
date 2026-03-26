# Brainstorming Log — Nested Tags: Cloud Mode Support

**Date:** 2026-03-26
**Topic:** Extending Phase A (nested tags) to fully support cloud mode
**Context:** Phase A implemented nested tags for local/offline mode only. Cloud mode (GraphQL/MongoDB backend) was missing `parentId` entirely.

---

## Questions & Answers

**Q1: Cascade deletion — what happens when a parent tag is deleted in cloud mode?**
A: Show a dialog and let the user choose:
- **Option A:** Delete all child tags recursively
- **Option B:** Unset `parentId` on all children (orphan them, they become top-level)

**Q2: Should the UI allow *setting* a parent tag (not just displaying it)?**
A: Yes — allow setting parent tag in the UI for **both cloud and offline mode**.

**Q3: Existing cloud users' tags have no `parentId` — any migration needed?**
A: No special handling. Existing tags stay as-is (treated as top-level, depth 0).

**Q4: Is this a standalone task or part of Phase A's PR?**
A: Part of Phase A. Should be included before Phase A's PR is created.

**Q5: Post-login migration / import-export — carry `parentId`?**
A: Yes — carry `parentId` in both directions during post-login migration and import/export.

**Q6: Where is the backend code?**
A: In the same monorepo.

**Q7: Parent tag selector — create vs. edit form?**
A: Support parent tag on creation too (add the selector to the new-tag form, not only the edit form).

**Q8: Storybook Apollo provider fix — scope?**
A: Fix all affected stories across the app. Find them by running smoke tests (`pnpm test`).

**Q9: Delete-parent dialog — remember user choice?**
A: Always start fresh — no remembered default.

**Q10: Post-login migration — is there existing migration code to extend?**
A: No existing migration pipeline yet. Scope reduced: carry `parentId` in import/export only. Post-login sync (IndexedDB → MongoDB) is deferred to a later phase.

---

## Current Implementation Issues (discovered during Phase A)

1. **`useTagsWithDepth` cloud mode**: The hook delegates to `useTags()` which handles dual mode. However, the cloud GraphQL schema doesn't return `parentId`, so cloud-mode tags are all depth 0 until the backend is updated.
2. **Storybook Apollo error**: Some Storybook pages are broken with: _"Could not find 'client' in the context or passed in as an option. Wrap the root component in an `<ApolloProvider>`."_ — stories that render routes calling Apollo hooks need `<ApolloProvider client={noopApolloClient}>`.

---

## Design Decisions

### Backend changes
- Add `parentId?: string` to Mongoose `TagClass` model
- Add `parentId` to GraphQL `Tag` type and `CreateTag`/`UpdateTag` mutations
- Update resolvers to accept and persist `parentId`
- Run codegen to regenerate TypeScript types

### Delete parent tag dialog
- In `useDeleteTag`, before deleting, check if the tag has children
- If it does, show a dialog with two choices: "Delete all children" or "Keep children (make them top-level)"
- Both actions are implemented as server-side mutations (delete cascade vs. unset parentId)
- Cloud and local mode both get the dialog

### Set parentId in tag form
- In `settings/tags/$id/index.tsx`, replace the read-only parent display with a dropdown select
- Also add the parent selector to the new-tag creation form
- The dropdown lists all tags of the same `typeId` (excluding the tag itself and its own descendants, to prevent cycles)
- A "None" option clears the `parentId`
- Works in both cloud and offline mode (local: updateTag; cloud: UpdateTag mutation)

### Delete parent tag dialog
- Always starts fresh — no remembered default choice

### Import/export
- Ensure `parentId` is included in JSON export/import
- Post-login sync (IndexedDB → MongoDB) is deferred to a later phase — not in Phase A

---

## Scope Summary (Phase A additions)

1. Fix Storybook Apollo provider errors (all affected stories — find via smoke tests)
2. Backend: `parentId` in Mongoose schema, GraphQL type, and resolvers (same monorepo)
3. Client: update GraphQL operations + regenerate types (codegen)
4. Hooks: pass `parentId` in cloud create/update paths
5. UI: parent tag selector in both new-tag creation form and edit form (both modes)
6. UI: delete-parent dialog (cascade vs. orphan, both modes; always starts fresh)
7. Import/export: carry `parentId` in JSON export/import (post-login sync deferred)
