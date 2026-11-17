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
import { createRecipe } from '@/db/operations'
import { GetRecipesDocument } from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { CloudRolePage, cloudRoleStorySetup } from '@/test/cloudRoleStory'

const meta = {
  title: 'Pages/Settings/Recipe',
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

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/settings/household/recipes'],
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

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      await createRecipe({ name: 'Pasta Bolognese' })
      await createRecipe({ name: 'Caesar Salad' })
      await createRecipe({ name: 'Chicken Stir Fry' })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/settings/household/recipes'],
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

// Households H5 task F.5. A household `member` in cloud mode: the recipes are listed, with no "New Recipe" and no Delete.
const memberRecipeMocks = [
  {
    request: { query: GetRecipesDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        recipes: [
          {
            __typename: 'Recipe',
            id: 'recipe-story-pancakes',
            name: 'Pancakes',
            items: [],
            lastCookedAt: null,
          },
        ],
      },
    },
  },
]

export const MemberReadOnly: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path="/settings/household/recipes"
      householdRole="member"
      mocks={memberRecipeMocks}
    />
  ),
}
