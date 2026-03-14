# CLAUDE.md Size Reduction Design

**Date:** 2026-03-14
**Branch:** docs/settings-refactor
**Status:** Approved

## Problem

The root `CLAUDE.md` file is 50.1k characters, exceeding Claude Code's 40k performance threshold. This triggers a warning on every session start and burns unnecessary context window tokens on conversations unrelated to feature internals.

## Goal

Reduce root `CLAUDE.md` to under 40k characters without deleting any content or degrading Claude's effectiveness.

## Approach

Move the entire `## Features` section (~330 lines, ~15k characters) out of the root `CLAUDE.md` and into sub-directory `CLAUDE.md` files co-located with the routes they describe.

Claude Code automatically loads `CLAUDE.md` files from all ancestor directories of any file it reads. This means feature documentation is loaded exactly when it is relevant and skipped when it is not.

## File Mapping

| New file | Content |
|---|---|
| `apps/web/src/routes/items/CLAUDE.md` | Tabbed Item Form, Manual Quantity Input |
| `apps/web/src/routes/settings/vendors/CLAUDE.md` | Vendor Management |
| `apps/web/src/routes/settings/tags/CLAUDE.md` | Tag Management |
| `apps/web/src/routes/settings/CLAUDE.md` | Cascade Deletion |
| `apps/web/src/routes/CLAUDE.md` | Item List Filter Pipeline, Shopping Page, Cooking Page |

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

- Root `CLAUDE.md`: ~35k characters (under 40k threshold)
- No warning on session start
- Feature docs load contextually when Claude works in the relevant directories
- Zero content loss
