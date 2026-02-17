# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Player 1 Inventory — a grocery and pantry management app. Designed by ETBlue.

## Commands

```bash
pnpm dev          # Start development server (Vite)
pnpm build        # Build for production
pnpm test         # Run tests (Vitest)
pnpm test:watch   # Run tests in watch mode
pnpm test:ui      # Run tests with UI browser interface
pnpm lint         # Lint with Biome
pnpm format       # Format with Biome
pnpm check        # Run all Biome checks
pnpm storybook    # Start Storybook
```

## Tech Stack

- **Build**: Vite
- **Framework**: React 19 + TypeScript (strict)
- **Routing**: TanStack Router (file-based)
- **Data/State**: TanStack Query + Dexie.js (IndexedDB)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Code Quality**: Biome
- **Testing**: Vitest + React Testing Library

## Architecture

```
Components → TanStack Query hooks → Dexie.js → IndexedDB
```

Components never access the database directly — they use Query hooks from `src/hooks/`.

## Project Structure

```
src/
  components/       # React components
    ui/             # shadcn/ui components
  hooks/            # TanStack Query hooks
  db/               # Dexie.js database and operations
  routes/           # TanStack Router file-based routes
  lib/              # Utilities (cn helper)
  types/            # TypeScript types
  test/             # Test setup
```

## Key Patterns

- **Data types** defined in `src/types/index.ts`
- **Database operations** in `src/db/operations.ts` with tests in `src/db/operations.test.ts`
- **Query hooks** wrap database operations and handle cache invalidation
- **Routes** auto-generate `src/routeTree.gen.ts` on dev server start

## Features

### Tabbed Item Form

Item detail pages use a tabbed layout with three sections:

**1. Stock Status (default tab, `/items/$id`)**
- Quantity fields for packed and unpacked stock
- Unpacked quantity field always enabled (supports fractional packages)
- Expiration date field (date value, not mode/threshold)
- Save button disabled when no changes made

**2. Item Info (same route, `/items/$id`)**
- Item name and package unit configuration
- Target quantity and refill threshold
- Consumption amount settings
- Expiration mode (specific date or days from purchase) and warning threshold

**3. Tags (`/items/$id/tags`)**
- Tag assignment interface with uppercase text styling for tag type names
- Click badges to toggle tag assignment (selected tags show X icon)
- Visual dividers between tag type sections
- Inline tag creation via "New Tag" buttons
- Changes apply immediately without save button

**Measurement Tracking Behavior:**

The "Track in measurement" switch controls measurement-based quantity tracking:
- **Switch always enabled** - Users can toggle freely between package/measurement modes
- **When OFF** (package mode):
  - Measurement fields (unit, amount per package) are disabled
  - All quantities tracked in package units
- **When ON** (measurement mode):
  - Measurement fields become enabled and required
  - Form cannot be submitted until both fields filled
  - Quantities automatically convert between units when toggling

**Unit Conversion:**

When toggling between package/measurement modes, these fields auto-convert:
- Unpacked quantity
- Target quantity
- Refill threshold
- Amount per consume

Conversion uses the `amountPerPackage` value (e.g., 500g per pack).

**Dirty State Tracking:**

Each tab tracks unsaved changes independently:
- Navigation guard prevents tab switching with unsaved changes
- Confirmation dialog offers "Discard" or "Cancel" options
- Save button disabled when form is clean (no changes)
- Logs tab never has unsaved changes (view-only)

**Files:**
- `src/components/ItemForm.tsx` - Shared form component used by both edit and new item routes
- `src/routes/items/$id.tsx` - Parent layout with tabs and navigation guard
- `src/routes/items/$id/index.tsx` - Stock Status + Item Info form (uses ItemForm with all sections)
- `src/routes/items/$id/tags.tsx` - Tags tab implementation
- `src/routes/items/$id.log.tsx` - History/logs tab (view-only)
- `src/routes/items/$id.test.tsx` - Integration tests
- `src/routes/items/new.tsx` - New item form (uses ItemForm with info + advanced sections)
- `src/hooks/useItemLayout.tsx` - Dirty state context for tab coordination

### Manual Quantity Input

Users can manually set current inventory quantities in the item detail form:
- **Packed Quantity** - Number of whole packages (always visible)
- **Unpacked Quantity** - Loose amount from opened packages (only for dual-unit items)
- **Pack unpacked button** - Manually converts complete units from unpacked to packed

**+/- Button Behavior (Pantry Page):**
- Both + and - buttons always operate on unpacked quantity
- No automatic normalization/packing
- Use "Pack unpacked" button in item detail form to manually pack complete units

**Location:** Item detail page (`/items/$id`) via ItemForm component

**Behavior:**
- Pre-populates with current `item.packedQuantity` and `item.unpackedQuantity`
- Validates non-negative values
- Warns when unpacked ≥ amountPerPackage
- Saves directly to database without creating inventory log entries
- Use for initial setup, corrections, or adjustments

**Files:**
- `src/routes/items/$id/index.tsx` - Item detail form with quantity fields
- `src/routes/items/$id.test.tsx` - Component tests
- `src/lib/quantityUtils.ts` - packUnpacked() function

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

**Background layers:**
Three-level system for surface elevation hierarchy:
- `--background-base` / `bg-background`: Base page background
- `--background-surface` / `bg-background-surface` / `bg-card`: Cards, panels, list items
- `--background-elevated` / `bg-background-elevated`: Toolbars, headers, elevated elements

Light mode: 100% → 95% → 90% (progressively darker)
Dark mode: 3.9% → 10% → 15% (progressively lighter)

**Usage:**
```tsx
// Theme colors (from theme.css)
<div className="bg-background text-foreground">
<Button className="bg-primary text-primary-foreground">

// Background layers
<div className="bg-background"> {/* Page base */}
  <Card> {/* Uses bg-card internally (alias for surface layer) */}
    <CardHeader className="bg-background-elevated">
      Toolbar
    </CardHeader>
  </Card>
</div>

// Tag colors (from colors.css)
import { colors, colorUtils } from '@/design-tokens'

<Badge style={{
  backgroundColor: colors.red.tint,
  color: colorUtils.dark
}}>
  Tag (light tint)
</Badge>

<Badge style={{
  backgroundColor: colors.red.default,
  color: colorUtils.tint
}}>
  Tag (bold)
</Badge>
```

**Button color variants:**

The Button component supports 20 color variants matching the Badge color palette:
- Solid variants (10): red, orange, amber, yellow, green, teal, blue, indigo, purple, pink
- Tint variants (10): red-tint, orange-tint, amber-tint, yellow-tint, green-tint, teal-tint, blue-tint, indigo-tint, purple-tint, pink-tint

Usage:
```tsx
<Button variant="teal-tint">Teal Button</Button>
<Button variant="red">Red Button</Button>
```

These variants are used in tag type filter triggers (`TagTypeDropdown`) to display tag type colors when filters are selected.

**Token categories:**
- **Theme**: Semantic colors (background, foreground, primary, card, destructive, etc.) - defined in theme.css
- **Background layers**: base (page, 100% light / 3.9% dark) / surface (cards, 95% light / 10% dark) / elevated (toolbars, 90% light / 15% dark) - defined in theme.css
- **Status colors**: ok, warning, error, inactive (with tint variants) - defined in theme.css
- **Colors**: 10 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink) - defined in colors.css
- **Color variants**: tint (light background) / default (bold, high contrast)
- **Inventory states**: lowStock, expiring, inStock, outOfStock - defined in colors.css
- **Shadows**: sm, md, lg - defined in shadows.css
- **Borders**: default (1px), thick (2px) - defined in borders.css

## Theme System

Three-state theme system (light/dark/system) with automatic OS preference detection and manual override.

**Hook:**
```tsx
import { useTheme } from '@/hooks/useTheme'

function MyComponent() {
  const { preference, theme, setPreference } = useTheme()
  // preference: 'light' | 'dark' | 'system' (user's choice)
  // theme: 'light' | 'dark' (actual applied theme)
  // setPreference: (pref) => void (updates localStorage and DOM)
}
```

**How it works:**
- Inline script in `index.html` applies theme before React loads (prevents flash)
- Theme stored in localStorage as `theme-preference`
- System preference detected via `matchMedia('(prefers-color-scheme: dark)')`
- `dark` class applied to `<html>` element when dark theme active
- Existing `:root` and `.dark` CSS variables in `src/index.css` handle colors

**Component variants:**
```tsx
// Card component supports status-aware variants with left indicator bar
<Card variant="default">   // elevated background, no status indicator
<Card variant="ok">        // green tint background with green left bar
<Card variant="warning">   // orange tint background with orange left bar
<Card variant="error">     // red tint background with red left bar
<Card variant="inactive">  // gray tint background with gray left bar
```

**Guidelines:**
- Use semantic Tailwind colors (`bg-card`, `text-foreground`, etc.) that adapt to theme
- Avoid hardcoded colors like `bg-white` or `bg-gray-900`
- Test components in both light and dark modes
- Use `dark:` prefix for dark-mode-specific styles when needed

## AI Agent SOP

### Documentation Updates

Before creating a PR, update all relevant documentation:

1. **CLAUDE.md** - Update if architecture, commands, or patterns change
2. **Design docs** (`docs/plans/*`) - Update if implementation diverges from plan
3. **Inline comments** - Ensure code comments reflect the changes
4. **Brainstorming logs** (`docs/brainstorming-logs/*`) - Create when brainstorming leads to decisions

### Component Development

**Always create Storybook stories for new components:**
- Every new component should have a corresponding `.stories.tsx` file
- Include multiple stories showing different states and variants
- Use realistic data that demonstrates the component's purpose

**Before committing feature code:**
1. **Check Storybook** - Update existing stories if component API changed
2. **Check Tests** - Update or add tests for new functionality
3. **Verify both pass** - Run `pnpm storybook` and `pnpm test` to ensure no breakage

**Commit together:**
- Commit feature code, Storybook stories, and tests in the same commit when possible
- This keeps the codebase in a consistent state where stories and tests match the code
- Exception: Large refactors may need separate commits, but stories/tests should follow immediately

### CSS Variable Renames

When you detect or perform a CSS variable rename:

1. **Search the entire project** for all occurrences of the obsolete CSS variable
2. **Replace all instances** with the new variable name
3. **Check all file types**:
   - CSS files (`.css`)
   - TypeScript/TSX files (`.ts`, `.tsx`)
   - Test files (`.test.ts`, `.test.tsx`)
   - Storybook files (`.stories.tsx`)
   - Current documentation (`.md`) - CLAUDE.md, README.md, etc.
   - **Do NOT update** historical docs in `docs/plans/` or `docs/brainstorming-logs/`

Use Grep to find all references:
```bash
# Example: search for old variable name
grep --pattern="--old-var-name" --glob="**/*.{css,ts,tsx,md}"
```

This ensures the design token system remains consistent across the entire codebase.

### Brainstorming Logs

**When to create:**
- When brainstorming leads to implementation/design decisions
- Not needed for exploratory discussions without decisions

**Format:**
- Location: `docs/brainstorming-logs/`
- Naming: `YYYY-MM-DD-brainstorming-<topic>.md`
- Date: Session date (when brainstorming occurred)

**Content:**
- Questions asked and user answers
- Final decision/recommendation
- Rationale and trade-offs discussed

### Workflow

**Branch Management:**

After completing a brainstorming session and before documenting the results, create a new branch. This branch will contain all related work:
- The brainstorming log itself
- Any design documents produced
- Implementation plans
- The actual code implementation

The timing is important: create the branch after brainstorming is complete but before writing the design document. This keeps all related work isolated and makes it easy to review the complete feature or change in one PR.

**Default Workflow: Git Worktrees**

Use git worktrees by default for feature work. Create isolated workspaces in `.worktrees/` directory. See "Advanced: Git Worktrees" section below for setup details.

**Alternative: Regular Branches**

For GUI tool users (GitHub Desktop, VS Code) or when worktrees are not suitable, use standard git branches instead.

**Branch Naming:**

Choose the branch prefix based on the primary purpose of the work:
- `docs/` - for documentation-heavy changes
- `feature/` - for new functionality
- `refactor/` - for code restructuring
- `chore/` - for maintenance tasks
- `fix/` - for bug fixes
- Other prefixes as appropriate to the mission

Use descriptive names: `docs/design-tokens`, `feature/dark-mode`, `refactor/component-extraction`

**Branch Cleanup:**

Always delete branches after their PR is merged. This keeps the repository clean and prevents confusion about which branches are active.

Recommended approach using GitHub CLI:
```bash
gh pr merge <number> --merge --delete-branch
```

This automatically deletes the remote branch after merging. Alternative approaches are fine as long as the branch gets deleted.

Local cleanup after the remote branch is deleted:
```bash
git branch -d <branch-name>
```

If using git worktrees, also remove the worktree:
```bash
git worktree remove <worktree-path>
```

**Exceptions:**

For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main. This applies to:
- Small bug fixes
- Typo corrections
- Simple configuration changes
- Other trivial updates

Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.

**General Rule:** If the work involves brainstorming, design decisions, or implementation planning, it should go through the full branch workflow. If it's a quick fix or minor adjustment, check with the user about their preference.

**Before Finishing a Branch:**

Always check for uncommitted changes before completing work:

```bash
git status
```

**If there are uncommitted changes:**
1. Review what's uncommitted - common culprits:
   - Design documents in `docs/plans/`
   - Brainstorming logs in `docs/brainstorming-logs/`
   - Implementation plans
   - Test files or Storybook stories
2. Commit all relevant changes with appropriate commit messages
3. Verify `git status` shows a clean working tree
4. Only then proceed with merge/PR/cleanup

**Why this matters:**
- Uncommitted work can be lost during branch cleanup
- Design docs and plans are part of the feature and should be in the PR
- A clean working tree ensures nothing is left behind

**Advanced: Git Worktrees**

For CLI users who want to work on multiple branches simultaneously without switching, git worktrees provide isolated workspaces.

**Setup:**
```bash
# Create worktree in .worktrees/ directory
git worktree add .worktrees/<branch-name> -b <branch-name>
cd .worktrees/<branch-name>
```

**Directory Convention:**
Use `.worktrees/` directory for git worktrees (project-local, hidden). Ensure it's in `.gitignore`.

**Cleanup:**
```bash
# After branch is merged and deleted
git worktree remove .worktrees/<branch-name>
```

**Note:** Git worktrees are not supported in GitHub Desktop. If you use GUI tools, stick with regular branches.

### Test Format

**Feature/integration tests** - Use "user can ..." naming with Given-When-Then comments:

```ts
it('user can create an item', async () => {
  // Given valid item data
  const itemData = { name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 }

  // When user creates the item
  const item = await createItem(itemData)

  // Then item is persisted with id and timestamps
  expect(item.id).toBeDefined()
  expect(item.createdAt).toBeInstanceOf(Date)
})
```

**Unit tests** - Keep simple naming (existing style is fine)

### Commits

Always include scope in commit messages:

- `feat(cart): add checkout confirmation`
- `fix(tags): prevent duplicate tag names`
- `docs(readme): update setup instructions`

### Pull Requests

Include these sections in PR description:

```
## Summary
- <bullet points of what changed>

## Test Plan
- [ ] <verification steps>
```
