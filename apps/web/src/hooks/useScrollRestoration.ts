// src/hooks/useScrollRestoration.ts
import { useCallback, useEffect, useRef } from 'react'

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

  // Capture window.scrollY in the render phase, before React commits DOM mutations.
  //
  // When navigation starts, TanStack Router updates useRouterState (which `key` is
  // derived from) immediately — before the old route component unmounts. This
  // triggers a re-render with the new URL's params (e.g. isTagsVisible=false), which
  // removes content from the DOM and causes the browser to clamp window.scrollY.
  // The useEffect cleanup fires after this DOM mutation, so window.scrollY is already
  // wrong by then.
  //
  // Reading window.scrollY here (during render, before commit) captures the correct
  // pre-navigation scroll position. The ref is then used in the cleanup instead of
  // window.scrollY directly.
  const scrollBeforeCommitRef = useRef(window.scrollY)
  scrollBeforeCommitRef.current = window.scrollY

  // Tracks the scroll target of an in-progress restoration so the save-on-unmount
  // cleanup can protect against React StrictMode's simulated unmount firing before
  // the rAF callback. StrictMode cleanup runs synchronously before any rAFs, so
  // window.scrollY may be clamped (page not yet full height). Saving that clamped
  // value would overwrite the correct target. Using max(scrollBeforeCommit, pendingTarget)
  // as a floor preserves the correct value in all cases.
  // The ref is cleared by the rAF so real navigation (after DOM settles) uses
  // the actual pre-commit scroll position.
  const pendingRestoreTargetRef = useRef<number | null>(null)

  // Restore scroll to the saved position for this key.
  // Retries once via requestAnimationFrame in case the initial scrollTo was
  // clamped because tag badges or the filter panel had not yet increased the
  // page height. The rAF fires after the browser lays out the new content.
  const restoreScroll = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved !== null) {
        const y = Number(saved)
        if (!Number.isNaN(y)) {
          pendingRestoreTargetRef.current = y
          window.scrollTo({ top: y, behavior: 'instant' })
          requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: 'instant' })
            pendingRestoreTargetRef.current = null
          })
        }
      }
    } catch {}
  }, [storageKey])

  // Save scroll position when component unmounts or when the key changes.
  // Uses max(scrollBeforeCommit, pendingTarget) to handle two scenarios:
  //   1. Navigation away: scrollBeforeCommit has the correct pre-navigation value
  //      (before DOM reflow removes content and clamps scrollY).
  //   2. React StrictMode cleanup: pendingTarget is the restore goal, protecting
  //      against a clamped scrollY saving over the correct target (because the rAF
  //      that completes the restoration hasn't fired yet when StrictMode cleanup runs).
  useEffect(() => {
    return () => {
      try {
        const pending = pendingRestoreTargetRef.current
        const y = Math.max(
          scrollBeforeCommitRef.current,
          pending !== null ? pending : 0,
        )
        sessionStorage.setItem(storageKey, String(Math.round(y)))
      } catch {}
    }
  }, [storageKey])

  return { restoreScroll }
}
