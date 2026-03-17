# Implementation Plan: item-list-state-restore E2E Cloud Mode Support

**Date:** 2026-03-17
**Branch:** `feature/e2e-cloud-state-restore`
**Related brainstorming:** `2026-03-17-brainstorming-e2e-cloud-support.md`

## Goal

Add cloud mode support to `e2e/tests/item-list-state-restore.spec.ts` so all four test
cases run under both the `local` and `cloud` Playwright projects.

All required GraphQL operations already exist on the backend. This plan only touches
E2E test files.

---

## Steps

### Step 1 — Create `e2e/utils/cloud.ts` shared helper

**File:** `e2e/utils/cloud.ts` (new)

Create a shared `makeGql` factory used by cloud seeding code across test files. New test
files use it; existing test files are not refactored (that is a separate plan).

```ts
import type { APIRequestContext } from '@playwright/test'
import { CLOUD_GRAPHQL_URL, E2E_USER_ID } from '../constants'

/**
 * Returns a typed GraphQL request helper for cloud seeding.
 * All requests are sent as the E2E test user.
 */
export function makeGql(request: APIRequestContext) {
  return async function gql<T = Record<string, unknown>>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await request.post(CLOUD_GRAPHQL_URL, {
      headers: {
        'x-e2e-user-id': E2E_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { query, variables },
    })
    const json = await res.json()
    if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
    return json.data as T
  }
}
```

**Note:** `CLOUD_GRAPHQL_URL` and `E2E_USER_ID` must be exported from `e2e/constants.ts`.
Verify they exist; add if missing (they are used in `cooking.spec.ts` already).

**Verification:** TypeScript check (`tsc --noEmit` in `e2e/`) passes.

---

### Step 2 — Update `item-list-state-restore.spec.ts` with cloud branches

**File:** `e2e/tests/item-list-state-restore.spec.ts`

#### 2a. Add imports and constants

```ts
import type { APIRequestContext } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { makeGql } from '../utils/cloud'
```

#### 2b. Add cloud cleanup (before/afterEach)

Before the existing `test.afterEach` (which handles local cleanup), add:

```ts
test.beforeEach(async ({ request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  }
})
```

Extend the existing `test.afterEach` to also clean up in cloud mode:

```ts
test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }
  // existing local IndexedDB cleanup...
})
```

#### 2c. Make `seedItems` cloud-aware

Replace the existing `seedItems` function with a mode-aware version:

```ts
async function seedItems(
  page: Page,
  names: string[],
  options?: { request?: APIRequestContext; baseURL?: string },
) {
  if (options?.baseURL === CLOUD_WEB_URL && options.request) {
    const gql = makeGql(options.request)
    for (const name of names) {
      await gql('mutation CreateItem($name: String!) { createItem(name: $name) { id } }', { name })
    }
    return
  }
  // existing local IndexedDB seeding (unchanged)...
}
```

Return type: when cloud, the function doesn't return IDs (not needed by tests). When local,
keep existing void return.

#### 2d. Make `seedTagTypes` cloud-aware

Replace with a mode-aware version that returns created IDs for cloud:

```ts
async function seedTagTypes(
  page: Page,
  names: string[],
  options?: { request?: APIRequestContext; baseURL?: string },
): Promise<string[]> {
  if (options?.baseURL === CLOUD_WEB_URL && options.request) {
    const gql = makeGql(options.request)
    const colors = ['red', 'blue', 'green', 'orange', 'purple']
    const ids: string[] = []
    for (let i = 0; i < names.length; i++) {
      const result = await gql<{ createTagType: { id: string } }>(
        'mutation CreateTagType($name: String!, $color: String!) { createTagType(name: $name, color: $color) { id } }',
        { name: names[i], color: colors[i % colors.length] },
      )
      ids.push(result.createTagType.id)
    }
    return ids
  }
  // Local: existing IndexedDB seeding. tagType IDs are `seed-tagtype-{i}`.
  await /* existing local implementation */ ...
  return names.map((_, i) => `seed-tagtype-${i}`)
}
```

#### 2e. Make `seedTagsForAllItems` cloud-aware

Cloud version:
1. Fetch all items via `query { items { id } }`
2. Create each tag via `createTag` mutation, collecting `tagId`
3. Assign all tagIds to each item via `updateItem` mutation

```ts
async function seedTagsForAllItems(
  page: Page,
  tags: { typeIndex: number; name: string }[],
  options?: { request?: APIRequestContext; baseURL?: string; tagTypeIds?: string[] },
) {
  if (options?.baseURL === CLOUD_WEB_URL && options.request) {
    const gql = makeGql(options.request)
    const tagTypeIds = options.tagTypeIds ?? []

    // Get all item IDs
    const { items } = await gql<{ items: { id: string }[] }>('query { items { id } }')

    // Create tags
    const tagIds: string[] = []
    for (const tag of tags) {
      const result = await gql<{ createTag: { id: string } }>(
        'mutation CreateTag($name: String!, $typeId: String!) { createTag(name: $name, typeId: $typeId) { id } }',
        { name: tag.name, typeId: tagTypeIds[tag.typeIndex] },
      )
      tagIds.push(result.createTag.id)
    }

    // Assign all tags to every item
    for (const item of items) {
      await gql(
        'mutation UpdateItem($id: ID!, $input: UpdateItemInput!) { updateItem(id: $id, input: $input) { id } }',
        { id: item.id, input: { tagIds } },
      )
    }
    return
  }
  // existing local IndexedDB seeding (unchanged)...
}
```

#### 2f. Update test bodies to pass `{ request, baseURL }` to seed functions

Each test that seeds data must pass the new options. Example:

```ts
test('user can navigate to item detail and back with search state preserved', async ({ page, request, baseURL }) => {
  await seedItems(page, ['Apple', 'Banana', 'Milk', 'Cheese', 'Bread'], { request, baseURL })
  // rest unchanged
})
```

For the scroll tests that also seed tags:

```ts
test('user can navigate to item detail and back with scroll position restored', async ({ page, request, baseURL }) => {
  const itemNames = Array.from({ length: 40 }, (_, i) => `Item ${String(i + 1).padStart(2, '0')}`)
  await seedItems(page, itemNames, { request, baseURL })
  const tagTypeIds = await seedTagTypes(page, ['Category', 'Location'], { request, baseURL })
  await seedTagsForAllItems(page, [
    { typeIndex: 0, name: 'Pantry' },
    { typeIndex: 1, name: 'Fridge' },
  ], { request, baseURL, tagTypeIds })
  // rest unchanged
})
```

**Verification:** `pnpm test:e2e --grep "item-list-state-restore"` passes in local mode.

---

### Step 3 — Add test to `testMatch` in `playwright.config.ts`

**File:** `e2e/playwright.config.ts`

Add `'**/tests/item-list-state-restore.spec.ts'` to the `testMatch` array for the `cloud`
project, alongside the existing five files.

**Verification:** `pnpm test:e2e --grep "item-list-state-restore"` passes in cloud mode.

---

### Step 4 — Final quality gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
pnpm test:e2e --grep "item-list-state-restore"
```

All must pass before finishing.

---

## Out of Scope

- Refactoring existing test files to use the shared `makeGql` helper
- Adding new test cases
- Changing test assertions
- Changing page objects
