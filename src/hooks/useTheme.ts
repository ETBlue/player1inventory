import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_PREFERENCE,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemePreference,
} from '@/lib/theme'

export function useTheme() {
  // Initialize from localStorage or window.__THEME_INIT__ or default
  // Note: localStorage is checked first because it's the source of truth after React hydrates
  // __THEME_INIT__ is only used for initial page load to prevent flash
  const getInitialPreference = (): ThemePreference => {
    const stored = localStorage.getItem(
      THEME_STORAGE_KEY,
    ) as ThemePreference | null
    if (stored) {
      return stored
    }
    if (window.__THEME_INIT__) {
      return window.__THEME_INIT__.preference
    }
    return DEFAULT_PREFERENCE
  }

  const getInitialTheme = (): Theme => {
    const preference = getInitialPreference()

    // If we have __THEME_INIT__ and preference matches, use its applied theme
    // This prevents recalculating system preference on mount
    if (
      window.__THEME_INIT__ &&
      window.__THEME_INIT__.preference === preference
    ) {
      return window.__THEME_INIT__.applied
    }

    // Otherwise calculate theme from preference
    if (preference === 'light' || preference === 'dark') {
      return preference
    }
    // preference is 'system'
    const systemPrefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    return systemPrefersDark ? 'dark' : 'light'
  }

  const [preference, setPreferenceState] =
    useState<ThemePreference>(getInitialPreference)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  // Track whether we should respond to system preference changes
  const shouldFollowSystem = useRef(preference === 'system')

  // Update ref when preference changes
  useEffect(() => {
    shouldFollowSystem.current = preference === 'system'
  }, [preference])

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // Listen for system preference changes when preference is 'system'
  useEffect(() => {
    if (preference !== 'system') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if we're still following system preference
      if (shouldFollowSystem.current) {
        setTheme(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [preference])

  const setPreference = (newPreference: ThemePreference) => {
    // Update localStorage
    localStorage.setItem(THEME_STORAGE_KEY, newPreference)

    // Update state
    setPreferenceState(newPreference)

    // Determine new theme
    let newTheme: Theme
    if (newPreference === 'light' || newPreference === 'dark') {
      newTheme = newPreference
    } else {
      // preference is 'system'
      const systemPrefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches
      newTheme = systemPrefersDark ? 'dark' : 'light'
    }

    setTheme(newTheme)
  }

  return {
    preference,
    theme,
    setPreference,
  }
}
