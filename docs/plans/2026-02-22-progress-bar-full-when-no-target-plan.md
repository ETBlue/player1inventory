# Progress Bar Full When No Target — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When `target === 0` and `current > 0`, render `ItemProgressBar` as a 100% full bar instead of an empty track.

**Architecture:** Modify the existing `target === 0` early-return guard in `ItemProgressBar` to branch on whether `current > 0`. When it is, render a full-width filled div using the status-mapped color. No other components change.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, Tailwind CSS v4

---

### Task 1: Set up the worktree

**Files:**
- No code files — only git operations

**Step 1: Create feature branch and worktree**

```bash
git worktree add .worktrees/feat-progress-bar-full-no-target -b feat/progress-bar-full-no-target
```

Expected output: `Preparing worktree (new branch 'feat/progress-bar-full-no-target')`

**Step 2: Verify worktree is on the right branch**

```bash
git -C .worktrees/feat-progress-bar-full-no-target status
```

Expected: `On branch feat/progress-bar-full-no-target`, clean working tree.

---

### Task 2: Write the failing test, then implement

**Files:**
- Modify: `.worktrees/feat-progress-bar-full-no-target/src/components/ItemProgressBar.test.tsx` (append after line 197)
- Modify: `.worktrees/feat-progress-bar-full-no-target/src/components/ItemProgressBar.tsx:214-220`

**Step 1: Add a failing test**

Open `.worktrees/feat-progress-bar-full-no-target/src/components/ItemProgressBar.test.tsx`.

Append this test inside the `describe` block, after the last `it(...)` (after line 197, before the closing `})`):

```ts
  it('renders full bar when target is 0 but current > 0', () => {
    const { container } = render(
      <ItemProgressBar current={2} target={0} status="ok" />,
    )

    // Should have an inner fill div (not just an empty track)
    const inner = container.querySelector('.flex-1 > div > div')
    expect(inner).toBeInTheDocument()
    expect(inner).toHaveClass('bg-status-ok')
  })
```

**Step 2: Run the test to confirm it fails**

```bash
pnpm --dir .worktrees/feat-progress-bar-full-no-target test --run src/components/ItemProgressBar.test.tsx 2>&1 | tail -20
```

Expected: FAIL — the test finds no `.flex-1 > div > div` because the current implementation renders only an empty border div with no children.

**Step 3: Implement the fix**

Open `.worktrees/feat-progress-bar-full-no-target/src/components/ItemProgressBar.tsx`.

Find the `target === 0` guard (lines 213–220):

```tsx
  // Guard: target=0 means inactive item — render empty visible track
  if (target === 0) {
    return (
      <div className="flex-1">
        <div className="h-2 w-full rounded-xs border border-accessory-emphasized" />
      </div>
    )
  }
```

Replace with:

```tsx
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
```

**Step 4: Run the tests**

```bash
pnpm --dir .worktrees/feat-progress-bar-full-no-target test --run src/components/ItemProgressBar.test.tsx 2>&1 | tail -15
```

Expected: all tests in this file pass (previously 8, now 9).

**Step 5: Run the full suite**

```bash
pnpm --dir .worktrees/feat-progress-bar-full-no-target test --run 2>&1 | tail -10
```

Expected: 0 failures.

**Step 6: Commit**

```bash
git -C .worktrees/feat-progress-bar-full-no-target add \
  src/components/ItemProgressBar.tsx \
  src/components/ItemProgressBar.test.tsx

git -C .worktrees/feat-progress-bar-full-no-target commit -m "$(cat <<'EOF'
feat(items): render progress bar as full when target is 0 but has stock

When targetQuantity is 0 and current quantity > 0, ItemProgressBar now
shows a 100% filled bar using the status color instead of an empty track.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Step 7: Verify**

```bash
git -C .worktrees/feat-progress-bar-full-no-target log --oneline -3
git -C .worktrees/feat-progress-bar-full-no-target status
```

Expected: new commit on `feat/progress-bar-full-no-target`, clean working tree.
