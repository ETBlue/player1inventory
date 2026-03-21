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
  title: 'Routes/Items/Detail/Recipes',
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
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Eggs',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      // Recipes exist but item is not assigned to any
      await createRecipe({ name: 'Omelette', items: [] })
      await createRecipe({ name: 'Scrambled Eggs', items: [] })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${itemId}/recipes`],
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

function WithRecipesStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Flour',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      // Recipe with this item assigned
      await createRecipe({
        name: 'Pancakes',
        items: [{ itemId: item.id, defaultAmount: 1 }],
      })
      // Another recipe without this item
      await createRecipe({ name: 'Pasta Sauce', items: [] })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${itemId}/recipes`],
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

export const WithRecipes: Story = {
  render: () => <WithRecipesStory />,
}
