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
- **Background layers**: base (page) / surface (cards) / elevated (toolbars)
- **Tag colors**: 10 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink)
- **Tag variants**: default (light tint) / inverse (bold)
- **State colors**: Global states + inventory mappings (low-stock, expiring, in-stock, out-of-stock)
- **Shadows**: sm, md, lg
- **Borders**: default (1px), thick (2px)

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
// Card component supports theme-aware variants
<Card variant="warning">  // orange border for warnings
<Card variant="default">  // standard bg-card background
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

**Recommended Approach: Regular Branches**

Use regular git branches for feature work. This approach works with all git tools including GitHub Desktop, VS Code, and CLI.

**Advanced Alternative: Git Worktrees**

CLI users may optionally use git worktrees for parallel work isolation. Create worktrees in `.worktrees/` directory (project-local, hidden). See "Advanced: Git Worktrees" section below for details.

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
