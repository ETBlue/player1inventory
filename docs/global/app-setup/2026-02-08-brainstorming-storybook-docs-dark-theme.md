# Brainstorming: Storybook Docs Page Dark Theme

**Date:** 2026-02-08
**Topic:** Adding dark theme support to Storybook Docs pages

## Problem Statement

When developing theme-aware components and browsing stories in the Docs page, it's not immediately obvious which theme (light/dark) is currently active. The Docs page always has a light background regardless of theme selection, making it difficult to quickly verify if components are styled correctly. Developers must hunt for the small theme toggle button to confirm which theme they're viewing, which slows down the development workflow.

## Questions and Answers

### Q1: Which approach for making the Docs page dark-themed?

**Options:**
- a) Match story canvas behavior — Apply dark background to the entire Docs page content area, similar to how story canvases appear (Recommended)
- b) Custom Docs-specific styling — Keep the Docs page UI chrome (sidebar, toolbar) light, but only darken the main content area
- c) Full dark mode — Apply dark theme to the entire Storybook interface including sidebar and toolbar, not just the Docs page

**Answer:** Option A - Match story canvas behavior

**Rationale:** Consistency with story canvas theming provides the clearest visual indicator and simplest implementation.

### Q2: Should dark theme styling apply to all documentation elements?

**Options:**
- a) Yes, full dark theme — All documentation content (text, code blocks, tables, etc.) should use dark theme colors for readability (Recommended)
- b) Partial dark theme — Only apply dark background, but let the default Storybook Docs styling handle text and code blocks

**Answer:** Option A - Full dark theme

**Rationale:** Complete theming ensures readability and provides the strongest visual indicator of which theme is active.

## Solution Approach

### Initial Design (Modified During Implementation)

**Original approach:**
- Import `themes` from `@storybook/theming`
- Create `withDocsTheme` decorator to update `context.parameters.docs.theme`
- Apply Storybook's built-in dark theme to Docs pages

**Issue encountered:**
- Storybook 10 uses `storybook/theming` instead of `@storybook/theming`
- Modifying `context.parameters.docs.theme` doesn't dynamically update the Docs page

### Final Implementation

**Approach:**
1. Apply `dark` class to `document.body` via custom decorator
2. Create custom CSS file (`docs-theme.css`) targeting Storybook Docs elements
3. Use project's design tokens for consistency with app theme system

**Key decisions:**
- **Decorator applies class to body**: Ensures all Docs page elements can be styled
- **Custom CSS over Storybook's theme API**: More control and better integration with design tokens
- **Use design tokens**: `--background`, `--foreground`, `--background-elevated` for consistency
- **Add `--background-elevated` token**: New semantic token for elevated surfaces (tables, toolbars, code blocks)

## Technical Details

### New Design Token

Added `--background-elevated` to `src/design-tokens/theme.css`:
- Light theme: `0 0% 95%` (slightly darker than white)
- Dark theme: `0 0% 10%` (slightly lighter than black)

### Files Modified

1. `.storybook/preview.tsx` - Added `withDocsTheme` decorator
2. `.storybook/docs-theme.css` - New file with theme-specific styles
3. `src/design-tokens/theme.css` - Added `--background-elevated` token

### Styling Strategy

**CSS approach:**
- Scope all rules with `.dark #storybook-docs` for specificity
- Use `box-shadow` for borders/outlines (softer visual hierarchy)
- Target specific Storybook classes: `.sbdocs-preview`, `.docblock-argstable`
- Use opacity modifiers: `hsl(var(--foreground)/0.75)` for subtle elements

## Outcome

The implementation successfully provides:
- Immediate visual feedback of active theme
- Consistent theming across all Docs page elements
- Integration with existing design token system
- Improved developer experience when building theme-aware components

## Trade-offs

**Chosen approach (Custom CSS + decorator):**
- ✅ Full control over styling
- ✅ Integrates with design tokens
- ✅ Works reliably with Storybook 10
- ⚠️ Requires maintenance if Storybook updates class names

**Alternative (Storybook's theme API):**
- ✅ More "official" approach
- ❌ Doesn't update dynamically in Storybook 10
- ❌ Less integration with design tokens
- ❌ Limited control over specific elements
