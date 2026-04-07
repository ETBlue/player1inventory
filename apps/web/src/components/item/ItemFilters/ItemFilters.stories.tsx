import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { noopApolloClient } from '@/test/apolloStub'
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
import { TagColor } from '@/types'
import { ItemFilters } from '.'

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

const meta: Meta<typeof ItemFilters> = {
  title: 'Components/Item/ItemFilters',
  component: ItemFilters,
  decorators: [
    (Story) => (
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterWrapper>
            <Story />
          </RouterWrapper>
        </QueryClientProvider>
      </ApolloProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ItemFilters>

const mockItems: Item[] = [
  {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['tag-1', 'tag-4', 'tag-6'],
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
    name: 'Cheese',
    tagIds: ['tag-1', 'tag-5'],
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
  {
    id: 'item-3',
    name: 'Apples',
    tagIds: ['tag-2', 'tag-4'],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 5,
    refillThreshold: 2,
    packedQuantity: 3,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const mockVendors: Vendor[] = [
  { id: 'v1', name: 'Costco', createdAt: new Date() },
  { id: 'v2', name: 'Safeway', createdAt: new Date() },
  { id: 'v3', name: "Trader Joe's", createdAt: new Date() },
]

const mockRecipes: Recipe[] = [
  {
    id: 'r1',
    name: 'Pancakes',
    items: [{ itemId: 'item-1', defaultAmount: 2 }],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'r2',
    name: 'Grilled Cheese',
    items: [{ itemId: 'item-2', defaultAmount: 2 }],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

// Note: ItemFilters fetches its own tag data via hooks.
// In Storybook, tags/tagTypes will be empty (no real database),
// so the tag type dropdowns render empty.
// Vendor and recipe dropdowns use props directly and render correctly.
// Use integration tests or the full app for tag filter interaction testing.

export const Default: Story = {
  render: () => <ItemFilters items={mockItems} />,
}

export const EmptyItems: Story = {
  render: () => <ItemFilters items={[]} />,
}

export const Disabled: Story = {
  render: () => <ItemFilters items={mockItems} disabled />,
}

export const WithVendors: Story = {
  render: () => <ItemFilters items={mockItems} vendors={mockVendors} />,
}

export const WithRecipes: Story = {
  render: () => <ItemFilters items={mockItems} recipes={mockRecipes} />,
}

export const WithVendorsAndRecipes: Story = {
  render: () => (
    <ItemFilters
      items={mockItems}
      vendors={mockVendors}
      recipes={mockRecipes}
    />
  ),
}

export const HideVendorFilter: Story = {
  render: () => (
    <ItemFilters
      items={mockItems}
      vendors={mockVendors}
      recipes={mockRecipes}
      hideVendorFilter
    />
  ),
}

export const HideRecipeFilter: Story = {
  render: () => (
    <ItemFilters
      items={mockItems}
      vendors={mockVendors}
      recipes={mockRecipes}
      hideRecipeFilter
    />
  ),
}

// ---------------------------------------------------------------------------
// Controlled (props-driven) variant — no router or DB hooks required
// ---------------------------------------------------------------------------

const controlledTagTypes: TagType[] = [
  { id: 'preservation', name: 'Preservation', color: TagColor.cyan },
  { id: 'category', name: 'Category', color: TagColor.pink },
]

const controlledTags: Tag[] = [
  { id: 'room-temperature', name: 'Room Temperature', typeId: 'preservation' },
  { id: 'refrigerated', name: 'Refrigerated', typeId: 'preservation' },
  { id: 'frozen', name: 'Frozen', typeId: 'preservation' },
  { id: 'food-and-dining', name: 'Food & Dining', typeId: 'category' },
  {
    id: 'produce',
    name: 'Produce',
    typeId: 'category',
    parentId: 'food-and-dining',
  },
  { id: 'household', name: 'Household', typeId: 'category' },
]

const controlledTagsWithDepth = [
  {
    id: 'room-temperature',
    name: 'Room Temperature',
    typeId: 'preservation',
    depth: 0,
  },
  {
    id: 'refrigerated',
    name: 'Refrigerated',
    typeId: 'preservation',
    depth: 0,
  },
  { id: 'frozen', name: 'Frozen', typeId: 'preservation', depth: 0 },
  {
    id: 'food-and-dining',
    name: 'Food & Dining',
    typeId: 'category',
    depth: 0,
  },
  {
    id: 'produce',
    name: 'Produce',
    typeId: 'category',
    parentId: 'food-and-dining',
    depth: 1,
  },
  { id: 'household', name: 'Household', typeId: 'category', depth: 0 },
]

const controlledItems: Item[] = [
  {
    id: 'rice',
    name: 'Rice',
    tagIds: ['room-temperature', 'food-and-dining'],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'eggs',
    name: 'Eggs',
    tagIds: ['refrigerated', 'produce'],
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

/**
 * Props-driven variant: no DB hooks or router required.
 * Demonstrates usage in onboarding where tag data comes from template data.
 */
export const ControlledWithPropData: Story = {
  render: () => {
    const [filterState, setFilterState] = useState<Record<string, string[]>>({})
    return (
      <ItemFilters
        items={controlledItems}
        tagTypes={controlledTagTypes}
        tags={controlledTags}
        tagsWithDepth={controlledTagsWithDepth}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        hideVendorFilter
        hideRecipeFilter
        hideEditTagsLink
      />
    )
  },
}
