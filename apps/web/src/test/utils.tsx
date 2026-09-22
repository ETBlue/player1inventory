import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type React from 'react'
import { expect } from 'vitest'

export const renderWithRouter = async (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = () => (
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
  const rootRoute = createRootRoute({ component: Wrapper })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const result = render(<RouterProvider router={router} />)
  await router.load()
  return result
}

// Asserts that every node precedes the next one in document order. The
// failure message names the pair that is out of order, so a swapped row says
// which two rows swapped instead of only "expected true".
//
// Shared by QuickUpdateDialog.test.tsx and ItemForm.test.tsx: both pin the
// same row order (see `components/CLAUDE.md`, "Row order (designer ruling,
// 2026-09-22)"), so one failure message format serves both.
export const expectDocumentOrder = (nodes: [string, Node][]) => {
  for (let i = 0; i < nodes.length - 1; i++) {
    const [currentName, current] = nodes[i] as [string, Node]
    const [nextName, next] = nodes[i + 1] as [string, Node]
    const precedes = Boolean(
      current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(
      precedes,
      `expected "${currentName}" to come before "${nextName}" in the DOM`,
    ).toBe(true)
  }
}
