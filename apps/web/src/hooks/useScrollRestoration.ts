// src/hooks/useScrollRestoration.ts
import { type RefObject, useCallback, useEffect, useRef } from 'react'

/**
 * Saves and restores the scroll position of a scroll container element for a
 * given key. Key should be the full URL (pathname + search) so different filter
 * states have independent scroll positions.
 *
 * The app shell pins `<main>` to the viewport, so the window itself never
 * scrolls — list views scroll inside an inner container (the element with
 * `overflow-y-auto`). Pass a ref to that container so save/restore operate on
 * `element.scrollTop` instead of `window.scrollY`.
 *
 * Usage:
 *   const scrollRef = useRef<HTMLDivElement>(null)
 *   const { restoreScroll } = useScrollRestoration(currentUrl, scrollRef)
 *   useEffect(() => { if (!isLoading) restoreScroll() }, [isLoading, restoreScroll])
 *   return <div ref={scrollRef} className="overflow-y-auto">...</div>
 */
export function useScrollRestoration(
  key: string,
  scrollRef: RefObject<HTMLElement | null>,
) {
  const storageKey = `scroll-pos:${key}`

  // Capture the container's scrollTop in the render phase, before React commits
  // DOM mutations.
  //
  // When navigation starts, TanStack Router updates useRouterState (which `key` is
  // derived from) immediately — before the old route component unmounts. This
  // triggers a re-render with the new URL's params (e.g. isTagsVisible=false), which
  // removes content from the DOM and causes the browser to clamp scrollTop.
  // The useEffect cleanup fires after this DOM mutation, so scrollTop is already
  // wrong by then.
  //
  // Reading scrollTop here (during render, before commit) captures the correct
  // pre-navigation scroll position. The ref is then used in the cleanup instead of
  // reading the live element. Guard against the ref not being attached yet
  // (default to 0) so capture in render never throws.
  const scrollBeforeCommitRef = useRef(scrollRef.current?.scrollTop ?? 0)
  scrollBeforeCommitRef.current = scrollRef.current?.scrollTop ?? 0

  // Tracks the scroll target of an in-progress restoration so the save-on-unmount
  // cleanup can protect against React StrictMode's simulated unmount firing before
  // the rAF callback. StrictMode cleanup runs synchronously before any rAFs, so
  // scrollTop may be clamped (container not yet full height). Saving that clamped
  // value would overwrite the correct target. Using max(scrollBeforeCommit, pendingTarget)
  // as a floor preserves the correct value in all cases.
  // The ref is cleared by the rAF so real navigation (after DOM settles) uses
  // the actual pre-commit scroll position.
  const pendingRestoreTargetRef = useRef<number | null>(null)

  // Restore scroll to the saved position for this key.
  // Retries once via requestAnimationFrame in case the initial scrollTo was
  // clamped because tag badges or the filter panel had not yet increased the
  // container height. The rAF fires after the browser lays out the new content.
  const restoreScroll = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved !== null) {
        const y = Number(saved)
        if (!Number.isNaN(y)) {
          pendingRestoreTargetRef.current = y
          scrollRef.current?.scrollTo({ top: y, behavior: 'instant' })
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: y, behavior: 'instant' })
            pendingRestoreTargetRef.current = null
          })
        }
      }
    } catch {}
  }, [storageKey, scrollRef])

  // Save scroll position when component unmounts or when the key changes.
  // Uses max(scrollBeforeCommit, pendingTarget) to handle two scenarios:
  //   1. Navigation away: scrollBeforeCommit has the correct pre-navigation value
  //      (before DOM reflow removes content and clamps scrollTop).
  //   2. React StrictMode cleanup: pendingTarget is the restore goal, protecting
  //      against a clamped scrollTop saving over the correct target (because the rAF
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
