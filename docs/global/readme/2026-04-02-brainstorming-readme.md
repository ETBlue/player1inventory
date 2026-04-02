# Brainstorming Log — README Rewrite

**Date:** 2026-04-02
**Topic:** Rewrite project README as a portfolio piece for job application

---

## Context

### Goal
Rewrite the README for Player 1 Inventory to serve as portfolio material for a Sr. UX Designer role at Netskope (Taipei, Taiwan). The README is the only portfolio material — no live demo deployed.

### Target audience
UX hiring manager at a B2B enterprise software company. Key signals from the Netskope JD:
- Design process (wireframes → hi-fi mockups)
- Systems thinking ("big-picture thinking, able to make connections across systems")
- Solving complex problems with complex technology
- Design system work

### Designer positioning (from LinkedIn update)
ET Blue positions as a gap-filler: between business requirements, UX design, and engineering. Background includes enterprise data products (Gemini Data, Auriga Security). Player 1 Inventory is described as "built solo from scratch in one month (February 2026) as a demonstration of modern React tooling and AI-assisted development workflows."

---

## Decisions Made

### Q: Personal design case study (first-person) vs. product page?
**Decision:** Product page — let the design speak for itself, imply the author.
**Rationale:** Shows ability to ship comprehensive design without requiring prose explanation.

### Q: README structure?
Three options considered:
- A — Journey Flow: screenshots follow user journey in sequence
- B — Feature Grid: 2×2 feature summary, then screenshots by section
- **C — Hero + Highlights ✓ (selected)**

**Rationale:** Naming design decisions explicitly (as highlights bullets) shows design intent, not just output — which is what a UX hiring manager is looking for.

Structure:
1. Title + tagline
2. Hero screenshot
3. Design Highlights (named design decisions as bullets)
4. All screenshots (organized by section)
5. Tech stack
6. Getting started

### Q: Tagline?
Three options considered:
- A — "A grocery and pantry management app — designed and built solo."
- **B — "Track what you have. Shop what you need. Cook what you can." ✓ (selected)**
- C — "Pantry management for people who think in systems."

**Rationale:** Demonstrates UX writing ability, previews the 3-section app structure in one sentence.

### Q: Origin story placement?
**Decision:** Add one origin line directly under the tagline.

```markdown
# Player 1 Inventory

Track what you have. Shop what you need. Cook what you can.

The real-life companion to [Guild Wars 2 Inventory](https://github.com/ETBlue/gw2inventory) —
for player, by player.
```

**Rationale:** "For player, by player" adds personality and signals genuine user empathy (built for self). Linking to gw2inventory shows a pattern of building tools, not a one-off.

### Q: Hero screenshot?
Three options considered:
- A — Welcome / Onboarding (clean, low information density)
- **B — Pantry List ✓ (selected)**
- C — Shopping Mode

**Rationale:** Most information-rich screen. Color-coded stock status, dual-unit quantities, expiry, tags, sort/filter toolbar — all visible at once. Shows the most UX craft in a single frame.

---

## In Progress

### Design Highlights (proposed, awaiting confirmation)

1. **Color-coded stock status** — red/yellow/green at the item level, driven by refill thresholds. Surfaces urgency without alerts or separate dashboards.
2. **Multi-dimensional filtering** — filter simultaneously by tag, vendor, recipe linkage, and stock level. Designed for power users managing large inventories.
3. **Vendor-aware shopping mode** — organize the cart by store, so a shopping trip to iHerb and a trip to the supermarket become two separate focused lists.
4. **Recipe-linked cooking** — selecting a recipe shows which items it needs and deducts quantities when you mark it done, keeping pantry state accurate without manual updates.
5. **Guided onboarding** — first-run flow offers a curated template (20 sample items + 19 vendors) or start from scratch, so the app is immediately useful without requiring full data setup.

Items intentionally excluded: dark mode, i18n, accessibility, offline/cloud — real work but polish/infra, not core UX decisions.

---

## Still To Decide

- Confirm / revise Design Highlights list
- Screenshot layout (grouping, ordering, captions)
- Tech stack section format
- Getting started section (include or omit?)
