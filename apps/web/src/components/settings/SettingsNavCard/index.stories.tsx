import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  getRouterContext,
} from '@tanstack/react-router'
import { CookingPot, Store, Tags } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { routeTree } from '@/routeTree.gen'
import { SettingsNavCard } from '.'

// SettingsNavCard uses <Link> from @tanstack/react-router, which needs RouterContext.
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
      history: createMemoryHistory({ initialEntries: ['/settings'] }),
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

const meta: Meta<typeof SettingsNavCard> = {
  title: 'Components/Settings/SettingsNavCard',
  component: SettingsNavCard,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <WithRouter>
        <Story />
      </WithRouter>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SettingsNavCard>

export const TagsLink: Story = {
  args: {
    icon: Tags,
    label: 'Tags',
    description: 'Manage your tags',
    to: '/settings/tags',
  },
}

export const VendorsLink: Story = {
  args: {
    icon: Store,
    label: 'Vendors',
    description: 'Manage vendors',
    to: '/settings/vendors',
  },
}

export const RecipesLink: Story = {
  args: {
    icon: CookingPot,
    label: 'Recipes',
    description: 'Manage your recipes',
    to: '/settings/recipes',
  },
}

export const AllLinks: Story = {
  render: () => (
    <div className="flex flex-col gap-2 max-w-sm">
      <SettingsNavCard
        icon={Tags}
        label="Tags"
        description="Manage your tags"
        to="/settings/tags"
      />
      <SettingsNavCard
        icon={Store}
        label="Vendors"
        description="Manage vendors"
        to="/settings/vendors"
      />
      <SettingsNavCard
        icon={CookingPot}
        label="Recipes"
        description="Manage your recipes"
        to="/settings/recipes"
      />
    </div>
  ),
}
