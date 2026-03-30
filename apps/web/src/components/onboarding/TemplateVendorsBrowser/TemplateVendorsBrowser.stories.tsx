import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  getRouterContext,
} from '@tanstack/react-router'
import { useState } from 'react'
import { routeTree } from '@/routeTree.gen'
import { TemplateVendorsBrowser } from '.'

// VendorCard uses <Link> from @tanstack/react-router, which needs RouterContext.
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

const meta: Meta<typeof TemplateVendorsBrowser> = {
  title: 'Components/Onboarding/TemplateVendorsBrowser',
  component: TemplateVendorsBrowser,
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
type Story = StoryObj<typeof TemplateVendorsBrowser>

export const AllVendors: Story = {
  args: {
    selectedKeys: new Set(),
  },
}

export const WithSelections: Story = {
  args: {
    selectedKeys: new Set(['costco', 'family-mart', '7-eleven', 'watsons']),
  },
}
