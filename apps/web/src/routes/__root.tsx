import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'
import { Toaster } from '@/components/ui/sonner'
import { useLanguage } from '@/hooks/useLanguage'
import { useNavigationTracker } from '@/hooks/useNavigationTracker'

function RootComponent() {
  // Global navigation tracking for all pages
  useNavigationTracker()
  // Sync language preference on app load
  useLanguage()

  return (
    <>
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
