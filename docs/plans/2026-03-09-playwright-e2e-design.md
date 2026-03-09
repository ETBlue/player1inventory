# Playwright E2E Testing — Design

## Goal

Add Playwright end-to-end tests as a technical practice. Primary objectives:
- Learn the Playwright API and Page Object Model pattern
- Build a foundation that grows into meaningful coverage over time
- Keep the setup migration-safe (no coupling to IndexedDB storage layer)

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Location | `e2e/` folder in same repo | Simple, co-located with code, no monorepo tooling needed |
| Pattern | Page Object Model (POM) | Industry standard, scales well, migration-safe |
| Server | Vite dev server via `webServer` + `reuseExistingServer: true` | Reuses running dev server if available; no impact on HMR |
| First suite | Item management (5 tests) | Covers core CRUD, touches multiple tabs — representative of the full app |
| CI | Local-only for now | Avoids slowing PRs; CI integration deferred until suite is stable |
| Data seeding | Via UI only | No IndexedDB injection — survives future backend migration |
| Test naming | `user can ...` | Consistent with existing Vitest integration tests |

## Folder Structure

```
e2e/
  playwright.config.ts
  pages/
    PantryPage.ts       # pantry list (/) — navigateTo, clickAddItem, searchFor, getItemCard
    ItemPage.ts         # item detail (/items/$id) — fillName, save, navigateToTab, delete, assignTag, assignVendor
  tests/
    item-management.spec.ts
```

## Page Objects

### `PantryPage`

Covers the pantry list page (`/`).

| Method | Description |
|---|---|
| `navigateTo()` | Navigate to `/` |
| `clickAddItem()` | Click the add item button |
| `searchFor(name)` | Type into the search input |
| `getItemCard(name)` | Return a locator for the named item card |

### `ItemPage`

Covers the item detail page (`/items/$id`).

| Method | Description |
|---|---|
| `fillName(name)` | Fill the item name field |
| `save()` | Click the Save button |
| `navigateToTab(tab)` | Switch to a named tab (Info, Tags, Vendors, etc.) |
| `delete()` | Click delete and confirm |
| `assignTag(name)` | Toggle a tag badge by name |
| `assignVendor(name)` | Toggle a vendor badge by name |

## First Test Suite: `item-management.spec.ts`

```
user can create an item
user can edit an item name
user can assign a tag to an item
user can assign a vendor to an item
user can delete an item
```

## Scripts

Added to `package.json`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:debug": "playwright test --debug"
```

- `test:e2e` — headless run
- `test:e2e:ui` — interactive UI mode (step-through, traces, screenshots — useful for learning)
- `test:e2e:debug` — pause and debug individual actions

## Future Extensions

- Additional suites: shopping flow, cooking flow
- CI integration with a dedicated job (parallel to unit tests) once suite is stable
- Data seeding via API/test endpoints when backend migration is complete
- Smoke test tagging (`@smoke`) for fast PR-level checks
