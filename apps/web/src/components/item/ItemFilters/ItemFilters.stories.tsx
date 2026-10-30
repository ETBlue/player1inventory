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

// `ItemFilters` reads only `id`, `name`, `tagIds` and `vendorIds` off an item:
// `calculateTagCount` -> `filterItems` reads `tagIds` (src/lib/filterUtils.ts:42),
// `filterItemsByVendors` reads `vendorIds` (same file, line 74), and
// `filterItemsByRecipes` matches on `item.id` (line 85). The per-location stock
// state (targetQuantity, refillThreshold, packedQuantity, unpackedQuantity)
// moved off `Item` onto `ItemStock` in v15/v16 and is read nowhere here.
const makeItem = (
  overrides: Pick<Item, 'id' | 'name' | 'tagIds'> & Partial<Item>,
): Item => ({
  vendorIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const mockItems: Item[] = [
  makeItem({ id: 'item-1', name: 'Milk', tagIds: ['tag-1', 'tag-4', 'tag-6'] }),
  makeItem({ id: 'item-2', name: 'Cheese', tagIds: ['tag-1', 'tag-5'] }),
  makeItem({ id: 'item-3', name: 'Apples', tagIds: ['tag-2', 'tag-4'] }),
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
  makeItem({
    id: 'rice',
    name: 'Rice',
    tagIds: ['room-temperature', 'food-and-dining'],
  }),
  makeItem({ id: 'eggs', name: 'Eggs', tagIds: ['refrigerated', 'produce'] }),
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
