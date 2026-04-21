# Docs Index

Status key: ✅ Implemented · 🔲 Pending · 🔄 In Progress · ⚠️ Partial

---

## Global — cross-cutting concerns

| Area | Status | Notes |
|------|--------|-------|
| [a11y](global/a11y/) | ✅ Implemented | Plan 1 (critical/high fixes), Plan 2 (keyboard/motion), Plan 3 (visual verification) — all done |
| [ai-sop](global/ai-sop/) | 🔄 Active | SOP evolves continuously; commit-splitting, verification-gate recent |
| [app-setup](global/app-setup/) | ✅ Implemented | Storybook, pnpm, initial design all done |
| [backend](global/backend/) | 🔲 Pending | Monorepo + Items + TagType/Tag + Vendor + Recipe done; shopping cart cloud backend done; **deferred:** post-login IndexedDB → MongoDB migration (see `global/backend/2026-03-27-post-login-migration.md`); seamless offline ↔ online migration with conflict UI 🔲 Pending (see `global/backend/2026-04-04-seamless-offline-online-migration-design.md`) |
| [design-system](global/design-system/) | ✅ Implemented | Tokens, theme, typography, button variants all done; OKLCH color conversion complete — Phase A (HSL→OKLCH) and Phase B (WCAG AA calibration) done (see `global/design-system/2026-04-05-oklch-colors.md`) |
| [design-guide](global/design-system/) | 🔄 In Progress | Starlight + Storybook live at `design.*` and `storybook.*`; content scaffold complete, filling content (see `global/design-system/2026-04-13-design-guide.md`) |
| [i18n](global/i18n/) | ⚠️ Partial | Core + settings/tags + shopping + cooking done; item list pages still hardcoded |
| [navigation](global/navigation/) | ✅ Implemented | Context-aware nav, hide-nav-bar, nav counts, RWD mobile+desktop all done |
| [refactoring](global/refactoring/) | ✅ Implemented | Renamed all component index.tsx files to ComponentName.tsx (refactor/rename-index-tsx) |
| [testing](global/testing/) | ⚠️ Partial | Playwright + Storybook smoke tests done; Storybook language toolbar done; route-level stories + smoke tests done; items + tags + vendors + recipes + cooking + state-restore E2E (local + cloud) done; shopping cloud E2E done |
| [ui-polish](global/ui-polish/) | ⚠️ Partial | Dialogs, toolbars, delete flows, component extraction done; RWD improvements done; form validation UX done; empty state consolidation 🔲 Pending |

---

## Features — page/domain-specific

| Feature | Status | Notes |
|---------|--------|-------|
| [cooking](features/cooking/) | ✅ Implemented | Core + toolbar + search + sort + E2E (local + cloud) done; expand/collapse state in URL done; sort by expiration 🔲 Pending |
| [items](features/items/) | 🔄 In Progress | Item card, form, filters, create-on-search all done; explicit expirationMode field in progress (`feature/expiration-mode`) |
| [pantry](features/pantry/) | ✅ Implemented | Toolbar, sort/filter pipeline, unified filters done |
| [settings](features/settings/) | ⚠️ Partial | Cascade deletion done; data import/export (both modes) done; settings-refactor pending |
| [sign-out-and-migration](features/settings/) | 🔄 In Progress | Sign Out button (cloud mode); Switch button symmetry (offline ↔ cloud); migration wiring (doDisable + usePostLoginMigration); DataModeCard refactor |
| [data-import-export](features/settings/) | ✅ Implemented | Export (local + cloud), import (local + cloud), conflict dialog with skip/replace/clear strategies, dual-mode, E2E verified |
| [shopping](features/shopping/) | ✅ Implemented | Cloud backend + E2E done; vendor selection in URL done; vendor carts 🔲 Pending |
| [tags](features/tags/) | ✅ Implemented | CRUD, filtering, colors, E2E done |
| [vendors](features/vendors/) | ✅ Implemented | CRUD, assignment, dual-mode hooks, cloud backend + E2E done |
| [recipes](features/recipes/) | ✅ Implemented | Cloud backend migration: model, schema, resolver, dual-mode hooks, E2E (local + cloud) done |
| [item-list-state-restore](features/item-list-state-restore/) | ✅ Done | Back-navigation state preservation done (local + cloud E2E) |
| [inventory-logs](features/inventory-logs/) | ✅ Implemented | Cloud operations done: schema fix, GraphQL queries/mutations, dual-mode hooks, E2E tests |
| [storybook-coverage](features/storybook-coverage/) | ✅ Implemented | Component stories done; route-level stories + smoke tests done for all 17 routes |
| [onboarding](features/onboarding/) | 🔄 In Progress | Phase A done: nested tags, InfoForm refactor, dialog improvements. Phase B done: full onboarding flow (template data, 4-step state machine, TemplateItemRow/TemplateVendorRow, inline import progress, auto-navigate to pantry, useOnboardingSetup hook, empty-data redirect, E2E). Phase C (settings reset) pending; template editor (dev tool) 🔲 Pending |
| [shelf](features/shelf/) | ✅ Done | Shelf view: filter + selection shelves; `/shelves` + `/shelves/$shelfId` + `/settings/shelves`; dual-persistence (local Dexie + cloud GraphQL); sortBy/sortDir top-level fields |

---

_Update this table when creating new plans (add row as 🔲 Pending) or completing implementations (update status to ✅)._
