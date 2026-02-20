import { useRouter } from '@tanstack/react-router'
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
  const router = useRouter()

  useEffect(() => {
    const history = loadNavigationHistory()
    const currentPath = router.state.location.pathname

    console.log('[useNavigationTracker] Effect fired:', {
      currentPath,
      historyBefore: [...history],
      lastEntry: history[history.length - 1],
    })

    // Only track app routes and avoid duplicates
    if (
      currentPath.startsWith('/') &&
      history[history.length - 1] !== currentPath
    ) {
      history.push(currentPath)
      // Keep last MAX_HISTORY_SIZE entries
      if (history.length > MAX_HISTORY_SIZE) history.shift()
      saveNavigationHistory(history)
      console.log('[useNavigationTracker] Added to history:', {
        currentPath,
        historyAfter: [...history],
      })
    } else {
      console.log('[useNavigationTracker] Skipped (duplicate or invalid):', {
        currentPath,
        startsWithSlash: currentPath.startsWith('/'),
        isDuplicate: history[history.length - 1] === currentPath,
      })
    }
  }, [router.state.location.pathname])
}
