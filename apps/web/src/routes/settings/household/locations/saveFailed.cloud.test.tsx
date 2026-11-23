import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { CLOUD_LOCATIONS, LOC_A } from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// A failed location save, in CLOUD mode
// (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md): Add and
// Rename on the locations page, and Add on the empty "no locations" screen
// (`NoLocationsGate`), which shows only in cloud mode. The delete and reorder
// refusals are in `index.cloud.test.tsx`.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVE_FAILED = 'Could not save the change. Please try again.'

describe('Locations - a failed cloud save', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemsQuery = { items: [] }
    cloudServer.queries.usePantryDataQuery = { items: [], itemStocks: [] }
    cloudServer.queries.useGetTagsQuery = { tags: [] }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useGetShelvesQuery = { shelves: [] }
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderAt(path: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  async function expectSaveFailedAndNoRejection() {
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  }

  it('user sees a message when the server refuses a new location, and the dialog keeps the name', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the new location
    cloudServer.failing.add('useCreateLocationMutation')
    renderAt('/settings/household/locations')

    // When the user adds a location named "Office"
    await user.click(
      await screen.findByRole('button', { name: /add location/i }),
    )
    await user.type(await screen.findByLabelText('Name'), 'Office')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    // Then the write was sent, a message shows, and the dialog stays open
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useCreateLocationMutation).toEqual([
      { name: 'Office' },
    ])
    expect(screen.getByLabelText('Name')).toHaveValue('Office')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^add$/i })).toBeEnabled(),
    )
  })

  it('user sees a message when the server refuses a location rename, and the dialog keeps the name', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the rename
    cloudServer.failing.add('useUpdateLocationMutation')
    renderAt('/settings/household/locations')

    // When the user renames Cloud Garage to "Studio"
    const main = await screen.findByRole('main')
    await user.click(
      await within(main).findByRole('button', { name: /rename cloud garage/i }),
    )
    const input = await screen.findByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'Studio')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the write was sent, a message shows, and the dialog keeps the name
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useUpdateLocationMutation).toHaveLength(1)
    expect(screen.getByLabelText('Name')).toHaveValue('Studio')
  })

  it('user sees a message when the server refuses a location made from the empty screen', async () => {
    const user = userEvent.setup()
    // Given a household with no location, and a server that refuses the new one
    seedCloudHousehold([])
    cloudServer.failing.add('useCreateLocationMutation')
    renderAt('/')

    // When the user presses Create a location and adds "Kitchen"
    const main = await screen.findByRole('main')
    await user.click(
      await within(main).findByRole('button', { name: 'Create a location' }),
    )
    await user.type(await screen.findByLabelText('Name'), 'Kitchen')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    // Then the write was sent, a message shows, and the dialog keeps the name
    // with Add enabled again
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useCreateLocationMutation).toEqual([
      { name: 'Kitchen' },
    ])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Kitchen')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^add$/i })).toBeEnabled(),
    )
  })
})
