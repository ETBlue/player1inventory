# Theme System Design

**Date:** 2026-02-05
**Status:** Approved

## Overview

Add dark/light theme support to Player 1 Inventory with automatic system preference detection and manual override capability.

## Requirements

### User Stories
- As a user, I want the app to automatically match my system's dark/light mode preference
- As a user, I want to manually override the theme if I prefer something different than my system setting
- As a user, I want my theme preference to persist across sessions
- As a user, I want to change my theme preference in the settings page

### Success Criteria
- No flash of incorrect theme on page load
- Theme preference persists across browser sessions
- System preference changes are detected when user chooses "system" mode
- Manual theme selection overrides system preference
- Theme control is accessible and easy to understand

## Design Decisions

### Theme States
Three possible user preferences:
- `'light'` - Force light theme
- `'dark'` - Force dark theme
- `'system'` - Follow OS preference (default)

Two actual themes applied:
- `'light'` - No class on `<html>`
- `'dark'` - Class `'dark'` on `<html>`

### Storage Strategy
**localStorage** - Chosen over IndexedDB for immediate synchronous access on page load, preventing theme flash.

Key: `'theme-preference'`
Values: `'light' | 'dark' | 'system'`

### Design Tokens
**Keep existing tokens unchanged** - Tag colors and state colors remain fixed. Only base theme colors (background, foreground, border, etc.) change via existing `:root` and `.dark` CSS variables in `src/index.css`.

### UI Placement
**Inline control in settings page** - Theme selection appears as a card on `/settings/` with segmented button control, following the existing settings UI pattern.

## Architecture

### Data Flow

1. **Page Load**
   - Inline script in `index.html` executes immediately
   - Script reads localStorage preference
   - Script detects system preference via `matchMedia`
   - Script applies theme class to `<html>`
   - Script stores initialization state in `window.__THEME_INIT__`

2. **React Initialization**
   - `useTheme` hook reads initialization state
   - Hook sets up state and event listeners
   - Settings component displays current selection

3. **Theme Change**
   - User clicks theme button in settings
   - `setPreference` function called
   - localStorage updated
   - State updated
   - Theme class applied to DOM
   - If switching to 'system', activate system preference listener

4. **System Preference Change** (when preference is 'system')
   - `matchMedia` listener fires
   - Theme automatically updates to match new system preference
   - DOM class updated accordingly

### File Structure

```
src/
  hooks/
    useTheme.ts              # Theme state & control hook
  lib/
    theme.ts                 # Types and utilities
  routes/
    settings/
      index.tsx              # Add theme control card
public/
  index.html                 # Add inline initialization script
```

## Component Details

### Inline Initialization Script

**Location:** `index.html` `<head>` (before other scripts)

**Purpose:** Apply theme immediately on page load to prevent flash

**Implementation:**
```html
<script>
  (function() {
    const preference = localStorage.getItem('theme-preference') || 'system';
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const shouldBeDark = preference === 'dark' ||
                        (preference === 'system' && systemPrefersDark);

    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    }

    window.__THEME_INIT__ = {
      preference,
      applied: shouldBeDark ? 'dark' : 'light'
    };
  })();
</script>
```

**Key characteristics:**
- IIFE to avoid global pollution
- Pure vanilla JS, no dependencies
- Synchronous execution
- Runs before CSS and React load

### useTheme Hook

**Location:** `src/hooks/useTheme.ts`

**API:**
```typescript
const {
  preference,      // 'light' | 'dark' | 'system'
  theme,           // 'light' | 'dark' (actual applied)
  setPreference    // (pref: ThemePreference) => void
} = useTheme()
```

**Responsibilities:**
- Track user's theme preference
- Track actual applied theme
- Listen for system preference changes (when preference is 'system')
- Update localStorage on preference change
- Apply theme class to `document.documentElement`

**Key behaviors:**
- Initialize from `window.__THEME_INIT__` or localStorage
- System preference listener only active when preference is 'system'
- Changing preference immediately updates localStorage and DOM
- No context provider needed (theme is global state)

### Theme Types

**Location:** `src/lib/theme.ts`

```typescript
export type ThemePreference = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme-preference'
export const DEFAULT_PREFERENCE: ThemePreference = 'system'
```

### Settings UI

**Location:** `src/routes/settings/index.tsx`

**Structure:**
Add theme card above existing Tags card:

```tsx
<Card>
  <CardContent className="p-4">
    {/* Header with icon and description */}
    <div className="flex items-center gap-3 mb-3">
      <Sun/Moon icon className="h-5 w-5 text-muted-foreground" />
      <div>
        <p className="font-medium">Theme</p>
        <p className="text-sm text-muted-foreground">
          Choose light, dark, or system theme
        </p>
      </div>
    </div>

    {/* Segmented control with three buttons */}
    <div className="flex gap-2">
      <Button
        variant={preference === 'light' ? 'default' : 'outline'}
        onClick={() => setPreference('light')}
      >
        Light
      </Button>
      <Button
        variant={preference === 'system' ? 'default' : 'outline'}
        onClick={() => setPreference('system')}
      >
        System
      </Button>
      <Button
        variant={preference === 'dark' ? 'default' : 'outline'}
        onClick={() => setPreference('dark')}
      >
        Dark
      </Button>
    </div>
  </CardContent>
</Card>
```

**UI Pattern:**
- Segmented button control (no toggle-group component available)
- Active button uses `'default'` variant
- Inactive buttons use `'outline'` variant
- Full-width layout with equal button sizing
- Icons: Sun for light theme, Moon for dark theme

## Testing Strategy

### Unit Tests

**useTheme Hook Tests** (`src/hooks/useTheme.test.ts`):
- Reads initial preference from localStorage
- Falls back to 'system' when no preference exists
- Applies correct theme class to `document.documentElement`
- Updates localStorage when preference changes
- Responds to system preference changes when set to 'system'
- Ignores system preference changes when set to 'light' or 'dark'
- Cleans up event listeners on unmount

**Settings Component Tests**:
- Renders current theme preference correctly
- Displays all three theme options
- Clicking each button updates the preference
- Visual state reflects active selection
- Integrates correctly with useTheme hook

### Integration Tests

**Theme Persistence**:
- Theme preference persists across page reloads
- localStorage correctly updated on preference change
- Preference correctly read on app initialization

**System Preference Detection**:
- System preference detected on initial load
- System preference changes tracked when set to 'system'
- System preference ignored when manual theme selected

### Manual Testing

**Initialization Script**:
- Test in different browsers (Chrome, Safari, Firefox)
- Test with different localStorage states (empty, light, dark, system)
- Verify no flash of incorrect theme on page load
- Test with system in light mode
- Test with system in dark mode

**Manual Verification Checklist**:
- [ ] No theme flash on initial page load
- [ ] Theme persists across page refreshes
- [ ] System preference changes detected when set to 'system'
- [ ] Manual selection overrides system preference
- [ ] Works in both Chromium and Safari
- [ ] localStorage updates correctly
- [ ] Theme applies to all pages in the app
- [ ] Design tokens (tag colors, states) remain visible in both themes

## Implementation Notes

### Existing CSS Support

The app already has dark mode CSS variables defined in `src/index.css`:
- `:root` defines light theme variables
- `.dark` defines dark theme variables
- Body already applies these variables

No CSS changes needed - just add/remove the `'dark'` class.

### Icon Selection

Use lucide-react icons:
- `Sun` for light theme
- `Moon` for dark theme
- Consider using conditional rendering to show Sun in dark mode, Moon in light mode as visual feedback

### Accessibility

- Button controls are keyboard accessible by default
- Use proper ARIA labels if needed
- Visual contrast meets WCAG standards in both themes
- Consider adding tooltips for clarity

### Edge Cases

- Handle missing localStorage gracefully (default to 'system')
- Handle browsers without `matchMedia` support (default to light theme)
- Ensure theme applies before any content renders (via inline script)

## Future Enhancements (Out of Scope)

- High contrast themes
- Custom theme colors
- Per-feature theme overrides
- Theme animation/transitions
- Schedule-based automatic theme switching
