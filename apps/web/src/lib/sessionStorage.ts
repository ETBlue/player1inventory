// src/lib/sessionStorage.ts

// Navigation history (sessionStorage)
const NAVIGATION_HISTORY_KEY = 'app-navigation-history'

export function loadNavigationHistory(): string[] {
  try {
    const stored = sessionStorage.getItem(NAVIGATION_HISTORY_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return []
    }

    // Validate all elements are strings
    if (!parsed.every((item) => typeof item === 'string')) {
      return []
    }

    return parsed
  } catch (error) {
    console.error(
      'Failed to load navigation history from sessionStorage:',
      error,
    )
    return []
  }
}

export function saveNavigationHistory(history: string[]): void {
  try {
    sessionStorage.setItem(NAVIGATION_HISTORY_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Failed to save navigation history to sessionStorage:', error)
  }
}
