import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'

const MAX_HISTORY_SIZE = 50

export function useAppNavigation() {
  const router = useRouter()
  const navigate = useNavigate()

  // Track navigation
  useEffect(() => {
    const history = loadNavigationHistory()
    const currentPath = router.state.location.pathname

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
  }, [router.state.location.pathname])

  const goBack = useCallback(() => {
    // Read fresh history from sessionStorage to ensure cross-tab/cross-component consistency
    const history = loadNavigationHistory()

    // Get previous page WITHOUT modifying array
    const currentIndex = history.length - 1
    const previousPath = history[currentIndex - 1]

    if (previousPath && previousPath !== router.state.location.pathname) {
      // Remove current page from history before navigating
      const newHistory = history.slice(0, -1)
      saveNavigationHistory(newHistory)
      navigate({ to: previousPath })
    } else {
      // No valid previous page - go home
      navigate({ to: '/' })
    }
  }, [navigate, router.state.location.pathname])

  return { goBack }
}
