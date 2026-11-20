import { ApolloClient, ApolloLink } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { MockLink } from '@apollo/client/testing'
import type { MockedProviderProps } from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  BootstrapCartsDocument,
  GetHouseholdDocument,
  GetHouseholdLocationsDocument,
  GetLocationsDocument,
  HouseholdMembersDocument,
  type HouseholdRole,
  LeaveLocationDocument,
  LocationPeopleDocument,
  type LocationRole,
  RemoveAllLocationItemsDocument,
  RemoveLocationRoleDocument,
  SetLocationRoleDocument,
} from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import {
  cloudRoleBaseMocks,
  cloudRoleStorySetup,
  ROLE_STORY_LOCATION,
} from '@/test/cloudRoleStory'

// The people page of one location (households H5c, task H.5), in cloud
// mode, on the REAL route tree, with the real generated hooks, the REAL
// `usePermissions` and `MockedProvider` answering. The caller's household
// role reaches the page through `GetHousehold` and their location roles
// through `GetLocations` (`myRole`), the way they do in the app. A page test
// through `permissionsFor` could not tell `canManageLocations` from
// `canEditCatalog` (the H5b G.9 pattern).
//
// The fake server keeps one people list per location. Every fixture has
// people of all three location roles, a second organizer, and a location the
// caller has no role on, so a rule that reads the wrong role shows a control
// where it must not.

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const KITCHEN = ROLE_STORY_LOCATION
const GARAGE = 'loc-garage'
const LOCATION_NAMES: Record<string, string> = {
  [KITCHEN]: 'my Kitchen',
  [GARAGE]: 'Garage',
}

// The household. Ola, Oz, Pia, Vic and Max are household members; Olive is
// the owner, Mona a manager. Max has no location role anywhere.
const HOUSEHOLD: {
  userId: string
  displayName: string
  role: HouseholdRole
}[] = [
  { userId: 'u-olive', displayName: 'Olive', role: 'owner' },
  { userId: 'u-mona', displayName: 'Mona', role: 'manager' },
  { userId: 'u-ola', displayName: 'Ola', role: 'member' },
  { userId: 'u-oz', displayName: 'oz Lin', role: 'member' },
  { userId: 'u-pia', displayName: 'Pia', role: 'member' },
  { userId: 'u-vic', displayName: 'vic', role: 'member' },
  { userId: 'u-max', displayName: 'Max', role: 'member' },
]

interface Server {
  me: string
  /** Location id -> userId -> role. */
  roles: Record<string, Record<string, LocationRole>>
  /** When set, the next `LocationPeople` reads answer this error. */
  peopleFail?: 'DOWN' | undefined
  /** When set, `SetLocationRole` is refused with this code. */
  setFails?: string | undefined
  /** Milliseconds `SetLocationRole` waits before it answers. */
  setDelay?: number | undefined
  /** When set, `HouseholdMembers` answers an error. */
  membersFail?: boolean | undefined
  setCalls: Record<string, unknown>[]
  removeCalls: Record<string, unknown>[]
  leaveCalls: Record<string, unknown>[]
  /** `RemoveAllLocationItems` calls (households H6, task J.7). */
  removeAllCalls: Record<string, unknown>[]
  peopleCalls: number
}

let server: Server
let ops: { name: string; variables: Record<string, unknown> }[]

const myHouseholdRole = () =>
  HOUSEHOLD.find((p) => p.userId === server.me)?.role ?? 'member'
const nameOf = (userId: string) =>
  HOUSEHOLD.find((p) => p.userId === userId)?.displayName ?? userId
const RANK: Record<LocationRole, number> = {
  organizer: 0,
  participant: 1,
  viewer: 2,
}

/** Like the server: organizers first, then by name (decision T39). */
function peopleOf(locationId: string) {
  return Object.entries(server.roles[locationId] ?? {})
    .map(([userId, role]) => ({
      __typename: 'LocationPerson' as const,
      userId,
      displayName: nameOf(userId),
      role,
      isMe: userId === server.me,
    }))
    .sort(
      (a, b) =>
        RANK[a.role] - RANK[b.role] || (a.displayName < b.displayName ? -1 : 1),
    )
}

function locationRow(id: string, order: number) {
  const roles = server.roles[id] ?? {}
  return {
    __typename: 'Location' as const,
    id,
    name: LOCATION_NAMES[id] ?? id,
    order,
    myRole: roles[server.me] ?? null,
    hasOrganizer: Object.values(roles).includes('organizer'),
  }
}

const forbidden = {
  errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
}

function dynamicMocks(): NonNullable<MockedProviderProps['mocks']> {
  const ids = [KITCHEN, GARAGE]
  return [
    {
      request: { query: GetHouseholdDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => ({
        data: {
          household: {
            __typename: 'Household',
            id: 'household-role-story',
            name: 'The Lin home',
            role: myHouseholdRole(),
          },
        },
      }),
    },
    {
      request: { query: GetLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => ({
        data: {
          locations: ids
            .map((id, order) => locationRow(id, order))
            .filter((l) => l.myRole !== null)
            .map(({ hasOrganizer: _, ...l }) => ({
              ...l,
              createdAt: '2026-11-01T00:00:00.000Z',
              updatedAt: '2026-11-01T00:00:00.000Z',
            })),
        },
      }),
    },
    {
      request: { query: GetHouseholdLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        const all = ids.map((id, order) => locationRow(id, order))
        const manages = myHouseholdRole() !== 'member'
        return {
          data: {
            householdLocations: manages
              ? all
              : all.filter((l) => l.myRole !== null),
          },
        }
      },
    },
    {
      request: {
        query: LocationPeopleDocument,
        variables: () => true,
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: (variables: Record<string, unknown>) => {
        server.peopleCalls += 1
        const locationId = variables.locationId as string
        if (server.peopleFail === 'DOWN') {
          return {
            errors: [
              {
                message: 'down',
                extensions: { code: 'INTERNAL_SERVER_ERROR' },
              },
            ],
          }
        }
        const mine = server.roles[locationId]?.[server.me]
        if (!(locationId in server.roles)) return forbidden
        if (myHouseholdRole() === 'member' && !mine) return forbidden
        return { data: { locationPeople: peopleOf(locationId) } }
      },
    },
    {
      request: { query: HouseholdMembersDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () =>
        server.membersFail
          ? {
              errors: [
                {
                  message: 'down',
                  extensions: { code: 'INTERNAL_SERVER_ERROR' },
                },
              ],
            }
          : {
              data: {
                householdMembers: HOUSEHOLD.map((p) => ({
                  __typename: 'HouseholdPerson',
                  ...p,
                  joinedAt: '2026-11-01T00:00:00.000Z',
                  isMe: p.userId === server.me,
                  hasLocationRole: Object.values(server.roles).some(
                    (r) => p.userId in r,
                  ),
                })),
              },
            },
    },
    // The active location's carts (`ActiveLocationProvider`). Not this
    // page's data; answered so the console stays quiet.
    {
      request: { query: BootstrapCartsDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: { data: { bootstrapCarts: [] } },
    },
    {
      request: { query: SetLocationRoleDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      delay: () => server.setDelay ?? 0,
      result: (variables: Record<string, unknown>) => {
        server.setCalls.push(variables)
        if (server.setFails)
          return {
            errors: [{ message: 'no', extensions: { code: server.setFails } }],
          }
        const { locationId, userId, role } = variables as {
          locationId: string
          userId: string
          role: LocationRole
        }
        server.roles[locationId] = {
          ...server.roles[locationId],
          [userId]: role,
        }
        return {
          data: {
            setLocationRole: {
              __typename: 'LocationPerson',
              userId,
              displayName: nameOf(userId),
              role,
              isMe: userId === server.me,
            },
          },
        }
      },
    },
    {
      request: { query: RemoveLocationRoleDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      delay: 100,
      result: (variables: Record<string, unknown>) => {
        server.removeCalls.push(variables)
        const { locationId, userId } = variables as {
          locationId: string
          userId: string
        }
        const had = !!server.roles[locationId]?.[userId]
        const next = { ...server.roles[locationId] }
        delete next[userId]
        server.roles[locationId] = next
        return { data: { removeLocationRole: had } }
      },
    },
    {
      request: {
        query: RemoveAllLocationItemsDocument,
        variables: () => true,
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
      delay: 100,
      result: (variables: Record<string, unknown>) => {
        server.removeAllCalls.push(variables)
        return { data: { removeAllLocationItems: true } }
      },
    },
    {
      request: { query: LeaveLocationDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      delay: 100,
      result: (variables: Record<string, unknown>) => {
        server.leaveCalls.push(variables)
        const { locationId } = variables as { locationId: string }
        const had = !!server.roles[locationId]?.[server.me]
        const next = { ...server.roles[locationId] }
        delete next[server.me]
        server.roles[locationId] = next
        return { data: { leaveLocation: had } }
      },
    },
  ]
}

function renderPage(locationId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/household/locations/${locationId}`],
    }),
    context: { queryClient },
  })
  // The base mocks without GetHousehold and GetLocations: this file answers
  // both itself, from the fake server.
  const base = cloudRoleBaseMocks('member').filter(
    (m) =>
      m.request.query !== GetHouseholdDocument &&
      m.request.query !== GetLocationsDocument,
  )
  // Every operation the page sends, with its variables (Review Focus 4)
  const spy = new ApolloLink((operation, forward) => {
    ops.push({
      name: operation.operationName ?? '',
      variables: operation.variables as Record<string, unknown>,
    })
    return forward(operation)
  })
  const link = ApolloLink.from([
    spy,
    new MockLink([...dynamicMocks(), ...base], {
      defaultOptions: { delay: 0 },
    }),
  ])
  // Our own client, not MockedProvider's, so a test can read every active
  // ACTIVE query again, the way a live LOCATION event does.
  const client = new ApolloClient({ cache: createCache(), link })
  render(
    <ApolloProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>,
  )
  return Object.assign(router, { apolloClient: client })
}

async function main() {
  return await screen.findByRole('main')
}

/** The list item of a person, found by their name. */
async function rowOf(name: string) {
  const title = await within(await main()).findByText(name)
  const row = title.closest('li')
  if (!row) throw new Error(`no list row for ${name}`)
  return row as HTMLElement
}

// Kitchen: two organizers (Ola, Oz), a participant (Pia), a viewer (Vic).
// Garage: Pia as participant only, so it has NO organizer.
function standardRoles(): Server['roles'] {
  return {
    [KITCHEN]: {
      'u-ola': 'organizer',
      'u-oz': 'organizer',
      'u-pia': 'participant',
      'u-vic': 'viewer',
    },
    [GARAGE]: { 'u-pia': 'participant' },
  }
}

beforeEach(() => {
  cloudRoleStorySetup()
  ops = []
  server = {
    me: 'u-pia',
    roles: standardRoles(),
    setCalls: [],
    removeCalls: [],
    leaveCalls: [],
    removeAllCalls: [],
    peopleCalls: 0,
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('location people page — who sees what', () => {
  it('user sees the people of a location and their roles', async () => {
    // Given Pia, a participant of the Kitchen
    renderPage(KITCHEN)

    // Then the heading is the location name, as stored
    expect(
      await within(await main()).findByRole('heading', {
        level: 1,
        name: 'my Kitchen',
      }),
    ).toBeInTheDocument()
    // And every person shows with their role, in the server's order
    expect(await rowOf('Ola')).toHaveTextContent('Organizer')
    expect(await rowOf('oz Lin')).toHaveTextContent('Organizer')
    expect(await rowOf('Pia')).toHaveTextContent('Participant')
    expect(await rowOf('Pia')).toHaveTextContent('(you)')
    expect(await rowOf('vic')).toHaveTextContent('Viewer')
    const items = within(await within(await main()).findByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
    expect(
      items.map((t) => t.split(/Organizer|Participant|Viewer|\(you\)/)[0]),
    ).toEqual(['Ola', 'oz Lin', 'Pia', 'vic'])
  })

  it('location participant sees the people and Leave, and no other control', async () => {
    // Given Pia, a participant of the Kitchen and a household member
    renderPage(KITCHEN)
    const page = await main()
    await rowOf('vic')

    // Then they see Leave location
    expect(
      await within(page).findByRole('button', { name: 'Leave location' }),
    ).toBeInTheDocument()
    // And no role picker, no Remove, no Add person and no rename
    expect(within(page).queryByRole('combobox')).toBeNull()
    expect(within(page).queryByRole('button', { name: /^Remove / })).toBeNull()
    expect(
      within(page).queryByRole('button', { name: 'Add person' }),
    ).toBeNull()
    expect(within(page).queryByRole('button', { name: /^Rename/ })).toBeNull()
    expect(within(page).queryByText(/already has a role here/)).toBeNull()
  })

  it('location organizer sees only participant and viewer as choices', async () => {
    // Given Ola, an organizer of the Kitchen and a household member
    server.me = 'u-ola'
    const user = userEvent.setup()
    renderPage(KITCHEN)

    // Then the other organizer's row and their own have no control
    for (const name of ['oz Lin', 'Ola']) {
      const row = await rowOf(name)
      expect(within(row).queryByRole('combobox')).toBeNull()
      expect(within(row).queryByRole('button')).toBeNull()
    }
    // And the viewer's row has Remove
    expect(
      within(await rowOf('vic')).getByRole('button', {
        name: 'Remove vic from this location',
      }),
    ).toBeInTheDocument()
    // And the participant's picker offers participant and viewer only
    await user.click(
      await within(await rowOf('Pia')).findByRole('combobox', {
        name: 'Location role of Pia',
      }),
    )
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Participant', 'Viewer'])
  })

  it('location organizer can add a member as participant or viewer, never organizer', async () => {
    server.me = 'u-ola'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    await user.click(
      await within(await main()).findByRole('button', { name: 'Add person' }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Participant', 'Viewer'])
  })

  it('household owner can give a member the organizer role', async () => {
    // Given Olive, the owner, with no role on the Kitchen
    server.me = 'u-olive'
    const user = userEvent.setup()
    renderPage(KITCHEN)

    // When Olive makes Pia an organizer
    await user.click(
      await within(await rowOf('Pia')).findByRole('combobox', {
        name: 'Location role of Pia',
      }),
    )
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Organizer', 'Participant', 'Viewer'])
    await user.click(screen.getByRole('option', { name: 'Organizer' }))

    // Then exactly that change is sent
    await waitFor(() =>
      expect(server.setCalls).toEqual([
        { locationId: KITCHEN, userId: 'u-pia', role: 'organizer' },
      ]),
    )
    // And the list is read again and shows it
    await waitFor(async () =>
      expect(await rowOf('Pia')).toHaveTextContent('Organizer'),
    )
  })

  it('user sees No organizer, and only an owner or manager reads the action', async () => {
    // Given Pia, the only person on the Garage, which has no organizer
    renderPage(GARAGE)
    const page = await main()
    expect(await within(page).findByText('No organizer')).toBeInTheDocument()
    expect(
      within(page).getByText(
        'This location has no organizer. Only a household owner or manager can rename it or add people.',
      ),
    ).toBeInTheDocument()
    // And no action sentence for a participant
    expect(
      within(page).queryByText('Give someone the Organizer role.'),
    ).toBeNull()
  })

  it('household manager sees No organizer with the action sentence', async () => {
    server.me = 'u-mona'
    renderPage(GARAGE)
    const page = await main()
    expect(await within(page).findByText('No organizer')).toBeInTheDocument()
    expect(
      await within(page).findByText('Give someone the Organizer role.'),
    ).toBeInTheDocument()
  })

  it('user sees no No organizer on a location that has one', async () => {
    renderPage(KITCHEN)
    await rowOf('vic')
    expect(within(await main()).queryByText('No organizer')).toBeNull()
  })
})

describe('location people page — Add person', () => {
  it('user can open Add person, which lists only members with no role here', async () => {
    // Given the owner on the Kitchen: Olive, Mona and Max have no role there
    server.me = 'u-olive'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    await user.click(
      await within(await main()).findByRole('button', { name: 'Add person' }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Person' }))
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Olive', 'Mona', 'Max'])
  })

  it('user sees that everyone already has a role, and no Add person', async () => {
    // Given every household member has a role on the Kitchen
    server.me = 'u-olive'
    server.roles[KITCHEN] = Object.fromEntries(
      HOUSEHOLD.map((p) => [p.userId, 'viewer' as LocationRole]),
    )
    server.roles[KITCHEN]['u-ola'] = 'organizer'
    renderPage(KITCHEN)
    const page = await main()
    expect(
      await within(page).findByText(
        'Everyone in this household already has a role here.',
      ),
    ).toBeInTheDocument()
    expect(
      within(page).queryByRole('button', { name: 'Add person' }),
    ).toBeNull()
  })

  it('household owner with No access sees the people and can give themselves a role, and nothing else of the location is read', async () => {
    // Given Olive, the owner, with no role on the Garage
    server.me = 'u-olive'
    const user = userEvent.setup()
    renderPage(GARAGE)

    // Then the people show
    expect(await rowOf('Pia')).toHaveTextContent('Participant')
    // And no request named the Garage except the people read
    const garageOps = () =>
      ops.filter((o) => o.variables.locationId === GARAGE).map((o) => o.name)
    expect(new Set(garageOps())).toEqual(new Set(['LocationPeople']))

    // When Olive adds herself as organizer
    await user.click(
      await within(await main()).findByRole('button', { name: 'Add person' }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Person' }))
    await user.click(screen.getByRole('option', { name: 'Olive' }))
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    await user.click(screen.getByRole('option', { name: 'Organizer' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add person' }))

    // Then exactly that write is sent, and Olive now shows on the list
    await waitFor(() =>
      expect(server.setCalls).toEqual([
        { locationId: GARAGE, userId: 'u-olive', role: 'organizer' },
      ]),
    )
    expect(await rowOf('Olive')).toHaveTextContent('Organizer')
    // And the dialog closed
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a refused role change shows a message', async () => {
    server.me = 'u-olive'
    server.setFails = 'FORBIDDEN'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    await user.click(
      await within(await rowOf('vic')).findByRole('combobox', {
        name: 'Location role of vic',
      }),
    )
    await user.click(screen.getByRole('option', { name: 'Participant' }))
    expect(
      await screen.findByText('Could not save the change. Try again.'),
    ).toBeInTheDocument()
  })
})

describe('location people page — Remove and Leave', () => {
  it('user who confirms Remove sees "Removing…" and the remove is sent once', async () => {
    server.me = 'u-ola'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    const row = await rowOf('vic')
    await user.click(
      within(row).getByRole('button', {
        name: 'Remove vic from this location',
      }),
    )
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent(
      'Remove vic from my Kitchen? They can no longer see its stock, carts or logs.',
    )
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))

    // Then the row says so and has no Remove to press again
    expect(within(row).getByRole('status')).toHaveTextContent('Removing…')
    expect(
      within(row).queryByRole('button', {
        name: 'Remove vic from this location',
      }),
    ).toBeNull()
    // And vic leaves the list; one remove was sent
    await waitFor(() =>
      expect(within(screen.getByRole('main')).queryByText('vic')).toBeNull(),
    )
    expect(server.removeCalls).toEqual([
      { locationId: KITCHEN, userId: 'u-vic' },
    ])
    // And no error shows
    expect(
      screen.queryByText('Could not save the change. Try again.'),
    ).toBeNull()
  })

  it('a remove the server answers false (already gone) shows no error', async () => {
    server.me = 'u-ola'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    const row = await rowOf('vic')
    // vic is removed in another tab before the confirm
    delete server.roles[KITCHEN]?.['u-vic']
    await user.click(
      within(row).getByRole('button', {
        name: 'Remove vic from this location',
      }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remove',
      }),
    )
    await waitFor(() => expect(server.removeCalls).toHaveLength(1))
    await waitFor(() =>
      expect(within(screen.getByRole('main')).queryByText('vic')).toBeNull(),
    )
    expect(
      screen.queryByText('Could not save the change. Try again.'),
    ).toBeNull()
    expect(screen.queryByText('Could not delete. Please try again.')).toBeNull()
  })

  async function openLeave() {
    const user = userEvent.setup()
    await user.click(
      await within(await main()).findByRole('button', {
        name: 'Leave location',
      }),
    )
    return { user, confirm: await screen.findByRole('alertdialog') }
  }

  it('the only organizer reads the extra warning in the Leave confirm', async () => {
    // Given Ola is the only organizer of the Kitchen
    server.me = 'u-ola'
    delete server.roles[KITCHEN]?.['u-oz']
    renderPage(KITCHEN)
    await rowOf('vic')
    const { confirm } = await openLeave()
    expect(confirm).toHaveTextContent(
      'Leave my Kitchen? You can no longer see its stock, carts or logs.',
    )
    expect(confirm).toHaveTextContent(
      'You are its only organizer. After you leave, only a household owner or manager can rename it or add people.',
    )
  })

  it('another organizer does not read the only-organizer warning', async () => {
    // Given Ola, with Oz as a second organizer
    server.me = 'u-ola'
    renderPage(KITCHEN)
    await rowOf('oz Lin')
    const { confirm } = await openLeave()
    expect(confirm).toHaveTextContent('Leave my Kitchen?')
    expect(confirm).not.toHaveTextContent('You are its only organizer.')
  })

  it('after Leave, a participant lands on the locations list', async () => {
    const router = renderPage(KITCHEN)
    await rowOf('vic')
    const { user, confirm } = await openLeave()
    await user.click(
      within(confirm).getByRole('button', { name: 'Leave location' }),
    )
    // "Leaving…" while it runs, so it cannot be confirmed again
    expect(
      await within(await main()).findByText('Leaving…'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/settings\/household\/locations\/?$/,
      ),
    )
    expect(server.leaveCalls).toEqual([{ locationId: KITCHEN }])
  })

  it('after Leave, a household owner stays on the page', async () => {
    // Given Olive, the owner, a viewer of the Kitchen
    server.me = 'u-olive'
    server.roles[KITCHEN] = { ...server.roles[KITCHEN], 'u-olive': 'viewer' }
    const router = renderPage(KITCHEN)
    await rowOf('Olive')
    const { user, confirm } = await openLeave()
    await user.click(
      within(confirm).getByRole('button', { name: 'Leave location' }),
    )
    // Then Olive leaves the list, the page stays, and Leave is gone
    await waitFor(() =>
      expect(within(screen.getByRole('main')).queryByText('Olive')).toBeNull(),
    )
    expect(router.state.location.pathname).toBe(
      `/settings/household/locations/${KITCHEN}`,
    )
    await waitFor(() =>
      expect(
        within(screen.getByRole('main')).queryByRole('button', {
          name: 'Leave location',
        }),
      ).toBeNull(),
    )
    expect(server.leaveCalls).toEqual([{ locationId: KITCHEN }])
  })
})

describe('location people page — states', () => {
  it('user sees that they have no access', async () => {
    // Given Max, a household member with no role on the Kitchen
    server.me = 'u-max'
    renderPage(KITCHEN)
    const page = await main()
    expect(
      await within(page).findByText('You do not have access to this location.'),
    ).toBeInTheDocument()
    expect(
      within(page).getByRole('link', { name: 'Back to locations' }),
    ).toBeInTheDocument()
    expect(within(page).queryByRole('list')).toBeNull()
  })

  it('user can retry after a network error', async () => {
    server.peopleFail = 'DOWN'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    const page = await main()
    expect(
      await within(page).findByText('Could not load the people. Try again.'),
    ).toBeInTheDocument()
    // Not the no-access text: this is not FORBIDDEN
    expect(
      within(page).queryByText('You do not have access to this location.'),
    ).toBeNull()

    server.peopleFail = undefined
    await user.click(within(page).getByRole('button', { name: 'Retry' }))
    expect(await rowOf('vic')).toHaveTextContent('Viewer')
  })
})

describe('location people page — review fixes', () => {
  it('user who loses their role in another tab sees no access, and no old names', async () => {
    // Given Pia, a participant of the Kitchen, looking at its people
    const router = renderPage(KITCHEN)
    await rowOf('vic')

    // When someone removes Pia in another tab, and a live LOCATION event
    // reads every active query again
    delete server.roles[KITCHEN]?.['u-pia']
    // (the read of the people is FORBIDDEN now, so the call rejects)
    await act(async () => {
      await router.apolloClient
        .refetchQueries({ include: 'active' })
        .catch(() => {})
    })

    // Then the page says so, and shows none of the old rows. Apollo keeps the
    // old rows next to the FORBIDDEN, so only `errorCode` can tell.
    const page = await main()
    expect(
      await within(page).findByText('You do not have access to this location.'),
    ).toBeInTheDocument()
    expect(within(page).queryByText('vic')).toBeNull()
    expect(within(page).queryByText('oz Lin')).toBeNull()
  })

  it('after a Remove, focus moves to the People heading', async () => {
    server.me = 'u-ola'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    const row = await rowOf('vic')
    await user.click(
      within(row).getByRole('button', {
        name: 'Remove vic from this location',
      }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remove',
      }),
    )
    const heading = within(await main()).getByRole('heading', {
      name: 'People',
    })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  it('after a Leave, a household owner who stays gets focus on the People heading', async () => {
    server.me = 'u-olive'
    server.roles[KITCHEN] = { ...server.roles[KITCHEN], 'u-olive': 'viewer' }
    const user = userEvent.setup()
    renderPage(KITCHEN)
    await rowOf('Olive')
    await user.click(
      await within(await main()).findByRole('button', {
        name: 'Leave location',
      }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Leave location',
      }),
    )
    await waitFor(() =>
      expect(within(screen.getByRole('main')).queryByText('Olive')).toBeNull(),
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(screen.getByRole('main')).getByRole('heading', {
          name: 'People',
        }),
      ),
    )
  })

  it('user sees a heading even when the location is not in their list', async () => {
    // Given Max, a household member with no role on the Kitchen: the
    // Kitchen is not in Max's list, so its name is not known
    server.me = 'u-max'
    renderPage(KITCHEN)
    const page = await main()
    await within(page).findByText('You do not have access to this location.')
    expect(
      within(page).getByRole('heading', { level: 1, name: 'Location' }),
    ).toBeInTheDocument()
  })

  it('user sees the picked role, and cannot pick again, while the change runs', async () => {
    // Given the owner, and a slow server
    server.me = 'u-olive'
    server.setDelay = 300
    const user = userEvent.setup()
    renderPage(KITCHEN)
    const picker = await within(await rowOf('vic')).findByRole('combobox', {
      name: 'Location role of vic',
    })

    // When the owner makes vic a participant
    await user.click(picker)
    await user.click(screen.getByRole('option', { name: 'Participant' }))

    // Then the picker shows the new role at once, and is off while it runs
    const running = within(await rowOf('vic')).getByRole('combobox', {
      name: 'Location role of vic',
    })
    expect(running).toHaveTextContent('Participant')
    expect(running).toBeDisabled()

    // And once the change has landed it is on again, still on the new role
    await waitFor(() =>
      expect(
        within(screen.getByText('vic').closest('li') as HTMLElement).getByRole(
          'combobox',
          { name: 'Location role of vic' },
        ),
      ).toBeEnabled(),
    )
    expect(
      within(screen.getByText('vic').closest('li') as HTMLElement).getByRole(
        'combobox',
        { name: 'Location role of vic' },
      ),
    ).toHaveTextContent('Participant')
    expect(server.setCalls).toEqual([
      { locationId: KITCHEN, userId: 'u-vic', role: 'participant' },
    ])
  })

  it('user sees why Add person is missing when the members cannot be read, and can retry', async () => {
    server.me = 'u-olive'
    server.membersFail = true
    const user = userEvent.setup()
    renderPage(KITCHEN)
    const page = await main()
    await rowOf('vic')
    expect(
      await within(page).findByText(
        'Could not load the household members. Try again.',
      ),
    ).toBeInTheDocument()
    expect(
      within(page).queryByRole('button', { name: 'Add person' }),
    ).toBeNull()

    server.membersFail = false
    await user.click(within(page).getByRole('button', { name: 'Retry' }))
    expect(
      await within(page).findByRole('button', { name: 'Add person' }),
    ).toBeInTheDocument()
  })
})

// Remove all items (households H6, task J.7, decision T55). For an ORGANIZER
// of this location only. The fixture has a second organizer location
// (Garage, for Pia below), an owner and a manager with no role on the
// Kitchen, so a rule that reads the household role or "organizer anywhere"
// shows the button where it must not.
describe('location people page — Remove all items', () => {
  it('location organizer can remove all items after typing the location name', async () => {
    server.me = 'u-ola'
    const user = userEvent.setup()
    renderPage(KITCHEN)
    const page = await main()

    const zone = await within(page).findByRole('region', {
      name: 'Danger zone',
    })
    await user.click(
      within(zone).getByRole('button', { name: 'Remove all items' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', {
      name: 'Remove all items',
    })
    expect(confirm).toBeDisabled()
    await user.type(
      within(dialog).getByRole('textbox', {
        name: 'Type my Kitchen to confirm',
      }),
      'my Kitchen',
    )
    await user.click(confirm)
    // A second press while it runs sends nothing more
    await user.click(confirm)

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(server.removeAllCalls).toEqual([{ locationId: KITCHEN }])
  })

  it.each([
    ['participant', 'u-pia'],
    ['viewer', 'u-vic'],
  ])('location %s does not see Remove all items', async (_role, me) => {
    server.me = me
    // Pia and Vic each organize the Garage, so "organizer anywhere" would
    // show the button here
    server.roles[GARAGE] = { [me]: 'organizer' }
    renderPage(KITCHEN)
    const page = await main()
    await rowOf('vic')
    expect(
      within(page).queryByRole('button', { name: 'Remove all items' }),
    ).toBeNull()
  })

  it.each([
    ['owner', 'u-olive'],
    ['manager', 'u-mona'],
  ])('household %s with no role on the location does not see Remove all items', async (_role, me) => {
    server.me = me
    server.roles[GARAGE] = { [me]: 'organizer' }
    renderPage(KITCHEN)
    const page = await main()
    // The owner and manager can read the page (Add person shows)
    expect(
      await within(page).findByRole('button', { name: 'Add person' }),
    ).toBeInTheDocument()
    expect(
      within(page).queryByRole('region', { name: 'Danger zone' }),
    ).toBeNull()
  })
})
