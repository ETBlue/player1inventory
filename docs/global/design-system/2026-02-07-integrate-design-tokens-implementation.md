# Design Tokens Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all CSS design tokens in `src/design-tokens/` directory, fix broken shadcn theme utilities by adding `@theme inline` mappings, and establish clear organization.

**Architecture:** Move shadcn theme variables from `src/index.css` to `src/design-tokens/theme.css` with proper `:root`, `.dark`, and `@theme inline` structure. Merge state colors into `colors.css`. Update all import paths accordingly.

**Tech Stack:** CSS, Tailwind CSS v4, design tokens, file organization

---

## Task 1: Create theme.css with shadcn semantic colors

**Files:**
- Create: `src/design-tokens/theme.css`

**Step 1: Create theme.css file**

Create `src/design-tokens/theme.css` with the following content:

```css
/* Base theme variables (light mode) */
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96.1%;
  --muted-foreground: 0 0% 45.1%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --ring: 0 0% 3.9%;
  --radius: 0.5rem;
}

/* Dark mode overrides */
.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 0 0% 83.1%;
}

/* Map to Tailwind utilities */
@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
}

/* Apply base colors to body */
body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

**Step 2: Commit**

```bash
git add src/design-tokens/theme.css
git commit -m "feat(design-tokens): add theme.css with shadcn semantic colors

Add theme.css with :root light mode variables, .dark overrides, and
@theme inline mappings to generate Tailwind utilities (bg-background,
text-foreground, etc.). This fixes broken shadcn theme utilities.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

## Task 2: Update colors.css to include state colors

**Files:**
- Modify: `src/design-tokens/colors.css`

**Step 1: Read current colors.css**

Read `src/design-tokens/colors.css` to see existing tag colors.

**Step 2: Read states.css to get state colors**

Read `src/design-tokens/states.css` to see what needs to be merged.

**Step 3: Update colors.css with merged content**

Update `src/design-tokens/colors.css` to include state colors:

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

  /* Global state colors */
  --color-state-normal: #a3a3a3;
  --color-state-ok: #22c55e;
  --color-state-warning: #f59e0b;
  --color-state-error: #ef4444;
  --color-state-inactive: #d4d4d4;
}

/* Inventory-specific state mappings */
:root {
  --color-inventory-low-stock: var(--color-state-warning);
  --color-inventory-expiring: var(--color-state-error);
  --color-inventory-in-stock: var(--color-state-ok);
  --color-inventory-out-of-stock: var(--color-state-inactive);
}

/* Dark mode state override */
.dark {
  --color-state-inactive: #666666;
}
```

**Step 4: Commit**

```bash
git add src/design-tokens/colors.css
git commit -m "refactor(design-tokens): merge state colors into colors.css

Consolidate all color-related tokens in colors.css by merging state
colors from states.css. Keeps colors organized in one place.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

## Task 3: Update design-tokens/index.css

**Files:**
- Modify: `src/design-tokens/index.css`

**Step 1: Update index.css imports**

Update `src/design-tokens/index.css`:

```css
@import './theme.css';
@import './colors.css';
@import './shadows.css';
@import './borders.css';
```

**Step 2: Commit**

```bash
git add src/design-tokens/index.css
git commit -m "refactor(design-tokens): update index to import theme first

Add theme.css import as first import and remove states.css import
(merged into colors.css). Theme establishes base semantic colors.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

## Task 4: Update src/index.css to minimal imports

**Files:**
- Modify: `src/index.css`

**Step 1: Update index.css to minimal content**

Replace entire content of `src/index.css`:

```css
@import 'tailwindcss';
@import './design-tokens/index.css';
```

**Step 2: Commit**

```bash
git add src/index.css
git commit -m "refactor(design-tokens): simplify src/index.css

Remove all theme variables from index.css (moved to design-tokens/theme.css).
Keep only Tailwind and design tokens imports for clean entry point.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

## Task 5: Delete states.css

**Files:**
- Delete: `src/design-tokens/states.css`

**Step 1: Delete states.css file**

```bash
git rm src/design-tokens/states.css
```

**Step 2: Commit**

```bash
git commit -m "refactor(design-tokens): remove states.css

Delete states.css as content has been merged into colors.css.
All color tokens now in one file.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

## Task 6: Verify build and visual check

**Files:**
- None (testing)

**Step 1: Run build**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

**Step 2: Check if bg-background utilities are generated**

```bash
grep -o "bg-background\|text-foreground\|bg-card" dist/assets/*.css | head -5
```

Expected: Should find CSS rules for these utilities (not just class names).

**Step 3: Start dev server**

```bash
pnpm dev
```

Expected: Dev server starts without errors.

**Step 4: Visual verification in browser**

1. Open http://localhost:5173 (or whatever port shown)
2. Check that background colors appear correctly
3. Check navigation, buttons, cards display properly
4. Toggle to dark mode using settings
5. Verify dark mode colors work correctly
6. Check that no visual regressions

Expected: All UI elements render with proper colors in both light and dark mode.

**Step 5: Run tests**

```bash
pnpm test
```

Expected: All tests pass (42 tests).

**Step 6: If all checks pass, note verification complete**

No commit needed for this task.

## Task 7: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Read current Design Tokens section**

Read `CLAUDE.md` lines 61-93 to see current documentation.

**Step 2: Update Design Tokens section**

Replace the Design Tokens section in `CLAUDE.md`:

```markdown
## Design Tokens

Token system for theme, colors, shadows, and borders:

```
src/design-tokens/
  ├── theme.css      # Shadcn semantic colors (background, primary, etc.)
  ├── colors.css     # Tag colors + state colors
  ├── shadows.css    # Shadow scale
  ├── borders.css    # Border definitions
  ├── index.css      # Imports all
  └── index.ts       # TypeScript exports
```

**Theme system:**
- `:root` defines HSL values for light mode semantic colors
- `.dark` overrides for dark mode
- `@theme inline` maps CSS variables to Tailwind utilities (bg-background, text-foreground, etc.)
- Two-layer approach preserves theming flexibility

**Usage:**
```tsx
// Theme colors (from theme.css)
<div className="bg-background text-foreground">
<Button className="bg-primary text-primary-foreground">

// Tag colors (from colors.css)
import { tagColors, tagTextColors } from '@/design-tokens'

<Badge style={{
  backgroundColor: tagColors.red.default,
  color: tagTextColors.default
}}>
  Tag
</Badge>
```

**Token categories:**
- **Theme**: Semantic colors (background, foreground, primary, card, destructive, etc.)
- **Tag colors**: 10 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink)
- **Tag variants**: default (light tint) / inverse (bold)
- **State colors**: Global states + inventory mappings (low-stock, expiring, in-stock, out-of-stock)
- **Shadows**: sm, md, lg
- **Borders**: default (1px), thick (2px)
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(design-tokens): update documentation for new structure

Update Design Tokens section to reflect new structure with theme.css,
merged colors+states, and explain @theme inline pattern.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

## Task 8: Final verification and create PR

**Files:**
- None (git operations)

**Step 1: Run all checks**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: All checks pass.

**Step 2: Review git log**

```bash
git log --oneline origin/main..HEAD
```

Expected: See 7 commits for this refactoring.

**Step 3: Push branch**

```bash
git push -u origin refactor/integrate-design-tokens
```

**Step 4: Create PR**

```bash
gh pr create --title "refactor(design-tokens): integrate index.css into design tokens" --body "$(cat <<'EOF'
## Summary
- Move shadcn theme from src/index.css to design-tokens/theme.css
- Add @theme inline mappings to fix broken bg-background utilities
- Merge states.css into colors.css for better organization
- Simplify src/index.css to minimal imports
- Update documentation

## Changes
- **NEW**: `design-tokens/theme.css` - Shadcn semantic colors with :root, .dark, @theme inline
- **UPDATED**: `design-tokens/colors.css` - Merged state colors
- **UPDATED**: `design-tokens/index.css` - Import theme first, remove states import
- **UPDATED**: `src/index.css` - Minimal imports only
- **DELETED**: `design-tokens/states.css` - Merged into colors.css
- **UPDATED**: `CLAUDE.md` - Document new structure

## Fixes
- bg-background, text-foreground, and other shadcn utilities now work correctly
- Proper @theme inline mapping generates Tailwind utilities

## Test Plan
- [x] All 42 tests passing
- [x] TypeScript compilation successful
- [x] Linting passes
- [x] Build successful
- [x] Visual verification in light mode
- [x] Visual verification in dark mode
- [x] No visual regressions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created successfully.

**Step 5: Note PR URL**

Save the PR URL for reference.

---

## Execution Notes

**Testing strategy:**
- No unit tests needed (CSS refactoring)
- Verification via build + visual check
- Ensure utilities are generated correctly

**Key validations:**
- Build succeeds
- bg-background utilities exist in compiled CSS
- Visual appearance unchanged
- Light/dark mode both work

**Rollback plan:**
If issues found, the changes are isolated to CSS organization and can be reverted via git.
