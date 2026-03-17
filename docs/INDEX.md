# Docs Index

Status key: ✅ Implemented · 🔲 Pending · 🔄 In Progress · ⚠️ Partial

---

## Global — cross-cutting concerns

| Area | Status | Notes |
|------|--------|-------|
| [ai-sop](global/ai-sop/) | 🔄 Active | SOP evolves continuously; commit-splitting, verification-gate recent |
| [app-setup](global/app-setup/) | ✅ Implemented | Storybook, pnpm, initial design all done |
| [backend](global/backend/) | ✅ Implemented | Monorepo + Items + TagType/Tag + Vendor + Recipe all done |
| [design-system](global/design-system/) | ✅ Implemented | Tokens, theme, typography, button variants all done |
| [i18n](global/i18n/) | ⚠️ Partial | Core + settings/tags done; most pages still hardcoded |
| [navigation](global/navigation/) | ✅ Implemented | Context-aware nav, hide-nav-bar, nav counts all done |
| [testing](global/testing/) | ⚠️ Partial | Playwright + Storybook smoke tests done; items + tags + vendors + recipes + cooking E2E (local + cloud) done |
| [ui-polish](global/ui-polish/) | ✅ Implemented | Dialogs, toolbars, delete flows, component extraction done |

---

## Features — page/domain-specific

| Feature | Status | Notes |
|---------|--------|-------|
| [cooking](features/cooking/) | ✅ Implemented | Core + toolbar + search + sort + E2E (local + cloud) done |
| [items](features/items/) | ✅ Implemented | Item card, form, filters, create-on-search all done |
| [pantry](features/pantry/) | ✅ Implemented | Toolbar, sort/filter pipeline, unified filters done |
| [settings](features/settings/) | ⚠️ Partial | Cascade deletion done; settings-refactor pending |
| [shopping](features/shopping/) | ✅ Implemented | Redesign, pin, checkout, package unit display done |
| [tags](features/tags/) | ✅ Implemented | CRUD, filtering, colors, E2E done |
| [vendors](features/vendors/) | ✅ Implemented | CRUD, assignment, dual-mode hooks, cloud backend + E2E done |
| [recipes](features/recipes/) | ✅ Implemented | Cloud backend migration: model, schema, resolver, dual-mode hooks, E2E (local + cloud) done |
| [item-list-state-restore](features/item-list-state-restore/) | ✅ Done | Back-navigation state preservation: filters, sort, search, scroll |

---

_Update this table when creating new plans (add row as 🔲 Pending) or completing implementations (update status to ✅)._
