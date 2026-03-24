# Brainstorming — RWD Improvements

**Date:** 2026-03-24

---

## User Request

Improve RWD consistency across multiple pages:

1. Cooking page + items tabs in recipe/vendor/tag detail + settings recipes/vendors: adopt pantry-style empty state
2. Tags tab in item detail: replace empty state text with a "New Tag Type" action button
3. Tags/vendors/recipes/log tabs in item detail: center-align content area in wide viewport (same as info tab)
4. Info tab in recipe/vendor/tag detail + new pages: center-align content area in wide viewport (same as item page)
5. Items tabs in tag/vendor/recipe detail: center-align content area in wide viewport

---

## Clarifying Q&A

**Q1: Empty state — 2 lines (pantry style) or just center the existing single-line text?**
A: 2 lines for all empty states. Extract to a reusable `EmptyState` component if needed.

**Q2: Tags tab button — navigate to settings, or open a dialog in place?**
A: Open a tag type creation dialog in place (no navigation away).

**Q3: Log tab — full-bleed cards or also get max-width + centering?**
A: Give it a max-width wrapper to stay visually consistent with other level-2 tabs.

**Q4: Padding — keep `px-6 py-4` or harmonise to `p-4`?**
A: Use `p-4` for consistency.

---

## Decisions

1. **`EmptyState` component** — extract shared component with `title` + `description` props, matching pantry pattern (`text-center py-12 text-foreground-muted`).

2. **Tags tab button** — show `EmptyState` + a "New Tag Type" `Button` that opens `AddNameDialog` to create a tag type inline.

3. **Centering pattern** — `max-w-2xl mx-auto` on the content container, `p-4` on the outer wrapper. Applied uniformly to all tabs and detail info pages.

4. **i18n** — all new strings go into `en.json` + `tw.json`. Existing single-line keys (`settings.recipes.empty`, `settings.vendors.empty`) are migrated to nested `title`/`description` keys.
