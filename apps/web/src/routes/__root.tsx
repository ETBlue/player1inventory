import { useAuth } from '@clerk/react'
import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { Layout } from '@/components/global/Layout'
import { PostLoginMigrationDialog } from '@/components/global/PostLoginMigrationDialog'
import { Toaster } from '@/components/ui/sonner'
import { useItems } from '@/hooks/useItems'
import { useLanguage } from '@/hooks/useLanguage'
import { useNavigationTracker } from '@/hooks/useNavigationTracker'
import { useTags } from '@/hooks/useTags'
import { useVendors } from '@/hooks/useVendors'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'

// Read mode once at module load — stable for this page lifetime
const mode = (localStorage.getItem(DATA_MODE_STORAGE_KEY) ?? 'local') as
  | 'local'
  | 'cloud'

// E2E test mode: VITE_E2E_TEST_USER_ID bypasses Clerk, so CloudAuthGuard
// must not mount (it calls useAuth() which requires ClerkProvider context).
const isE2ETestMode = !!import.meta.env.VITE_E2E_TEST_USER_ID

function CloudAuthGuard() {
  const { isSignedIn, isLoaded } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate({ to: '/sign-in' })
    }
  }, [isLoaded, isSignedIn, navigate])

  return null
}

function RootComponent() {
  // Global navigation tracking for all pages
  useNavigationTracker()
  // Sync language preference on app load
  useLanguage()

  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
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
    // E2E tests that are NOT testing onboarding set this flag via addInitScript
    // so that navigating with an empty DB doesn't redirect to /onboarding.
    // Read inside the effect (not at module level) so it picks up the current
    // value after addInitScript runs before each SPA navigation.
    const skipOnboardingRedirect =
      localStorage.getItem('e2e-skip-onboarding') === 'true'
    if (
      allLoaded &&
      isEmpty &&
      pathname !== '/onboarding' &&
      !skipOnboardingRedirect
    ) {
      navigate({ to: '/onboarding' })
    }
  }, [allLoaded, isEmpty, pathname, navigate])

  return (
    <>
      {mode === 'cloud' && !isE2ETestMode && (
        <>
          <CloudAuthGuard />
          <PostLoginMigrationDialog />
        </>
      )}
      <Layout>
        <Outlet />
      </Layout>
      <Toaster />
      {/* <TanStackRouterDevtools /> */}
    </>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
})
