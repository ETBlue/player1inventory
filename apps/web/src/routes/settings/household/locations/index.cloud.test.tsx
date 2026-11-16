import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  CLOUD_LOCATIONS,
  cloudLocation,
  LOC_A,
  LOC_B,
} from '@/test/cloudFixtures'

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

type Role = 'organizer' | 'participant' | 'viewer' | null
type HouseholdRow = Omit<ReturnType<typeof cloudLocation>, 'myRole'> & {
  myRole: Role
  hasOrganizer: boolean
}

// The switcher's list (`GetLocations`): only locations with a role.
const mockLocations = vi.fn()
// The settings list (`GetHouseholdLocations`, households H5 task F.3). When a
// test sets none, it is the switcher's list with an organizer on every row,
// which is what an owner who organizes everything gets.
const mockHouseholdLocations = vi.fn<() => HouseholdRow[] | undefined>()
// The caller's household role (`GetHousehold`).
const mockHouseholdRole = vi.fn<() => string>()
const mockDeleteLocation = vi.fn()
const mockReorderLocations = vi.fn()

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
    useGetHouseholdLocationsQuery: () => ({
      ...emptyQuery,
      data: {
        householdLocations:
          mockHouseholdLocations() ??
          (mockLocations() as ReturnType<typeof cloudLocation>[]).map((l) => ({
            ...l,
            hasOrganizer: true,
          })),
      },
    }),
    useCreateLocationMutation: () => [vi.fn(), { loading: false }],
    useUpdateLocationMutation: () => [vi.fn(), { loading: false }],
    useDeleteLocationMutation: () => [mockDeleteLocation, { loading: false }],
    useReorderLocationsMutation: () => [
      mockReorderLocations,
      { loading: false },
    ],
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
    // The household sidebar heading reads the household name
    // (`HouseholdLabel`), and `usePermissions` reads the caller's role.
    useGetHouseholdQuery: () => ({
      ...emptyQuery,
      data: {
        household: {
          __typename: 'Household',
          id: 'hh-1',
          name: 'Home',
          role: mockHouseholdRole(),
        },
      },
    }),
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
const OFFLINE_MESSAGE = 'You are offline. Changes cannot be saved right now.'

describe('Settings locations page — cloud mode', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    mockHouseholdRole.mockReturnValue('owner')
    mockHouseholdLocations.mockReturnValue(undefined)
    mockReorderLocations.mockResolvedValue({ data: undefined })
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

  it('user deleting a location while offline sees only the offline message', async () => {
    // Given two locations, and no network. The mock does what
    // `offlineWriteLink` does: it shows its own toast, then rejects with
    // `OfflineWriteError`.
    mockLocations.mockReturnValue(CLOUD_LOCATIONS)
    mockDeleteLocation.mockImplementation(async () => {
      toast.error(OFFLINE_MESSAGE)
      throw new OfflineWriteError()
    })
    renderPage()

    // When the user deletes the second location
    await deleteLocationNamed('Cloud Garage')

    // Then the offline message is shown
    expect(await screen.findByText(OFFLINE_MESSAGE)).toBeInTheDocument()
    expect(mockDeleteLocation).toHaveBeenCalledTimes(1)
    // And the page adds no second, general toast for the same failure
    expect(screen.queryByText(GENERAL_MESSAGE)).not.toBeInTheDocument()
  })
})

// ── Households H5 task F.3: the settings list for every role ──
//
// Three locations and two lists. The SWITCHER list (`GetLocations`) holds only
// the locations where the caller has a role; the SETTINGS list
// (`GetHouseholdLocations`) holds every location an owner or manager may
// see. "Cloud Shed" is on the settings list only, with no role: a page that
// read the switcher's list would not show it at all.
const LOC_C = 'clw3loc0c0002s9f8h7g6d5e6'

function row(
  id: string,
  name: string,
  order: number,
  myRole: Role,
  hasOrganizer = true,
): HouseholdRow {
  return { ...cloudLocation(id, name, order), myRole, hasOrganizer }
}

describe('Settings locations page — cloud roles (households H5 task F.3)', () => {
  let queryClient: QueryClient
  let layout: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    mockHouseholdRole.mockReturnValue('owner')
    mockReorderLocations.mockResolvedValue({ data: undefined })
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
    layout?.mockRestore()
    layout = undefined
    vi.clearAllMocks()
  })

  /** Set both lists. `rows` is the settings list; the switcher gets the rows with a role. */
  function given(householdRole: string, rows: HouseholdRow[]) {
    mockHouseholdRole.mockReturnValue(householdRole)
    mockHouseholdLocations.mockReturnValue(rows)
    mockLocations.mockReturnValue(rows.filter((r) => r.myRole !== null))
  }

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

  /** The row of the settings list that shows `name`. */
  async function rowNamed(name: string) {
    const main = await screen.findByRole('main')
    const list = await within(main).findByRole('list')
    const found = within(list)
      .getAllByRole('listitem')
      .find((r) => within(r).queryByText(name) !== null)
    if (!found) throw new Error(`no row shows "${name}"`)
    return found
  }

  it('household manager sees a location they have no role on, marked No access', async () => {
    // Given a manager who is a viewer of the Kitchen and has no role on the
    // Shed, and a member (not the caller) who organizes the Shed
    given('manager', [
      row(LOC_A, 'Cloud Kitchen', 0, 'viewer'),
      row(LOC_C, 'Cloud Shed', 1, null),
    ])
    renderPage()

    // Then the Shed is on the list, marked No access
    const shed = await rowNamed('Cloud Shed')
    expect(within(shed).getByText('No access')).toBeInTheDocument()
    // And it is not a link into its data
    expect(within(shed).queryByRole('link')).not.toBeInTheDocument()
    // And the manager may delete and move it, but not rename it
    expect(
      within(shed).getByRole('button', { name: 'Delete Cloud Shed' }),
    ).toBeInTheDocument()
    expect(
      within(shed).getByRole('button', { name: 'Drag to reorder Cloud Shed' }),
    ).toBeInTheDocument()
    expect(
      within(shed).queryByRole('button', { name: 'Rename Cloud Shed' }),
    ).not.toBeInTheDocument()
    // And the Kitchen shows the manager's own role there
    const kitchen = await rowNamed('Cloud Kitchen')
    expect(within(kitchen).getByText('Viewer')).toBeInTheDocument()
  })

  it('household manager sees No organizer on a location without one', async () => {
    // Given the Shed's only organizer left the household
    given('manager', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null, false),
    ])
    renderPage()

    // Then the Shed says it has no organizer, and the Kitchen does not
    const shed = await rowNamed('Cloud Shed')
    expect(within(shed).getByText('No organizer')).toBeInTheDocument()
    const kitchen = await rowNamed('Cloud Kitchen')
    expect(within(kitchen).queryByText('No organizer')).not.toBeInTheDocument()
  })

  it('household member does not see Delete or drag handles', async () => {
    // Given a household member who organizes the Kitchen and helps in the
    // Garage. The server answers a member with only their own locations.
    given('member', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_B, 'Cloud Garage', 1, 'participant'),
    ])
    renderPage()

    // Then no row has Delete or a drag handle, the Kitchen included
    for (const name of ['Cloud Kitchen', 'Cloud Garage']) {
      const r = await rowNamed(name)
      expect(
        within(r).queryByRole('button', { name: `Delete ${name}` }),
      ).not.toBeInTheDocument()
      expect(
        within(r).queryByRole('button', { name: `Drag to reorder ${name}` }),
      ).not.toBeInTheDocument()
    }
  })

  it('household member sees their role on each row', async () => {
    given('member', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_B, 'Cloud Garage', 1, 'participant'),
    ])
    renderPage()

    expect(
      within(await rowNamed('Cloud Kitchen')).getByText('Organizer'),
    ).toBeInTheDocument()
    expect(
      within(await rowNamed('Cloud Garage')).getByText('Participant'),
    ).toBeInTheDocument()
  })

  it('location organizer who is a household member can rename that location and not the others', async () => {
    given('member', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_B, 'Cloud Garage', 1, 'participant'),
    ])
    renderPage()

    // Then Rename shows on the Kitchen (organizer) only
    expect(
      within(await rowNamed('Cloud Kitchen')).getByRole('button', {
        name: 'Rename Cloud Kitchen',
      }),
    ).toBeInTheDocument()
    expect(
      within(await rowNamed('Cloud Garage')).queryByRole('button', {
        name: 'Rename Cloud Garage',
      }),
    ).not.toBeInTheDocument()
  })

  it('user sees the role on each row', async () => {
    // Given an owner who organizes the Kitchen and has no role on the Shed
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
    ])
    renderPage()

    expect(
      within(await rowNamed('Cloud Kitchen')).getByText('Organizer'),
    ).toBeInTheDocument()
    expect(
      within(await rowNamed('Cloud Shed')).getByText('No access'),
    ).toBeInTheDocument()
  })

  it('household owner reorders every location of the household, the No access one included', async () => {
    // Given an owner with a role on the Kitchen and the Garage, and none on
    // the Shed between them
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
      row(LOC_B, 'Cloud Garage', 2, 'organizer'),
    ])
    // jsdom has no layout, so every row measures 0 x 0 and the keyboard
    // sensor finds nowhere to move. Give each row a 40px slot by its place
    // in the list, which is all dnd-kit's vertical strategy reads.
    layout = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    layout.mockImplementation(function (this: HTMLElement) {
      const item = this.closest('li')
      const index = item?.parentElement
        ? Array.from(item.parentElement.children).indexOf(item)
        : 0
      const top = index * 40
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        width: 300,
        height: 40,
        right: 300,
        bottom: top + 40,
        toJSON: () => ({}),
      } as DOMRect
    })
    renderPage()
    const user = userEvent.setup()

    // When the owner moves the Kitchen down one place with the keyboard
    const handle = within(await rowNamed('Cloud Kitchen')).getByRole('button', {
      name: 'Drag to reorder Cloud Kitchen',
    })
    handle.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')

    // Then the reorder sends all three ids, the Shed's too. The server
    // refuses a list that leaves one out (task F.2).
    expect(mockReorderLocations).toHaveBeenCalledWith({
      variables: { orderedIds: [LOC_C, LOC_A, LOC_B] },
    })
  })

  it('user sees no Delete while the household role is not known', async () => {
    // `usePermissions` gives no Delete while the household role is unknown
    // (here: the household answers with no role).
    given('owner', [row(LOC_A, 'Cloud Kitchen', 0, 'organizer')])
    mockHouseholdRole.mockReturnValue(undefined as unknown as string)
    renderPage()

    const kitchen = await rowNamed('Cloud Kitchen')
    expect(
      within(kitchen).queryByRole('button', { name: 'Delete Cloud Kitchen' }),
    ).not.toBeInTheDocument()
  })
})
