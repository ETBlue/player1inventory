# Design Tokens Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement hierarchical design token system with type-safe tag colors and semantic states.

**Architecture:** Tailwind v4 `@theme` directive for CSS tokens, TypeScript constants for type-safe access, organized by category (colors, shadows, borders, states).

**Tech Stack:** Tailwind CSS v4, TypeScript, existing React setup

---

## Task 1: Create Design Tokens Folder Structure

**Files:**
- Create: `src/design-tokens/colors.css`
- Create: `src/design-tokens/shadows.css`
- Create: `src/design-tokens/borders.css`
- Create: `src/design-tokens/states.css`
- Create: `src/design-tokens/index.css`
- Create: `src/design-tokens/index.ts`

**Step 1: Create design-tokens folder**

Run:
```bash
mkdir -p src/design-tokens
```

Expected: Folder created

**Step 2: Create empty token files**

Run:
```bash
touch src/design-tokens/colors.css
touch src/design-tokens/shadows.css
touch src/design-tokens/borders.css
touch src/design-tokens/states.css
touch src/design-tokens/index.css
touch src/design-tokens/index.ts
```

Expected: 6 files created

**Step 3: Verify files exist**

Run:
```bash
ls -la src/design-tokens/
```

Expected: All 6 files listed

**Step 4: Commit**

```bash
git add src/design-tokens/
git commit -m "chore(tokens): create design tokens folder structure"
```

---

## Task 2: Define Color Tokens

**Files:**
- Modify: `src/design-tokens/colors.css`

**Step 1: Add tag color primitives**

Write to `src/design-tokens/colors.css`:

```css
@theme {
  /* Tag base colors (bold backgrounds) */
  --color-tag-red: #ef4444;
  --color-tag-orange: #f97316;
  --color-tag-amber: #f59e0b;
  --color-tag-yellow: #eab308;
  --color-tag-green: #22c55e;
  --color-tag-teal: #14b8a6;
  --color-tag-blue: #3b82f6;
  --color-tag-indigo: #6366f1;
  --color-tag-purple: #a855f7;
  --color-tag-pink: #ec4899;

  /* Tag light tints (default backgrounds) */
  --color-tag-red-light: #fee2e2;
  --color-tag-orange-light: #ffedd5;
  --color-tag-amber-light: #fef3c7;
  --color-tag-yellow-light: #fef9c3;
  --color-tag-green-light: #dcfce7;
  --color-tag-teal-light: #ccfbf1;
  --color-tag-blue-light: #dbeafe;
  --color-tag-indigo-light: #e0e7ff;
  --color-tag-purple-light: #f3e8ff;
  --color-tag-pink-light: #fce7f3;

  /* Tag text colors */
  --color-tag-text-bold: #ffffff;
  --color-tag-text-default: #18181b;
}
```

**Step 2: Verify syntax**

Run: `pnpm typecheck`
Expected: No CSS syntax errors

**Step 3: Commit**

```bash
git add src/design-tokens/colors.css
git commit -m "feat(tokens): add tag color primitives with tint variants"
```

---

## Task 3: Define Shadow Tokens

**Files:**
- Modify: `src/design-tokens/shadows.css`

**Step 1: Add shadow tokens**

Write to `src/design-tokens/shadows.css`:

```css
@theme {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

**Step 2: Commit**

```bash
git add src/design-tokens/shadows.css
git commit -m "feat(tokens): add shadow tokens (sm, md, lg)"
```

---

## Task 4: Define Border Tokens

**Files:**
- Modify: `src/design-tokens/borders.css`

**Step 1: Add border tokens**

Write to `src/design-tokens/borders.css`:

```css
@theme {
  --border-width-default: 1px;
  --border-width-thick: 2px;

  --border-default: var(--border-width-default) solid hsl(var(--border));
  --border-thick: var(--border-width-thick) solid hsl(var(--border));
}
```

**Step 2: Commit**

```bash
git add src/design-tokens/borders.css
git commit -m "feat(tokens): add border tokens (default, thick)"
```

---

## Task 5: Define State Tokens

**Files:**
- Modify: `src/design-tokens/states.css`

**Step 1: Add global and inventory state tokens**

Write to `src/design-tokens/states.css`:

```css
@theme {
  /* Global semantic states (primitives) */
  --color-state-normal: hsl(0 0% 64%);
  --color-state-ok: #22c55e;
  --color-state-warning: #f59e0b;
  --color-state-error: #ef4444;
  --color-state-inactive: hsl(0 0% 83%);
}

:root {
  /* Inventory states (semantic, reference global) */
  --color-inventory-low-stock: var(--color-state-warning);
  --color-inventory-expiring: var(--color-state-error);
  --color-inventory-in-stock: var(--color-state-ok);
  --color-inventory-out-of-stock: var(--color-state-inactive);
}

.dark {
  /* Adjust inactive for dark mode */
  --color-state-inactive: hsl(0 0% 40%);
}
```

**Step 2: Commit**

```bash
git add src/design-tokens/states.css
git commit -m "feat(tokens): add global and inventory state tokens"
```

---

## Task 6: Create Token Index CSS

**Files:**
- Modify: `src/design-tokens/index.css`

**Step 1: Import all token files**

Write to `src/design-tokens/index.css`:

```css
@import './colors.css';
@import './shadows.css';
@import './borders.css';
@import './states.css';
```

**Step 2: Commit**

```bash
git add src/design-tokens/index.css
git commit -m "feat(tokens): create token index CSS"
```

---

## Task 7: Create TypeScript Exports

**Files:**
- Modify: `src/design-tokens/index.ts`

**Step 1: Add TypeScript token exports**

Write to `src/design-tokens/index.ts`:

```ts
// Tag colors with default/inverse variants
export const tagColors = {
  red: {
    default: 'var(--color-tag-red-light)',
    inverse: 'var(--color-tag-red)',
  },
  orange: {
    default: 'var(--color-tag-orange-light)',
    inverse: 'var(--color-tag-orange)',
  },
  amber: {
    default: 'var(--color-tag-amber-light)',
    inverse: 'var(--color-tag-amber)',
  },
  yellow: {
    default: 'var(--color-tag-yellow-light)',
    inverse: 'var(--color-tag-yellow)',
  },
  green: {
    default: 'var(--color-tag-green-light)',
    inverse: 'var(--color-tag-green)',
  },
  teal: {
    default: 'var(--color-tag-teal-light)',
    inverse: 'var(--color-tag-teal)',
  },
  blue: {
    default: 'var(--color-tag-blue-light)',
    inverse: 'var(--color-tag-blue)',
  },
  indigo: {
    default: 'var(--color-tag-indigo-light)',
    inverse: 'var(--color-tag-indigo)',
  },
  purple: {
    default: 'var(--color-tag-purple-light)',
    inverse: 'var(--color-tag-purple)',
  },
  pink: {
    default: 'var(--color-tag-pink-light)',
    inverse: 'var(--color-tag-pink)',
  },
} as const

export type TagColorName = keyof typeof tagColors
export type TagColorVariant = 'default' | 'inverse'

// Tag text colors
export const tagTextColors = {
  default: 'var(--color-tag-text-default)',
  inverse: 'var(--color-tag-text-bold)',
} as const

// Shadows
export const shadows = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
} as const

// Borders
export const borders = {
  default: 'var(--border-default)',
  thick: 'var(--border-thick)',
} as const

// Global states
export const globalStates = {
  normal: 'var(--color-state-normal)',
  ok: 'var(--color-state-ok)',
  warning: 'var(--color-state-warning)',
  error: 'var(--color-state-error)',
  inactive: 'var(--color-state-inactive)',
} as const

// Inventory states
export const inventoryStates = {
  lowStock: 'var(--color-inventory-low-stock)',
  expiring: 'var(--color-inventory-expiring)',
  inStock: 'var(--color-inventory-in-stock)',
  outOfStock: 'var(--color-inventory-out-of-stock)',
} as const
```

**Step 2: Verify TypeScript**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/design-tokens/index.ts
git commit -m "feat(tokens): add TypeScript exports for type-safe access"
```

---

## Task 8: Import Tokens into Global Styles

**Files:**
- Modify: `src/index.css`

**Step 1: Add import at top**

Add after `@import 'tailwindcss';`:

```css
@import './design-tokens/index.css';
```

**Step 2: Verify dev server**

Run: `pnpm dev`
Expected: Server starts without errors

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(tokens): import design tokens into global styles"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add design tokens section**

Add after "Key Patterns" section:

```markdown
## Design Tokens

Token system for colors, shadows, borders, and states:

```
src/design-tokens/
  ├── colors.css     # Tag colors, primitives
  ├── shadows.css    # Shadow scale
  ├── borders.css    # Border definitions
  ├── states.css     # Global + inventory states
  ├── index.css      # Imports all
  └── index.ts       # TypeScript exports
```

**Usage:**
```tsx
import { tagColors, tagTextColors } from '@/design-tokens'

<Badge style={{
  backgroundColor: tagColors.red.default,
  color: tagTextColors.default
}}>
  Tag
</Badge>
```

**Token categories:**
- **Tag colors**: 10 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink)
- **Variants**: default (light tint) / inverse (bold)
- **States**: Global (normal, ok, warning, error, inactive) → Inventory (low-stock, expiring, in-stock, out-of-stock)
- **Shadows**: sm, md, lg
- **Borders**: default (1px), thick (2px)
```

**Step 2: Verify format**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(tokens): add design tokens section to CLAUDE.md"
```

---

## Summary

**Tasks:** 9 total
- Task 1: Create folder structure
- Task 2: Define color tokens (tag colors with variants)
- Task 3: Define shadow tokens
- Task 4: Define border tokens
- Task 5: Define state tokens (global + inventory)
- Task 6: Create CSS index
- Task 7: Create TypeScript exports
- Task 8: Import into global styles
- Task 9: Update CLAUDE.md

**Files created:** 6 token files
**Files modified:** `src/index.css`, `CLAUDE.md`

**Testing:**
- `pnpm typecheck` - Verify TypeScript
- `pnpm dev` - Verify styles load
- Visual verification in Storybook

**Next steps:**
- Update TagBadge component to use tokens
- Update inventory display components
- Document tokens in Storybook
