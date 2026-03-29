import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  getRouterContext,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { routeTree } from '@/routeTree.gen'
import type { Vendor } from '@/types'
import { VendorCard } from '.'

// VendorCard uses <Link> from @tanstack/react-router, which needs RouterContext.
// We provide the context directly via getRouterContext() so we can render the
// card without running a full route (avoids Dexie/QueryClient side-effects).
const RouterCtx = getRouterContext()

function WithRouter({ children }: { children: ReactNode }) {
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
      {/* Provide RouterContext so <Link> can compute hrefs without rendering routes */}
      <RouterCtx.Provider
        value={router as Parameters<typeof RouterCtx.Provider>[0]['value']}
      >
        {children}
      </RouterCtx.Provider>
    </QueryClientProvider>
  )
}

const meta: Meta<typeof VendorCard> = {
  title: 'Components/Vendor/VendorCard',
  component: VendorCard,
  decorators: [
    (Story) => (
      <WithRouter>
        <Story />
      </WithRouter>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VendorCard>

const vendor: Vendor = {
  id: '1',
  name: 'Costco',
  createdAt: new Date(),
}

export const Default: Story = {
  args: {
    vendor,
    onDelete: () => console.log('Delete Costco'),
  },
}

export const WithItemCount: Story = {
  args: {
    vendor,
    itemCount: 5,
    onDelete: () => console.log('Delete Costco'),
  },
}

export const WithNoItems: Story = {
  args: {
    vendor,
    itemCount: 0,
    onDelete: () => console.log('Delete Costco'),
  },
}

export const TemplateVariant: Story = {
  name: 'Template variant (unselected)',
  args: {
    vendor,
    onDelete: () => {},
    variant: 'template',
    selected: false,
    onToggle: () => console.log('Toggle Costco'),
  },
}

export const TemplateVariantSelected: Story = {
  name: 'Template variant (selected)',
  args: {
    vendor,
    onDelete: () => {},
    variant: 'template',
    selected: true,
    onToggle: () => console.log('Toggle Costco'),
  },
}
