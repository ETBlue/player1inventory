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

const meta = {
  title: 'Routes/Cooking',
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
