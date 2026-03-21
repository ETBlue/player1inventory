# Brainstorming: RWD — Mobile + Desktop Layout

**Date:** 2026-03-21
**Topic:** Responsive web design improvements to fit the UI into mobile and desktop

---

## Questions & Answers

**Q1: What is the primary target?**
A: Both (a) make desktop usable (currently looks stretched/awkward) AND (b) progressive enhancement — mobile stays as-is, desktop gets a richer layout.

**Q2: What does "desktop layout" look like?**
A: (b) Sidebar navigation replaces bottom nav on desktop, AND icon-only buttons expand to icon+text buttons.

**Q3: What breakpoint triggers "desktop"?**
A: `lg` (1024px+).

**Q4: Which pages?**
A: All pages — this is a full page layout change.

**Q5: Reference apps or designs?**
A: From scratch.

**Q6: Sidebar style on desktop?**
A: Fixed left sidebar, always visible, `w-56`, icon + label. No collapse toggle.

**Q7: Content area on desktop?**
A: Full remaining width (no max-width cap).

**Q8: Icon → icon+text scope?**
A: All icon-only buttons — toolbar actions (sort direction, tags toggle, filter, search), detail page nav buttons, add/create buttons.

**Q9: Header / page title on desktop?**
A: App name/logo in sidebar header. Top toolbars exactly the same as mobile — no separate top header bar.

**Q10: Should sidebar show on fullscreen detail pages (item detail, vendor/tag/recipe settings pages)?**
A: No — sidebar hidden on detail pages on desktop too, matching current fullscreen behavior.

---

## Final Decision

**RWD at `lg:` breakpoint:**
- New fixed `Sidebar` component (same visibility rules as bottom `Navigation`)
- Bottom `Navigation` hidden via `lg:hidden`
- `Layout` updated to add `lg:ml-56` offset and remove bottom padding on desktop
- All icon-only buttons get label text shown on `lg:`

**Sidebar header:** "Player 1 Inventory" as app name text (no logo image)
