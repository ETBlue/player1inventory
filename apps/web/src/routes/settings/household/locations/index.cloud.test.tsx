import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { CLOUD_LOCATIONS, cloudLocation, LOC_A } from '@/test/cloudFixtures'

// The locations page in CLOUD mode (households task 3.12).
//
// A household has no default location. Every cloud row can be deleted, and the
// server refuses to delete the LAST one with the error code `LAST_LOCATION`
// (decision H13). Before this task the page called `deleteLocation.mutate`
// with no `onError`, so that refusal showed nothing at all.
//
// The delete goes through the REAL `useDeleteLocation` cloud branch; only the
// generated Apollo hook under it is replaced, so the rejection it returns is
// the one Apollo really produces: a `CombinedGraphQLErrors` with the code in
// `extensions`. The toast is the real one mounted by `__root.tsx`.

const emptyQuery = { data: undefined, loading: false, error: undefined }

const mockLocations = vi.fn()
const mockDeleteLocation = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    // This factory REPLACES the one in `src/test/setup.ts`, so every hook the
    // app shell calls on this page is stubbed here.
    useGetLocationsQuery: () => ({
      ...emptyQuery,
      data: { locations: mockLocations() },
    }),
    useCreateLocationMutation: () => [vi.fn(), { loading: false }],
    useUpdateLocationMutation: () => [vi.fn(), { loading: false }],
    useDeleteLocationMutation: () => [mockDeleteLocation, { loading: false }],
    useReorderLocationsMutation: () => [vi.fn(), { loading: false }],
    useBootstrapCartsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    usePantryDataQuery: () => ({
      ...emptyQuery,
      networkStatus: 7,
      refetch: vi.fn(),
    }),
    useGetTagsQuery: () => emptyQuery,
    useGetTagTypesQuery: () => emptyQuery,
    useGetVendorsQuery: () => emptyQuery,
  }
})

function serverRefusal(code: string, message: string) {
  return new CombinedGraphQLErrors({
    errors: [{ message, extensions: { code } }],
  })
}

const LAST_LOCATION_MESSAGE =
  'You cannot delete your last location. Add another location first.'
const GENERAL_MESSAGE = 'Could not delete this location. Please try again.'

describe('Settings locations page — cloud mode', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
    vi.clearAllMocks()
  })

  function renderPage() {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/settings/household/locations'],
      }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  async function deleteLocationNamed(name: string) {
    const user = userEvent.setup()
    // The desktop sidebar's LocationSwitcher also renders the active
    // location's name, so the lookup is scoped to <main>.
    const main = await screen.findByRole('main')
    await user.click(
      await within(main).findByRole('button', { name: `Delete ${name}` }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))
  }

  it('user cannot delete the last location in cloud mode and sees why', async () => {
    // Given a household with ONE location, which the server refuses to delete
    mockLocations.mockReturnValue([cloudLocation(LOC_A, 'Cloud Kitchen', 0)])
    mockDeleteLocation.mockRejectedValue(
      serverRefusal(
        'LAST_LOCATION',
        "The household's last location cannot be deleted.",
      ),
    )
    renderPage()

    // When the user deletes it (cloud shows Delete on every row, this one too)
    await deleteLocationNamed('Cloud Kitchen')

    // Then the page says why, in the app's own words
    expect(await screen.findByText(LAST_LOCATION_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(GENERAL_MESSAGE)).not.toBeInTheDocument()
    // And the delete really was sent for that location
    expect(mockDeleteLocation).toHaveBeenCalledWith({
      variables: { id: LOC_A },
    })
  })

  it('user sees a general message when a cloud delete fails for another reason', async () => {
    // Given two locations, and a server that refuses with FORBIDDEN (for
    // example, the user is not an organizer of that location)
    mockLocations.mockReturnValue(CLOUD_LOCATIONS)
    mockDeleteLocation.mockRejectedValue(
      serverRefusal('FORBIDDEN', 'Forbidden'),
    )
    renderPage()

    // When the user deletes the second location
    await deleteLocationNamed('Cloud Garage')

    // Then a general failure message is shown, not the last-location one
    expect(await screen.findByText(GENERAL_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(LAST_LOCATION_MESSAGE)).not.toBeInTheDocument()
  })
})
