import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'

const MAX_HISTORY_SIZE = 50

/**
 * Global navigation tracker that records ALL page visits.
 * Must be used at app root to track every navigation.
 */
export function useNavigationTracker() {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })

  useEffect(() => {
    const history = loadNavigationHistory()

    // Only track app routes and avoid duplicates
    if (
      currentPath.startsWith('/') &&
      history[history.length - 1] !== currentPath
    ) {
      history.push(currentPath)
      // Keep last MAX_HISTORY_SIZE entries
      if (history.length > MAX_HISTORY_SIZE) history.shift()
      saveNavigationHistory(history)
    }
  }, [currentPath])
}
