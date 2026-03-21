# Brainstorming Log — A11y Audit (2026-03-21)

## Questions & Answers

**Q: What's the goal — discovery only, fix-as-we-go, or plan-then-fix?**
A: Create a plan for documentation first, then fix issues. Split into multiple plans if there are too many issues.

**Q: Scope — whole app or specific pages/concerns?**
A: The whole app.

**Q: WCAG target level?**
A: WCAG 2.1 AA as baseline, AAA as nice to have.

**Q: What to do with findings?**
A: Write plans first, then implement separately.

**Q: Any known pain points?**
A: None — starting from scratch.

**Q: Will color contrast audit cover both light and dark themes?**
A: Yes — both themes must pass WCAG AA contrast ratios independently.

---

## Audit Summary (from codebase exploration)

### Positive Findings
- `<main>` and `<nav>` semantic elements used correctly
- Most interactive icon-only buttons have `aria-label`
- All form inputs have associated `<label>` elements
- Dialogs use shadcn/ui `<Dialog>` with `DialogTitle` + `DialogDescription`
- `autoFocus` used correctly in dialogs and search inputs
- i18n ARIA labels (e.g. `CookingControlBar`)
- Design token system (avoids hardcoded colors)

### Issues Found

| # | Issue | Severity | WCAG |
|---|-------|----------|------|
| 1 | 4 nav links (icon-only) missing `aria-label` in `Navigation/index.tsx` (note: `<nav>` label added in PR #135; Sidebar is now accessible with icon+text; individual link labels still missing) | 🔴 Critical | 1.1.1 A |
| 2 | Clickable tag/vendor/recipe badges in `ItemCard` missing `role="button"` + `aria-pressed` | 🔴 Critical | 2.1.1, 4.1.3 A |
| 3 | No skip-to-main-content link | 🟠 High | 2.4.1 A |
| 4 | No `aria-live` regions for dynamic content (quantity changes, filters, form status) | 🟠 High | 4.1.3 A |
| 5 | Fixed top bars use `<div>` instead of semantic `<header>` | 🟠 High | 1.3.1 A |
| 6 | Color contrast unverified (status badges, muted text, opacity-50 inactive items) | 🟡 Medium | 1.4.3 AA |
| 7 | Focus indicators not verified (shadcn/ui defaults may be insufficient) | 🟡 Medium | 2.4.7 AA |
| 8 | Drag-and-drop tag reorder keyboard-inaccessible (no keyboard sensor in dnd-kit) | 🟡 Medium | 2.1.1 A |
| 9 | No `prefers-reduced-motion` CSS handling | 🟡 Medium | 2.3.3 AAA / best practice |

---

## Decision: Split into 3 Plans

**Plan 1 — A11y: Critical & High Fixes**
- Issues #1, #2, #3, #4, #5
- Pure code changes, clearly broken, no visual testing needed

**Plan 2 — A11y: Keyboard & Motion**
- Issues #8, #9
- Interactive keyboard support + CSS motion preference

**Plan 3 — A11y: Visual Verification**
- Issues #6, #7
- Requires running the app and auditing with browser tools (axe, contrast checker)
- Both light and dark themes must be tested
