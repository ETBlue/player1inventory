# Storybook Language Switch — Brainstorming Log

**Date:** 2026-03-19
**Topic:** DX improvement: support language switch in Storybook

## Questions & Answers

**Q: What's the main pain point — on-the-fly language switching, reducing per-language story boilerplate, or both?**
A: Both.

**Q: Should per-language story variants be consolidated into one story (using toolbar), or coexist with the toolbar?**
A: Consolidated into 1 story.

**Q: What should the toolbar default to — always English, or Auto (respects localStorage/browser)?**
A: Auto.

## Approaches Considered

1. **Globals + decorator (i18n only)** — calls `i18n.changeLanguage()` only. Doesn't update `useLanguage` hook state (reads localStorage separately). Simpler but inconsistent for settings-related stories.

2. **Globals + decorator (i18n + localStorage sync)** — calls `i18n.changeLanguage()` AND writes to localStorage, keeping `useLanguage` in sync. Fully consistent, no new packages. **Selected.**

3. **`storybook-react-i18next` addon** — turnkey but adds a dependency and has less control over Auto behavior.

## Decision

Option B: Globals + decorator syncing both i18n and localStorage. Minimal code change, no new dependencies, covers all component patterns.
