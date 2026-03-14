import { useAuth } from '@clerk/react'
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { PostLoginMigrationDialog } from '@/components/PostLoginMigrationDialog'
import { Toaster } from '@/components/ui/sonner'
import { useLanguage } from '@/hooks/useLanguage'
import { useNavigationTracker } from '@/hooks/useNavigationTracker'
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
