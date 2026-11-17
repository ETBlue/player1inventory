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
import { db } from '@/db'
import {
  CreateInviteDocument,
  GetHouseholdDocument,
  GetHouseholdLocationsDocument,
  HouseholdInvitesDocument,
  type HouseholdInvitesQuery,
  HouseholdMembersDocument,
  type HouseholdMembersQuery,
  type HouseholdRole,
  LeaveHouseholdDocument,
  RemoveMemberDocument,
  RevokeInviteDocument,
  SetHouseholdRoleDocument,
} from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { cloudRoleBaseMocks, cloudRoleStorySetup } from '@/test/cloudRoleStory'

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
  /** `GetHousehold`: a household id, or the error code NO_HOUSEHOLD. */
  household: { id: string; role: HouseholdRole } | 'NO_HOUSEHOLD'
  membersCalls: number
  invitesCalls: number
}

let server: Server

function dynamicMocks(): NonNullable<MockedProviderProps['mocks']> {
  return [
    {
      request: { query: GetHouseholdDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        const h = server.household
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
        return { data: { householdMembers: server.members } }
      },
    },
    {
      request: { query: HouseholdInvitesDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        server.invitesCalls += 1
        return { data: { householdInvites: server.invites } }
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
            },
            // A location the caller has no role on (owner and manager see it)
            {
              __typename: 'Location',
              id: 'loc-garage',
              name: 'Garage',
              order: 1,
              myRole: null,
              hasOrganizer: true,
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
  render(
    <MockedProvider
      mocks={[...dynamicMocks(), ...base, ...extra]}
      cache={createCache()}
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
  }
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock, replace: replaceMock },
    writable: true,
    configurable: true,
  })
})

afterEach(async () => {
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
  await db.delete()
  await db.open()
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

    // Then the note says the owner cannot leave
    expect(
      await screen.findByText(
        'The owner cannot leave. Handing over the household comes in a later version.',
      ),
    ).toBeInTheDocument()
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

  function leaveMock(after: Server['household']) {
    return {
      request: { query: LeaveHouseholdDocument },
      result: () => {
        server.household = after
        return { data: { leaveHousehold: true } }
      },
    }
  }

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
