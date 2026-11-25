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
import { createItem, createRecipe, updateRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Settings/Recipe/Detail/Item',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DefaultStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [recipeId, setRecipeId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const recipe = await createRecipe({ name: 'Caesar Salad' })
      const storedRecipeId = recipe.id

      // 2 items with no recipe assignment
      await createItem({
        name: 'Romaine Lettuce',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      await createItem({
        name: 'Parmesan',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setRecipeId(storedRecipeId)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !recipeId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/household/recipes/${recipeId}/items`],
    }),
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

function WithItemsStory({
  nonConsumable = false,
}: {
  nonConsumable?: boolean
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [recipeId, setRecipeId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const recipe = await createRecipe({ name: 'Chicken Stir Fry' })
      const storedRecipeId = recipe.id

      // 2 items assigned to this recipe
      const chicken = await createItem({
        name: 'Chicken Breast',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      const broccoli = await createItem({
        name: 'Broccoli',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      // The non-consumable variant: the recipe also links a Wok (old data,
      // "Not used in cooking"), and a Plate is listed but cannot be added
      // (owner decision 2026-11-26: only consumable items can be in a recipe)
      const extra = nonConsumable
        ? await createItem({
            name: 'Wok',
            tagIds: [],
            vendorIds: [],
            targetUnit: 'package',
            targetQuantity: 1,
            refillThreshold: 0,
            packedQuantity: 1,
            unpackedQuantity: 0,
            consumeAmount: 1,
            consumable: false,
          })
        : undefined
      if (nonConsumable) {
        await createItem({
          name: 'Plate',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 0,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
          consumable: false,
        })
      }

      await updateRecipe(storedRecipeId, {
        items: [
          { itemId: chicken.id, defaultAmount: 1 },
          { itemId: broccoli.id, defaultAmount: 1 },
          ...(extra ? [{ itemId: extra.id, defaultAmount: 1 }] : []),
        ],
      })

      setRecipeId(storedRecipeId)
      setReady(true)
    }
    setup()
  }, [nonConsumable])

  if (!ready || !recipeId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/household/recipes/${recipeId}/items`],
    }),
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

export const Default: Story = {
  render: () => <DefaultStory />,
}

export const WithItems: Story = {
  render: () => <WithItemsStory />,
}

export const NonConsumableItems: Story = {
  render: () => <WithItemsStory nonConsumable />,
}
