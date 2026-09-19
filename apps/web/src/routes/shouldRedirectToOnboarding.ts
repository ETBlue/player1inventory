interface OnboardingRedirectInput {
  allLoaded: boolean
  isEmpty: boolean
  mode: 'local' | 'cloud'
  offline: boolean
  pathname: string
  dismissed: boolean
}

/**
 * Decides whether to send the user to the onboarding page.
 *
 * The offline rule is the important one. Offline, an empty cache is not the
 * same as an empty account. Redirecting then looks to the user like their
 * data was deleted.
 */
export function shouldRedirectToOnboarding({
  allLoaded,
  isEmpty,
  mode,
  offline,
  pathname,
  dismissed,
}: OnboardingRedirectInput): boolean {
  if (!allLoaded) return false
  if (!isEmpty) return false
  if (mode === 'cloud' && offline) return false
  if (pathname === '/onboarding') return false
  if (dismissed) return false
  return true
}
