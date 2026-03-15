// src/hooks/useScrollRestoration.ts
import { useCallback, useEffect } from 'react'

/**
 * Saves and restores window.scrollY for a given key.
 * Key should be the full URL (pathname + search) so different filter states
 * have independent scroll positions.
 *
 * Usage:
 *   const { restoreScroll } = useScrollRestoration(currentUrl)
 *   useEffect(() => { if (!isLoading) restoreScroll() }, [isLoading, restoreScroll])
 */
export function useScrollRestoration(key: string) {
  const storageKey = `scroll-pos:${key}`

  // Restore scroll to the saved position for this key
  const restoreScroll = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved !== null) {
        const y = Number(saved)
        if (!Number.isNaN(y)) {
          window.scrollTo({ top: y, behavior: 'instant' })
        }
      }
    } catch {}
  }, [storageKey])

  // Save scroll position when component unmounts
  useEffect(() => {
    return () => {
      try {
        sessionStorage.setItem(storageKey, String(Math.round(window.scrollY)))
      } catch {}
    }
  }, [storageKey])

  return { restoreScroll }
}
