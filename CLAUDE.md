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

## Worktrees

Use `.worktrees/` directory for git worktrees (project-local, hidden).

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

### Branches

Use prefixes:

- `feature/` - New features (e.g., `feature/cart-checkout`)
- `fix/` - Bug fixes (e.g., `fix/tag-duplication`)
- `docs/` - Documentation only (e.g., `docs/api-reference`)

### Pull Requests

Include these sections in PR description:

```
## Summary
- <bullet points of what changed>

## Test Plan
- [ ] <verification steps>
```
