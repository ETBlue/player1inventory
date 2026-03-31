# Progress Bar Package Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an item has `amountPerPackage` defined, `ItemProgressBar` always renders segmented mode based on the number of packages — regardless of `targetUnit`.

**Architecture:** Add `amountPerPackage?: number` prop to `ItemProgressBar`. Internally compute a `scale` factor and `packageTarget`; pass converted values to `SegmentedProgressBar`. `ItemCard` passes the new prop through. No data model changes.

**Tech Stack:** React 19, TypeScript strict, Vitest + React Testing Library, Tailwind CSS v4

**Worktree:** `.worktrees/feature-progress-bar-package-segments` (branch: `feature/progress-bar-package-segments`)

---

## Files

- Modify: `apps/web/src/components/item/ItemProgressBar/index.tsx` — new prop + updated mode logic + value conversion
- Modify: `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.test.tsx` — 4 new test cases
- Modify: `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.stories.tsx` — new story for measurement item with `amountPerPackage`
- Modify: `apps/web/src/components/item/ItemCard/index.tsx` — pass `amountPerPackage` to `ItemProgressBar` (line ~213)

---

## Task 1: Write failing tests

**Files:**
- Modify: `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.test.tsx`

- [ ] **Step 1: Add 4 new test cases to the existing describe block**

Append these 4 tests inside the `describe('ItemProgressBar with partial segments', ...)` block, after the last existing test (line 252, before the closing `}`):

```ts
it('uses segmented mode for measurement item with amountPerPackage when package count ≤ 30', () => {
  // target=500g, amountPerPackage=100g/pack → 5 packages → segmented
  const { container } = render(
    <ItemProgressBar
      current={300}
      target={500}
      status="ok"
      targetUnit="measurement"
      amountPerPackage={100}
    />,
  )
  expect(container.querySelector('[role="progressbar"]')).not.toBeInTheDocument()
  const segments = container.querySelectorAll('[data-segment]')
  expect(segments).toHaveLength(5)
})

it('uses continuous mode for measurement item with amountPerPackage when package count > 30', () => {
  // target=3200g, amountPerPackage=100g/pack → 32 packages > 30 → continuous
  const { container } = render(
    <ItemProgressBar
      current={1600}
      target={3200}
      status="ok"
      targetUnit="measurement"
      amountPerPackage={100}
    />,
  )
  expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
  expect(container.querySelector('[data-segment]')).not.toBeInTheDocument()
})

it('uses continuous mode for measurement item without amountPerPackage (regression guard)', () => {
  // targetUnit=measurement, no amountPerPackage, small target → still continuous
  const { container } = render(
    <ItemProgressBar
      current={3}
      target={5}
      status="ok"
      targetUnit="measurement"
    />,
  )
  expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
  expect(container.querySelector('[data-segment]')).not.toBeInTheDocument()
})

it('converts packed and unpacked to package units in segmented mode for measurement items', () => {
  // target=500g, amountPerPackage=100g → 5 segments
  // ItemCard passes packed = packedQuantity * amountPerPackage = 3 * 100 = 300
  // ItemCard passes unpacked = unpackedQuantity = 50 (grams)
  // After /scale: packed=3 packs, unpacked=0.5 packs
  const { container } = render(
    <ItemProgressBar
      current={350}
      target={500}
      status="ok"
      targetUnit="measurement"
      amountPerPackage={100}
      packed={300}
      unpacked={50}
    />,
  )
  const segments = container.querySelectorAll('[data-segment]')
  expect(segments).toHaveLength(5)
  // Segments 0–2: 100% packed
  expect(segments[0]).toHaveAttribute('data-packed', '100')
  expect(segments[1]).toHaveAttribute('data-packed', '100')
  expect(segments[2]).toHaveAttribute('data-packed', '100')
  // Segment 3: 50% unpacked (0.5 of a pack)
  expect(segments[3]).toHaveAttribute('data-unpacked', '50')
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments/apps/web && pnpm test --run ItemProgressBar.test)
```

Expected: 4 new tests fail (amountPerPackage prop is not yet accepted / behavior unchanged), all existing tests still pass.

---

## Task 2: Implement `amountPerPackage` in `ItemProgressBar`

**Files:**
- Modify: `apps/web/src/components/item/ItemProgressBar/index.tsx`

- [ ] **Step 1: Add `amountPerPackage` to the `ProgressBarProps` interface**

In `apps/web/src/components/item/ItemProgressBar/index.tsx`, replace lines 7–15:

```ts
interface ProgressBarProps {
  current: number
  target: number
  status?: 'ok' | 'warning' | 'error' | 'inactive'
  targetUnit?: 'package' | 'measurement'
  packed?: number
  unpacked?: number
  measurementUnit?: string
}
```

with:

```ts
interface ProgressBarProps {
  current: number
  target: number
  status?: 'ok' | 'warning' | 'error' | 'inactive'
  targetUnit?: 'package' | 'measurement'
  packed?: number
  unpacked?: number
  measurementUnit?: string
  amountPerPackage?: number
}
```

- [ ] **Step 2: Update the `ItemProgressBar` export function**

Replace lines 212–273 (the `export function ItemProgressBar` block) with:

```ts
export function ItemProgressBar({
  current,
  target,
  status,
  targetUnit,
  packed = 0,
  unpacked = 0,
  amountPerPackage,
}: ProgressBarProps) {
  // Use continuous bar when tracking in measurement units
  // Guard: target=0 means inactive item
  if (target === 0) {
    if (current > 0) {
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
      return (
        <div className="flex-1">
          <div className="h-2 w-full rounded-xs border border-accessory-emphasized overflow-hidden">
            <div className={cn('h-full w-full', fillColor)} />
          </div>
        </div>
      )
    }
    return (
      <div className="flex-1">
        <div className="h-2 w-full rounded-xs border border-accessory-emphasized" />
      </div>
    )
  }

  // When amountPerPackage is set, convert all values to package units for segmented rendering.
  // Fall back to continuous for measurement-unit items with no package info.
  const scale = amountPerPackage ?? 1
  const packageTarget = amountPerPackage ? target / amountPerPackage : target
  const useContinuous =
    (targetUnit === 'measurement' && !amountPerPackage) ||
    packageTarget > SEGMENTED_MODE_MAX_TARGET

  return (
    <div className="flex-1">
      {useContinuous ? (
        <ContinuousProgressBar
          current={current}
          target={target}
          {...(status ? { status } : {})}
          packed={packed}
          unpacked={unpacked}
        />
      ) : (
        <SegmentedProgressBar
          current={current / scale}
          target={packageTarget}
          {...(status ? { status } : {})}
          packed={packed / scale}
          unpacked={unpacked / scale}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run the tests to verify all pass**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments/apps/web && pnpm test --run ItemProgressBar.test)
```

Expected: all tests pass (4 new + all existing).

---

## Task 3: Update `ItemCard` call site and stories

**Files:**
- Modify: `apps/web/src/components/item/ItemCard/index.tsx`
- Modify: `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.stories.tsx`

- [ ] **Step 1: Add `amountPerPackage` prop to the `ItemProgressBar` call in `ItemCard`**

In `apps/web/src/components/item/ItemCard/index.tsx`, replace lines 213–223:

```tsx
          <ItemProgressBar
            current={packageProgressCurrent}
            target={packageProgressTarget}
            status={progressStatus}
            targetUnit={item.targetUnit}
            packed={displayPacked}
            unpacked={item.unpackedQuantity}
            {...(item.measurementUnit
              ? { measurementUnit: item.measurementUnit }
              : {})}
          />
```

with:

```tsx
          <ItemProgressBar
            current={packageProgressCurrent}
            target={packageProgressTarget}
            status={progressStatus}
            targetUnit={item.targetUnit}
            packed={displayPacked}
            unpacked={item.unpackedQuantity}
            {...(item.measurementUnit
              ? { measurementUnit: item.measurementUnit }
              : {})}
            {...(item.amountPerPackage
              ? { amountPerPackage: item.amountPerPackage }
              : {})}
          />
```

- [ ] **Step 2: Add a story for measurement item with `amountPerPackage`**

In `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.stories.tsx`, add this story after the last existing export:

```tsx
export const MeasurementWithPackages: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">500g target, 100g/pack → 5 segments (3 packs + 50g loose)</p>
        <ItemProgressBar
          current={350}
          target={500}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={100}
          packed={300}
          unpacked={50}
        />
      </div>
      <div>
        <p className="text-sm mb-2">500g target, 100g/pack → 5 segments (3 full packs)</p>
        <ItemProgressBar
          current={300}
          target={500}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={100}
          packed={300}
          unpacked={0}
        />
      </div>
      <div>
        <p className="text-sm mb-2">3200g target, 100g/pack → 32 packages → continuous</p>
        <ItemProgressBar
          current={1600}
          target={3200}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={100}
        />
      </div>
    </div>
  ),
}
```

- [ ] **Step 3: Run full test suite to verify no regressions**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments/apps/web && pnpm test --run)
```

Expected: 1141+ tests pass, 0 failures.

- [ ] **Step 4: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments
git add apps/web/src/components/item/ItemProgressBar/index.tsx
git add apps/web/src/components/item/ItemProgressBar/ItemProgressBar.test.tsx
git add apps/web/src/components/item/ItemProgressBar/ItemProgressBar.stories.tsx
git add apps/web/src/components/item/ItemCard/index.tsx
git commit -m "feat(items): segment progress bar by package when amountPerPackage is set"
```

---

## Task 4: Verification gate

- [ ] **Step 1: Lint**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments/apps/web && pnpm lint)
```

Expected: no errors.

- [ ] **Step 2: Build**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments/apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Check for deprecated imports**

```bash
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Expected: `OK: no deprecated imports`

- [ ] **Step 4: Biome check**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments/apps/web && pnpm check)
```

Expected: no errors.

- [ ] **Step 5: Build Storybook**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-progress-bar-package-segments/apps/web && pnpm build-storybook)
```

Expected: Storybook builds with no errors.

- [ ] **Step 6: E2E tests**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory && pnpm test:e2e --grep "items|a11y")
```

Expected: all tests pass.
