# Brainstorming — Item-detail tab restructure (Locations PR #1)

**Date:** 2026-06-11
**Participants:** ETBlue, Claude
**Context:** First PR of the **Location** feature (see `docs/features/locations/`). A standalone, no-regression UI refactor that prepares the item-detail page for per-location stock, merged to `main` before feature implementation begins.
**Outcome:** Design doc `2026-06-11-item-detail-tabs-design.md`.

## Why this PR first

The Location feature needs a dedicated **Stock tab** on item detail (future host for the all-locations pager) and a less crowded toolbar (room for the Stock icon now, per-location UI later). Doing the tab restructure as its own PR keeps that diff reviewable and behaviour-preserving, separate from the data-model change.

## Decisions

1. **Split the combined Stock+Info tab.** Today `/items/$id` (index) renders `ItemForm sections={['stock','info']}`. Split into:
   - **Info tab** (keeps index route + Settings icon): item **name** + two **new global fields** (below).
   - **Stock tab** (new route + new icon): all stock/units/expiration fields, **including `packageUnit` and `amountPerPackage`** (units are stock-side — aligns with the feature's `ItemStock`).
2. **Two new global `Item` fields** (live on the Info tab):
   - `wikidataUrl` — link to the item's Wikidata entity; future source for item-name i18n. Stored as the **full URL** (Q-ID derivable later). Optional.
   - `note` — free-text description / notes (e.g. iHerb / PChome links). Multiline. Optional.
   - Both optional strings → no Dexie index → **no schema migration**.
3. **Merge tags + vendors + recipes** (3 toolbar icons) into **one "Relation" toolbar icon** (aria-label ≈ "item relations"). Toolbar goes 5 → 4 buttons: Info · Stock · Relation · Log.
4. **Relation tab** opens a **submenu under the top toolbar** holding the three icon buttons (tags / vendors / recipes) that previously lived in the toolbar. **Default subtab = vendors.**
5. **Single stock only.** No location/pager concept in this PR — the Stock tab just hosts the relocated existing fields.

## Branch / sequencing

- Own branch off `main`: `worktree-refactor-item-detail-tabs` (worktree `.worktrees/refactor-item-detail-tabs`).
- Merge this PR → rebase the `feature-locations` branch onto it → implement the Location feature.

## Deferred (next PRs, the feature itself)

Per-location `ItemStock` split, active-location switcher, scoped pantry/shopping/cooking, the Stock-tab all-locations pager, Settings › Locations. See `docs/features/locations/2026-06-11-locations-design.md`.
