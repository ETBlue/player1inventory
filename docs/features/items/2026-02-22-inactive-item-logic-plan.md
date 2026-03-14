# Inactive Item Logic Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move two uncommitted changes (new `isInactive` logic + `ItemCard` opacity scoping) into an isolated worktree, fix the 2 failing tests, update stale test cases, add a new test case, and fix the Storybook story.

**Architecture:** Stash uncommitted changes on `main`, create a `fix/inactive-item-logic` branch + worktree, apply stash there, then fix tests and Storybook. All changes land in one commit on the feature branch.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, Storybook

---

### Task 1: Set up the worktree

**Files:**
- No code files — only git operations

**Step 1: Stash the uncommitted changes on main**

```bash
git stash push -m "fix(items): inactive logic + card opacity scoping" -- src/components/ItemCard.tsx src/lib/quantityUtils.ts
```

Expected output: `Saved working directory and index state On main: fix(items): inactive logic + card opacity scoping`

**Step 2: Create feature branch and worktree**

```bash
git worktree add .worktrees/fix-inactive-item-logic -b fix/inactive-item-logic
```

Expected output: `Preparing worktree (new branch 'fix/inactive-item-logic')`

**Step 3: Apply the stash inside the worktree**

```bash
cd .worktrees/fix-inactive-item-logic && git stash pop
```

Expected output: `On branch fix/inactive-item-logic … HEAD is now at …` followed by the two modified files.

**Step 4: Verify the two files are modified in the worktree**

```bash
git -C .worktrees/fix-inactive-item-logic status
```

Expected: `modified: src/components/ItemCard.tsx` and `modified: src/lib/quantityUtils.ts`

**Step 5: Confirm tests are failing**

```bash
pnpm --dir .worktrees/fix-inactive-item-logic test --run 2>&1 | tail -20
```

Expected: 2 test failures in `quantityUtils.test.ts` and `quantityUtils.integration.test.ts`.

---

### Task 2: Fix `quantityUtils.test.ts`

**Files:**
- Modify: `.worktrees/fix-inactive-item-logic/src/lib/quantityUtils.test.ts:444-490`

The `isInactive` describe block has 4 tests. Two are wrong, one is misleading, and one new case is missing. Replace the entire block.

**New logic:** `isInactive` returns `true` when `targetQuantity === 0 && refillThreshold === 0`.

**Step 1: Replace the `isInactive` describe block**

Find this block (lines 444–490):

```ts
describe('isInactive', () => {
  it('returns true when both target and current are 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(true)
  })

  it('returns false when target > 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns false when current > 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetQuantity: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns false when unpacked > 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0.5,
    }

    expect(isInactive(item as Item)).toBe(false)
  })
})
```

Replace with:

```ts
describe('isInactive', () => {
  it('returns true when both targetQuantity and refillThreshold are 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      refillThreshold: 0,
    }

    expect(isInactive(item as Item)).toBe(true)
  })

  it('returns false when targetQuantity > 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 2,
      refillThreshold: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns false when refillThreshold > 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      refillThreshold: 1,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns true even when item has stock', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 3,
      unpackedQuantity: 0.5,
    }

    expect(isInactive(item as Item)).toBe(true)
  })
})
```

**Step 2: Run tests for this file only**

```bash
pnpm --dir .worktrees/fix-inactive-item-logic test --run src/lib/quantityUtils.test.ts 2>&1 | tail -15
```

Expected: all tests in this file pass.

---

### Task 3: Fix `quantityUtils.integration.test.ts`

**Files:**
- Modify: `.worktrees/fix-inactive-item-logic/src/lib/quantityUtils.integration.test.ts:53-55`

The integration test sets `item.targetQuantity = 0` and expects `isInactive` to return `true`, but with the new logic `refillThreshold` must also be 0. The item was created with `refillThreshold: 0.5`.

**Step 1: Add `refillThreshold = 0` before the assertion**

Find:
```ts
    // Set target to 0 → becomes inactive
    item.targetQuantity = 0
    expect(isInactive(item)).toBe(true)
```

Replace with:
```ts
    // Set target and threshold to 0 → becomes inactive
    item.targetQuantity = 0
    item.refillThreshold = 0
    expect(isInactive(item)).toBe(true)
```

**Step 2: Run the integration test**

```bash
pnpm --dir .worktrees/fix-inactive-item-logic test --run src/lib/quantityUtils.integration.test.ts 2>&1 | tail -10
```

Expected: PASS

**Step 3: Run the full test suite**

```bash
pnpm --dir .worktrees/fix-inactive-item-logic test --run 2>&1 | tail -10
```

Expected: 0 failures.

---

### Task 4: Fix the Storybook `InactiveItem` story

**Files:**
- Modify: `.worktrees/fix-inactive-item-logic/src/components/ItemCard.stories.tsx:190-202`

The `InactiveItem` story spreads `mockItem` (which has `refillThreshold: 1`). With the new logic the card won't render as inactive. Add `refillThreshold: 0` to the story.

**Step 1: Update the story**

Find:
```ts
export const InactiveItem: Story = {
  args: {
    item: {
      ...mockItem,
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    },
    quantity: 0,
    tags: [],
    tagTypes: [],
  },
}
```

Replace with:
```ts
export const InactiveItem: Story = {
  args: {
    item: {
      ...mockItem,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    },
    quantity: 0,
    tags: [],
    tagTypes: [],
  },
}
```

**Step 2: Run the full test suite one more time to confirm nothing broke**

```bash
pnpm --dir .worktrees/fix-inactive-item-logic test --run 2>&1 | tail -10
```

Expected: 0 failures.

---

### Task 5: Commit

**Files:** all modified files in the worktree

**Step 1: Stage all changes**

```bash
git -C .worktrees/fix-inactive-item-logic add \
  src/components/ItemCard.tsx \
  src/lib/quantityUtils.ts \
  src/lib/quantityUtils.test.ts \
  src/lib/quantityUtils.integration.test.ts \
  src/components/ItemCard.stories.tsx
```

**Step 2: Commit**

```bash
git -C .worktrees/fix-inactive-item-logic commit -m "$(cat <<'EOF'
fix(items): redefine inactive as both target and threshold zero

isInactive now checks targetQuantity===0 && refillThreshold===0 instead
of checking current stock. Also scopes opacity-50 to CardHeader and
CardContent only so shopping-mode controls stay visible on inactive items.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Step 3: Verify**

```bash
git -C .worktrees/fix-inactive-item-logic log --oneline -3
git -C .worktrees/fix-inactive-item-logic status
```

Expected: new commit on `fix/inactive-item-logic`, clean working tree.
