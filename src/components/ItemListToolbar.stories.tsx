import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Link,
  RouterProvider,
} from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import type { Item } from '@/types'
import { ItemListToolbar } from './ItemListToolbar'

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

const meta: Meta<typeof ItemListToolbar> = {
  title: 'Components/ItemListToolbar',
  component: ItemListToolbar,
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
type Story = StoryObj<typeof ItemListToolbar>

const mockItems: Item[] = [
  {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['tag-1'],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'item-2',
    name: 'Eggs',
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 1,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

function Controlled(props: Partial<Parameters<typeof ItemListToolbar>[0]>) {
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  return (
    <ItemListToolbar
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSortChange={(f, d) => {
        setSortBy(f)
        setSortDirection(d)
      }}
      {...props}
    />
  )
}

export const Default: Story = {
  render: () => <Controlled items={mockItems} />,
}

export const WithTagsToggle: Story = {
  render: () => <Controlled isTagsToggleEnabled items={mockItems} />,
}

export const WithAddButton: Story = {
  render: () => (
    <Controlled isTagsToggleEnabled items={mockItems}>
      <Link to="/">
        <Button>
          <Plus />
          Add item
        </Button>
      </Link>
    </Controlled>
  ),
}

export const WithLeadingSlot: Story = {
  render: () => {
    const [vendor, setVendor] = useState('')
    return (
      <Controlled
        items={mockItems}
        leading={
          <Select value={vendor || 'all'} onValueChange={setVendor}>
            <SelectTrigger className="bg-transparent border-none">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              <SelectItem value="vendor-1">Costco (12)</SelectItem>
              <SelectItem value="vendor-2">Trader Joe's (8)</SelectItem>
            </SelectContent>
          </Select>
        }
      />
    )
  },
}

export const SortedByStock: Story = {
  render: () => {
    const [sortBy, setSortBy] = useState<SortField>('stock')
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

    return (
      <ItemListToolbar
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(f, d) => {
          setSortBy(f)
          setSortDirection(d)
        }}
        isTagsToggleEnabled
        items={mockItems}
      />
    )
  },
}

export const DescendingSort: Story = {
  render: () => {
    const [sortBy, setSortBy] = useState<SortField>('name')
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

    return (
      <ItemListToolbar
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(f, d) => {
          setSortBy(f)
          setSortDirection(d)
        }}
        isTagsToggleEnabled
        items={mockItems}
      />
    )
  },
}
