# Storybook Docs Page Dark Theme Design

**Date:** 2026-02-08
**Status:** Approved

## Problem Statement

When developing theme-aware components and browsing stories in the Docs page, it's not immediately obvious which theme (light/dark) is currently active. The Docs page always has a light background regardless of theme selection, making it difficult to quickly verify if components are styled correctly. Developers must hunt for the small theme toggle button to confirm which theme they're viewing, which slows down the development workflow.

## Solution Overview

Apply dark theme styling to the Docs page background and content when dark theme is selected. This creates an immediate visual indicator - if the entire page is dark, you're viewing components in dark mode; if it's light, you're in light mode. No need to hunt for the toggle button.

## Technical Approach

Configure Storybook's Docs theme using the `docs.theme` parameter in `.storybook/preview.tsx`. Create a custom decorator that listens to theme changes and dynamically updates the Docs theme to match the theme selection from the `withThemeByClassName` decorator.

### Storybook APIs Used

- `themes` from `@storybook/theming` - provides built-in `themes.light` and `themes.dark`
- `parameters.docs.theme` - controls Docs page theming
- `context.globals.theme` - tracks current theme selection
- Existing `withThemeByClassName` decorator - handles story canvas theming

### Implementation

**File:** `.storybook/preview.tsx`

```typescript
import type { Preview, Decorator } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import { themes } from '@storybook/theming'
import '../src/index.css'

// Custom decorator to sync Docs theme with theme toggle
const withDocsTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme || 'light'

  // Update Docs theme based on current theme
  if (context.parameters.docs) {
    context.parameters.docs.theme = theme === 'dark' ? themes.dark : themes.light
  }

  return Story()
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      theme: themes.light, // default Docs theme
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
    withDocsTheme, // Add after withThemeByClassName
  ],
}

export default preview
```

### How It Works

1. The `withDocsTheme` decorator runs for every story render
2. It reads the current theme from `context.globals.theme`
3. It updates `context.parameters.docs.theme` to match
4. The Docs page automatically re-renders with the new theme

When you toggle the theme in Storybook's toolbar:
- `withThemeByClassName` applies/removes the `dark` class on story canvases
- `withDocsTheme` updates the Docs page theme to match
- Both systems stay in sync

## Expected Behavior

**Light theme selected:**
- Docs page has white/light gray background
- Dark text for readability
- Light-themed code blocks and tables

**Dark theme selected:**
- Docs page has dark background
- Light text for readability
- Dark-themed code blocks and tables

**Visual indicator:**
- The page background itself becomes the visual indicator
- No need to check the toggle button
- Immediate confirmation of which theme is active

**Story canvases:**
- Continue to work as before with the `dark` class applied

## Testing Plan

1. Start Storybook: `pnpm storybook`
2. Navigate to any component's Docs page
3. Toggle between light/dark themes using the toolbar button
4. Verify the entire Docs page (background, text, code blocks, tables) changes theme
5. Check multiple components to ensure consistency

### Edge Cases

- **Initial page load:** Should respect the default theme (light)
- **Theme persistence:** If Storybook remembers theme preference in localStorage, both systems should sync
- **MDX custom content:** Custom styled MDX content might need additional dark mode styles using the project's design tokens

## Developer Experience Impact

When building theme-aware components, developers can now rapidly browse through Docs pages and immediately know which theme they're viewing based on the page background color. This eliminates the need to hunt for the theme toggle button and speeds up the development workflow for theme-aware components.

## Implementation Scope

**Files to modify:**
- `.storybook/preview.tsx` - Add imports, create decorator, update configuration

**No additional dependencies required** - uses existing `@storybook/theming` package

**Estimated complexity:** Simple - single file change with ~10 lines of new code
