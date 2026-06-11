# Design — Item-detail tab restructure (Locations PR #1)

**Date:** 2026-06-11
**Status:** 🔲 Pending
**Brainstorming:** `2026-06-11-brainstorming-item-detail-tabs.md`
**Branch:** `worktree-refactor-item-detail-tabs` (off `main`)
**Scope:** Behaviour-preserving UI refactor of the item-detail page + two new optional global `Item` fields. **No locations / per-location stock** — that's the subsequent feature.

## Goal

Restructure the item-detail tabs so stock has its own tab and the toolbar has room, preparing for the Location feature, while adding two global item-info fields (`wikidataUrl`, `note`). No regression to existing behaviour.

## Toolbar: before → after

| | Before (5) | After (4) |
|---|---|---|
| 1 | Info+Stock (`Settings2`) → `/items/$id` | **Info** (`Settings2`) → `/items/$id` |
| 2 | Tags (`Tags`) → `/items/$id/tags` | **Stock** (new icon) → `/items/$id/stock` |
| 3 | Vendors (`Store`) → `/items/$id/vendors` | **Relation** (new icon) → `/items/$id/relation` |
| 4 | Recipes (`ChefHat`) → `/items/$id/recipes` | **Log** (`History`) → `/items/$id/log` |
| 5 | Log (`History`) → `/items/$id/log` | — |

Tags / Vendors / Recipes move *into* the Relation tab's submenu (below the toolbar).

**Icon + i18n proposals** (finalise during impl):
- Stock icon: lucide `Boxes` (or `Package`); aria-label key `items.detail.tabs.stock` → "Item stock tab".
- Relation icon: lucide `Waypoints` (or `Network`); aria-label key `items.detail.tabs.relations` → "Item relations tab".

## Field placement

`ItemForm` (`apps/web/src/components/item/ItemForm/ItemForm.tsx`) already gates blocks via its `sections` prop. Rework which block owns which field:

- **Info section** (`sections=['info']`): `name` + **new** `wikidataUrl` + **new** `note`. *(Remove `packageUnit` from this block.)*
- **Stock section** (`sections=['stock']`): packed/unpacked, target, threshold, consumeAmount, the measurement toggle, `measurementUnit`, `amountPerPackage`, **`packageUnit`** (moved here), expiration mode + fields.

## New `Item` fields

`packages/types/src/index.ts`:
```ts
interface Item {
  // ...existing...
  wikidataUrl?: string   // full URL to the Wikidata entity; future name-i18n source
  note?: string          // free-text notes / links
}
```
Optional, non-indexed → **no Dexie version bump**. `createItem`/`updateItem` in `apps/web/src/db/operations.ts` pass them through; default `undefined`.

**Info-tab inputs:**
- `wikidataUrl`: single-line text input, optional, light URL validation (non-blocking — allow empty; if present, expect an `http(s)://` URL). Placeholder e.g. `https://www.wikidata.org/wiki/Q...`.
- `note`: multiline `textarea`, optional. Not capitalized (free text / links).

## Routing changes

TanStack file-based routes under `apps/web/src/routes/items/`:

- **`$id/index.tsx`** — becomes the **Info** tab: `ItemForm sections={['info']}` + delete button. Gains a save button + dirty guard (name/wikidata/note are editable).
- **`$id/stock.tsx`** (new) — the **Stock** tab: `ItemForm sections={['stock']}` + the stock save/dirty behaviour that the combined tab has today (recipe-adjust dialog logic moves here with the stock fields).
- **`$id/relation.tsx`** (new) — **Relation** layout: renders a secondary submenu (Tags / Vendors / Recipes icon buttons) under the main toolbar + `<Outlet/>`.
  - **`$id/relation/index.tsx`** (new) — redirect to `…/relation/vendors` (default subtab).
  - **`$id/relation/tags.tsx`**, **`relation/vendors.tsx`**, **`relation/recipes.tsx`** — relocated content from today's `$id/tags.tsx`, `$id/vendors.tsx`, `$id/recipes.tsx` (immediate-apply, unchanged behaviour). Old files removed.
- **`$id/log.tsx`** — unchanged.
- **`$id.tsx`** (layout): toolbar rebuilt to the 4-button set; the Relation button is active on any `…/relation/*` route. Dirty-guard now applies when leaving **either** the Info or Stock tab.

`routeTree.gen.ts` regenerates on dev server start.

## Dirty-state handling

Today only the combined Stock+Info tab is dirty-guarded via `useItemLayout()` + `ItemLayoutProvider` (`apps/web/src/hooks/useItemLayout.tsx`, `routes/items/$id.tsx`). After the split, **both** Info and Stock tabs render an `ItemForm` that registers dirty state through the same context; the toolbar navigation guard already reads `isDirty`, so it covers both. Verify the discard dialog fires when navigating away from each.

## Relation submenu

`$id/relation.tsx` renders, under the main `LayoutInnerPages` toolbar, a horizontal secondary nav with three `Link` icon buttons (Tags `Tags`, Vendors `Store`, Recipes `ChefHat`) — each active-highlighted on its subroute — plus the routed `<Outlet/>`. Reuse the existing aria-label keys (`items.detail.tabs.tags|vendors|recipes`). Default landing = vendors.

## Stories, tests, i18n

- **Types/i18n:** add `wikidataUrl`/`note` to types; add `items.detail.tabs.stock` + `items.detail.tabs.relations` keys and Info-field labels/placeholders to `apps/web/src/i18n/locales/*.json` (all locales).
- **Stories:** new `$id/stock.stories.tsx`; update `$id/index.stories.tsx` (now Info-only, with the new fields); relocate tags/vendors/recipes stories under `relation/`; add a relation-layout story showing the submenu. Each with a matching `.stories.test.tsx` smoke test.
- **Unit/integration:** update `$id.test.tsx` (4-button toolbar, dirty guard from both editable tabs); move tags/vendors/recipes route tests under `relation/`; add a stock-tab test; test `ItemForm` renders the new Info fields and persists them; test `packageUnit` now lives in the stock section.
- **E2E:** update any `e2e/tests/items*.spec.ts` page objects/selectors for the new tab routes (`/items/$id/stock`, `/items/$id/relation/...`); add a check that editing the Info note/wikidata persists. Add the new routes' a11y coverage if route-level pages are scanned.

## Verification gate (per CLAUDE.md)

`pnpm lint` · `pnpm build` (+ `grep TS6385`) · `pnpm build-storybook` · `pnpm check`; final: `pnpm test:e2e --grep "items|a11y"`.

## Out of scope

Locations, `ItemStock`, active-location switcher, the Stock-tab all-locations pager — all in subsequent feature PRs (`docs/features/locations/`).
