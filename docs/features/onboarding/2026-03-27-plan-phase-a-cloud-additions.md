# Phase A Cloud Additions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Extend Phase A (nested tags) to fully support cloud mode — backend schema, hooks, UI, delete dialog, and import/export.

**Design doc:** `docs/features/onboarding/2026-03-26-design-onboarding.md`
**Brainstorming log:** `docs/features/onboarding/2026-03-26-brainstorming-nested-tags-cloud-mode.md`

**Prerequisite:** Phase A steps 1–6 are committed on `feature/onboarding`.

**Tech stack:** TypeScript (Mongoose + TypeGraphQL + Apollo), Dexie.js, React 19, TanStack Query, shadcn/ui.

---

## Verification Gate (run after every step)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-phase-a-cloud.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-phase-a-cloud.log && echo "FAIL: deprecated imports" || echo "OK"
```

Final step only — also run:

```bash
pnpm test:e2e --grep "tags|items|pantry|shopping|a11y"
```

---

## Step 1 — Fix Storybook Apollo provider errors

**Context:** Some route-level stories call Apollo hooks and need `<ApolloProvider client={noopApolloClient}>` wrapping. The stub is already at `apps/web/src/test/apolloStub.ts`.

**Files to change:**
- Run `pnpm test` (Vitest smoke tests) and collect all stories that fail with _"Could not find 'client'"_
- For each affected `.stories.tsx`, wrap the `RouterProvider` (or root element) with `<ApolloProvider client={noopApolloClient}>`
- Import pattern:
  ```ts
  import { noopApolloClient } from '@/test/apolloStub'
  import { ApolloProvider } from '@apollo/client/react'
  ```

**No new tests needed** — the existing smoke tests (`*.stories.test.tsx`) are the verification. They must all pass after this step.

**Commit:** `fix(storybook): wrap route stories with ApolloProvider to fix missing client errors`

---

## Step 2 — Backend: add `parentId` to schema, model, and resolvers

**Files:**
- Modify: `apps/server/src/schema/tag.graphql`
- Modify: `apps/server/src/models/Tag.model.ts`
- Modify: `apps/server/src/resolvers/tag.resolver.ts`

**What to do:**

### `tag.graphql`
Add `parentId: String` as optional field to `type Tag`.
Add `parentId: String` to both `CreateTagInput` and `UpdateTagInput` (or the equivalent mutation input types).

### `Tag.model.ts`
Add `@prop({ type: String }) parentId?: string` to `TagClass`.

### `tag.resolver.ts`
1. **`createTag`** — accept and persist `parentId` from input.
2. **`updateTag`** — accept and persist `parentId` from input (allow setting to `null`/`undefined` to clear it).
3. **`deleteTag`** — before deleting, find all tags whose `parentId` equals the deleted tag's `id`. Handle them based on the caller-supplied `deleteChildren: Boolean` flag:
   - `deleteChildren: true` → recursively delete all child tags (and their children)
   - `deleteChildren: false` (default) → unset `parentId` on all direct children (they become top-level)

Update the `deleteTag` mutation signature to accept `deleteChildren: Boolean` (optional, default `false`).

**Tests:** Backend unit/integration tests if the project has them; otherwise the E2E test at the final step covers this.

**Commit:** `feat(backend/tags): add parentId to schema, model, and resolver with cascade delete option`

---

## Step 3 — Client: update GraphQL operations and run codegen

**Files:**
- Find all `.graphql` operation files in `apps/web/src/` that reference Tag fragments or tag mutations
- Modify: add `parentId` to Tag fragments and mutation variables
- Run: `pnpm codegen`
- Verify: `apps/web/src/generated/graphql.ts` now includes `parentId` on the Tag type and input types

**What to do:**

1. In any `TagFragment` or equivalent GraphQL fragment, add `parentId` to the selected fields.
2. In `createTag` and `updateTag` mutation operations, add `parentId` to the variables and the mutation body.
3. In `deleteTag` mutation operation, add `deleteChildren: Boolean` to the variables.
4. Run `pnpm codegen` from the repo root.
5. Check the generated file for TypeScript errors — fix any that appear.

**No new tests needed** — type safety from codegen + the build gate (`pnpm build`) is the verification.

**Commit:** `feat(client/tags): add parentId and deleteChildren to GraphQL operations; run codegen`

---

## Step 4 — Hooks: pass `parentId` in cloud create/update/delete paths

**Files:**
- Modify: `apps/web/src/hooks/useTags.ts`

**What to do:**

In `useCreateTag` (around line 266):
- Add `parentId?: string` to the hook's input type
- Pass `parentId` through to both the local `createTag()` call and the GraphQL mutation variables

In `useUpdateTag` (around line 306):
- Add `parentId?: string` to the updates type
- Pass `parentId` through to both the local `updateTag()` call and the GraphQL mutation variables

In `useDeleteTag` (around line 351):
- Add `deleteChildren?: boolean` to the hook's input
- Pass `deleteChildren` to the GraphQL mutation variable (cloud path)
- For the **local path**: implement the cascade manually using Dexie —
  - `deleteChildren: true` → recursively find and delete all child tags in IndexedDB
  - `deleteChildren: false` → find all direct children and set their `parentId` to `undefined`

**Tests:** Update `operations.test.ts` if applicable; verify dual-mode behavior.

**Commit:** `feat(hooks/tags): pass parentId and deleteChildren through create/update/delete hooks`

---

## Step 5 — UI: parent tag selector in create and edit forms

**Files:**
- Modify: `apps/web/src/routes/settings/tags/index.tsx` (new-tag creation flow)
- Modify: `apps/web/src/routes/settings/tags/$id/index.tsx` (edit form — Info tab)
- Modify: `apps/web/src/routes/settings/tags/index.stories.tsx`
- Modify: `apps/web/src/routes/settings/tags/$id/index.stories.tsx`

**What to do:**

### Edit form (`$id/index.tsx`)
Replace the read-only "Parent: [tag name]" display with a `<Select>` dropdown:
- Options: all tags sharing the same `typeId`, excluding the tag itself and its descendants (to prevent cycles — use `getTagAndDescendantIds` from `tagUtils.ts`)
- Add a "None" option (value `""`) to clear `parentId`
- On change: call `useUpdateTag` with the new `parentId` (or `undefined` if "None")
- Works in both local and cloud mode

### Creation form (`index.tsx`)
The new-tag creation flow uses `AddNameDialog` or similar. Extend it to also offer a parent tag selector:
- Show the parent selector only after a tag type is chosen (since available parents depend on `typeId`)
- Parent selection is optional — default is no parent

### Stories
- Add a `WithParentSelector` story to each file showing the dropdown populated with sibling tags
- Update existing stories if the form layout changed

**Commit:** `feat(settings/tags): add parent tag selector to create and edit forms`

---

## Step 6 — UI: delete-parent dialog (cascade vs. orphan)

**Files:**
- Modify: `apps/web/src/routes/settings/tags/$id/index.tsx`
- Modify: `apps/web/src/hooks/useTags.ts` (if not already done in Step 4)
- Modify: `apps/web/src/routes/settings/tags/$id/index.stories.tsx`

**What to do:**

When the user attempts to delete a tag that has children:
1. Before calling `useDeleteTag`, check if the tag has any children (i.e. any tag with `parentId === tag.id`)
2. If yes, show a custom `AlertDialog` (shadcn) with:
   - **Title:** "This tag has child tags"
   - **Description:** "Choose what to do with the child tags."
   - **Button A:** "Delete all child tags" → calls `useDeleteTag({ id, deleteChildren: true })`
   - **Button B:** "Keep child tags (make them top-level)" → calls `useDeleteTag({ id, deleteChildren: false })`
   - **Cancel button** — dismisses with no action
3. If the tag has no children, delete immediately (existing behaviour — no dialog).
4. Always starts fresh — no remembered choice.

Both local and cloud paths are covered by `useDeleteTag` from Step 4.

### Stories
Add a `WithChildTagsDeleteDialog` story showing the dialog state.

**Commit:** `feat(settings/tags): show cascade-or-orphan dialog when deleting a parent tag`

---

## Step 7 — Import/export: carry `parentId`

**Files:**
- Modify: `apps/web/src/lib/importData.ts` (function `toTagInput` around line 152)
- Modify: `apps/web/src/lib/exportData.ts` (if `parentId` is stripped there too)

**What to do:**

In `toTagInput()`:
```ts
// Before
return { id: t.id, name: t.name, typeId: t.typeId }

// After
return { id: t.id, name: t.name, typeId: t.typeId, parentId: t.parentId }
```

In `exportData.ts`: verify `parentId` is not stripped by `sanitiseCloudPayload()` or any other mapper. If it is, update that mapper too.

In the import conflict detection: update any equality comparison that checks if a local and remote tag "match" — `parentId` should be included in the comparison so a changed `parentId` is treated as a conflict.

**Tests:**
- `user can export tags with parentId`
- `user can import tags with parentId`
- `user can import tags without parentId (backwards-compatible)`

**Commit:** `feat(import-export): include parentId in tag export and import`

---

## Final E2E check

After all steps pass the verification gate:

```bash
pnpm test:e2e --grep "tags|items|pantry|shopping|a11y"
```

Fix any failures before marking Phase A complete and opening the PR.
