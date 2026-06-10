# Brainstorming: UnitBadge + UnitInline Component Extraction

**Date:** 2026-06-10
**Branch:** refactor/unit-badge
**Plan:** [2026-06-10-plan-unit-badge.md](2026-06-10-plan-unit-badge.md)

---

## Context

Unit labels appear in two display contexts across the app:

1. **Bordered pill** (cards + dialogs) — a `<span>` with border and muted text, used in ItemCard, GroupCard, QuickUpdateDialog
2. **Inline label text** (form labels) — a `<span>` with reduced font size in parentheses, used in ItemForm

These were implemented as raw `<span>` elements with inconsistent classes. The goal was to extract them into shared components for visual consistency.

---

## Questions & Decisions

### Q1: Should `UnitBadge` cover just cards or also ItemForm inline spans?

**Answer:** Two separate components — `UnitBadge` for bordered pill contexts, `UnitInline` for inline form label contexts. They serve different semantic roles.

### Q2: Opacity-75 is inconsistent across the three card/dialog spans — should UnitBadge normalize style?

**Answer:** Yes, normalize. Specifically: check whether `opacity-75` passes WCAG AA contrast audit. If it passes, standardize it on `UnitBadge` and document in the design guide. If it fails, remove it from all locations.

### Q3: Should `UnitBadge` resolve the unit label internally (accept raw item fields) or accept an already-resolved string?

**Answer:** Accept a resolved `unit?: string`. If undefined, render `"pack"` as the default. Callers are responsible for resolution logic (keeps the component simple and reusable).

### Q4: The measurement-unit label in ItemForm shows `"?"` when `measurementUnit` is unset — how should `UnitInline` handle this?

**Answer:** `UnitInline` accepts an optional `placeholder?: string` that defaults to `"pack"`. The measurement-unit label case passes `placeholder="?"` explicitly. This keeps the `"?"` semantic at the call site, which already knows the context, rather than building it into the component.

---

## Final Design

### `UnitBadge`

- **Location:** `src/components/shared/UnitBadge/`
- **Props:** `unit?: string` (defaults to `"pack"`)
- **Style:** `px-1 text-xs text-foreground-muted border border-foreground-muted` (+ `opacity-75` only if a11y passes)
- **Relationship to `CardMetadata`:** UnitBadge = CardMetadata base style + border treatment
- **Usage:** ItemCard, GroupCard, QuickUpdateDialog

### `UnitInline`

- **Location:** `src/components/shared/UnitInline/`
- **Props:** `unit?: string`, `placeholder?: string` (default `"pack"`)
- **Renders:** `(unit ?? placeholder)` — parentheses included
- **Style:** `text-xs font-normal` inline `<span>`
- **Usage:** ItemForm label spans (all quantity-related fields)

---

## Context: CardMetadata (new in PR #229)

PR #229 added `CardMetadata` — a `div` with `text-xs text-foreground-muted` for supplementary card data. `UnitBadge` is a more specialized variant (adds a border). The two components are siblings in the design system.
