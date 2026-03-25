# A11y Plan 2 — Keyboard & Motion

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Make drag-and-drop tag reordering keyboard-accessible and add `prefers-reduced-motion` support so users who are sensitive to animation can use the app comfortably.

**Scope:** 2 issues.

**WCAG References:**
- 2.1.1 Keyboard (A) — all functionality available via keyboard, no keyboard traps
- 2.3.3 Animation from Interactions (AAA) — motion can be disabled
- Best practice: respect OS-level `prefers-reduced-motion` setting

---

## Task 1: Keyboard Support for Drag-and-Drop Tag Reordering

**Issue:** Tag reordering on the settings/tags page uses `@dnd-kit` with only `PointerSensor` and `TouchSensor`. Keyboard-only users cannot reorder tags.

**Context from PR #143 (commit 94d4d04):** `DraggableTagBadge` was restructured to fix a `nested-interactive` violation. The current structure is:
- Outer `<div ref={setNodeRef} style={style}>` — plain layout container, no role, no ARIA
- Inner `<div {...attributes} {...listeners}>` wrapping `<TagBadge>` — the drag handle; `{...attributes}` from `useSortable` gives it `role="button"` and `tabIndex`
- `<DeleteButton>` is a sibling outside the drag handle (avoids nested-interactive)

Adding `KeyboardSensor` will make the drag-handle div respond to Space/Enter to pick up and arrow keys to move — it works naturally with the existing attributes structure.

**Files:**
- `apps/web/src/routes/settings/tags/index.tsx`

**Step 1: Read the file**

Read `src/routes/settings/tags/index.tsx`. Confirm the current `sensors` setup (only `PointerSensor` and `TouchSensor`) and the `DraggableTagBadge` structure described above.

**Step 2: Add `KeyboardSensor`**

Import `KeyboardSensor` and `sortableKeyboardCoordinates` from `@dnd-kit/sortable`:

```tsx
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
```

Add `KeyboardSensor` to the sensors array:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  }),
)
```

**Step 3: Add drag instructions for screen readers**

Add a visually-hidden instruction paragraph near the draggable list:

```tsx
<p className="sr-only" id="dnd-instructions">
  Press Space or Enter to pick up a tag, use arrow keys to move it, and press Space or Enter again to drop it.
</p>
```

Add `aria-describedby="dnd-instructions"` to the inner drag-handle div in `DraggableTagBadge`:

```tsx
<div aria-describedby="dnd-instructions" {...attributes} {...listeners}>
  <TagBadge ... />
</div>
```

**Step 4: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "a11y"
```

Manual test: Tab to a draggable tag → press Space → use arrow keys → press Space to drop. Confirm reorder persists.

---

## Task 2: `prefers-reduced-motion` CSS Support

**Issue:** The app uses CSS transitions (drag-and-drop items, potentially shadcn/ui animations). Users with vestibular disorders who have enabled "Reduce Motion" in their OS settings will still see animations. No `prefers-reduced-motion` media query is present in the codebase.

**Files:**
- `apps/web/src/index.css` (global CSS entry point)

**Step 1: Read `src/index.css`**

Read the file to understand what's already there and find the right place to add the media query.

**Step 2: Add global motion reduction**

Add the following at the end of `src/index.css`:

```css
/* Respect user's motion preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This approach:
- Uses `0.01ms` instead of `none` so JS-driven animation callbacks still fire (prevents broken state)
- Covers all CSS transitions and animations universally
- Keeps scroll behavior smooth → instant, since rapid scroll motion can also cause discomfort

**Step 3: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

Manual test: Enable "Reduce Motion" in OS settings → open the app → confirm drag-and-drop and dialog animations are instant.

---

## Task 3: Final Verification & Commit

**Step 1: Full quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

**Step 2: E2E**

```bash
pnpm test:e2e --grep "tags|settings"
```

**Step 3: Commit (2 separate commits)**

```
fix(a11y): add keyboard sensor and screen reader instructions to tag drag-and-drop
fix(a11y): add prefers-reduced-motion global CSS support
```
