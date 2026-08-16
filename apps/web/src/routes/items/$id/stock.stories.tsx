import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Item/Stock',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function PackageItemStory() {
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
        name: 'Milk',
        tagIds: [],
        packageUnit: 'bottle',
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${itemId}/stock`],
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

function MeasurementItemStory() {
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
        packageUnit: 'pack',
        measurementUnit: 'g',
        amountPerPackage: 500,
        targetUnit: 'measurement',
        targetQuantity: 2000,
        refillThreshold: 500,
        packedQuantity: 2,
        unpackedQuantity: 250,
        consumeAmount: 100,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${itemId}/stock`],
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

function NotYetStockedHereStory() {
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

      // Stocked at a different location, so the active (default) location's
      // stock tab loads with zeroed pre-filled values — triggers the
      // implicit stock-add confirmation dialog on Save.
      const item = await createItem(
        {
          name: 'Butter',
          tagIds: [],
          packageUnit: 'block',
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 2,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
        },
        'loc-other',
      )

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${itemId}/stock`],
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

export const PackageItem: Story = {
  render: () => <PackageItemStory />,
}

export const MeasurementItem: Story = {
  render: () => <MeasurementItemStory />,
}

export const StockAddConfirmation: Story = {
  name: 'Not yet stocked here — Save confirmation dialog',
  render: () => <NotYetStockedHereStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const user = userEvent.setup()

    // Wait for the form to render, then edit a field so the Save button
    // becomes enabled (it's disabled while the form is clean).
    const packedInput = await canvas.findByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    // Click Save to open the implicit stock-add confirmation dialog.
    const saveButton = await canvas.findByRole('button', { name: /save/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
  },
}
