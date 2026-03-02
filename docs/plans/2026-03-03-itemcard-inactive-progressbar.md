# ItemCard: Inactive Progress Bar Color Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render the progress bar in `bg-status-inactive` color for inactive items, and commit the user's existing layout polish changes alongside.

**Architecture:** Add `'inactive'` to `ItemProgressBar`'s `status` type and map it to `bg-status-inactive` in all three rendering paths (segmented, continuous, target=0 full-bar). In `ItemCard`, compute `progressStatus = isInactive(item) ? 'inactive' : status` and pass it to `<ItemProgressBar>`.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, Tailwind CSS v4

---

### Task 1: Extend ItemProgressBar to support `'inactive'` status

**Files:**
- Modify: `src/components/ItemProgressBar.tsx`
- Modify: `src/components/ItemProgressBar.test.tsx`

**Step 1: Write the failing test**

Add to `src/components/ItemProgressBar.test.tsx` (inside the existing `describe` block, after the last test):

```tsx
it('renders fill bar with inactive color when status is inactive and current > 0', () => {
  const { container } = render(
    <ItemProgressBar current={2} target={0} status="inactive" />,
  )

  // Should have an inner fill div with bg-status-inactive
  const inner = container.querySelector('.flex-1 > div > div')
  expect(inner).toBeInTheDocument()
  expect(inner).toHaveClass('bg-status-inactive')
})

it('renders segmented bar with inactive fill color when status is inactive', () => {
  const { container } = render(
    <ItemProgressBar current={2} target={5} status="inactive" />,
  )

  const segments = container.querySelectorAll('[data-segment]')
  expect(segments).toHaveLength(5)

  // First two segments should be filled — check a filled segment's child div
  const firstSegment = segments[0]
  const fillDiv = firstSegment.querySelector('div')
  expect(fillDiv).toHaveClass('bg-status-inactive')
})

it('renders continuous bar with inactive fill color when status is inactive', () => {
  const { container } = render(
    <ItemProgressBar
      current={20}
      target={40}
      status="inactive"
      targetUnit="measurement"
    />,
  )

  // Continuous mode uses Progress component — check its indicator class
  const progressBar = container.querySelector('[role="progressbar"]')
  expect(progressBar).toBeInTheDocument()
  // The Progress component renders a child div with the fill color via [&>div]
  // We verify the wrapper has the inactive class applied
  const wrapper = container.querySelector('.flex-1 > div')
  expect(wrapper).toHaveClass('[&>div]:bg-status-inactive')
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/components/ItemProgressBar.test.tsx
```

Expected: 3 new tests fail — `'inactive'` is not assignable to the `status` type.

**Step 3: Extend the `status` type and add inactive color handling**

In `src/components/ItemProgressBar.tsx`, change `status` type in `ProgressBarProps` from:
```ts
status?: 'ok' | 'warning' | 'error'
```
to:
```ts
status?: 'ok' | 'warning' | 'error' | 'inactive'
```

Then update the three color resolution blocks to add `'inactive'` → `bg-status-inactive`.

**In `SegmentedProgressBar` — both `fillColor` and `packedColor`** (lines ~71–87), add `inactive` branch before the final fallback:

```ts
const fillColor =
  status === 'ok'
    ? 'bg-status-ok'
    : status === 'warning'
      ? 'bg-status-warning'
      : status === 'error'
        ? 'bg-status-error'
        : status === 'inactive'
          ? 'bg-status-inactive'
          : 'bg-accessory-emphasized'

const packedColor =
  status === 'ok'
    ? 'bg-status-ok'
    : status === 'warning'
      ? 'bg-status-warning'
      : status === 'error'
        ? 'bg-status-error'
        : status === 'inactive'
          ? 'bg-status-inactive'
          : 'bg-accessory-emphasized'
```

**In `ContinuousProgressBar` — `packedColor`** (lines ~151–158) and the `<Progress>` className (lines ~192–198), same pattern:

```ts
const packedColor =
  status === 'ok'
    ? 'bg-status-ok'
    : status === 'warning'
      ? 'bg-status-warning'
      : status === 'error'
        ? 'bg-status-error'
        : status === 'inactive'
          ? 'bg-status-inactive'
          : 'bg-accessory-emphasized'
```

```tsx
<Progress
  value={percentage}
  className={cn(
    'h-2 [&>div]:transition-all [&>div]:duration-300',
    status === 'ok'
      ? '[&>div]:bg-status-ok'
      : status === 'warning'
        ? '[&>div]:bg-status-warning'
        : status === 'error'
          ? '[&>div]:bg-status-error'
          : status === 'inactive'
            ? '[&>div]:bg-status-inactive'
            : '[&>div]:bg-accessory-emphasized',
  )}
/>
```

**In `ItemProgressBar` — the `target === 0` + `current > 0` branch** (lines ~216–223):

```ts
const fillColor =
  status === 'ok'
    ? 'bg-status-ok'
    : status === 'warning'
      ? 'bg-status-warning'
      : status === 'error'
        ? 'bg-status-error'
        : status === 'inactive'
          ? 'bg-status-inactive'
          : 'bg-accessory-emphasized'
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/components/ItemProgressBar.test.tsx
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/components/ItemProgressBar.tsx src/components/ItemProgressBar.test.tsx
git commit -m "feat(progress-bar): add inactive status for neutral fill color"
```

---

### Task 2: Use `progressStatus` in ItemCard for inactive items

**Files:**
- Modify: `src/components/ItemCard.tsx`

**Step 1: Write the failing test**

Add to `src/components/ItemCard.test.tsx` (new `describe` block at end of file):

```tsx
describe('ItemCard - inactive item progress bar', () => {
  const inactiveItem: Item = {
    id: 'item-inactive',
    name: 'Archived Item',
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 0,   // inactive: targetQuantity=0
    refillThreshold: 0,  // inactive: refillThreshold=0
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('renders progress bar fill with inactive color for inactive item', async () => {
    const { container } = await renderWithRouter(
      <ItemCard item={inactiveItem} tags={[]} tagTypes={[]} />,
    )

    // Inactive item with packedQuantity=2 > 0 renders the target=0 full-bar branch
    const fillDiv = container.querySelector('.flex-1 > div > div')
    expect(fillDiv).toBeInTheDocument()
    expect(fillDiv).toHaveClass('bg-status-inactive')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: test fails — fill div has `bg-status-ok` (not `bg-status-inactive`).

**Step 3: Add `progressStatus` computation in `ItemCard`**

In `src/components/ItemCard.tsx`, after the `status` declaration (line ~78), add:

```ts
const progressStatus = isInactive(item) ? 'inactive' : status
```

Then update the `<ItemProgressBar>` call (lines ~172–182) to pass `progressStatus` instead of `status`:

```tsx
<ItemProgressBar
  current={currentQuantity}
  target={item.targetQuantity}
  status={progressStatus}
  targetUnit={item.targetUnit}
  packed={displayPacked}
  unpacked={item.unpackedQuantity}
  {...(item.measurementUnit
    ? { measurementUnit: item.measurementUnit }
    : {})}
/>
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: all tests pass including new inactive test.

**Step 5: Commit alongside user's layout changes**

```bash
git add src/components/ItemCard.tsx src/components/ui/card.tsx
git commit -m "feat(item-card): inactive progress bar color + layout polish"
```

---

### Task 3: Commit the design doc

**Step 1: Commit design and plan docs**

```bash
git add docs/plans/2026-03-03-itemcard-inactive-progressbar-design.md docs/plans/2026-03-03-itemcard-inactive-progressbar.md
git commit -m "docs(plans): inactive progress bar color design and implementation plan"
```

---

### Task 4: Verify full test suite passes

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: all tests pass, no regressions.
