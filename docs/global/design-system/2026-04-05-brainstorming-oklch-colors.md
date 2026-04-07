# Brainstorming: HSL → OKLCH Color Conversion

**Date:** 2026-04-05
**Topic:** Converting design tokens from HSL to OKLCH for a11y-friendly reasoning

---

## Questions & Answers

**Q: What worktree should this work happen in?**
A: `docs-readme-rewrite` — there are already color-related commits in that worktree for screenshot taking (part of README docs).

**Q: Straight conversion (same appearance) or palette redesign?**
A: Both — Phase A first (straight conversion), then Phase B (palette redesign). User wanted to preview the difference before deciding.

**Q: What specific a11y benefit are you targeting?**
A: Easier to reason about contrast ratios. OKLCH's `L` channel is perceptually uniform, so you can see at a glance whether two values will have sufficient contrast.

**Q: Keep separate `:root` / `.dark` declarations or use relative color syntax?**
A: Keep separate declarations (same structure as today, just new format).

**Q: Does the TypeScript `index.ts` side need changes?**
A: No — it exports color names as constants, not raw values.

**Q: Percentage vs decimals for OKLCH values?**
A: Use percentage for both L and C, degrees for H. C% is relative to 0.4 (CSS Color Level 4 max chroma). Example: `oklch(86% 3% 84.6)`.

---

## Final Decision

Two-phase approach:

### Phase A — Straight Conversion
- Mechanically translate every `hsl(...)` value in `theme.css` to its OKLCH equivalent
- No visual change — same colors, new format
- Benefit: L channel is now perceptually meaningful, enabling contrast reasoning by inspection
- Implementation: conversion script using `culori` (accurate color space math)

### Phase B — Palette Redesign
- After Phase A is complete and merged
- Audit each semantic token pair for WCAG AA compliance (4.5:1 for normal text, 3:1 for large)
- Adjust L values to meet contrast budget, with C/H chosen around that constraint
- Normalize the 14 hue colors to a consistent perceived brightness (same L)
- Some colors will change slightly (e.g. yellow, which currently has known contrast issues)

### Rationale
Phase A gives the team the perceptual L channel immediately — future a11y work becomes obvious by inspection. Phase B builds on that foundation to guarantee compliance rather than audit it after the fact.
