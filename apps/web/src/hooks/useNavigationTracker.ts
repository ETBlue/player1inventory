import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'

const MAX_HISTORY_SIZE = 50

/**
 * Global navigation tracker that records ALL page visits as full URLs (pathname + search).
 * When params change on the same page, updates the last entry in place rather than appending.
 * Must be used at app root to track every navigation.
 */
export function useNavigationTracker() {
  const currentUrl = useRouterState({
    select: (state) => state.location.pathname + (state.location.search ?? ''),
  })

  useEffect(() => {
    if (!currentUrl.startsWith('/')) return

    const history = loadNavigationHistory()
    const lastEntry = history[history.length - 1]
    const lastPathname = lastEntry?.split('?')[0]
    const currentPathname = currentUrl.split('?')[0]

    if (lastEntry === currentUrl) {
      // Exact same URL — no change needed
      return
    }

    if (lastPathname === currentPathname) {
      // Same page, params changed — update last entry in place
      history[history.length - 1] = currentUrl
    } else {
      // Different page — append new entry
      history.push(currentUrl)
      if (history.length > MAX_HISTORY_SIZE) history.shift()
    }

    saveNavigationHistory(history)
  }, [currentUrl])
}
