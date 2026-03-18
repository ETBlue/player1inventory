import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
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

// No-op Apollo client — satisfies Apollo context requirement for hooks called
// with skip:true inside routes rendered when navigating to pantry/shopping/cooking.
// Tests don't need this because setup.ts mocks all generated Apollo hooks via vi.mock.
const noopApolloClient = new ApolloClient({
  link: new ApolloLink(() => null),
  cache: new InMemoryCache(),
})

const meta = {
  title: 'Components/Navigation',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NavigationStory({ path }: { path: string }) {
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
    history: createMemoryHistory({ initialEntries: [path] }),
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

// Story 1: Pantry tab active (home)
export const PantryActive: Story = {
  render: () => <NavigationStory path="/" />,
}

// Story 2: Cart tab active
export const CartActive: Story = {
  render: () => <NavigationStory path="/shopping" />,
}

// Story 3: Use (cooking) tab active
export const CookingActive: Story = {
  render: () => <NavigationStory path="/cooking" />,
}

// Story 4: Settings tab active
export const SettingsActive: Story = {
  render: () => <NavigationStory path="/settings" />,
}

// Story 5: Hidden on fullscreen pages (items, tags, vendors, recipes)
export const HiddenOnFullscreen: Story = {
  render: () => <NavigationStory path="/settings/vendors" />,
}
