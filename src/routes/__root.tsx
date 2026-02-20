import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'
import { useNavigationTracker } from '@/hooks/useNavigationTracker'

function RootComponent() {
  // Global navigation tracking for all pages
  useNavigationTracker()

  return (
    <>
      <Layout>
        <Outlet />
      </Layout>
      {/* <TanStackRouterDevtools /> */}
    </>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
})
