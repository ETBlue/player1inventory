# Brainstorming — Upcoming Requirements (2026-04-04)

## Context

Five upcoming requirements were discussed to capture design intent before implementation begins.

---

## 1. Onboarding Template Editor

**Q:** What does "editing" mean — (a) users customize during onboarding, (b) a separate settings/developer page to edit template data for future reuse, (c) something else?

**A:** b, but not for user — for developer. A settings page in another app in the monorepo. Developer can have a GUI to edit template items and export a JSON file for the main frontend to consume.

**Decision:** New developer tool app in the monorepo with a GUI for editing onboarding template data and exporting JSON.

---

## 2. Seamless Offline ↔ Online Migration

**Q:** Is this about (a) auto-sync after login, (b) two-way offline↔cloud, (c) conflict resolution UI, (d) all of the above?

**A:** b + c

**Decision:** Two-way sync (IndexedDB ↔ MongoDB) with a conflict-resolution UI when local and cloud data diverge.

---

## 3. Sort Recipes by Item Expiration

**Q:** What should the sort key be? Should urgency sort to the top? Is this a default sort or a new option alongside existing ones?

**A:** Earliest expiring ingredient. Urgency sorts to top (soonest-expiring recipe first). New sort option alongside existing ones.

**Decision:** New "Expiration" sort option on cooking page; sort key = earliest `dueDate` among a recipe's items; soonest to top.

---

## 4. One Cart Per Vendor

**Q:** Is this visual grouping, separate tabs, or per-vendor checkout?

**A:** Per-vendor checkout. Landing of shopping page shows vendors with cart item count in a grid. User clicks a vendor and sees existing shopping page with vendor locked. Top bar shows vendor name + back button. Items can appear in multiple vendor carts.

**Decision:** Shopping page gains a vendor selection landing screen (grid of vendors with item counts). Clicking a vendor enters a locked single-vendor shopping view.

---

## 5. Empty State Consolidation

**Q:** What's inconsistent — copy, visuals, CTA buttons? Is this a shared component or pure polish?

**A:** Some empty states have no content at all (e.g. Settings > Tags). UI polish but may need a shared component.

**Decision:** Audit all empty states, create a shared `EmptyState` component, apply consistently across pages (starting with Settings > Tags).
