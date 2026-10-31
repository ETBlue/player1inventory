import { useSyncExternalStore } from 'react'

// The Tailwind `lg` breakpoint. Tailwind v4 defines it as
// `--breakpoint-lg: 64rem` (tailwindcss/theme.css), and this app does not
// override it. A media query in rem uses the browser's default font size,
// exactly as the CSS `lg:` classes do, so JavaScript and CSS switch at the
// same width even when the user changes that default. At the usual 16px
// default, 64rem is 1024px.
export const DESKTOP_MEDIA_QUERY = '(min-width: 64rem)'

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia(DESKTOP_MEDIA_QUERY)
}

function subscribe(onChange: () => void): () => void {
  const mql = getMediaQueryList()
  if (!mql) return () => {}
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return getMediaQueryList()?.matches ?? false
}

/**
 * Reports whether the screen is at least as wide as the Tailwind `lg`
 * breakpoint. Use it only where the screen width changes what is rendered
 * (for example a redirect). For styling, use the `lg:` classes instead.
 *
 * Returns `false` when `matchMedia` does not exist.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
