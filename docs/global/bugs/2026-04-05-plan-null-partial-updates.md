# Null Partial Updates Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `toUpdateItemInput()` so partial item updates (quantity buttons, tag/vendor assignment, cooking consume) no longer null out expiration and measurement fields in cloud mode.

**Architecture:** Two coordinated changes — (1) `toUpdateItemInput()` uses sparse spreading so absent fields are omitted from the GraphQL input entirely, and (2) `buildUpdates()` replaces `delete` with explicit `undefined` assignment so intentional clears from the full ItemForm still reach the server as `null`.

**Tech Stack:** TypeScript, Apollo GraphQL, Vitest

---

### Task 1: Test and fix `toUpdateItemInput()`

**Files:**
- Modify: `apps/web/src/hooks/useItems.ts:46-58` — export function, fix sparse building, update comment
- Modify: `apps/web/src/hooks/useItems.test.ts` — add 3 unit tests

- [ ] **Step 1: Write the three failing tests**

Add a new `describe` block at the bottom of `apps/web/src/hooks/useItems.test.ts`. Add the import at the top of the file:

```ts
// At the top, alongside existing imports:
import { toUpdateItemInput } from './useItems'
```

Then append to the end of the file:

```ts
// ─── toUpdateItemInput ─────────────────────────────────────────────────────────

describe('toUpdateItemInput', () => {
  it('does not include optional fields absent from the payload', () => {
    // Given a partial update that only sets quantity fields
    const input = { packedQuantity: 3, unpackedQuantity: 0 }

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then the 7 optional clearable fields must be absent from the output
    expect(result).not.toHaveProperty('packageUnit')
    expect(result).not.toHaveProperty('measurementUnit')
    expect(result).not.toHaveProperty('amountPerPackage')
    expect(result).not.toHaveProperty('estimatedDueDays')
    expect(result).not.toHaveProperty('expirationThreshold')
    expect(result).not.toHaveProperty('expirationMode')
    expect(result).not.toHaveProperty('dueDate')
  })

  it('sends null for an optional field explicitly set to undefined', () => {
    // Given an update that deliberately includes packageUnit as undefined
    // (meaning: clear this field in the DB)
    const input: Partial<Item> = { packedQuantity: 3, packageUnit: undefined }

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then packageUnit is present with value null
    expect(result).toHaveProperty('packageUnit', null)
  })

  it('serializes a full payload including all optional fields', () => {
    // Given a complete update payload from the full ItemForm
    const dueDate = new Date('2026-12-01')
    const input: Partial<Item> = {
      packedQuantity: 2,
      unpackedQuantity: 0,
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      estimatedDueDays: 7,
      expirationThreshold: 3,
      expirationMode: 'date',
      dueDate,
    }

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then all optional fields are present with correct values
    expect(result.packageUnit).toBe('pack')
    expect(result.measurementUnit).toBe('g')
    expect(result.amountPerPackage).toBe(500)
    expect(result.estimatedDueDays).toBe(7)
    expect(result.expirationThreshold).toBe(3)
    expect(result.expirationMode).toBe('date')
    expect(result.dueDate).toBe(dueDate.toISOString())
  })
})
```

You will also need to add `Item` to the import at the top of the test file:
```ts
import type { Item } from '@/types'
```

- [ ] **Step 2: Run tests — expect compile error (function not exported yet)**

```bash
(cd apps/web && pnpm test -- --reporter=verbose useItems.test.ts 2>&1 | head -30)
```

Expected: TypeScript error — `toUpdateItemInput` is not exported from `'./useItems'`

- [ ] **Step 3: Export `toUpdateItemInput` and fix sparse building**

In `apps/web/src/hooks/useItems.ts`, replace lines 42–58 with:

```ts
// Map frontend Item partial to the GraphQL UpdateItemInput shape.
// Strips non-updatable fields and converts dueDate from Date to ISO string.
//
// Semantics:
//   - Field absent from `updates` → omitted from output → server leaves it alone
//   - Field present with undefined/null value → sent as null → server clears it
//
// This means partial updates (quantity buttons, tag assignment, etc.) safely
// omit expiration and measurement fields, leaving them untouched in MongoDB.
// The full ItemForm explicitly sets these fields (to a value or undefined) so
// it still controls their DB state.
export function toUpdateItemInput(updates: Partial<Item>): UpdateItemInput {
  const { id: _id, createdAt: _c, updatedAt: _u, dueDate, ...rest } = updates
  return {
    ...rest,
    ...('packageUnit' in rest && { packageUnit: rest.packageUnit ?? null }),
    ...('measurementUnit' in rest && { measurementUnit: rest.measurementUnit ?? null }),
    ...('amountPerPackage' in rest && { amountPerPackage: rest.amountPerPackage ?? null }),
    ...('estimatedDueDays' in rest && { estimatedDueDays: rest.estimatedDueDays ?? null }),
    ...('expirationThreshold' in rest && { expirationThreshold: rest.expirationThreshold ?? null }),
    ...('expirationMode' in rest && { expirationMode: rest.expirationMode ?? null }),
    ...('dueDate' in updates && { dueDate: dueDate instanceof Date ? dueDate.toISOString() : null }),
  }
}
```

Also update the stale comment inside `useUpdateItem` (around line 226) that says:
```ts
// Cloud mode: updates must be a complete item payload (as produced by buildUpdates),
// not a true partial. Absent optional fields are sent as null to MongoDB $set,
// which clears them. A partial update with absent fields would silently clear them.
```

Replace it with:
```ts
// Cloud mode: serializes updates to GraphQL input via toUpdateItemInput().
// Absent fields are omitted (server leaves them alone); fields present
// with undefined/null are sent as null (server clears them).
```

- [ ] **Step 4: Run tests — expect all 3 new tests to pass**

```bash
(cd apps/web && pnpm test -- --reporter=verbose useItems.test.ts 2>&1 | tail -20)
```

Expected: all tests in `useItems.test.ts` pass (3 new + existing `useDeleteItem` tests)

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
(cd apps/web && pnpm test 2>&1 | tail -20)
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useItems.ts apps/web/src/hooks/useItems.test.ts
git commit -m "$(cat <<'EOF'
fix(items): use sparse building in toUpdateItemInput for cloud mode

Partial updates (quantity buttons, tag/vendor assignment, cooking consume)
no longer null expiration and measurement fields. toUpdateItemInput() now
only includes a field when it is explicitly present in the update payload;
absent fields are omitted so MongoDB $set leaves them untouched.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fix `buildUpdates()` so full-form clears still reach the server

**Files:**
- Modify: `apps/web/src/routes/items/$id/index.tsx:95-114` — replace `delete` with `= undefined`

- [ ] **Step 1: Replace the four `delete` calls**

In `apps/web/src/routes/items/$id/index.tsx`, replace lines 95–114:

```ts
// Before
if (values.packageUnit) {
  updates.packageUnit = values.packageUnit
} else {
  delete updates.packageUnit
}
if (values.measurementUnit) {
  updates.measurementUnit = values.measurementUnit
} else {
  delete updates.measurementUnit
}
if (values.amountPerPackage) {
  updates.amountPerPackage = Number(values.amountPerPackage)
} else {
  delete updates.amountPerPackage
}
if (values.expirationThreshold) {
  updates.expirationThreshold = Number(values.expirationThreshold)
} else {
  delete updates.expirationThreshold
}
```

Replace with:

```ts
// Assign undefined (not delete) so toUpdateItemInput() sees the key as
// present and sends null to MongoDB — intentionally clearing the field
// when the user leaves it blank in the full ItemForm.
updates.packageUnit = values.packageUnit || undefined
updates.measurementUnit = values.measurementUnit || undefined
updates.amountPerPackage = values.amountPerPackage
  ? Number(values.amountPerPackage)
  : undefined
updates.expirationThreshold = values.expirationThreshold
  ? Number(values.expirationThreshold)
  : undefined
```

- [ ] **Step 2: Run full test suite**

```bash
(cd apps/web && pnpm test 2>&1 | tail -20)
```

Expected: all tests pass (no regressions from the `buildUpdates` change)

- [ ] **Step 3: Run the verification gate**

```bash
(cd apps/web && pnpm lint 2>&1 | tail -5)
(cd apps/web && pnpm build 2>&1 | tee /tmp/p1i-build.log | tail -10)
(cd apps/web && pnpm build-storybook 2>&1 | tail -5)
(cd apps/web && pnpm check 2>&1 | tail -5)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All five must pass before continuing.

- [ ] **Step 4: Commit**

```bash
git add 'apps/web/src/routes/items/$id/index.tsx'
git commit -m "$(cat <<'EOF'
fix(items): replace delete with undefined in buildUpdates for cloud clears

Using delete removes the key from the update object, which after the
toUpdateItemInput fix would mean "leave it alone". Using undefined keeps
the key present so toUpdateItemInput sends null, correctly clearing the
field in MongoDB when the user blanks it in the full ItemForm.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Complete bug doc, run E2E, and finish the branch

**Files:**
- Modify: `docs/global/bugs/2026-04-05-bug-null-partial-updates.md` — fill in Fix Applied, Test Added, PR/Commit

- [ ] **Step 1: Run E2E tests**

```bash
pnpm test:e2e --grep "items|shopping|cooking|tags|vendors|a11y"
```

Expected: all tests pass. Any failure is a hard stop — fix before continuing.

- [ ] **Step 2: Update the bug doc**

Fill in the three TBD fields in `docs/global/bugs/2026-04-05-bug-null-partial-updates.md`:

```markdown
## Fix Applied

Two coordinated changes:

1. `toUpdateItemInput()` in `apps/web/src/hooks/useItems.ts` now uses sparse spreading via `'key' in rest` checks. Fields absent from the update payload are omitted from the GraphQL input; the server leaves them untouched. Fields present (even as `undefined`) are still sent as `null` to clear them.

2. `buildUpdates()` in `apps/web/src/routes/items/$id/index.tsx` replaces `delete updates.field` with `updates.field = undefined` for the four optional clearable fields (`packageUnit`, `measurementUnit`, `amountPerPackage`, `expirationThreshold`). This keeps the key present in the object so `toUpdateItemInput()` correctly includes it as `null` when the user blanks the field in the full ItemForm.

## Test Added

Three unit tests added in `apps/web/src/hooks/useItems.test.ts` under `describe('toUpdateItemInput')`:
- Partial payload (only `packedQuantity`) → the 7 optional fields are absent from the output
- Payload with `packageUnit: undefined` → `packageUnit: null` is present in the output
- Full payload with all optional fields → all fields serialized correctly (including `dueDate` as ISO string)

## PR / Commit

- Commit 1: `fix(items): use sparse building in toUpdateItemInput for cloud mode`
- Commit 2: `fix(items): replace delete with undefined in buildUpdates for cloud clears`
- PR: TBD
```

- [ ] **Step 3: Commit the completed bug doc**

```bash
git add docs/global/bugs/2026-04-05-bug-null-partial-updates.md
git commit -m "$(cat <<'EOF'
docs(bugs): complete null-partial-updates bug doc with fix and test details

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Invoke `superpowers:finishing-a-development-branch`**
