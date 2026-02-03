# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Player 1 Inventory — a grocery and pantry management app. Designed by ETBlue.

## Commands

```bash
npm run dev       # Start development server (Vite)
npm run build     # Build for production
npm test          # Run tests (Vitest)
npm run test:watch # Run tests in watch mode
npm run lint      # Lint with Biome
npm run format    # Format with Biome
npm run check     # Run all Biome checks
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
