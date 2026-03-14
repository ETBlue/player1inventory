# Inactive Item Progress Bar Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the progress bar disappearing in item cards when an item is inactive (targetQuantity === 0).

**Architecture:** Add a guard at the top of `ItemProgressBar` that returns an empty track `<div>` when `target === 0`, before the segmented/continuous mode selection logic runs.

**Tech Stack:** React, TypeScript, Vitest + React Testing Library, Storybook

---

### Task 1: Add failing test for target=0

**Files:**
- Modify: `src/components/ItemProgressBar.test.tsx`

**Step 1: Read the existing test file**

Read `src/components/ItemProgressBar.test.tsx` to understand the existing test patterns before adding a new one.

**Step 2: Write the failing test**

Find the end of the existing test suite in `src/components/ItemProgressBar.test.tsx` and add:

```tsx
it('renders empty track when target is 0', () => {
  render(
    <ItemProgressBar
      current={0}
      target={0}
      status="ok"
      targetUnit="package"
    />
  )

  // Should NOT render any segment divs
  expect(document.querySelectorAll('[data-segment]').length).toBe(0)

  // Should render the outer flex-1 wrapper
  const wrapper = document.querySelector('.flex-1')
  expect(wrapper).toBeInTheDocument()
})
```

**Step 3: Run test to verify it fails**

```bash
pnpm test src/components/ItemProgressBar.test.tsx
```

Expected: FAIL — the test finds segment divs (or the empty track assertion fails).

---

### Task 2: Implement the fix

**Files:**
- Modify: `src/components/ItemProgressBar.tsx`

**Step 1: Read the existing file**

Read `src/components/ItemProgressBar.tsx` to locate the `ItemProgressBar` export function (around line 204).

**Step 2: Add the guard**

Insert the early return inside the `ItemProgressBar` function body, before the `useContinuous` line:

```tsx
export function ItemProgressBar({
  current,
  target,
  status,
  targetUnit,
  packed = 0,
  unpacked = 0,
}: ProgressBarProps) {
  // Guard: target=0 means inactive item — render empty visible track
  if (target === 0) {
    return <div className="flex-1 h-2 rounded-xs border border-accessory-emphasized" />
  }

  // Use continuous bar when tracking in measurement units
  const useContinuous =
    targetUnit === 'measurement' || target > SEGMENTED_MODE_MAX_TARGET
  // ... rest unchanged
```

**Step 3: Run test to verify it passes**

```bash
pnpm test src/components/ItemProgressBar.test.tsx
```

Expected: PASS — all tests green.

**Step 4: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass (no regressions).

**Step 5: Commit**

```bash
git add src/components/ItemProgressBar.tsx src/components/ItemProgressBar.test.tsx
git commit -m "fix(progress-bar): render empty track when target is 0 (inactive item)"
```

---

### Task 3: Add Storybook story for inactive state

**Files:**
- Modify: `src/components/ItemProgressBar.stories.tsx`

**Step 1: Read the existing stories file**

Read `src/components/ItemProgressBar.stories.tsx` to understand the existing story structure and default args.

**Step 2: Add the Inactive story**

Add a new story at the end of the file:

```tsx
export const Inactive: Story = {
  args: {
    current: 0,
    target: 0,
    status: 'ok',
    targetUnit: 'package',
  },
}
```

**Step 3: Verify in Storybook**

```bash
pnpm storybook
```

Navigate to the `ItemProgressBar` → `Inactive` story and confirm it renders an empty bar track (not a blank space).

**Step 4: Commit**

```bash
git add src/components/ItemProgressBar.stories.tsx
git commit -m "feat(storybook): add Inactive story for ItemProgressBar"
```

---

### Task 4: Finish branch

Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate this work (PR vs direct merge vs cleanup).
