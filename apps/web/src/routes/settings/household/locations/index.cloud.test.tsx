import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
// A household has no default location. Every cloud row can be deleted. Until
// households H5 task F.7 the server refused to delete the LAST one with the
// error code `LAST_LOCATION` (decision H13), and the page had its own message
// for it. F.7 lifted that rule: the last location can go, and the page has no
// special message any more. Before task 3.12 the page called
// `deleteLocation.mutate` with no `onError`, so a refusal showed nothing.
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
// `true` while the settings list has not answered yet (first visit).
const mockHouseholdLocationsLoading = vi.fn<() => boolean>()
// The Apollo client the reorder mutation hands back. A refused reorder
// reloads the location lists through it.
const mockRefetchQueries = vi.fn()
// The caller's saved sort (`myLocationSort`, households H7b task M.4), and
// the write that saves a new one.
const mockMyLocationSort = vi.fn<() => string | undefined>()
const mockSetLocationSort = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    // The ownership offer banner in `__root.tsx` (households H6b, task K.6)
    // calls these in cloud mode. This factory replaces `src/test/setup.ts`'s,
    // so they are stubbed here too: the real hooks need an ApolloProvider.
    useMyOwnershipOffersQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: () => Promise.resolve(),
    }),
    useAcceptOwnershipOfferMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeclineOwnershipOfferMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDismissOwnershipOfferMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // **Switch to…** in the household sidebar (households H7 task L.4)
    // calls these in cloud mode. Stubbed for the same reason.
    useMyHouseholdsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useSetActiveHouseholdMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useCreateHouseholdMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // `useItems` reads the catalog from `GetItems` in a household with no
    // location (households H5, review of task F.7). This factory replaces
    // setup.ts's, so it must stub that hook too: the real one needs an
    // ApolloProvider even when skipped.
    useGetItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
      networkStatus: 7,
      refetch: () => Promise.resolve(),
    }),
    // This factory REPLACES the one in `src/test/setup.ts`, so every hook the
    // app shell calls on this page is stubbed here.
    useGetLocationsQuery: () => ({
      ...emptyQuery,
      data: { locations: mockLocations() },
    }),
    useGetHouseholdLocationsQuery: () =>
      mockHouseholdLocationsLoading()
        ? { ...emptyQuery, loading: true }
        : {
            ...emptyQuery,
            data: {
              householdLocations:
                mockHouseholdLocations() ??
                (mockLocations() as ReturnType<typeof cloudLocation>[]).map(
                  (l) => ({
                    ...l,
                    hasOrganizer: true,
                  }),
                ),
            },
          },
    // The people page (households H5c task H.5), which a click on a
    // location's name opens (task H.6). It only needs to mount: the people
    // stay loading.
    useLocationPeopleQuery: () => ({
      ...emptyQuery,
      loading: true,
      refetch: () => Promise.resolve(),
    }),
    useHouseholdMembersQuery: () => ({
      ...emptyQuery,
      refetch: () => Promise.resolve(),
    }),
    useSetLocationRoleMutation: () => [vi.fn(), { loading: false }],
    useRemoveLocationRoleMutation: () => [vi.fn(), { loading: false }],
    useLeaveLocationMutation: () => [vi.fn(), { loading: false }],
    useCreateLocationMutation: () => [vi.fn(), { loading: false }],
    useUpdateLocationMutation: () => [vi.fn(), { loading: false }],
    useDeleteLocationMutation: () => [mockDeleteLocation, { loading: false }],
    useReorderLocationsMutation: () => [
      mockReorderLocations,
      { loading: false, client: { refetchQueries: mockRefetchQueries } },
    ],
    useBootstrapCartsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // Households H7b task M.4: the sort and the visit.
    useMyLocationSortQuery: () => {
      const sort = mockMyLocationSort()
      return {
        ...emptyQuery,
        data: sort ? { myLocationSort: sort } : undefined,
      }
    },
    useSetLocationSortMutation: () => [mockSetLocationSort, {}],
    useMarkLocationVisitedMutation: () => [
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
          hasOwner: true,
          pendingTransfer: null,
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

const GENERAL_MESSAGE = 'Could not delete this location. Please try again.'
const OFFLINE_MESSAGE = 'You are offline. Changes cannot be saved right now.'
const REORDER_MESSAGE =
  'The location list changed. Reloading it now. Try again.'
const REORDER_FAILED_MESSAGE = 'Could not save the new order. Please try again.'

describe('Settings locations page — cloud mode', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    mockHouseholdRole.mockReturnValue('owner')
    mockHouseholdLocations.mockReturnValue(undefined)
    mockHouseholdLocationsLoading.mockReturnValue(false)
    mockMyLocationSort.mockReturnValue(undefined)
    mockRefetchQueries.mockResolvedValue([])
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

  it('user can delete the last location in cloud mode', async () => {
    // Given a household with ONE location (H5 task F.7: the server allows it)
    mockLocations.mockReturnValue([cloudLocation(LOC_A, 'Cloud Kitchen', 0)])
    mockDeleteLocation.mockResolvedValue({ data: { deleteLocation: true } })
    renderPage()

    // When the user deletes it (cloud shows Delete on every row, this one too)
    await deleteLocationNamed('Cloud Kitchen')

    // Then the delete is sent for that location
    await waitFor(() =>
      expect(mockDeleteLocation).toHaveBeenCalledWith({
        variables: { id: LOC_A },
      }),
    )
  })

  it('user sees the general message when an older server still refuses the last location', async () => {
    // Given a server from before H5 task F.7, which still answers
    // LAST_LOCATION. The web no longer has its own text for that code, so
    // this deploy window shows the general message.
    mockLocations.mockReturnValue([cloudLocation(LOC_A, 'Cloud Kitchen', 0)])
    mockDeleteLocation.mockRejectedValue(
      serverRefusal(
        'LAST_LOCATION',
        "The household's last location cannot be deleted.",
      ),
    )
    renderPage()

    await deleteLocationNamed('Cloud Kitchen')

    expect(await screen.findByText(GENERAL_MESSAGE)).toBeInTheDocument()
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

    // Then a general failure message is shown
    expect(await screen.findByText(GENERAL_MESSAGE)).toBeInTheDocument()
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
    mockHouseholdLocationsLoading.mockReturnValue(false)
    mockMyLocationSort.mockReturnValue(undefined)
    mockRefetchQueries.mockResolvedValue([])
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
    return router
  }

  // jsdom has no layout, so every row measures 0 x 0 and the keyboard sensor
  // finds nowhere to move. Give each row a 40px slot by its place in the
  // list, which is all dnd-kit's vertical strategy reads.
  function stubRowLayout() {
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
  }

  /** Move the row `name` down one place with the keyboard. */
  async function moveDownOne(name: string) {
    const user = userEvent.setup()
    const handle = within(await rowNamed(name)).getByRole('button', {
      name: `Drag to reorder ${name}`,
    })
    handle.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')
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
    // And its name links to the Shed's people page (households H5c task
    // H.6, owner decision O24-A), where the manager sees names and roles,
    // never the Shed's stock, carts or logs
    expect(
      within(shed).getByRole('link', { name: 'Open Cloud Shed' }),
    ).toHaveAttribute('href', `/settings/household/locations/${LOC_C}`)
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

  it('household member does not see Delete, and can drag their own order', async () => {
    // Given a household member who organizes the Kitchen and helps in the
    // Garage. The server answers a member with only their own locations.
    // Since households H7b the order is personal (decision T78), so a member
    // may reorder their own list.
    given('member', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_B, 'Cloud Garage', 1, 'participant'),
    ])
    stubRowLayout()
    renderPage()

    // Then no row has Delete, and every row has a drag handle
    for (const name of ['Cloud Kitchen', 'Cloud Garage']) {
      const r = await rowNamed(name)
      expect(
        within(r).queryByRole('button', { name: `Delete ${name}` }),
      ).not.toBeInTheDocument()
      expect(
        within(r).getByRole('button', { name: `Drag to reorder ${name}` }),
      ).toBeInTheDocument()
    }

    // When the member moves the Kitchen down one place
    await moveDownOne('Cloud Kitchen')

    // Then their own list is sent in the new order
    await waitFor(() =>
      expect(mockReorderLocations).toHaveBeenCalledWith({
        variables: { orderedIds: [LOC_B, LOC_A] },
      }),
    )
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

  it('household member sees a link only on the locations they have a role on', async () => {
    // Given a household member who organizes the Kitchen and helps in the
    // Garage. The Shed, where they have no role, is in the list too: the
    // server never sends it to a member, but it is the row that shows
    // whether the page reads the member's role or links every row.
    given('member', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_B, 'Cloud Garage', 1, 'participant'),
      row(LOC_C, 'Cloud Shed', 2, null),
    ])
    renderPage()

    // Then the Kitchen and the Garage link to their people pages
    for (const [id, name] of [
      [LOC_A, 'Cloud Kitchen'],
      [LOC_B, 'Cloud Garage'],
    ] as const) {
      expect(
        within(await rowNamed(name)).getByRole('link', {
          name: `Open ${name}`,
        }),
      ).toHaveAttribute('href', `/settings/household/locations/${id}`)
    }
    // And the Shed is not a link: the member may not open its page (O24-A)
    expect(
      within(await rowNamed('Cloud Shed')).queryByRole('link'),
    ).not.toBeInTheDocument()
  })

  it('user can open the people page of a location from its name', async () => {
    // Given an owner who organizes the Kitchen
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
    ])
    const router = renderPage()

    // When the owner clicks the Shed's name, a No access row
    const user = userEvent.setup()
    await user.click(
      within(await rowNamed('Cloud Shed')).getByRole('link', {
        name: 'Open Cloud Shed',
      }),
    )

    // Then the app goes to the Shed's people page, and no drag started:
    // nothing was reordered
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/settings/household/locations/${LOC_C}`,
      ),
    )
    expect(
      await screen.findByRole('link', { name: 'Back to locations' }),
    ).toBeInTheDocument()
    expect(mockReorderLocations).not.toHaveBeenCalled()
  })

  it('user can open the people page with the keyboard, and the keys start no drag', async () => {
    // Given an owner, so every row has a drag handle AND a name link. The
    // drag listeners belong on the handle only. dnd-kit's KeyboardSensor
    // starts a drag on Space or Enter on whatever element carries them, so
    // this test fails if the link gets them too. A mouse click cannot show
    // it: the PointerSensor waits for an 8 px move.
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
    ])
    const router = renderPage()
    const main = await screen.findByRole('main')
    const link = within(await rowNamed('Cloud Kitchen')).getByRole('link', {
      name: 'Open Cloud Kitchen',
    })
    const user = userEvent.setup()

    // When the user focuses the name and presses Space
    link.focus()
    await user.keyboard(' ')

    // Then no drag started: the name shows once, with no drag overlay copy
    expect(within(main).getAllByText('Cloud Kitchen')).toHaveLength(1)

    // When the user presses Enter on the name
    await user.keyboard('{Enter}')

    // Then the app goes to the Kitchen's people page, and nothing was
    // reordered
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/settings/household/locations/${LOC_A}`,
      ),
    )
    expect(
      await screen.findByRole('link', { name: 'Back to locations' }),
    ).toBeInTheDocument()
    expect(mockReorderLocations).not.toHaveBeenCalled()
  })

  it('household owner reorders every location of the household, the No access one included', async () => {
    // Given an owner with a role on the Kitchen and the Garage, and none on
    // the Shed between them
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
      row(LOC_B, 'Cloud Garage', 2, 'organizer'),
    ])
    stubRowLayout()
    renderPage()
    // The names are links (households H5c task H.6). The drag handle is a
    // separate button, so the link must not get in the way of a reorder.
    expect(
      within(await rowNamed('Cloud Kitchen')).getByRole('link', {
        name: 'Open Cloud Kitchen',
      }),
    ).toBeInTheDocument()

    // When the owner moves the Kitchen down one place with the keyboard
    await moveDownOne('Cloud Kitchen')

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

  it('household owner sees why a refused reorder went back, and both location lists reload', async () => {
    // Given an owner who organizes the Kitchen, is a viewer of the Garage
    // and has no role on the Shed. Another member deleted a location in the
    // meantime, so the server refuses the list this tab sends (task F.2).
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
      row(LOC_B, 'Cloud Garage', 2, 'viewer'),
    ])
    mockReorderLocations.mockRejectedValue(
      serverRefusal('BAD_USER_INPUT', 'Send every location of the household.'),
    )
    stubRowLayout()
    renderPage()

    // When the owner moves the Kitchen down one place
    await moveDownOne('Cloud Kitchen')

    // Then the page says the list changed and was reloaded
    expect(await screen.findByText(REORDER_MESSAGE)).toBeInTheDocument()
    expect(mockReorderLocations).toHaveBeenCalledWith({
      variables: { orderedIds: [LOC_C, LOC_A, LOC_B] },
    })
    // And both location lists are fetched again, by name, and nothing else
    expect(mockRefetchQueries.mock.calls).toEqual([
      [{ include: ['GetHouseholdLocations', 'GetLocations'] }],
    ])
    // And it is not the general message
    expect(screen.queryByText(REORDER_FAILED_MESSAGE)).not.toBeInTheDocument()
  })

  it('household member whose manager role was taken away is told the list changed, and the lists and the role reload', async () => {
    // Given a person the page still believes is a manager. Their role was
    // lowered in another tab, so the "No access" Shed is not in their own
    // list any more and the server refuses with FORBIDDEN (households H7b:
    // every role may reorder, so FORBIDDEN means an out-of-date list).
    given('manager', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
      row(LOC_B, 'Cloud Garage', 2, 'viewer'),
    ])
    mockReorderLocations.mockRejectedValue(
      serverRefusal('FORBIDDEN', 'Not allowed.'),
    )
    stubRowLayout()
    renderPage()

    // When they move the Kitchen down one place
    await moveDownOne('Cloud Kitchen')

    // Then the page says the list changed, not the general message
    expect(await screen.findByText(REORDER_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(REORDER_FAILED_MESSAGE)).not.toBeInTheDocument()
    // And both lists and the household role are fetched again
    expect(mockRefetchQueries.mock.calls).toEqual([
      [{ include: ['GetHouseholdLocations', 'GetLocations', 'GetHousehold'] }],
    ])
  })

  it('household owner whose reorder fails with a network error sees a general message, and nothing reloads', async () => {
    // Given an owner, with a viewer row and a No access row, and a server
    // that cannot be reached
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
      row(LOC_B, 'Cloud Garage', 2, 'viewer'),
    ])
    mockReorderLocations.mockRejectedValue(new Error('Failed to fetch'))
    stubRowLayout()
    renderPage()

    // When the owner moves the Kitchen down one place
    await moveDownOne('Cloud Kitchen')

    // Then the general message shows, and nothing is fetched again
    expect(await screen.findByText(REORDER_FAILED_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(REORDER_MESSAGE)).not.toBeInTheDocument()
    expect(mockRefetchQueries).not.toHaveBeenCalled()
  })

  it('household owner reordering while offline sees only the offline message', async () => {
    // Given no network. The mock does what `offlineWriteLink` does: it shows
    // its own toast, then rejects with `OfflineWriteError`.
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
      row(LOC_B, 'Cloud Garage', 2, 'viewer'),
    ])
    mockReorderLocations.mockImplementation(async () => {
      toast.error(OFFLINE_MESSAGE)
      throw new OfflineWriteError()
    })
    stubRowLayout()
    renderPage()

    // When the owner moves the Kitchen down one place
    await moveDownOne('Cloud Kitchen')

    // Then the offline message is shown
    expect(await screen.findByText(OFFLINE_MESSAGE)).toBeInTheDocument()
    expect(mockReorderLocations).toHaveBeenCalledTimes(1)
    // And the page adds no second toast, and nothing is fetched again
    expect(screen.queryByText(REORDER_MESSAGE)).not.toBeInTheDocument()
    expect(screen.queryByText(REORDER_FAILED_MESSAGE)).not.toBeInTheDocument()
    expect(mockRefetchQueries).not.toHaveBeenCalled()
  })

  it('user who leaves the page before a reorder is refused sees no message about it', async () => {
    // Given an owner whose reorder answer is still on its way
    given('owner', [
      row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      row(LOC_C, 'Cloud Shed', 1, null),
      row(LOC_B, 'Cloud Garage', 2, 'viewer'),
    ])
    let refuse: (err: unknown) => void = () => {}
    mockReorderLocations.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject
        }),
    )
    stubRowLayout()
    const router = renderPage()
    await moveDownOne('Cloud Kitchen')
    expect(mockReorderLocations).toHaveBeenCalledTimes(1)

    // When the user goes to another settings page, and only then the server
    // refuses the list
    await act(async () => {
      await router.navigate({ to: '/settings' })
    })
    expect(router.state.location.pathname).toBe('/settings')
    await act(async () => {
      refuse(
        serverRefusal(
          'BAD_USER_INPUT',
          'Send every location of the household.',
        ),
      )
    })

    // Then the lists still reload (another page may show them)
    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: ['GetHouseholdLocations', 'GetLocations'],
    })
    // But no toast at all talks about a list the user is no longer looking
    // at. Counted by sonner's own attribute, so the test does not depend on
    // the wording.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0)
  })

  it('user sees no empty state while the cloud locations list is loading', async () => {
    // Given a member on a first visit: the settings list has not answered
    given('member', [row(LOC_A, 'Cloud Kitchen', 0, 'viewer')])
    mockHouseholdLocationsLoading.mockReturnValue(true)
    renderPage()

    // Then the page is shown (its title is there)
    const main = await screen.findByRole('main')
    expect(
      await within(main).findByRole('heading', { name: 'Locations' }),
    ).toBeInTheDocument()
    // But it does not say "No locations yet" while it waits
    expect(within(main).queryByText('No locations yet')).not.toBeInTheDocument()
  })

  it('user sees the empty state once the cloud list answers with no location', async () => {
    // A control for the test above: the same page with an empty answer
    // does show the empty state, so its absence above means something.
    given('member', [])
    renderPage()

    const main = await screen.findByRole('main')
    expect(
      await within(main).findByText('No locations yet'),
    ).toBeInTheDocument()
  })

  // ── Households H7b task M.4: Sort by ──
  //
  // The shared order is Kitchen, Shed, Garage. Each sort gives another
  // order, so a page that ignored the sort could not pass:
  //   name        → Garage, Kitchen, Shed
  //   lastUpdated → Shed, Garage, Kitchen (Kitchen has no date)
  //   custom      → Kitchen, Shed, Garage
  const SORT_ROWS = () => [
    {
      ...row(LOC_A, 'Cloud Kitchen', 0, 'organizer'),
      dataUpdatedAt: null,
    },
    {
      ...row(LOC_C, 'Cloud Shed', 1, null),
      dataUpdatedAt: '2026-03-01T00:00:00.000Z',
    },
    {
      ...row(LOC_B, 'Cloud Garage', 2, 'viewer'),
      dataUpdatedAt: '2026-02-01T00:00:00.000Z',
    },
  ]

  /** The names of the settings list, top to bottom. */
  async function listedNames() {
    const main = await screen.findByRole('main')
    const list = await within(main).findByRole('list')
    return within(list)
      .getAllByRole('listitem')
      .map(
        (r) =>
          ['Cloud Kitchen', 'Cloud Shed', 'Cloud Garage'].find(
            (n) => within(r).queryByText(n) !== null,
          ) ?? '?',
      )
  }

  it('user sees Sort by with four choices, the current one from their saved sort', async () => {
    // Given an owner whose saved sort is Name
    given('owner', SORT_ROWS())
    mockMyLocationSort.mockReturnValue('name')
    renderPage()

    // Then the control shows Name
    const control = await screen.findByRole('combobox', { name: 'Sort by' })
    expect(control).toHaveTextContent('Name')

    // And opening it offers the four sorts
    await userEvent.setup().click(control)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Custom',
      'Name',
      'Last updated',
      'Last visited',
    ])
  })

  it('user with no saved sort sees Custom, the shared order, with drag handles', async () => {
    // Given an owner who never chose a sort (owner decision O52-A)
    given('owner', SORT_ROWS())
    mockMyLocationSort.mockReturnValue(undefined)
    renderPage()

    expect(
      await screen.findByRole('combobox', { name: 'Sort by' }),
    ).toHaveTextContent('Custom')
    expect(await listedNames()).toEqual([
      'Cloud Kitchen',
      'Cloud Shed',
      'Cloud Garage',
    ])
    expect(
      within(await rowNamed('Cloud Shed')).getByRole('button', {
        name: 'Drag to reorder Cloud Shed',
      }),
    ).toBeInTheDocument()
  })

  it('user sees the list by name, with no drag handles, under the Name sort', async () => {
    // Given an owner whose saved sort is Name
    given('owner', SORT_ROWS())
    mockMyLocationSort.mockReturnValue('name')
    renderPage()

    // Then the list is by name
    await waitFor(async () =>
      expect(await listedNames()).toEqual([
        'Cloud Garage',
        'Cloud Kitchen',
        'Cloud Shed',
      ]),
    )
    // And no row can be dragged: a drag would save an order nobody sees
    for (const name of ['Cloud Kitchen', 'Cloud Shed', 'Cloud Garage']) {
      expect(
        within(await rowNamed(name)).queryByRole('button', {
          name: `Drag to reorder ${name}`,
        }),
      ).not.toBeInTheDocument()
    }
  })

  it('user sees the location changed last first under Last updated', async () => {
    given('owner', SORT_ROWS())
    mockMyLocationSort.mockReturnValue('lastUpdated')
    renderPage()

    await waitFor(async () =>
      expect(await listedNames()).toEqual([
        'Cloud Shed',
        'Cloud Garage',
        'Cloud Kitchen',
      ]),
    )
  })

  it('user changing the sort saves it on the server, with an answer shown at once', async () => {
    // Given an owner on Custom
    given('owner', SORT_ROWS())
    mockMyLocationSort.mockReturnValue('custom')
    mockSetLocationSort.mockResolvedValue({
      data: { setLocationSort: 'lastVisited' },
    })
    renderPage()
    const user = userEvent.setup()

    // When they pick Last visited
    await user.click(await screen.findByRole('combobox', { name: 'Sort by' }))
    await user.click(screen.getByRole('option', { name: 'Last visited' }))

    // Then the choice is sent, with an optimistic answer so the lists
    // re-sort before the server answers
    await waitFor(() =>
      expect(mockSetLocationSort).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { sort: 'lastVisited' },
          optimisticResponse: { setLocationSort: 'lastVisited' },
        }),
      ),
    )
  })
})
