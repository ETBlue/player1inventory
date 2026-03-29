---
feature: tags
date: 2026-03-29
type: bug
---

# Bug: E2E cascade-delete test sees no child tags

## Bug Description

The E2E test `user can delete a parent tag with cascade (deletes child tags too)` in `e2e/tests/settings/tags.spec.ts:766` fails. The test expects the "This tag has child tags" alert dialog when deleting the "Chicken" tag, but instead receives the regular safe-delete dialog ("It's safe to delete 'Chicken' since no item is using it."). This means `hasChildren` is `false` at deletion time — the "Grilled Chicken" child tag is absent from the tags list.

## Root Cause

Race condition in test setup (cloud variant). After `page.goBack()` (line 789) and creating "Grilled Chicken" with `submitTagDialog()` (line 795), the test navigates directly to the parent tag detail page. In cloud mode, the tags query may not have refetched by the time the detail page evaluates `childTags`, so `hasChildren === false`.

**Affected file:** `e2e/tests/settings/tags.spec.ts` lines ~789–820

## Fix Applied

Replaced `page.goto(\`/settings/tags/${parentTagId}\`)` (a hard page reload that clears the Apollo InMemoryCache) with SPA navigation using `tagsPage.clickTagBadgeToNavigate('Chicken')`. The SPA navigation preserves the in-memory Apollo cache, which was already updated by the `createTag` mutation's `refetchQueries: [{ query: GetTagsDocument }]`. With the cache intact, `useTags()` on the detail page returns data synchronously — including "Grilled Chicken" with `parentId` set — so `hasChildren === true` immediately.

The original `page.goto()` forced a fresh network `GetTags` request on mount. The response arrived and React re-rendered, but the existing `page.waitForSelector('h1')` + `expect(h1).toContainText('Chicken')` completed before the re-render finished — so the Delete click landed before `hasChildren` was set to `true`.

**Affected file:** `e2e/tests/settings/tags.spec.ts` line 819

## Test Added / Updated

The fix is the test itself — the navigation approach was changed from hard reload to SPA click.

## PR / Commit

Part of the `feature/sort-tags-alpha` branch.
