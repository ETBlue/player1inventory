import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  getRouterContext,
} from '@tanstack/react-router'
import { useState } from 'react'
import { routeTree } from '@/routeTree.gen'
import { TemplateItemsBrowser } from '.'

// TemplateItemsBrowser renders ItemCard which uses <Link> and useLastPurchaseDate.
// We provide RouterContext directly (avoids async route loading) and QueryClientProvider.
const RouterCtx = getRouterContext()

function WithProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [router] = useState(() =>
    createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { queryClient },
    }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <RouterCtx.Provider
        value={router as Parameters<typeof RouterCtx.Provider>[0]['value']}
      >
        {children}
      </RouterCtx.Provider>
    </QueryClientProvider>
  )
}

const withProviders: Decorator = (Story) => (
  <WithProviders>
    <Story />
  </WithProviders>
)

const meta: Meta<typeof TemplateItemsBrowser> = {
  title: 'Components/Onboarding/TemplateItemsBrowser',
  component: TemplateItemsBrowser,
  decorators: [withProviders],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSelectionChange: () => {},
    onBack: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateItemsBrowser>

export const AllItems: Story = {
  args: {
    selectedKeys: new Set(),
  },
}

export const WithSelections: Story = {
  args: {
    selectedKeys: new Set(['rice', 'eggs', 'milk', 'toothpaste', 'dish-soap']),
  },
}
