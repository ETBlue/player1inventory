# Docs Index

Status key: ✅ Implemented · 🔲 Pending · 🔄 In Progress · ⚠️ Partial

---

## Global — cross-cutting concerns

| Area | Status | Notes |
|------|--------|-------|
| [ai-sop](global/ai-sop/) | 🔄 Active | SOP evolves continuously; commit-splitting, verification-gate recent |
| [app-setup](global/app-setup/) | ✅ Implemented | Storybook, pnpm, initial design all done |
| [backend](global/backend/) | 🔄 In Progress | Monorepo + Items + TagType/Tag done; remaining entities (Vendor, Recipe, etc.) pending |
| [design-system](global/design-system/) | ✅ Implemented | Tokens, theme, typography, button variants all done |
| [i18n](global/i18n/) | ⚠️ Partial | Core + settings/tags done; most pages still hardcoded |
| [navigation](global/navigation/) | ✅ Implemented | Context-aware nav, hide-nav-bar, nav counts all done |
| [testing](global/testing/) | ⚠️ Partial | Playwright + Storybook smoke tests done; items + tags E2E (local + cloud) done; cooking E2E pending |
| [ui-polish](global/ui-polish/) | ✅ Implemented | Dialogs, toolbars, delete flows, component extraction done |

---

## Features — page/domain-specific

| Feature | Status | Notes |
|---------|--------|-------|
| [cooking](features/cooking/) | ⚠️ Partial | Core + toolbar + search + sort done; E2E pending |
| [items](features/items/) | ✅ Implemented | Item card, form, filters, create-on-search all done |
| [pantry](features/pantry/) | ✅ Implemented | Toolbar, sort/filter pipeline, unified filters done |
| [settings](features/settings/) | ⚠️ Partial | Cascade deletion done; settings-refactor pending |
| [shopping](features/shopping/) | ✅ Implemented | Redesign, pin, checkout, package unit display done |
| [tags](features/tags/) | ✅ Implemented | CRUD, filtering, colors, E2E done |
| [vendors](features/vendors/) | ✅ Implemented | CRUD, assignment, combined input all done |

---

_Update this table when creating new plans (add row as 🔲 Pending) or completing implementations (update status to ✅)._
