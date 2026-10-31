import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Settings',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SettingsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
    context: { queryClient },
  })

  return (
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>
  )
}

// Language variants (EN/TW) are exercised via the Storybook toolbar (withI18n decorator in preview.tsx).
// No per-story localStorage setup needed — use the Language toolbar button to switch languages.
//
// /settings depends on the screen width (useIsDesktop): mobile shows the
// accordion, desktop goes to /settings/household. Each story fixes the
// Storybook viewport, so the canvas width matches the story name.

// Mobile: the two-item accordion. "My data" is open, "Preferences" is closed.
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <SettingsStory />,
}

// Desktop: /settings lands on the household config page.
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  render: () => <SettingsStory />,
}
