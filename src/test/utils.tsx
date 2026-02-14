import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type React from 'react'

export const renderWithRouter = async (ui: React.ReactElement) => {
  const Wrapper = () => ui
  const rootRoute = createRootRoute({ component: Wrapper })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const result = render(<RouterProvider router={router} />)
  await router.load()
  return result
}
