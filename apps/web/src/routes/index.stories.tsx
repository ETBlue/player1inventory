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
import {
  createItem,
  createLocation,
  createRecipe,
  createShelf,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Pantry',
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
    async function init() {
      await db.delete()
      await db.open()
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
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

function WithItemsStory() {
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

      await createItem({
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await createItem({
        name: 'Eggs',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await createItem({
        name: 'Orange Juice',
        tagIds: [],
        packageUnit: 'bottle',
        targetUnit: 'package',
        targetQuantity: 6,
        refillThreshold: 2,
        packedQuantity: 5,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
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

function WithSearchTailStory() {
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

      // A second location — this is what makes "not stocked here" possible:
      // Milk Powder below is stocked ONLY there, never at the default
      // location this story renders.
      const office = await createLocation('Office')

      const stock = {
        targetUnit: 'package' as const,
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      }

      // Stocked here → the pantry's own list.
      await createItem({ name: 'Milk', tagIds: [], ...stock })

      // Exists globally but stocked ONLY at the Office → "not stocked
      // here", with an "Add to My Home" button.
      await createItem(
        { name: 'Milk Powder', tagIds: [], vendorIds: [], ...stock },
        office.id,
      )

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/?q=milk'] }),
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

function ShelfGroupViewStory() {
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

      const item = await createItem({
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await createShelf({
        name: 'dairy',
        type: 'selection',
        order: 0,
        itemIds: [item.id],
      })

      // A shelf whose only item is stocked in another location, so the story
      // shows the split state: it sinks below the "N not stocked here" divider
      // together with the (here-empty) Unsorted bucket.
      const cabin = await createLocation('Cabin')
      const firewood = await createItem(
        {
          name: 'Firewood',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 6,
          refillThreshold: 2,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
        },
        cabin.id,
      )

      await createShelf({
        name: 'woodpile',
        type: 'selection',
        order: 1,
        itemIds: [firewood.id],
      })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/?groupBy=shelf'] }),
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

function VendorGroupViewStory() {
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

      const vendor = await createVendor('Costco')

      await createItem({
        name: 'Eggs',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      // A vendor whose only item is stocked in another location, plus an
      // unfiled item that lives only there too — so the story shows the split
      // state: both sink below the "N not stocked here" divider.
      const cabin = await createLocation('Cabin')
      const cabinSupply = await createVendor('Cabin Supply')

      await createItem(
        {
          name: 'Firewood',
          tagIds: [],
          vendorIds: [cabinSupply.id],
          targetUnit: 'package',
          targetQuantity: 6,
          refillThreshold: 2,
          packedQuantity: 4,
          unpackedQuantity: 0,
          consumeAmount: 1,
        },
        cabin.id,
      )

      await createItem(
        {
          name: 'Kindling',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        },
        cabin.id,
      )

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/?groupBy=vendor'] }),
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

function RecipeGroupViewStory() {
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

      const item = await createItem({
        name: 'Pasta',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await createRecipe({
        name: 'Pasta Carbonara',
        items: [{ itemId: item.id, defaultAmount: 1 }],
      })

      // A recipe built only from an item stocked in another location, plus an
      // item in no recipe that lives only there too — so the story shows the
      // split state: both sink below the "N not stocked here" divider.
      const cabin = await createLocation('Cabin')
      const beans = await createItem(
        {
          name: 'Beans',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
        },
        cabin.id,
      )

      await createItem(
        {
          name: 'Kindling',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        },
        cabin.id,
      )

      await createRecipe({
        name: 'Campfire Stew',
        items: [{ itemId: beans.id, defaultAmount: 1 }],
      })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/?groupBy=recipe'] }),
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

function ShelfDetailViewStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [shelfId, setShelfId] = useState('')

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [item.id],
      })

      setShelfId(shelf.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !shelfId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/?groupBy=shelf&id=${shelfId}`],
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

function ShelfDetailViewSearchTailStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [shelfId, setShelfId] = useState('')

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const stock = {
        targetUnit: 'package' as const,
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      }

      // A second location — Milk Powder below is stocked ONLY there, never
      // at the default location this story renders.
      const office = await createLocation('Office')

      // Stocked here, but not yet a shelf member → "not in this list", with
      // an "Add to shelf" button.
      await createItem({ name: 'Milk', tagIds: [], ...stock })

      // Exists globally but stocked ONLY at the Office → "not stocked here",
      // with an "Add to My Home" button.
      await createItem(
        { name: 'Milk Powder', tagIds: [], vendorIds: [], ...stock },
        office.id,
      )

      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [],
      })

      setShelfId(shelf.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !shelfId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/?groupBy=shelf&id=${shelfId}&q=milk`],
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

function VendorDetailViewStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [vendorId, setVendorId] = useState('')

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const vendor = await createVendor('Costco')

      await createItem({
        name: 'Eggs',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setVendorId(vendor.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !vendorId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/?groupBy=vendor&id=${vendorId}`],
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

function RecipeDetailViewStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [recipeId, setRecipeId] = useState('')

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Pasta',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      const recipe = await createRecipe({
        name: 'Pasta Carbonara',
        items: [{ itemId: item.id, defaultAmount: 1 }],
      })

      setRecipeId(recipe.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !recipeId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/?groupBy=recipe&id=${recipeId}`],
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

export const WithSearchTail: Story = {
  render: () => <WithSearchTailStory />,
}

export const ShelfGroupView: Story = {
  render: () => <ShelfGroupViewStory />,
}

export const VendorGroupView: Story = {
  render: () => <VendorGroupViewStory />,
}

export const RecipeGroupView: Story = {
  render: () => <RecipeGroupViewStory />,
}

export const ShelfDetailView: Story = {
  render: () => <ShelfDetailViewStory />,
}

export const ShelfDetailViewSearchTail: Story = {
  render: () => <ShelfDetailViewSearchTailStory />,
}

export const VendorDetailView: Story = {
  render: () => <VendorDetailViewStory />,
}

export const RecipeDetailView: Story = {
  render: () => <RecipeDetailViewStory />,
}
