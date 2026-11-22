import { ApolloLink } from '@apollo/client'
import type { ApolloCache } from '@apollo/client/cache'
import { MockLink } from '@apollo/client/testing'
import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
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
  AcceptOwnershipOfferDocument,
  CancelOwnershipOfferDocument,
  CreateInviteDocument,
  GetHouseholdDocument,
  GetHouseholdLocationsDocument,
  HouseholdInvitesDocument,
  type HouseholdInvitesQuery,
  HouseholdMembersDocument,
  type HouseholdMembersQuery,
  type HouseholdRole,
  LeaveHouseholdDocument,
  MyOwnershipOffersDocument,
  type MyOwnershipOffersQuery,
  OfferOwnershipDocument,
  RemoveMemberDocument,
  RevokeInviteDocument,
  SetHouseholdRoleDocument,
} from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { cloudRoleBaseMocks, cloudRoleStorySetup } from '@/test/cloudRoleStory'
import { createHoldLink, type HoldLink } from '@/test/holdLink'

// The Members page in cloud mode (households H5b, task G.9), on the REAL
// route tree, with the real generated hooks and `MockedProvider` answering.
// The caller's role reaches the page the way it does in the app: through
// `GetHousehold`, read by `usePermissions`.
//
// Every fixture holds people of all three roles, and the caller is one of
// them. So a rule that reads the wrong role (the caller's instead of the
// row's, or the other way round) shows a button on a row where it must not.

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// The household switch clears IndexedDB and loads another page. The test
// only needs to know it was asked for, with which household and target.
const switchToHouseholdMock = vi.hoisted(() => vi.fn(async () => {}))
const forgetHouseholdMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return {
    ...actual,
    switchToHousehold: switchToHouseholdMock,
    forgetHousehold: forgetHouseholdMock,
  }
})

const reloadMock = vi.fn()
const replaceMock = vi.fn()
const originalLocation = window.location

type Person = HouseholdMembersQuery['householdMembers'][number]
type Invite = HouseholdInvitesQuery['householdInvites'][number]
type Offer = MyOwnershipOffersQuery['myOwnershipOffers'][number]

function offer(
  id: string,
  kind: 'transfer' | 'handover',
  toUserId: string,
  toName: string,
  extra: Partial<Offer> = {},
): Offer {
  return {
    __typename: 'OwnershipOffer',
    id,
    householdId: 'household-role-story',
    householdName: 'The Lin home',
    kind,
    toUserId,
    toName,
    fromName: kind === 'transfer' ? 'Olive' : null,
    createdAt: '2026-11-20T00:00:00.000Z',
    dismissedAt: null,
    ...extra,
  }
}

function person(
  userId: string,
  displayName: string,
  role: HouseholdRole,
  isMe = false,
): Person {
  return {
    __typename: 'HouseholdPerson',
    userId,
    displayName,
    role,
    joinedAt: '2026-11-01T00:00:00.000Z',
    isMe,
    hasLocationRole: true,
  }
}

const TOKEN = 'tok-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd'
const OTHER_TOKEN = 'tok-ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210-_zyxw'

function invite(
  id: string,
  householdRole: HouseholdRole,
  token = TOKEN,
  locationRoles: Invite['locationRoles'] = [
    {
      __typename: 'InviteLocationRole',
      locationId: 'loc-kitchen',
      locationName: 'my Kitchen',
      role: 'participant',
    },
  ],
): Invite {
  return {
    __typename: 'HouseholdInvite',
    id,
    token,
    householdRole,
    locationRoles,
    createdByName: 'Olive',
    expiresAt: '2026-11-25T12:00:00.000Z',
  }
}

/** What the fake server answers. Tests change it between requests. */
interface Server {
  members: Person[]
  invites: Invite[]
  /**
   * `GetHousehold`: a household id, the error code NO_HOUSEHOLD, or another
   * error. (`MockedProvider` cannot switch a mock to a NETWORK error between
   * requests: a `result` function that throws breaks the mock link. A server
   * error takes the same branch of `useLeaveHousehold`: any error that is not
   * NO_HOUSEHOLD.)
   */
  household: { id: string; role: HouseholdRole } | 'NO_HOUSEHOLD' | 'FAILS'
  membersCalls: number
  invitesCalls: number
  /** `GetHousehold.hasOwner` (households H6b). */
  hasOwner: boolean
  /** `GetHousehold.pendingTransfer`: only the owner gets one. */
  pendingTransfer: Offer | null
  /** `MyOwnershipOffers`: the caller's offers, in every household. */
  offers: Offer[]
  offersCalls: number
  /** When set, `HouseholdMembers` / `HouseholdInvites` answer an error. */
  membersFail?: boolean
  invitesFail?: boolean
}

let server: Server

function dynamicMocks(): NonNullable<MockedProviderProps['mocks']> {
  return [
    {
      request: { query: GetHouseholdDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        const h = server.household
        if (h === 'FAILS') {
          return {
            errors: [
              {
                message: 'down',
                extensions: { code: 'INTERNAL_SERVER_ERROR' },
              },
            ],
          }
        }
        if (h === 'NO_HOUSEHOLD') {
          return {
            errors: [
              { message: 'no household', extensions: { code: 'NO_HOUSEHOLD' } },
            ],
          }
        }
        return {
          data: {
            household: {
              __typename: 'Household',
              id: h.id,
              name: 'The Lin home',
              role: h.role,
              hasOwner: server.hasOwner,
              pendingTransfer: server.pendingTransfer,
            },
          },
        }
      },
    },
    {
      request: { query: HouseholdMembersDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        server.membersCalls += 1
        if (server.membersFail)
          return {
            errors: [
              {
                message: 'down',
                extensions: { code: 'INTERNAL_SERVER_ERROR' },
              },
            ],
          }
        return { data: { householdMembers: server.members } }
      },
    },
    {
      request: { query: HouseholdInvitesDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        server.invitesCalls += 1
        if (server.invitesFail)
          return {
            errors: [
              {
                message: 'down',
                extensions: { code: 'INTERNAL_SERVER_ERROR' },
              },
            ],
          }
        return { data: { householdInvites: server.invites } }
      },
    },
    {
      request: { query: MyOwnershipOffersDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        server.offersCalls += 1
        return { data: { myOwnershipOffers: server.offers } }
      },
    },
    {
      request: { query: GetHouseholdLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          householdLocations: [
            {
              __typename: 'Location',
              id: 'loc-kitchen',
              name: 'my Kitchen',
              order: 0,
              myRole: 'organizer',
              hasOrganizer: true,
              dataUpdatedAt: null,
              lastVisitedAt: null,
            },
            // A location the caller has no role on (owner and manager see it)
            {
              __typename: 'Location',
              id: 'loc-garage',
              name: 'Garage',
              order: 1,
              myRole: null,
              hasOrganizer: true,
              dataUpdatedAt: null,
              lastVisitedAt: null,
            },
          ],
        },
      },
    },
  ]
}

function renderPage(
  role: HouseholdRole,
  extra: NonNullable<MockedProviderProps['mocks']> = [],
  // `cache`: start from a cache that already holds answers (the copy
  // restored from IndexedDB). `hold`: put a hold link in front of the mocks,
  // so a test decides when an answer comes.
  options: { cache?: ApolloCache; hold?: HoldLink } = {},
) {
  server.household = { id: 'household-role-story', role }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/settings/household/members'],
    }),
    context: { queryClient },
  })
  // The base mocks without their GetHousehold: this file answers it itself.
  const base = cloudRoleBaseMocks(role).filter(
    (m) => m.request.query !== GetHouseholdDocument,
  )
  const mocks = [...dynamicMocks(), ...base, ...extra]
  const link = options.hold
    ? ApolloLink.from([
        options.hold.link,
        new MockLink(mocks, { defaultOptions: { delay: 0 } }),
      ])
    : undefined
  render(
    <MockedProvider
      mocks={mocks}
      cache={options.cache ?? createCache()}
      {...(link ? { link } : {})}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>,
  )
  return router
}

/** The list item of a person, found by their name. */
async function rowOf(name: string) {
  const main = await screen.findByRole('main')
  const title = await within(main).findByText(name)
  const row = title.closest('li')
  if (!row) throw new Error(`no list row for ${name}`)
  return row as HTMLElement
}

// Owner Olive, manager Mona, member Mia, member Milo. `me` is the caller.
function people(me: string): Person[] {
  return [
    person('u-olive', 'Olive', 'owner', me === 'u-olive'),
    person('u-mona', 'Mona', 'manager', me === 'u-mona'),
    person('u-max', 'Max', 'manager', me === 'u-max'),
    person('u-mia', 'Mia', 'member', me === 'u-mia'),
    person('u-milo', 'Milo', 'member', me === 'u-milo'),
  ]
}

beforeEach(() => {
  cloudRoleStorySetup()
  server = {
    members: [],
    invites: [],
    household: { id: 'household-role-story', role: 'owner' },
    membersCalls: 0,
    invitesCalls: 0,
    hasOwner: true,
    pendingTransfer: null,
    offers: [],
    offersCalls: 0,
  }
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock, replace: replaceMock },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
  reloadMock.mockReset()
  replaceMock.mockReset()
  switchToHouseholdMock.mockReset()
  forgetHouseholdMock.mockReset()
  vi.restoreAllMocks()
  localStorage.clear()
  // No db.delete() here. This cloud test writes nothing to the local Dexie
  // database, but the cloud root still READS it: usePostLoginMigration calls
  // getAllItems() to see whether there is local data to copy. That read is
  // two Dexie transactions and outlives the test on a loaded machine. Deleting
  // the database between them made the second one fail with an unhandled
  // DatabaseClosedError after the test had ended.
})

describe('Members page — who sees which control', () => {
  it('household owner sees the role control and Remove on every other row, not on their own', async () => {
    // Given the owner, with two managers and two members
    server.members = people('u-olive')
    renderPage('owner')

    // Then every other row has the role control and Remove
    for (const name of ['Mona', 'Max', 'Mia', 'Milo']) {
      const row = await rowOf(name)
      expect(
        await within(row).findByRole('combobox', {
          name: `Household role of ${name}`,
        }),
      ).toBeInTheDocument()
      expect(
        within(row).getByRole('button', { name: `Remove ${name}` }),
      ).toBeInTheDocument()
    }
    // And their own row has neither, and says "(you)"
    const own = await rowOf('Olive')
    expect(within(own).queryByRole('combobox')).toBeNull()
    expect(within(own).queryByRole('button')).toBeNull()
    expect(own).toHaveTextContent('(you)')
    expect(own).toHaveTextContent('Owner')
  })

  it('household manager sees Remove only on member rows, and no role control', async () => {
    // Given a manager (Max), with another manager (Mona) and two members
    server.members = people('u-max')
    renderPage('manager')

    // Then the member rows have Remove
    for (const name of ['Mia', 'Milo']) {
      expect(
        await within(await rowOf(name)).findByRole('button', {
          name: `Remove ${name}`,
        }),
      ).toBeInTheDocument()
    }
    // And the owner and the other manager do not
    for (const name of ['Olive', 'Mona']) {
      expect(
        within(await rowOf(name)).queryByRole('button', {
          name: `Remove ${name}`,
        }),
      ).toBeNull()
    }
    // And there is no role control anywhere
    expect(
      within(await screen.findByRole('main')).queryByRole('combobox'),
    ).toBeNull()
    // And the manager's own row has Leave
    expect(
      await within(await rowOf('Max')).findByRole('button', {
        name: 'Leave household',
      }),
    ).toBeInTheDocument()
  })

  it('household member sees the list and Leave, and no Invite', async () => {
    // Given a member (Mia)
    server.members = people('u-mia')
    renderPage('member')

    // Then they see every person and their role
    const main = await screen.findByRole('main')
    for (const [name, role] of [
      ['Olive', 'Owner'],
      ['Mona', 'Manager'],
      ['Milo', 'Member'],
    ] as const) {
      expect(await rowOf(name)).toHaveTextContent(role)
    }
    // And Leave on their own row only
    expect(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Leave household',
      }),
    ).toBeInTheDocument()
    expect(
      within(main).getAllByRole('button', { name: 'Leave household' }),
    ).toHaveLength(1)
    // And no Remove, no role control, no Invite, no open invites
    expect(within(main).queryByRole('button', { name: /^Remove / })).toBeNull()
    expect(within(main).queryByRole('combobox')).toBeNull()
    expect(
      within(main).queryByRole('button', { name: 'Invite someone' }),
    ).toBeNull()
    expect(within(main).queryByText('Open invites')).toBeNull()
    // And the invites were never asked for (a member gets FORBIDDEN)
    expect(server.invitesCalls).toBe(0)
  })

  it('household owner sees no Leave, and the note', async () => {
    // Given the owner
    server.members = people('u-olive')
    renderPage('owner')

    // Then their own row says the owner cannot leave, and what to do
    // (households H6b task K.7: no longer "comes in a later version")
    expect(await rowOf('Olive')).toHaveTextContent(
      'The owner cannot leave. Transfer ownership first.',
    )
    expect(screen.queryByText(/later version/)).toBeNull()
    // And no Leave anywhere
    expect(
      within(await screen.findByRole('main')).queryByRole('button', {
        name: 'Leave household',
      }),
    ).toBeNull()
  })

  it('household manager does not see the owner note', async () => {
    // A negative control for the test above: the note is about the owner
    server.members = people('u-max')
    renderPage('manager')
    await rowOf('Max')
    expect(screen.queryByText(/The owner cannot leave/)).toBeNull()
  })

  it('household owner alone is told the household goes when they join another one', async () => {
    // Given the owner is the only person (T21)
    server.members = [person('u-olive', 'Olive', 'owner', true)]
    renderPage('owner')

    // Then the page says so
    expect(
      await screen.findByText(
        /You are the only person in this household\. If you join another household/,
      ),
    ).toBeInTheDocument()
  })

  it('household owner with other people sees no "only person" note', async () => {
    server.members = people('u-olive')
    renderPage('owner')
    await rowOf('Mia')
    expect(screen.queryByText(/You are the only person/)).toBeNull()
  })
})

// Households H5c task H.6, owner decision O28-A. Milo joined with no
// location role (O14-A). Every other person has one.
describe('Members page — No location roles', () => {
  function peopleWithMiloWithoutRole(me: string): Person[] {
    return people(me).map((p) =>
      p.userId === 'u-milo' ? { ...p, hasLocationRole: false } : p,
    )
  }

  it.each([
    'owner',
    'manager',
  ] as const)('household %s sees No location roles and a link on a person with no location role', async (role) => {
    // Given the caller (Olive the owner, or Max the manager), and Milo with
    // no location role
    server.members = peopleWithMiloWithoutRole(
      role === 'owner' ? 'u-olive' : 'u-max',
    )
    renderPage(role)

    // Then Milo's row says so, with a link to the locations list, where a
    // role is given on a location's page
    const milo = await rowOf('Milo')
    expect(
      await within(milo).findByText('No location roles'),
    ).toBeInTheDocument()
    expect(
      within(milo).getByRole('link', { name: 'Give a location role' }),
    ).toHaveAttribute('href', '/settings/household/locations')

    // And nobody else's row has the mark
    const main = await screen.findByRole('main')
    expect(within(main).getAllByText('No location roles')).toHaveLength(1)
    expect(
      within(main).getAllByRole('link', { name: 'Give a location role' }),
    ).toHaveLength(1)
  })

  it('household member sees no No location roles mark', async () => {
    // Given Mia, a member, and Milo with no location role. A member cannot
    // give a location role, so the mark would point at nothing they can do.
    server.members = peopleWithMiloWithoutRole('u-mia')
    renderPage('member')

    // Then Milo's row shows his name and role, and no mark or link. Leave on
    // Mia's own row shows that the role is known, so the mark is not just
    // still waiting for it.
    expect(await rowOf('Milo')).toHaveTextContent('Member')
    expect(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Leave household',
      }),
    ).toBeInTheDocument()
    const main = await screen.findByRole('main')
    expect(within(main).queryByText('No location roles')).toBeNull()
    expect(
      within(main).queryByRole('link', { name: 'Give a location role' }),
    ).toBeNull()
  })
})

describe('Members page — the invite form', () => {
  async function openForm() {
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Invite someone' }),
    )
    const dialog = await screen.findByRole('dialog')
    return { user, dialog }
  }

  it("owner's invite form offers member and manager; a manager's offers member only", async () => {
    // Given the owner
    server.members = people('u-olive')
    renderPage('owner')
    let { user, dialog } = await openForm()

    // When they open the household role picker
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Household role' }),
    )

    // Then both roles are offered
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Member', 'Manager'])
    cleanup()

    // Given a manager
    server.members = people('u-max')
    renderPage('manager')
    ;({ user, dialog } = await openForm())
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Household role' }),
    )

    // Then only member is offered
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Member'])
  })

  it('the invite form lists every location with No access selected', async () => {
    // Given the owner, in a household with a location they have no role on
    server.members = people('u-olive')
    renderPage('owner')
    const { dialog } = await openForm()

    // Then each location has a picker on "No access"
    const kitchen = await within(dialog).findByRole('combobox', {
      name: 'my Kitchen',
    })
    const garage = within(dialog).getByRole('combobox', { name: 'Garage' })
    expect(kitchen).toHaveTextContent('No access')
    expect(garage).toHaveTextContent('No access')
  })

  it('user can create an invite and sees the link', async () => {
    // Given the owner, who gives the invite a role on one location only
    server.members = people('u-olive')
    const created = invite('inv-new', 'member')
    const createMock = {
      request: {
        query: CreateInviteDocument,
        // The location left on "No access" is not sent (O14-A)
        variables: {
          householdRole: 'member',
          locationRoles: [{ locationId: 'loc-kitchen', role: 'participant' }],
        },
      },
      result: () => {
        server.invites = [created]
        return { data: { createInvite: created } }
      },
    }
    renderPage('owner', [createMock])
    const { user, dialog } = await openForm()
    await user.click(
      await within(dialog).findByRole('combobox', { name: 'my Kitchen' }),
    )
    await user.click(
      within(screen.getByRole('listbox')).getByRole('option', {
        name: 'Participant',
      }),
    )
    // And they change their mind about the Garage: a role, then No access
    // again. A row set back to No access must not be sent either.
    for (const choice of ['Viewer', 'No access']) {
      await user.click(within(dialog).getByRole('combobox', { name: 'Garage' }))
      await user.click(
        within(screen.getByRole('listbox')).getByRole('option', {
          name: choice,
        }),
      )
    }

    // When they create the link
    await user.click(
      within(dialog).getByRole('button', { name: 'Create invite link' }),
    )

    // Then the dialog shows the link of this site's join page
    const link = await within(dialog).findByLabelText('Invite link')
    expect(link).toHaveValue(`${window.location.origin}/join/${TOKEN}`)
    expect(dialog).toHaveTextContent(/Anyone with this link can join once/)

    // When they copy it
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }))

    // Then the link is on the clipboard, and the dialog says so
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/join/${TOKEN}`,
    )
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Link copied',
    )
    // And the open invites list was refetched and shows it
    await waitFor(() => expect(server.invitesCalls).toBeGreaterThanOrEqual(2))
  })

  it('user whose browser cannot copy sees the link selected and a message', async () => {
    // Given an invite was created
    server.members = people('u-olive')
    const created = invite('inv-new', 'member')
    renderPage('owner', [
      {
        request: {
          query: CreateInviteDocument,
          variables: { householdRole: 'member', locationRoles: [] },
        },
        result: { data: { createInvite: created } },
      },
    ])
    const { user, dialog } = await openForm()
    await within(dialog).findByRole('combobox', { name: 'my Kitchen' })
    await user.click(
      within(dialog).getByRole('button', { name: 'Create invite link' }),
    )
    const link = await within(dialog).findByLabelText('Invite link')

    // And the Clipboard API refuses, and there is no old way to copy
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('NotAllowedError'),
    )
    Object.defineProperty(document, 'execCommand', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    // When they press Copy link
    link.blur()
    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }))

    // Then the dialog says to copy it by hand, with the text selected
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Could not copy. Select the link and copy it yourself.',
    )
    const input = link as HTMLInputElement
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    Reflect.deleteProperty(document, 'execCommand')
  })
})

describe('Members page — open invites', () => {
  it('user sees open invites with Copy link and Revoke', async () => {
    // Given the owner, with a member invite and a manager invite
    server.members = people('u-olive')
    server.invites = [
      invite('inv-member', 'member', TOKEN),
      invite('inv-manager', 'manager', OTHER_TOKEN, []),
    ]
    renderPage('owner')

    // Then both are listed, each with Copy link and Revoke
    const list = (await screen.findByText('Open invites')).closest('section')
    if (!list) throw new Error('no invites section')
    const rows = await within(list as HTMLElement).findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(
        within(row).getByRole('button', { name: 'Copy link' }),
      ).toBeInTheDocument()
      expect(
        within(row).getByRole('button', { name: 'Revoke' }),
      ).toBeInTheDocument()
    }
    // And each row says what it gives, and who made it
    expect(rows[0]).toHaveTextContent('my Kitchen: Participant')
    expect(rows[0]).toHaveTextContent('Created by Olive')
    // An invite with no location role says so
    expect(rows[1]).toHaveTextContent('No location roles')

    // When the owner copies the second link
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    await user.click(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Copy link' }),
    )

    // Then that invite's link is copied, and a toast says so
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/join/${OTHER_TOKEN}`,
    )
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('household manager sees no Revoke on a manager invite', async () => {
    // Given a manager, and (should the server ever send one) a manager invite
    server.members = people('u-max')
    server.invites = [
      invite('inv-member', 'member', TOKEN),
      invite('inv-manager', 'manager', OTHER_TOKEN),
    ]
    renderPage('manager')

    const list = (await screen.findByText('Open invites')).closest('section')
    const rows = await within(list as HTMLElement).findAllByRole('listitem')
    // Then the member invite can be revoked, the manager invite cannot
    expect(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'Revoke' }),
    ).toBeInTheDocument()
    expect(
      within(rows[1] as HTMLElement).queryByRole('button', { name: 'Revoke' }),
    ).toBeNull()
    // Copy link stays on both
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Copy link' }),
    ).toBeInTheDocument()
  })

  async function revokeFirst() {
    const user = userEvent.setup()
    const list = (await screen.findByText('Open invites')).closest('section')
    const [row] = await within(list as HTMLElement).findAllByRole('listitem')
    await user.click(
      within(row as HTMLElement).getByRole('button', { name: 'Revoke' }),
    )
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent(
      'Revoke this invite? The link will stop working.',
    )
    await user.click(within(confirm).getByRole('button', { name: 'Revoke' }))
  }

  it('user can revoke an invite, and the list is read again', async () => {
    server.members = people('u-olive')
    server.invites = [invite('inv-member', 'member')]
    renderPage('owner', [
      {
        request: {
          query: RevokeInviteDocument,
          variables: { id: 'inv-member' },
        },
        result: () => {
          server.invites = []
          return { data: { revokeInvite: true } }
        },
      },
    ])

    await revokeFirst()

    // Then a toast says so, and the row is gone after the refetch
    expect(await screen.findByText('Invite revoked')).toBeInTheDocument()
    expect(await screen.findByText('No open invites.')).toBeInTheDocument()
  })

  it('after a revoke, focus moves to the Open invites heading', async () => {
    server.members = people('u-olive')
    server.invites = [invite('inv-member', 'member')]
    renderPage('owner', [
      {
        request: {
          query: RevokeInviteDocument,
          variables: { id: 'inv-member' },
        },
        result: () => {
          server.invites = []
          return { data: { revokeInvite: true } }
        },
      },
    ])

    await revokeFirst()

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Open invites' }),
      ),
    )
  })

  it('user sees an error, not "No open invites.", when the invites cannot be read', async () => {
    // Given the open invites cannot be read
    server.members = people('u-olive')
    server.invitesFail = true
    renderPage('owner')

    // Then the section says so
    expect(
      await screen.findByText('Could not load the open invites. Try again.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No open invites.')).toBeNull()
  })

  it('user whose browser cannot copy an open invite sees its link on the row, selected', async () => {
    // Given the owner with one open invite, and a browser that cannot copy
    server.members = people('u-olive')
    server.invites = [invite('inv-member', 'member')]
    renderPage('owner')
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('NotAllowedError'),
    )
    Object.defineProperty(document, 'execCommand', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    try {
      const list = (await screen.findByText('Open invites')).closest(
        'section',
      ) as HTMLElement
      const [row] = await within(list).findAllByRole('listitem')

      // When they press Copy link
      await user.click(
        within(row as HTMLElement).getByRole('button', { name: 'Copy link' }),
      )

      // Then the row shows the link, focused and selected
      const field = (await within(row as HTMLElement).findByRole('textbox', {
        name: 'Invite link',
      })) as HTMLInputElement
      expect(field.value).toBe(`${window.location.origin}/join/${TOKEN}`)
      expect(document.activeElement).toBe(field)
      expect(field.selectionStart).toBe(0)
      expect(field.selectionEnd).toBe(field.value.length)
      expect(
        await screen.findByText(
          'Could not copy. Select the link and copy it yourself.',
        ),
      ).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(document, 'execCommand')
    }
  })

  it('a revoke that answers false refetches the list and shows no success message', async () => {
    // Given the invite was used in the meantime: the server revokes nothing
    server.members = people('u-olive')
    server.invites = [invite('inv-member', 'member')]
    renderPage('owner', [
      {
        request: {
          query: RevokeInviteDocument,
          variables: { id: 'inv-member' },
        },
        result: () => {
          server.invites = []
          return { data: { revokeInvite: false } }
        },
      },
    ])
    await screen.findByText('Open invites')
    await waitFor(() => expect(server.invitesCalls).toBe(1))

    await revokeFirst()

    // Then the list is read again, and the row goes away
    expect(await screen.findByText('No open invites.')).toBeInTheDocument()
    expect(server.invitesCalls).toBe(2)
    // And nothing says it was revoked
    expect(screen.queryByText('Invite revoked')).toBeNull()
  })
})

describe('Members page — role, remove and leave', () => {
  it('user can make a member a manager, and the list is read again', async () => {
    // Given the owner and Mia, a member
    server.members = people('u-olive')
    renderPage('owner', [
      {
        request: {
          query: SetHouseholdRoleDocument,
          variables: { userId: 'u-mia', role: 'manager' },
        },
        result: () => {
          server.members = server.members.map((p) =>
            p.userId === 'u-mia' ? { ...p, role: 'manager' } : p,
          )
          const mia = server.members.find((p) => p.userId === 'u-mia')
          return { data: { setHouseholdRole: mia } }
        },
      },
    ])
    const user = userEvent.setup()
    const row = await rowOf('Mia')
    const before = server.membersCalls

    // When the owner picks Manager for Mia
    await user.click(
      await within(row).findByRole('combobox', {
        name: 'Household role of Mia',
      }),
    )
    await user.click(
      within(screen.getByRole('listbox')).getByRole('option', {
        name: 'Manager',
      }),
    )

    // Then the list is read again and shows the new role
    await waitFor(() => expect(server.membersCalls).toBeGreaterThan(before))
    await waitFor(() =>
      expect(
        within(row).getByRole('combobox', { name: 'Household role of Mia' }),
      ).toHaveTextContent('Manager'),
    )
  })

  it('user can remove a member after confirming, and the list is read again', async () => {
    server.members = people('u-olive')
    renderPage('owner', [
      {
        request: {
          query: RemoveMemberDocument,
          variables: { userId: 'u-mia' },
        },
        result: () => {
          server.members = server.members.filter((p) => p.userId !== 'u-mia')
          return { data: { removeMember: true } }
        },
      },
    ])
    const user = userEvent.setup()

    // When the owner presses Remove on Mia and confirms
    await user.click(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Remove Mia',
      }),
    )
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent(
      'Remove Mia from this household? They lose access to all its locations.',
    )
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))

    // Then Mia is gone after the refetch, and the others stay
    await waitFor(() => expect(screen.queryByText('Mia')).toBeNull())
    expect(await rowOf('Milo')).toBeInTheDocument()
  })

  it('removing a manager reads the open invites again, so their revoked invites go (O20)', async () => {
    // Given Max, a manager, made an open invite. The server revokes it with
    // the removal; this tab gets no live event for its own change.
    server.members = people('u-olive')
    server.invites = [invite('inv-max', 'member')]
    renderPage('owner', [
      {
        request: {
          query: RemoveMemberDocument,
          variables: { userId: 'u-max' },
        },
        result: () => {
          server.members = server.members.filter((p) => p.userId !== 'u-max')
          server.invites = []
          return { data: { removeMember: true } }
        },
      },
    ])
    const user = userEvent.setup()
    const list = (await screen.findByText('Open invites')).closest('section')
    expect(
      await within(list as HTMLElement).findAllByRole('listitem'),
    ).toHaveLength(1)

    // When the owner removes Max
    await user.click(
      await within(await rowOf('Max')).findByRole('button', {
        name: 'Remove Max',
      }),
    )
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))

    // Then the invite list is read again and shows no open invite
    expect(await screen.findByText('No open invites.')).toBeInTheDocument()
  })

  it('a remove that worked shows no error when the list cannot be read again', async () => {
    // Given the remove works, but the refetch of the list then fails
    server.members = people('u-olive')
    renderPage('owner', [
      {
        request: {
          query: RemoveMemberDocument,
          variables: { userId: 'u-mia' },
        },
        // Long enough to see "Removing…" before the answer comes
        delay: 100,
        result: () => {
          server.membersFail = true
          return { data: { removeMember: true } }
        },
      },
    ])
    const user = userEvent.setup()
    const before = server.membersCalls
    const row = await rowOf('Mia')
    await user.click(
      await within(row).findByRole('button', {
        name: 'Remove Mia',
      }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remove',
      }),
    )
    expect(within(row).getByRole('status')).toHaveTextContent('Removing…')

    // Then the list was asked for again. "Removing…" goes away only when
    // `remove()` has settled, whether it resolved or rejected, so after it
    // the page has already decided about the error. No fixed wait: a wait
    // of 50 ms passed whenever the error came later than that.
    await waitFor(() => expect(server.membersCalls).toBeGreaterThan(before))
    await waitFor(() => expect(within(row).queryByRole('status')).toBeNull())
    // And no "could not save" shows: the write itself worked
    expect(
      screen.queryByText('Could not save the change. Try again.'),
    ).toBeNull()
  })

  it('user who confirms Remove sees "Removing…" and cannot confirm it again', async () => {
    // Given a slow server
    server.members = people('u-olive')
    let removeCalls = 0
    renderPage('owner', [
      {
        request: {
          query: RemoveMemberDocument,
          variables: { userId: 'u-mia' },
        },
        maxUsageCount: Number.POSITIVE_INFINITY,
        delay: 300,
        result: () => {
          removeCalls += 1
          const gone = !server.members.some((p) => p.userId === 'u-mia')
          server.members = server.members.filter((p) => p.userId !== 'u-mia')
          // A second remove of someone no longer here is refused
          return gone
            ? {
                errors: [{ message: 'no', extensions: { code: 'FORBIDDEN' } }],
              }
            : { data: { removeMember: true } }
        },
      },
    ])
    const user = userEvent.setup()
    const row = await rowOf('Mia')
    const confirmRemove = async (button: HTMLElement) => {
      await user.click(button)
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Remove',
        }),
      )
    }

    // When the owner confirms Remove on Mia
    await confirmRemove(
      await within(row).findByRole('button', { name: 'Remove Mia' }),
    )

    // Then the row says so, and has no Remove to press again
    expect(within(row).getByRole('status')).toHaveTextContent('Removing…')
    const again = within(row).queryByRole('button', { name: 'Remove Mia' })
    if (again) await confirmRemove(again)
    expect(again).toBeNull()

    // And one request was sent, and no false error shows
    await waitFor(() => expect(screen.queryByText('Mia')).toBeNull())
    expect(removeCalls).toBe(1)
    expect(
      screen.queryByText('Could not save the change. Try again.'),
    ).toBeNull()
  })

  it('after a remove, focus moves to the page heading', async () => {
    server.members = people('u-olive')
    renderPage('owner', [
      {
        request: {
          query: RemoveMemberDocument,
          variables: { userId: 'u-mia' },
        },
        result: () => {
          server.members = server.members.filter((p) => p.userId !== 'u-mia')
          return { data: { removeMember: true } }
        },
      },
    ])
    const user = userEvent.setup()
    await user.click(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Remove Mia',
      }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remove',
      }),
    )

    // Then the button that had focus is gone, and focus is on the heading
    await waitFor(() => expect(screen.queryByText('Mia')).toBeNull())
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1, name: 'Members' }),
      ),
    )
  })

  it('a refused remove shows an error and keeps the row', async () => {
    server.members = people('u-olive')
    renderPage('owner', [
      {
        request: {
          query: RemoveMemberDocument,
          variables: { userId: 'u-mia' },
        },
        result: {
          errors: [{ message: 'no', extensions: { code: 'FORBIDDEN' } }],
        },
      },
    ])
    const user = userEvent.setup()
    await user.click(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Remove Mia',
      }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remove',
      }),
    )
    expect(
      await screen.findByText('Could not save the change. Try again.'),
    ).toBeInTheDocument()
    expect(await rowOf('Mia')).toBeInTheDocument()
  })

  async function leave() {
    const user = userEvent.setup()
    await user.click(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Leave household',
      }),
    )
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent(
      'Leave this household? You lose access to all its locations.',
    )
    await user.click(
      within(confirm).getByRole('button', { name: 'Leave household' }),
    )
  }

  let leaveCalls = 0
  function leaveMock(after: Server['household'], delay = 0) {
    leaveCalls = 0
    return {
      request: { query: LeaveHouseholdDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      delay,
      result: () => {
        leaveCalls += 1
        server.household = after
        return { data: { leaveHousehold: true } }
      },
    }
  }

  it('user who confirms Leave sees "Leaving…" and cannot confirm it again', async () => {
    // Given Mia is in two households, and the server is slow to answer
    server.members = people('u-mia')
    renderPage('member', [
      leaveMock({ id: 'household-next', role: 'owner' }, 300),
    ])
    const user = userEvent.setup()

    // When she confirms Leave
    await leave()

    // Then her row says it is leaving, in a status
    const row = await rowOf('Mia')
    expect(within(row).getByRole('status')).toHaveTextContent('Leaving…')
    // And she tries to confirm again, if the button is still there
    const again = within(row).queryByRole('button', { name: 'Leave household' })
    if (again) {
      await user.click(again)
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Leave household',
        }),
      )
    }
    expect(again).toBeNull()

    // Then exactly one leave reached the server: a second one would leave
    // her next household too
    await waitFor(() => expect(switchToHouseholdMock).toHaveBeenCalled())
    expect(leaveCalls).toBe(1)
  })

  it('leaving when the household cannot be read afterwards still loads the pantry, and forgets nothing', async () => {
    // Given the leave works, but the next read fails with an error that is
    // not NO_HOUSEHOLD (offline, or a server error)
    server.members = people('u-mia')
    renderPage('member', [leaveMock('FAILS')])

    await leave()

    // Then the pantry loads again; the next load asks the server again
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
    expect(forgetHouseholdMock).not.toHaveBeenCalled()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('leaving calls leaveHousehold, then switchToHousehold for the next household', async () => {
    // Given Mia is also in another household
    server.members = people('u-mia')
    renderPage('member', [leaveMock({ id: 'household-next', role: 'owner' })])

    // When she leaves this one
    await leave()

    // Then the device moves to the next household, landing on the pantry
    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-next', {
        to: '/',
      }),
    )
    expect(switchToHouseholdMock).toHaveBeenCalledOnce()
    expect(forgetHouseholdMock).not.toHaveBeenCalled()
  })

  it('leaving the last household forgets it and loads the pantry, where the no-household screen shows', async () => {
    // Given Mia is in no other household
    server.members = people('u-mia')
    renderPage('member', [leaveMock('NO_HOUSEHOLD')])

    // When she leaves
    await leave()

    // Then the old household is forgotten and the pantry loads again
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
    expect(forgetHouseholdMock).toHaveBeenCalledOnce()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('a refused leave moves nothing and shows an error', async () => {
    server.members = people('u-mia')
    renderPage('member', [
      {
        request: { query: LeaveHouseholdDocument },
        result: {
          errors: [{ message: 'no', extensions: { code: 'BAD_USER_INPUT' } }],
        },
      },
    ])

    await leave()

    expect(
      await screen.findByText('Could not save the change. Try again.'),
    ).toBeInTheDocument()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
    expect(forgetHouseholdMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})

// Households H6b task K.7. Transfer (the owner), the ownerless household
// (hand-over), and the O37-A warning for the last person.
describe('Members page — transfer ownership', () => {
  it('household owner can offer the household to a member after a confirm, and the row then waits for them', async () => {
    // Given the owner, with no pending offer
    server.members = people('u-olive')
    // Only an offer for Mia matches this mock; any other `userId` gets no
    // answer, and the row would never wait
    let sent = 0
    renderPage('owner', [
      {
        request: {
          query: OfferOwnershipDocument,
          variables: { userId: 'u-mia' },
        },
        result: () => {
          sent += 1
          // The server now has the pending offer
          server.pendingTransfer = offer('off-1', 'transfer', 'u-mia', 'Mia')
          return { data: { offerOwnership: server.pendingTransfer } }
        },
      },
    ])
    const user = userEvent.setup()

    // When they press Transfer ownership on Mia's row, it asks first
    await user.click(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Transfer ownership to Mia',
      }),
    )
    expect(sent).toBe(0)
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Transfer ownership',
    })
    expect(dialog).toHaveTextContent(
      'Offer The Lin home to Mia? You become a manager when they accept.',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Transfer ownership' }),
    )

    // Then the offer is sent for Mia
    await waitFor(() => expect(sent).toBe(1))
    // And Mia's row says it waits for her, with Cancel
    const mia = await rowOf('Mia')
    await waitFor(() =>
      expect(mia).toHaveTextContent('Waiting for Mia to accept'),
    )
    expect(
      within(mia).getByRole('button', { name: 'Cancel the offer to Mia' }),
    ).toBeInTheDocument()
    // And no other row offers a transfer now (one at a time)
    expect(
      within(await screen.findByRole('main')).queryByRole('button', {
        name: /^Transfer ownership to /,
      }),
    ).toBeNull()
  })

  it('household owner can cancel the pending offer', async () => {
    // Given a pending offer to Mona
    server.members = people('u-olive')
    server.pendingTransfer = offer('off-1', 'transfer', 'u-mona', 'Mona')
    let cancels = 0
    renderPage('owner', [
      {
        request: { query: CancelOwnershipOfferDocument },
        result: () => {
          cancels += 1
          server.pendingTransfer = null
          return { data: { cancelOwnershipOffer: true } }
        },
      },
    ])
    const user = userEvent.setup()

    const mona = await rowOf('Mona')
    await waitFor(() =>
      expect(mona).toHaveTextContent('Waiting for Mona to accept'),
    )
    await user.click(
      within(mona).getByRole('button', { name: 'Cancel the offer to Mona' }),
    )

    // Then the offer is taken back, and every row offers a transfer again
    await waitFor(() => expect(cancels).toBe(1))
    expect(
      await within(await rowOf('Mona')).findByRole('button', {
        name: 'Transfer ownership to Mona',
      }),
    ).toBeInTheDocument()
    expect(await rowOf('Mona')).not.toHaveTextContent('Waiting for')
  })

  it('a cancel that finds no offer says the offer is no longer open', async () => {
    server.members = people('u-olive')
    server.pendingTransfer = offer('off-1', 'transfer', 'u-mona', 'Mona')
    renderPage('owner', [
      {
        request: { query: CancelOwnershipOfferDocument },
        result: () => {
          server.pendingTransfer = null
          return { data: { cancelOwnershipOffer: false } }
        },
      },
    ])
    const user = userEvent.setup()
    const mona = await rowOf('Mona')
    await user.click(
      await within(mona).findByRole('button', {
        name: 'Cancel the offer to Mona',
      }),
    )
    expect(
      await screen.findByText('This offer is no longer open.'),
    ).toBeInTheDocument()
  })

  it('a refused offer shows an error and the rows stay as they were', async () => {
    server.members = people('u-olive')
    renderPage('owner', [
      {
        request: {
          query: OfferOwnershipDocument,
          variables: { userId: 'u-milo' },
        },
        result: {
          errors: [{ message: 'no', extensions: { code: 'FORBIDDEN' } }],
        },
      },
    ])
    const user = userEvent.setup()
    await user.click(
      await within(await rowOf('Milo')).findByRole('button', {
        name: 'Transfer ownership to Milo',
      }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Transfer ownership',
      }),
    )
    expect(
      await screen.findByText('Could not save the change. Try again.'),
    ).toBeInTheDocument()
    expect(await rowOf('Milo')).not.toHaveTextContent('Waiting for')
  })

  it('household manager sees no Transfer ownership', async () => {
    // Given a manager; the owner's row is there, so the page has loaded
    server.members = people('u-max')
    renderPage('manager')
    expect(await rowOf('Olive')).toHaveTextContent('Owner')
    expect(
      within(await screen.findByRole('main')).queryByRole('button', {
        name: /Transfer ownership/,
      }),
    ).toBeNull()
  })
})

describe('Members page — a household with no owner', () => {
  // The owner's account was deleted (task K.4): the owner's row is gone
  function ownerless(me: string): Person[] {
    return people(me).filter((p) => p.role !== 'owner')
  }

  it('user sees "This household has no owner." when nobody owns it', async () => {
    server.members = ownerless('u-milo')
    server.hasOwner = false
    renderPage('member')
    expect(
      await screen.findByText('This household has no owner.'),
    ).toBeInTheDocument()
    // And with no offer, no button to take it
    await waitFor(() => expect(server.offersCalls).toBeGreaterThan(0))
    expect(
      screen.queryByRole('button', { name: 'Become the owner' }),
    ).toBeNull()
  })

  it('user sees no such note while the household has an owner', async () => {
    // A presence check first: the page has loaded the household and the list
    server.members = people('u-milo')
    renderPage('member')
    expect(await rowOf('Olive')).toHaveTextContent('Owner')
    await waitFor(() => expect(server.offersCalls).toBeGreaterThan(0))
    expect(screen.queryByText('This household has no owner.')).toBeNull()
  })

  it('user with a hand-over offer they put off with "Not now" can still become the owner here (O42)', async () => {
    // Given Mona has a hand-over offer for this household, already dismissed,
    // and another offer for her OTHER household
    server.members = ownerless('u-mona')
    server.hasOwner = false
    server.offers = [
      offer('off-other', 'handover', 'u-mona', 'Mona', {
        householdId: 'household-other',
        householdName: 'Beach house',
      }),
      offer('off-1', 'handover', 'u-mona', 'Mona', {
        dismissedAt: '2026-11-20T01:00:00.000Z',
      }),
    ]
    // Only an accept of THIS household's offer (off-1) matches this mock
    let accepted = 0
    renderPage('manager', [
      {
        request: {
          query: AcceptOwnershipOfferDocument,
          variables: { id: 'off-1' },
        },
        result: () => {
          accepted += 1
          server.offers = server.offers.filter((o) => o.id !== 'off-1')
          server.hasOwner = true
          server.household = { id: 'household-role-story', role: 'owner' }
          return {
            data: {
              acceptOwnershipOffer: {
                __typename: 'Household',
                id: 'household-role-story',
                name: 'The Lin home',
                role: 'owner',
                hasOwner: true,
                pendingTransfer: null,
              },
            },
          }
        },
      },
    ])
    const user = userEvent.setup()

    // When she presses Become the owner
    const button = await screen.findByRole('button', {
      name: 'Become the owner',
    })
    // And the button says which household it is for
    expect(button).toHaveAccessibleDescription('This household has no owner.')
    await user.click(button)

    // Then THIS household's offer is accepted, not the other one
    await waitFor(() => expect(accepted).toBe(1))
    expect(
      await screen.findByText('You are now the owner of The Lin home.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Become the owner' }),
      ).toBeNull(),
    )
  })

  it('user whose hand-over offer is gone is told so', async () => {
    server.members = ownerless('u-mona')
    server.hasOwner = false
    server.offers = [offer('off-1', 'handover', 'u-mona', 'Mona')]
    renderPage('manager', [
      {
        request: {
          query: AcceptOwnershipOfferDocument,
          variables: { id: 'off-1' },
        },
        result: () => {
          server.offers = []
          return {
            errors: [{ message: 'gone', extensions: { code: 'FORBIDDEN' } }],
          }
        },
      },
    ])
    const user = userEvent.setup()
    // The banner (__root) has its own Accept; this is the page's button
    await user.click(
      await screen.findByRole('button', { name: 'Become the owner' }),
    )
    expect(
      await screen.findByText('This offer is no longer open.'),
    ).toBeInTheDocument()
  })

  it('a failed accept says the answer could not be sent', async () => {
    server.members = ownerless('u-mona')
    server.hasOwner = false
    server.offers = [offer('off-1', 'handover', 'u-mona', 'Mona')]
    renderPage('manager', [
      {
        request: {
          query: AcceptOwnershipOfferDocument,
          variables: { id: 'off-1' },
        },
        result: {
          errors: [
            { message: 'down', extensions: { code: 'INTERNAL_SERVER_ERROR' } },
          ],
        },
      },
    ])
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Become the owner' }),
    )
    expect(
      await screen.findByText('Could not send your answer. Please try again.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Become the owner' }),
    ).toBeInTheDocument()
  })

  it('user with a transfer offer sees who offered it, and can become the owner here', async () => {
    // Given Mia has a transfer offer from the owner, Olive
    server.members = people('u-mia')
    server.offers = [offer('off-1', 'transfer', 'u-mia', 'Mia')]
    renderPage('member')
    const button = await screen.findByRole('button', {
      name: 'Become the owner',
    })
    expect(button).toHaveAccessibleDescription(
      'Olive wants to make you the owner of The Lin home.',
    )
    // The household has an owner, so no "no owner" note
    expect(screen.queryByText('This household has no owner.')).toBeNull()
  })
})

describe('Members page — the last person leaves (O37-A)', () => {
  it('the last person of a household with no owner is warned that leaving deletes it', async () => {
    // Given Mona is the only live person left
    server.members = [person('u-mona', 'Mona', 'manager', true)]
    server.hasOwner = false
    renderPage('manager')
    const user = userEvent.setup()

    await user.click(
      await within(await rowOf('Mona')).findByRole('button', {
        name: 'Leave household',
      }),
    )
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'You are the last person here. Leaving deletes the household and everything in it.',
    )
  })

  it('a person who is not the last gets the usual leave text', async () => {
    server.members = people('u-mia')
    renderPage('member')
    const user = userEvent.setup()
    await user.click(
      await within(await rowOf('Mia')).findByRole('button', {
        name: 'Leave household',
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'Leave this household? You lose access to all its locations.',
    )
    expect(dialog).not.toHaveTextContent('last person')
  })

  // Owner decision O48 (households H6b task K.7b). The member list can come
  // first from the cache restored from IndexedDB. If the last other person
  // left since then, that stale list hides the warning while the server will
  // delete the household. So Leave waits for the server's answer.
  it('Leave cannot be used until the server has answered, so a stale list cannot hide the warning (O48)', async () => {
    // Given the cache from an earlier visit holds Mona and Mia, but Mia has
    // left since: the server now has only Mona
    const cache = createCache()
    cache.writeQuery({
      query: HouseholdMembersDocument,
      data: {
        householdMembers: [
          person('u-mona', 'Mona', 'manager', true),
          person('u-mia', 'Mia', 'member'),
        ],
      },
    })
    server.members = [person('u-mona', 'Mona', 'manager', true)]
    server.hasOwner = false
    const hold = createHoldLink()
    hold.hold('HouseholdMembers')
    renderPage('manager', [], { cache, hold })
    const user = userEvent.setup()

    // When the page shows the cached list, before the server answers
    await rowOf('Mia')
    await waitFor(() => expect(hold.waiting('HouseholdMembers')).toBe(1))

    // Then Leave is there but cannot be used
    const leave = within(await rowOf('Mona')).getByRole('button', {
      name: 'Leave household',
    })
    expect(leave).toBeDisabled()

    // When the server answers with Mona alone
    hold.release('HouseholdMembers')
    await waitFor(() =>
      expect(screen.queryByText('Mia')).not.toBeInTheDocument(),
    )

    // Then Leave works, and its confirm gives the last-person warning
    const ready = within(await rowOf('Mona')).getByRole('button', {
      name: 'Leave household',
    })
    await waitFor(() => expect(ready).toBeEnabled())
    await user.click(ready)
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'You are the last person here. Leaving deletes the household and everything in it.',
    )
  })

  it('Leave stays off when the list could only be read from the cache (O48)', async () => {
    // Given a cached list, and a read of it that fails (offline)
    const cache = createCache()
    cache.writeQuery({
      query: HouseholdMembersDocument,
      data: {
        householdMembers: [
          person('u-mona', 'Mona', 'manager', true),
          person('u-mia', 'Mia', 'member'),
        ],
      },
    })
    const hold = createHoldLink()
    hold.hold('HouseholdMembers')
    renderPage('manager', [], { cache, hold })
    await rowOf('Mia')
    await waitFor(() => expect(hold.waiting('HouseholdMembers')).toBe(1))

    // When the read fails
    hold.fail('HouseholdMembers')
    await waitFor(() => expect(hold.waiting('HouseholdMembers')).toBe(0))

    // Then the cached list stays, and Leave is still off
    expect(await rowOf('Mia')).toBeInTheDocument()
    expect(
      within(await rowOf('Mona')).getByRole('button', {
        name: 'Leave household',
      }),
    ).toBeDisabled()
  })
})
