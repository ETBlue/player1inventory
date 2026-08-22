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
import { createItem, createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import type { Item } from '@/types'

const meta = {
  title: 'Pages/Cooking',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function CookingStory({
  setup,
  initialUrl = '/cooking',
}: {
  setup: () => Promise<void>
  initialUrl?: string
}) {
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
      await setup()
      setReady(true)
    }
    init()
  }, [setup])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
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

// Story 1: Empty state — no recipes in DB
function DefaultStory() {
  return <CookingStory setup={async () => {}} />
}

export const Default: Story = {
  render: () => <DefaultStory />,
}

// Story 2: Several unchecked recipes
function WithRecipesStory() {
  return (
    <CookingStory
      setup={async () => {
        // Create items for Pasta Carbonara
        const flour = await createItem({
          name: 'Eggs',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 6,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const guanciale = await createItem({
          name: 'Guanciale',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 3,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const pecorino = await createItem({
          name: 'Pecorino Romano',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        // Create items for Green Smoothie
        const spinach = await createItem({
          name: 'Spinach',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const banana = await createItem({
          name: 'Banana',
          tagIds: [],
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 5,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        // Create items for Oatmeal
        const oats = await createItem({
          name: 'Rolled Oats',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const milk = await createItem({
          name: 'Milk',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const honey = await createItem({
          name: 'Honey',
          tagIds: [],
          targetQuantity: 1,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const cinnamon = await createItem({
          name: 'Cinnamon',
          tagIds: [],
          targetQuantity: 1,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await createRecipe({
          name: 'Pasta Carbonara',
          items: [
            { itemId: flour.id, defaultAmount: 2 },
            { itemId: guanciale.id, defaultAmount: 1 },
            { itemId: pecorino.id, defaultAmount: 1 },
          ],
        })

        await createRecipe({
          name: 'Green Smoothie',
          items: [
            { itemId: spinach.id, defaultAmount: 1 },
            { itemId: banana.id, defaultAmount: 1 },
          ],
        })

        await createRecipe({
          name: 'Oatmeal',
          items: [
            { itemId: oats.id, defaultAmount: 1 },
            { itemId: milk.id, defaultAmount: 1 },
            { itemId: honey.id, defaultAmount: 1 },
            { itemId: cinnamon.id, defaultAmount: 0 },
          ],
        })
      }}
    />
  )
}

export const WithRecipes: Story = {
  render: () => <WithRecipesStory />,
}

// Story 3: One recipe available — user can check it manually
function WithCheckedRecipeStory() {
  return (
    <CookingStory
      setup={async () => {
        const pasta = await createItem({
          name: 'Spaghetti',
          tagIds: [],
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const eggs = await createItem({
          name: 'Eggs',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 6,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await createRecipe({
          name: 'Pasta Carbonara',
          items: [
            { itemId: pasta.id, defaultAmount: 1 },
            { itemId: eggs.id, defaultAmount: 2 },
          ],
        })
      }}
    />
  )
}

export const WithCheckedRecipe: Story = {
  render: () => <WithCheckedRecipeStory />,
}

// Story 4: Recipe with items visible — user can expand manually
function WithExpandedRecipeStory() {
  return (
    <CookingStory
      setup={async () => {
        const pasta = await createItem({
          name: 'Spaghetti',
          tagIds: [],
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const eggs = await createItem({
          name: 'Eggs',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 6,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await createRecipe({
          name: 'Pasta Carbonara',
          items: [
            { itemId: pasta.id, defaultAmount: 1 },
            { itemId: eggs.id, defaultAmount: 2 },
          ],
        })
      }}
    />
  )
}

export const WithExpandedRecipe: Story = {
  render: () => <WithExpandedRecipeStory />,
}

// Story 5: Active toolbar — recipe checked, showing count text + Cancel + Done
function WithActiveToolbarStory() {
  return (
    <CookingStory
      setup={async () => {
        const pasta = await createItem({
          name: 'Spaghetti',
          tagIds: [],
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const eggs = await createItem({
          name: 'Eggs',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 6,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const cheese = await createItem({
          name: 'Pecorino Romano',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await createRecipe({
          name: 'Pasta Carbonara',
          items: [
            { itemId: pasta.id, defaultAmount: 1 },
            { itemId: eggs.id, defaultAmount: 2 },
            { itemId: cheese.id, defaultAmount: 1 },
          ],
        })

        await createRecipe({
          name: 'Green Smoothie',
          items: [],
        })
      }}
    />
  )
}

export const WithActiveToolbar: Story = {
  render: () => <WithActiveToolbarStory />,
}

// Story 6: Search open — shows search input row with filtered results
function WithSearchStory() {
  return (
    <CookingStory
      initialUrl="/cooking?q=pasta"
      setup={async () => {
        const oats = await createItem({
          name: 'Rolled Oats',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const milk = await createItem({
          name: 'Milk',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const spinach = await createItem({
          name: 'Spinach',
          tagIds: [],
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const banana = await createItem({
          name: 'Banana',
          tagIds: [],
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 5,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await createRecipe({
          name: 'Oatmeal',
          items: [
            { itemId: oats.id, defaultAmount: 1 },
            { itemId: milk.id, defaultAmount: 1 },
          ],
        })

        await createRecipe({
          name: 'Green Smoothie',
          items: [
            { itemId: spinach.id, defaultAmount: 1 },
            { itemId: banana.id, defaultAmount: 1 },
          ],
        })
      }}
    />
  )
}

export const WithSearch: Story = {
  render: () => <WithSearchStory />,
}

// Story 7: Sort by recent — recipes sorted by most recently used
function SortByRecentStory() {
  return (
    <CookingStory
      initialUrl="/cooking?sort=recent"
      setup={async () => {
        const egg = await createItem({
          name: 'Egg',
          targetUnit: 'package',
          targetQuantity: 10,
          refillThreshold: 2,
          packedQuantity: 5,
          unpackedQuantity: 0,
          consumeAmount: 1,
          tagIds: [],
        })
        await createRecipe({
          name: 'Omelette',
          items: [{ itemId: egg.id, defaultAmount: 2 }],
        })
        await createRecipe({ name: 'Pasta', items: [] })
      }}
    />
  )
}

export const SortByRecent: Story = { render: () => <SortByRecentStory /> }

// Story 8: Sort by count descending — recipes sorted by ingredient count
function SortByCountStory() {
  return (
    <CookingStory
      initialUrl="/cooking?sort=count&dir=desc"
      setup={async () => {
        const egg = await createItem({
          name: 'Egg',
          targetUnit: 'package',
          targetQuantity: 10,
          refillThreshold: 2,
          packedQuantity: 5,
          unpackedQuantity: 0,
          consumeAmount: 1,
          tagIds: [],
        })
        await createRecipe({
          name: 'Omelette',
          items: [{ itemId: egg.id, defaultAmount: 2 }],
        })
        await createRecipe({ name: 'Toast', items: [] })
      }}
    />
  )
}

export const SortByCount: Story = { render: () => <SortByCountStory /> }

// ── Stock status stories ───────────────────────────────────────────────────
// The recipe card's third row reports how many of a recipe's items are stocked
// in the active location, plus the health of those that are.

// Stocks an item in the active ('local') location with explicit levels.
const stockedHere = (
  name: string,
  stock: {
    targetQuantity: number
    refillThreshold: number
    packedQuantity: number
  },
) =>
  createItem({
    name,
    targetUnit: 'package',
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
    ...stock,
  })

// Creates a global item whose only stock row lives in ANOTHER location, so the
// cooking page (scoped to 'local') sees it as not stocked here.
const stockedElsewhere = async (name: string): Promise<Item> => {
  const now = new Date()
  const id = crypto.randomUUID()
  const item: Item = { id, name, tagIds: [], createdAt: now, updatedAt: now }
  await db.items.put(item)
  await db.itemStocks.put({
    id: `stock-${id}`,
    itemId: id,
    locationId: 'loc-elsewhere',
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: now,
    updatedAt: now,
  })
  return item
}

// Story 9: every item stocked here and healthy — "2 / 2 here", no health counts
function StockStatusHealthyStory() {
  return (
    <CookingStory
      setup={async () => {
        const beef = await stockedHere('Beef Chuck', {
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 4,
        })
        const carrot = await stockedHere('Carrot', {
          targetQuantity: 6,
          refillThreshold: 2,
          packedQuantity: 6,
        })
        await createRecipe({
          name: 'Beef Stew',
          items: [
            { itemId: beef.id, defaultAmount: 1 },
            { itemId: carrot.id, defaultAmount: 2 },
          ],
        })
      }}
    />
  )
}

export const StockStatusHealthy: Story = {
  render: () => <StockStatusHealthyStory />,
}

// Story 10: partly stocked here — "3 / 5 here · 1 empty · 1 low stock"
function StockStatusPartialStory() {
  return (
    <CookingStory
      setup={async () => {
        const pancetta = await stockedHere('Pancetta', {
          targetQuantity: 4,
          refillThreshold: 2,
          packedQuantity: 0,
        })
        const pecorino = await stockedHere('Pecorino Romano', {
          targetQuantity: 4,
          refillThreshold: 2,
          packedQuantity: 2,
        })
        const spaghetti = await stockedHere('Spaghetti', {
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 4,
        })
        const eggs = await stockedElsewhere('Eggs')
        const pepper = await stockedElsewhere('Black Pepper')
        await createRecipe({
          name: 'Pasta Carbonara',
          items: [
            { itemId: pancetta.id, defaultAmount: 1 },
            { itemId: pecorino.id, defaultAmount: 1 },
            { itemId: spaghetti.id, defaultAmount: 1 },
            { itemId: eggs.id, defaultAmount: 2 },
            { itemId: pepper.id, defaultAmount: 1 },
          ],
        })
      }}
    />
  )
}

export const StockStatusPartial: Story = {
  render: () => <StockStatusPartialStory />,
}

// Story 11: nothing stocked here — "0 / 2 here", dimmed card, disabled checkbox
function StockStatusUnavailableStory() {
  return (
    <CookingStory
      setup={async () => {
        const paste = await stockedElsewhere('Red Curry Paste')
        const coconut = await stockedElsewhere('Coconut Milk')
        await createRecipe({
          name: 'Thai Curry',
          items: [
            { itemId: paste.id, defaultAmount: 1 },
            { itemId: coconut.id, defaultAmount: 1 },
          ],
        })
      }}
    />
  )
}

export const StockStatusUnavailable: Story = {
  render: () => <StockStatusUnavailableStory />,
}

// Story 12: the split list — a recipe stocked here on top, one with nothing
// stocked here below the "N not stocked here" divider (still disabled).
function NotStockedHereSplitStory() {
  return (
    <CookingStory
      setup={async () => {
        const beef = await stockedHere('Beef Chuck', {
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 4,
        })
        await createRecipe({
          name: 'Beef Stew',
          items: [{ itemId: beef.id, defaultAmount: 1 }],
        })

        const paste = await stockedElsewhere('Red Curry Paste')
        const coconut = await stockedElsewhere('Coconut Milk')
        await createRecipe({
          name: 'Thai Curry',
          items: [
            { itemId: paste.id, defaultAmount: 1 },
            { itemId: coconut.id, defaultAmount: 1 },
          ],
        })
      }}
    />
  )
}

export const NotStockedHereSplit: Story = {
  render: () => <NotStockedHereSplitStory />,
}
