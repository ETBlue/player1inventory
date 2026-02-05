# Brainstorming Log: Theme System

**Date:** 2026-02-05
**Topic:** Dark/Light Theme Implementation

## Questions & Answers

### Q1: What's your main goal for theme support?
**Answer:** Both automatic detection AND manual override
- Start with system preference detection
- Allow users to manually switch themes
- Save user's choice

### Q2: How should users control the theme?
**Answer:** Three-state toggle (Light / System / Dark)
- Users can explicitly choose light, dark, or follow system preference
- Makes it clear when following system vs. overriding

### Q3: Where should the theme toggle be placed?
**Answer:** In a settings page/modal
- Keeps main UI clean
- Theme is a one-time preference setting rather than frequently toggled

### Q4: How should the theme preference be stored?
**Answer:** localStorage
- Fast, synchronous access on page load
- Prevents flash of wrong theme
- Standard approach for theme preferences

### Q5: What about design tokens in dark mode?
**Answer:** Keep design tokens as-is
- Existing tag colors and state colors work fine in both themes
- Only base theme colors (background, foreground, border) need to change
- Simpler implementation

### Q6: Do you have a settings page already?
**Answer:** Settings page already exists at `/settings/`
- Found existing page with card-based UI pattern
- Currently has link to `/settings/tags`

### Q7: How should the theme control be structured?
**Answer:** Inline on settings page
- Add a card with segmented control directly on `/settings/`
- No extra navigation needed
- Quick and accessible

### Q8: How should the theme be initialized on page load?
**Answer:** Inline script in index.html
- Standard approach to prevent theme flashing
- Runs before React loads
- Detects system preference and reads localStorage immediately

### Q9: UI Control Style?
**Answer:** Segmented control style with buttons (toggle-group not available)
- Three connected buttons
- Active button uses different variant than inactive
- Visual and accessible

## Final Decision

**Implement a three-state theme system (Light/System/Dark) with:**
- Automatic system preference detection as default
- Manual override capability with localStorage persistence
- Inline initialization script in index.html to prevent flashing
- Theme control integrated into existing `/settings/` page
- Segmented button control for theme selection
- Existing design tokens remain unchanged

## Rationale

**Three-state over two-state:** Makes system preference explicit and gives users full control while still supporting automatic detection.

**localStorage over IndexedDB:** Synchronous access is critical for preventing theme flash on page load.

**Settings page over navigation:** Theme is typically set once and rarely changed, so it doesn't need to occupy valuable navigation space.

**Inline script over React-only:** Only reliable way to prevent flash of incorrect theme on initial page load.

**Keep design tokens fixed:** Simplifies implementation and the existing tag colors work well against both light and dark backgrounds.

**Segmented buttons over radio group:** More visually integrated with the modern UI design while still being accessible.

## Trade-offs Discussed

**Storage location:**
- localStorage (chosen): Fast but limited to ~5MB, synchronous access
- IndexedDB: More storage but async, could cause theme flash
- Both: Over-engineered for simple preference storage

**UI placement:**
- Settings page (chosen): Clean main UI, appropriate for infrequent changes
- Navigation bar: Quick access but clutters navigation
- Both: Redundant for simple preference

**Design token handling:**
- Fixed tokens (chosen): Simple, works well in both themes
- Dark variants: More work, not necessary for this color palette
- Theme-aware CSS vars: Over-engineered for current needs

## Next Steps

1. Create feature branch for implementation
2. Write detailed implementation plan
3. Implement theme system following the design document
4. Test thoroughly including manual verification
5. Update documentation if needed
6. Create PR for review
