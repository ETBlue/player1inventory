import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'

// Export for testing
export function isSamePage(path1: string, path2: string): boolean {
  // Item detail pages: /items/:id/*
  const itemMatch1 = path1.match(/^\/items\/([^/]+)/)
  const itemMatch2 = path2.match(/^\/items\/([^/]+)/)
  if (itemMatch1 && itemMatch2 && itemMatch1[1] === itemMatch2[1]) {
    return true
  }

  // Vendor detail pages: /settings/vendors/:id/*
  const vendorMatch1 = path1.match(/^\/settings\/vendors\/([^/]+)/)
  const vendorMatch2 = path2.match(/^\/settings\/vendors\/([^/]+)/)
  if (vendorMatch1 && vendorMatch2 && vendorMatch1[1] === vendorMatch2[1]) {
    return true
  }

  return false
}

export function useAppNavigation(fallbackPath?: string) {
  const router = useRouter()
  const navigate = useNavigate()

  const goBack = useCallback(() => {
    // Read fresh history from sessionStorage to ensure cross-tab/cross-component consistency
    const history = loadNavigationHistory()
    const currentPath = router.state.location.pathname

    // Filter out same-page navigation to find the previous different page
    let previousPath: string | undefined
    for (let i = history.length - 1; i >= 0; i--) {
      const path = history[i]
      if (path && path !== currentPath && !isSamePage(path, currentPath)) {
        previousPath = path
        break
      }
    }

    if (previousPath) {
      // Remove all same-page entries and current page from history
      const newHistory = history.filter(
        (path) => !isSamePage(path, currentPath) && path !== currentPath,
      )
      saveNavigationHistory(newHistory)
      navigate({ to: previousPath })
    } else {
      // No valid previous page - use fallback or default to home
      navigate({ to: fallbackPath || '/' })
    }
  }, [navigate, router.state.location.pathname, fallbackPath])

  return { goBack }
}
