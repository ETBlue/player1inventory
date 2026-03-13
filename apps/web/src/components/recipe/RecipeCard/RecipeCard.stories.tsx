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
import type { Recipe } from '@/types'
import { RecipeCard } from '.'

// RecipeCard uses <Link> from @tanstack/react-router, which needs RouterContext.
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

const meta: Meta<typeof RecipeCard> = {
  title: 'Components/RecipeCard',
  component: RecipeCard,
  decorators: [
    (Story) => (
      <WithRouter>
        <Story />
      </WithRouter>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof RecipeCard>

const recipe: Recipe = {
  id: '1',
  name: 'Pasta Dinner',
  items: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const Default: Story = {
  args: {
    recipe,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}

export const WithItemCount: Story = {
  args: {
    recipe,
    itemCount: 6,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}

export const WithNoItems: Story = {
  args: {
    recipe,
    itemCount: 0,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}
