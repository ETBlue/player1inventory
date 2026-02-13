import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { PantryToolbar } from './PantryToolbar'

const queryClient = new QueryClient()

const createStoryRouter = (storyComponent: React.ComponentType) => {
  const rootRoute = createRootRoute({
    component: storyComponent as () => React.ReactNode,
  })

  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function RouterWrapper({ children }: { children: React.ReactNode }) {
  const [router] = useState(() => createStoryRouter(() => <>{children}</>))
  return <RouterProvider router={router} />
}

const meta: Meta<typeof PantryToolbar> = {
  title: 'Components/PantryToolbar',
  component: PantryToolbar,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <RouterWrapper>
          <Story />
        </RouterWrapper>
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof PantryToolbar>

export const Default: Story = {
  args: {
    filtersVisible: false,
    tagsVisible: false,
    sortBy: 'expiring',
    sortDirection: 'asc',
    onToggleFilters: () => console.log('Toggle filters'),
    onToggleTags: () => console.log('Toggle tags'),
    onSortChange: (field, direction) =>
      console.log('Sort change:', field, direction),
  },
}

export const FiltersVisible: Story = {
  args: {
    ...Default.args,
    filtersVisible: true,
  },
}

export const TagsVisible: Story = {
  args: {
    ...Default.args,
    tagsVisible: true,
  },
}

export const BothVisible: Story = {
  args: {
    ...Default.args,
    filtersVisible: true,
    tagsVisible: true,
  },
}

export const SortByName: Story = {
  args: {
    ...Default.args,
    sortBy: 'name',
    sortDirection: 'asc',
  },
}

export const SortByQuantity: Story = {
  args: {
    ...Default.args,
    sortBy: 'quantity',
    sortDirection: 'asc',
  },
}

export const NameDescending: Story = {
  args: {
    ...Default.args,
    sortBy: 'name',
    sortDirection: 'desc',
  },
}

export const QuantityDescending: Story = {
  args: {
    ...Default.args,
    sortBy: 'quantity',
    sortDirection: 'desc',
  },
}
