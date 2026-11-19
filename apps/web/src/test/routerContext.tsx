import { QueryClient } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  getRouterContext,
} from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { routeTree } from '@/routeTree.gen'

// A component that renders a TanStack `<Link>` needs the router in context,
// or `<Link>` throws. This gives it one, with the real route tree, WITHOUT
// rendering any route. So a story or a test of one component does not mount
// a page, Dexie or Apollo (households H5c, task H.6: the links of
// `LocationList` and `MemberList`).
//
// The same pattern as the private `WithRouter` in
// `components/settings/SettingsNavCard/index.stories.tsx`.

const RouterCtx = getRouterContext()

export function WithRouterContext({
  children,
  initialPath = '/settings',
}: {
  children: ReactNode
  initialPath?: string
}) {
  const [router] = useState(() =>
    createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [initialPath] }),
      context: { queryClient: new QueryClient() },
    }),
  )
  return (
    <RouterCtx.Provider
      value={router as Parameters<typeof RouterCtx.Provider>[0]['value']}
    >
      {children}
    </RouterCtx.Provider>
  )
}
