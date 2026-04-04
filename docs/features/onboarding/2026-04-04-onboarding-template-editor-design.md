# Onboarding Template Editor

## Overview

A developer-facing GUI tool — a new app in the monorepo — for editing the onboarding template data (tags, items, vendors) and exporting a JSON file consumed by the main frontend app.

This is not end-user facing. It is a developer workflow tool to make template maintenance easier than hand-editing JSON.

## Motivation

The current template data (`src/i18n/` locales + hardcoded seed arrays) is maintained by hand-editing source files. As the template grows (more tags, items, vendors, i18n keys), a GUI editor reduces errors and speeds up iteration.

## Scope

- New app in the monorepo (e.g. `apps/template-editor/`)
- Developer launches it locally (`pnpm dev` in that app)
- Loads the existing template JSON, presents editable UI
- Exports updated JSON file(s) back to the main app's source tree

## Key Design Decisions

- **Who uses it:** Developers only — no auth, no deployment needed
- **Input format:** Reads current template data (tags, items, vendors, i18n keys) from `apps/web/src/`
- **Output format:** Exports JSON that the main app imports statically
- **Items can appear in multiple vendor carts** — not relevant here (vendor assignment is part of the item data model)
- **i18n:** Template data is i18n-keyed; editor must support editing both `en` and `zh-TW` locale strings

## Open Questions

- What app framework for the editor? (Same React/Vite stack? Simpler HTML tool?)
- Should the editor also handle tag-type hierarchy (nested tags)?
- Where does the exported JSON land — same file paths as current static data, or a dedicated `template.json`?
- Does the editor need preview mode (show what the onboarding flow would look like with current template data)?

## Status

🔲 Pending — no implementation plan yet
