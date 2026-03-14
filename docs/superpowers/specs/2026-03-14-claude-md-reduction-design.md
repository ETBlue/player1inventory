# CLAUDE.md Size Reduction Design

**Date:** 2026-03-14
**Branch:** docs/settings-refactor
**Status:** Ready for implementation

## Problem

The root `CLAUDE.md` file is 50.1k characters, exceeding Claude Code's 40k performance threshold. This triggers a warning on every session start and burns unnecessary context window tokens on conversations unrelated to feature internals.

## Goal

Reduce root `CLAUDE.md` to under 40k characters without deleting any content or degrading Claude's effectiveness.

## Approach

Move the entire `## Features` section (~330 lines, ~20k characters) out of the root `CLAUDE.md` and into sub-directory `CLAUDE.md` files co-located with the routes they describe.

Claude Code automatically loads `CLAUDE.md` files from all ancestor directories of any file it reads. This means feature documentation is loaded exactly when it is relevant and skipped when it is not.

## File Mapping

| New file | Content |
|---|---|
| `apps/web/src/routes/items/CLAUDE.md` | Tabbed Item Form, Manual Quantity Input |
| `apps/web/src/routes/settings/vendors/CLAUDE.md` | Vendor Management |
| `apps/web/src/routes/settings/tags/CLAUDE.md` | Tag Management |
| `apps/web/src/routes/settings/CLAUDE.md` | Cascade Deletion |
| `apps/web/src/routes/CLAUDE.md` | Item List Filter Pipeline, Shopping Page, Cooking Page |

**Note on Cascade Deletion placement:** The cascade logic lives in `apps/web/src/db/operations.ts` and `apps/web/src/hooks/`, not in `src/routes/settings/`. Placing Cascade Deletion in `apps/web/src/routes/settings/CLAUDE.md` means it will be loaded when Claude works on settings route files (the delete UI entry points), but NOT when Claude works directly on `src/db/operations.ts` or the delete hooks. This is a known limitation. The cascade behavior is partially covered by the Vendor Management and Tag Management sections (in their respective sub-files), which describe the cascade effect from the feature perspective.

**Note on Recipes:** `apps/web/src/routes/settings/recipes/` exists but does not need its own `CLAUDE.md`. Recipe management is described as part of the item form's Recipes tab, which lives in `apps/web/src/routes/items/CLAUDE.md`.

## Root CLAUDE.md After Change

The `## Features` section heading and body are removed and replaced with a short pointer comment:

```markdown
## Features

> Feature documentation lives in sub-directory CLAUDE.md files co-located with the routes:
> - `apps/web/src/routes/CLAUDE.md` — filter pipeline, shopping, cooking
> - `apps/web/src/routes/items/CLAUDE.md` — item form, manual quantity input
> - `apps/web/src/routes/settings/CLAUDE.md` — cascade deletion
> - `apps/web/src/routes/settings/tags/CLAUDE.md` — tag management
> - `apps/web/src/routes/settings/vendors/CLAUDE.md` — vendor management
```

## What Does NOT Change

- AI Agent SOP section (stays in root, always needed)
- Commands, Tech Stack, Architecture, Project Structure, Key Patterns (stays in root)
- Shared Components, Custom Hooks (stays in root)
- Design Tokens, Name Display Convention, Theme System, i18n (stays in root)
- Content itself — nothing is deleted or rewritten

## Expected Result

- Root `CLAUDE.md`: ~30k characters (well under 40k threshold)
- No warning on session start
- Feature docs load contextually when Claude works in the relevant directories
- Zero content loss
