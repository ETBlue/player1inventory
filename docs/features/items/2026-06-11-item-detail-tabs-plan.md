# Plan — Item-detail tab restructure (Locations PR #1)

**Design:** `2026-06-11-item-detail-tabs-design.md`
**Approach:** TDD per phase. Run the full verification gate after each phase (`pnpm lint` · `pnpm build` + `grep TS6385` · `pnpm build-storybook` · `pnpm check`). E2E (`--grep "items|a11y"`) on the final phase only. Each phase is one logical commit (feature + its stories + tests together).

---

## Phase 1 — New global fields + field re-placement in `ItemForm`

**Goal:** `Item` gains `wikidataUrl`/`note`; `packageUnit` moves from the info block to the stock block; info block renders the two new inputs. No routing changes yet.

1. **Types** — `packages/types/src/index.ts`: add `wikidataUrl?: string`, `note?: string` to `Item`.
2. **Operations** — `apps/web/src/db/operations.ts`: `createItem`/`updateItem` pass `wikidataUrl`/`note` through (default `undefined`). Add an operations test asserting round-trip persistence of both fields.
3. **i18n** — `apps/web/src/i18n/locales/*.json`: add Info-field label/placeholder keys (e.g. `items.info.wikidataUrl.label/placeholder`, `items.info.note.label/placeholder`) for every locale.
4. **ItemForm** — `apps/web/src/components/item/ItemForm/ItemForm.tsx`:
   - Move the `packageUnit` field from the info block into the stock block (it should render only when `sections.includes('stock')`).
   - Add `wikidataUrl` (single-line input, optional, light `http(s)` validation that allows empty) and `note` (textarea, optional) to the info block.
   - Extend form state, dirty computation, and submit payload to include both fields.
5. **Stories/tests** — update `ItemForm.stories.tsx` (info story shows new fields; stock story shows package unit) + matching smoke test; unit-test validation (empty allowed; malformed URL flagged) and that info dirty-state toggles on the new fields.

**Verify:** gate. New fields persist; `packageUnit` no longer in info-only render.

---

## Phase 2 — Stock tab route + Info tab becomes info-only

**Goal:** Stock fields live on their own route; the index route is the Info tab.

1. **New route** `apps/web/src/routes/items/$id/stock.tsx`: render `ItemForm sections={['stock']}`; move the stock save / recipe-adjust dialog / dirty-registration logic here from today's `$id/index.tsx`.
2. **Rework** `apps/web/src/routes/items/$id/index.tsx`: render `ItemForm sections={['info']}` + save button + dirty registration + the existing delete button.
3. **Toolbar** `apps/web/src/routes/items/$id.tsx`: add the **Stock** icon button (`Boxes`, aria `items.detail.tabs.stock`) linking to `…/stock`; keep Info on the index. Ensure the dirty-guard fires when leaving **either** Info or Stock.
4. **Stories/tests** — new `$id/stock.stories.tsx` (+ smoke test); update `$id/index.stories.tsx`/`.test` to info-only; update `$id.test.tsx` for the new button + dual-tab dirty guard.

**Verify:** gate. Editing/saving works on both Info and Stock; discard dialog fires from each.

---

## Phase 3 — Relation tab + submenu (merge tags/vendors/recipes)

**Goal:** One Relation toolbar button; tags/vendors/recipes become subtabs with a submenu, default vendors.

1. **Layout** `apps/web/src/routes/items/$id/relation.tsx`: under the main toolbar render a secondary nav of three `Link` icon buttons (Tags `Tags`, Vendors `Store`, Recipes `ChefHat`, reusing existing aria keys), each active on its subroute, + `<Outlet/>`.
2. **Default** `apps/web/src/routes/items/$id/relation/index.tsx`: redirect to `…/relation/vendors`.
3. **Relocate** today's `$id/tags.tsx`, `$id/vendors.tsx`, `$id/recipes.tsx` → `$id/relation/tags.tsx`, `relation/vendors.tsx`, `relation/recipes.tsx` (content unchanged). Remove the old files.
4. **Toolbar** `$id.tsx`: replace the three icons with one **Relation** icon (`Waypoints`, aria `items.detail.tabs.relations`) linking to `…/relation`; active on any `…/relation/*`. Toolbar now Info · Stock · Relation · Log.
5. **Stories/tests** — relocate tags/vendors/recipes stories + route tests under `relation/`; add a relation-layout story/smoke test showing the submenu + default-vendors redirect.

**Verify:** gate. Navigating Relation lands on vendors; submenu switches subtabs; old routes gone.

---

## Phase 4 — E2E, a11y, docs

**Goal:** End-to-end coverage and documentation reflect the new structure.

1. **E2E** — update `e2e/` page objects/specs touching item-detail tab routes to the new paths (`/items/$id/stock`, `/items/$id/relation/{tags,vendors,recipes}`); add a check that Info note/wikidata persist. Add new route-level a11y coverage if applicable.
2. **Docs** — update `apps/web/src/routes/items/CLAUDE.md` (new tab structure, Info vs Stock fields, relation submenu); flip this feature's row in `docs/INDEX.md` to ✅ when done.
3. **Run** `pnpm test:e2e --grep "items|a11y"` — hard stop on any failure.

**Verify:** full gate + E2E green.

---

## Notes / decisions to confirm during impl
- Final lucide icons for Stock (`Boxes` vs `Package`) and Relation (`Waypoints` vs `Network`).
- Whether the recipe-adjust-on-consume dialog belongs with stock (yes — it follows `consumeAmount`).
- Light URL validation copy for `wikidataUrl` (non-blocking).
