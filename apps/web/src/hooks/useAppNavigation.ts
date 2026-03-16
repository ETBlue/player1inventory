import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'

// Extract pathname from a full URL string (strips search params)
function getPathname(url: string): string {
  return url.split('?')[0] ?? url
}

// Export for testing. Accepts full URLs or plain pathnames — compares pathnames only.
export function isSamePage(url1: string, url2: string): boolean {
  const path1 = getPathname(url1)
  const path2 = getPathname(url2)

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

  // Tag detail pages: /settings/tags/:id/*
  const tagMatch1 = path1.match(/^\/settings\/tags\/([^/]+)/)
  const tagMatch2 = path2.match(/^\/settings\/tags\/([^/]+)/)
  if (tagMatch1 && tagMatch2 && tagMatch1[1] === tagMatch2[1]) {
    return true
  }

  // Recipe detail pages: /settings/recipes/:id/*
  const recipeMatch1 = path1.match(/^\/settings\/recipes\/([^/]+)/)
  const recipeMatch2 = path2.match(/^\/settings\/recipes\/([^/]+)/)
  if (recipeMatch1 && recipeMatch2 && recipeMatch1[1] === recipeMatch2[1]) {
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
    const currentPathname = router.state.location.pathname

    // Filter out same-page navigation and "new" pages to find the previous different page
    let previousUrl: string | undefined
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i]
      const entryPathname = getPathname(entry ?? '')
      if (
        entry &&
        entryPathname !== currentPathname &&
        !isSamePage(entry, currentPathname) &&
        !entryPathname.endsWith('/new')
      ) {
        previousUrl = entry
        break
      }
    }

    if (previousUrl) {
      // Remove all same-page entries, current page, and "new" pages from history
      const newHistory = history.filter((entry) => {
        const entryPathname = getPathname(entry)
        return (
          !isSamePage(entry, currentPathname) &&
          entryPathname !== currentPathname &&
          !entryPathname.endsWith('/new')
        )
      })
      saveNavigationHistory(newHistory)
      // Use router.history.push to navigate to the full URL (preserving search params)
      router.history.push(previousUrl)
    } else {
      // No valid previous page - use fallback or default to home
      navigate({ to: fallbackPath || '/' })
    }
  }, [navigate, router, fallbackPath])

  return { goBack }
}
