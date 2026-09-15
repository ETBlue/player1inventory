import { useAuth } from '@clerk/react'
import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { Layout } from '@/components/global/Layout'
import { OfflineBanner } from '@/components/global/OfflineBanner'
import { PostLoginMigrationDialog } from '@/components/global/PostLoginMigrationDialog'
import { Toaster } from '@/components/ui/sonner'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import { useIsOffline } from '@/hooks/useIsOffline'
import { useItems } from '@/hooks/useItems'
import { useLanguage } from '@/hooks/useLanguage'
import { useNavigationTracker } from '@/hooks/useNavigationTracker'
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'
import { useTags } from '@/hooks/useTags'
import { useVendors } from '@/hooks/useVendors'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { shouldRedirectToOnboarding } from './shouldRedirectToOnboarding'

// Read mode once at module load — stable for this page lifetime
const mode = (localStorage.getItem(DATA_MODE_STORAGE_KEY) ?? 'local') as
  | 'local'
  | 'cloud'

// E2E test mode: VITE_E2E_TEST_USER_ID bypasses Clerk, so CloudAuthGuard
// must not mount (it calls useAuth() which requires ClerkProvider context).
const isE2ETestMode = !!import.meta.env.VITE_E2E_TEST_USER_ID

export function CloudAuthGuard() {
  const { isSignedIn, isLoaded } = useAuth()
  const navigate = useNavigate()
  const offline = useIsOffline()

  useEffect(() => {
    // Do not redirect while offline. Clerk cannot confirm the session
    // without a network, and a sign-in page cannot be finished offline.
    // The user's cached data is on the device and should stay reachable.
    if (offline) return
    if (isLoaded && !isSignedIn) {
      navigate({ to: '/sign-in' })
    }
  }, [isLoaded, isSignedIn, navigate, offline])

  return null
}

function RootComponent() {
  // Global navigation tracking for all pages
  useNavigationTracker()
  // Sync language preference on app load
  useLanguage()
  // Ask the user to reload when a new version is ready. Never auto-reloads.
  useServiceWorkerUpdate()

  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const offline = useIsOffline()
  const itemsResult = useItems()
  const tagsResult = useTags()
  const vendorsResult = useVendors()
  // Only redirect after all three queries have loaded at least once
  // (data === undefined means the query hasn't resolved yet)
  const allLoaded =
    itemsResult.data !== undefined &&
    tagsResult.data !== undefined &&
    vendorsResult.data !== undefined
  const isEmpty =
    (itemsResult.data?.length ?? 0) === 0 &&
    (tagsResult.data?.length ?? 0) === 0 &&
    (vendorsResult.data?.length ?? 0) === 0

  useEffect(() => {
    // Skip redirect if the user explicitly chose "Start from scratch",
    // or if E2E tests set the skip flag via addInitScript.
    const dismissed =
      localStorage.getItem('onboarding-dismissed') === 'true' ||
      localStorage.getItem('e2e-skip-onboarding') === 'true'
    if (
      shouldRedirectToOnboarding({
        allLoaded,
        isEmpty,
        mode,
        offline,
        pathname,
        dismissed,
      })
    ) {
      navigate({ to: '/onboarding' })
    }
  }, [allLoaded, isEmpty, pathname, navigate, offline])

  return (
    <ActiveLocationProvider>
      {mode === 'cloud' && !isE2ETestMode && (
        <>
          <CloudAuthGuard />
          <PostLoginMigrationDialog />
        </>
      )}
      <Layout>
        {mode === 'cloud' && <OfflineBanner />}
        <Outlet />
      </Layout>
      <Toaster />
      {/* <TanStackRouterDevtools /> */}
    </ActiveLocationProvider>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
})
