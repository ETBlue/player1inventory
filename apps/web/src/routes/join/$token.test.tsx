import { ApolloProvider } from '@apollo/client/react'
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
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { db } from '@/db'
import {
  InvitePreviewDocument,
  type InvitePreviewQuery,
  JoinHouseholdDocument,
} from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { cloudRoleBaseMocks, cloudRoleStorySetup } from '@/test/cloudRoleStory'
import { defined, elementAt } from '@/test/narrow'

// The real generated hooks and Apollo React hooks, so `MockedProvider`
// answers the page. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// The household switch clears IndexedDB and reloads the page. The test only
// needs to know it was asked for, with which household.
const switchToHouseholdMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return { ...actual, switchToHousehold: switchToHouseholdMock }
})

const TOKEN = 'tok-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd'
const reloadMock = vi.fn()
const replaceMock = vi.fn()
const originalLocation = window.location

type Preview = InvitePreviewQuery['invitePreview']

const VALID: Preview = {
  __typename: 'InvitePreview',
  status: 'VALID',
  householdName: 'the Lin home',
  invitedByName: 'Mei Lin',
  householdRole: 'member',
  locationRoles: [
    {
      __typename: 'InviteLocationRole',
      locationId: 'loc-kitchen',
      locationName: 'my Kitchen',
      role: 'organizer',
    },
    {
      __typename: 'InviteLocationRole',
      locationId: 'loc-garage',
      locationName: 'Garage',
      role: 'viewer',
    },
  ],
}

function previewMock(preview: Preview) {
  return {
    request: { query: InvitePreviewDocument, variables: { token: TOKEN } },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { invitePreview: preview } },
  }
}

function joinRefusal(reason: string) {
  return {
    request: { query: JoinHouseholdDocument, variables: { token: TOKEN } },
    result: {
      errors: [
        { message: 'refused', extensions: { code: 'BAD_USER_INPUT', reason } },
      ],
    },
  }
}

function joinSuccess() {
  return {
    request: { query: JoinHouseholdDocument, variables: { token: TOKEN } },
    result: {
      data: {
        joinHousehold: {
          __typename: 'Household',
          id: 'household-joined',
          name: 'the Lin home',
          role: 'member',
        },
      },
    },
  }
}

function renderCloud(mocks: NonNullable<MockedProviderProps['mocks']>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/join/${TOKEN}`] }),
    context: { queryClient },
  })
  render(
    <MockedProvider mocks={[...cloudRoleBaseMocks('owner'), ...mocks]}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>,
  )
  return router
}

function renderLocal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/join/${TOKEN}`] }),
    context: { queryClient },
  })
  render(
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>,
  )
  return router
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock, replace: replaceMock },
    writable: true,
    configurable: true,
  })
})

afterEach(async () => {
  // Unmount first: a mounted page still reads Dexie, which the delete below
  // closes.
  cleanup()
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
  reloadMock.mockReset()
  replaceMock.mockReset()
  switchToHouseholdMock.mockReset()
  vi.restoreAllMocks()
  localStorage.clear()
  await db.delete()
  await db.open()
})

describe('join page, local mode', () => {
  it('user with no data who opens an invite link in local mode stays on the join page', async () => {
    // Given a brand-new visitor: local mode (the default), an empty
    // database, and no onboarding skip flag (Review Focus 1, decision T25)
    localStorage.removeItem('e2e-skip-onboarding')

    // When they open the invite link
    const router = renderLocal()

    // Then they see why joining needs cloud sync, and a way to sign in
    expect(
      await screen.findByRole('button', { name: 'Sign in to join' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Join a household' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Joining a household uses cloud sync. Your data on this device stays here and is not copied.',
      ),
    ).toBeInTheDocument()
    // And the empty catalog does not send them to onboarding. The redirect
    // waits for the three catalog reads, so give them time to finish
    await new Promise((r) => setTimeout(r, 100))
    expect(router.state.location.pathname).toBe(`/join/${TOKEN}`)
  })

  it('user can switch to cloud from the join page without copying local data', async () => {
    // Given local mode with one local item
    await db.items.add({
      id: 'local-item',
      name: 'milk',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
    const user = userEvent.setup()
    renderLocal()

    // When they press Sign in to join
    await user.click(
      await screen.findByRole('button', { name: 'Sign in to join' }),
    )

    // Then the app switches to cloud and reloads
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    expect(reloadMock).toHaveBeenCalledOnce()
    // And no copy of local data is started: `migration-strategy` would
    // start one. The question is not asked on the join and sign-in pages
    // (`isCopyPromptPausedPath`), and never in the household joined
    // (`migration-skip-households`, written by Join).
    expect(localStorage.getItem('migration-strategy')).toBeNull()
    // And the question is NOT turned off for good: `migration-prompted`
    // would stop it in every later household too (bug 2026-11-19)
    expect(localStorage.getItem('migration-prompted')).toBeNull()
    // And the local data is still there
    expect(await db.items.count()).toBe(1)
  })
})

describe('join page, cloud mode', () => {
  beforeEach(() => {
    cloudRoleStorySetup()
  })

  it('user sees who invited them, the household and their roles', async () => {
    // Given a valid invite with a household role and two location roles
    renderCloud([previewMock(VALID)])

    // Then the page names the household and the inviter
    expect(
      await screen.findByRole('heading', { name: 'Join the Lin home' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Mei Lin invites you to this household:'),
    ).toBeInTheDocument()

    // And the household card shows the household name and the household role
    const householdCard = defined(
      screen.getByText('the Lin home').parentElement ?? undefined,
      'household card',
    )
    expect(within(householdCard).getByText('Your role:')).toBeInTheDocument()
    expect(within(householdCard).getByText('Member')).toBeInTheDocument()

    // And the locations come under their own heading, in a list it names
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Locations in this household:',
      }),
    ).toBeInTheDocument()
    const list = screen.getByRole('list', {
      name: 'Locations in this household:',
    })
    // The household card is not part of the locations list
    expect(list).not.toContainElement(householdCard)
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const kitchen = elementAt(rows, 0)
    expect(within(kitchen).getByText('my Kitchen')).toBeInTheDocument()
    expect(within(kitchen).getByText('Your role:')).toBeInTheDocument()
    expect(within(kitchen).getByText('Organizer')).toBeInTheDocument()
    const garage = elementAt(rows, 1)
    expect(within(garage).getByText('Garage')).toBeInTheDocument()
    expect(within(garage).getByText('Your role:')).toBeInTheDocument()
    expect(within(garage).getByText('Viewer')).toBeInTheDocument()

    // And shows household and location names as stored, never title-cased
    for (const name of ['the Lin home', 'my Kitchen', 'Garage']) {
      let node: HTMLElement | null = screen.getByText(name)
      while (node) {
        expect(node.className).not.toMatch(/\bcapitalize\b/)
        node = node.parentElement
      }
    }
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
  })

  it('user sees no locations heading or list when the invite gives no location roles', async () => {
    // Given a valid invite with a household role and no location roles
    renderCloud([previewMock({ ...VALID, locationRoles: [] })])

    // Then the household card shows the household role
    expect(
      await screen.findByRole('heading', { name: 'Join the Lin home' }),
    ).toBeInTheDocument()
    const householdCard = defined(
      screen.getByText('the Lin home').parentElement ?? undefined,
      'household card',
    )
    expect(within(householdCard).getByText('Member')).toBeInTheDocument()

    // And there is no locations heading and no list
    expect(screen.queryByText('Locations in this household:')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
  })

  it('user who is already in the household is told so, with no Join button', async () => {
    // Given an invite to a household the person is already in
    renderCloud([previewMock({ ...VALID, status: 'ALREADY_MEMBER' })])

    // Then the page says so and links to the pantry
    expect(
      await screen.findByText('You are already in this household.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pantry' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })

  it('user who opens a used or expired link sees that it is no longer valid', async () => {
    // Given an invalid invite. The server sends no names for INVALID; this
    // fixture sends them anyway, so the test proves the PAGE hides them
    renderCloud([previewMock({ ...VALID, status: 'INVALID' })])

    // Then only the "no longer valid" text shows
    expect(
      await screen.findByText(
        'This invite is no longer valid. Ask for a new one.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Join a household' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/the Lin home/)).toBeNull()
    expect(screen.queryByText(/Mei Lin/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })

  it('user can join, and the device switches to the new household', async () => {
    // Given a valid invite
    const user = userEvent.setup()
    renderCloud([
      previewMock(VALID),
      {
        ...joinSuccess(),
      },
    ])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the device moves to the joined household (decision T23) and
    // ends on the pantry. Reloading the join page would show the now-used
    // invite as "no longer valid"
    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-joined', {
        to: '/',
      }),
    )
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('user who joins is not asked to copy local data into the joined household', async () => {
    // Given a valid invite, and a device that was already told to skip
    // the question in another household
    localStorage.setItem(
      'migration-skip-households',
      JSON.stringify(['household-earlier']),
    )
    const user = userEvent.setup()
    renderCloud([previewMock(VALID), joinSuccess()])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the joined household is added to the households where the
    // "Copy local data?" question is never asked (owner decision O12-A),
    // before the device switches to it
    await waitFor(() => expect(switchToHouseholdMock).toHaveBeenCalled())
    expect(
      JSON.parse(localStorage.getItem('migration-skip-households') ?? '[]'),
    ).toEqual(['household-earlier', 'household-joined'])
    // And the question is not turned off for every other household
    expect(localStorage.getItem('migration-prompted')).toBeNull()
  })

  it('user who joins still ends on the pantry when the old cache cannot be cleared', async () => {
    // Given a join that works, and a cache that cannot be cleared
    switchToHouseholdMock.mockRejectedValueOnce(new Error('IndexedDB is gone'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderCloud([previewMock(VALID), joinSuccess()])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the browser goes to the pantry, not back to the join page
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('user who presses Join twice joins once', async () => {
    // Given a join that takes a moment. There is only ONE join answer: a
    // second request would get no answer and show the error toast
    const errorToast = vi.spyOn(toast, 'error')
    const user = userEvent.setup()
    renderCloud([previewMock(VALID), { ...joinSuccess(), delay: 50 }])

    // When they press Join twice
    const button = await screen.findByRole('button', { name: 'Join' })
    await user.click(button)
    await user.click(button)

    // Then the button is disabled while the join runs, and one join is sent
    expect(button).toBeDisabled()
    await waitFor(() => expect(switchToHouseholdMock).toHaveBeenCalledOnce())
    expect(errorToast).not.toHaveBeenCalled()
  })

  it('user whose link was used meanwhile is told it is no longer valid', async () => {
    // Given a valid preview, and a join the server refuses as INVITE_INVALID
    const user = userEvent.setup()
    renderCloud([previewMock(VALID), joinRefusal('INVITE_INVALID')])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the page says the link is no longer valid, and nothing switches
    const message = await screen.findByText(
      'This invite is no longer valid. Ask for a new one.',
    )
    // And the message is announced and holds the focus the Join button had
    expect(screen.getByRole('status')).toBe(message)
    await waitFor(() => expect(message).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('user who joined meanwhile in another tab is told they are already in', async () => {
    // Given a valid preview, and a join the server refuses as ALREADY_MEMBER
    const user = userEvent.setup()
    renderCloud([previewMock(VALID), joinRefusal('ALREADY_MEMBER')])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the page says they are already in the household, with focus on
    // the message
    const message = await screen.findByText(
      'You are already in this household.',
    )
    await waitFor(() => expect(message).toHaveFocus())
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('user sees an error toast when the join fails for another reason, and can try again', async () => {
    // Given a join that fails with a network error
    const errorToast = vi.spyOn(toast, 'error')
    const user = userEvent.setup()
    renderCloud([
      previewMock(VALID),
      {
        request: { query: JoinHouseholdDocument, variables: { token: TOKEN } },
        error: new Error('network down'),
      },
    ])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then a toast says it failed, and the Join button stays
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Could not join. Try again.'),
    )
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('user who is offline sees only the offline toast when Join fails', async () => {
    // Given a join refused by `offlineWriteLink`, which shows its own toast
    const errorToast = vi.spyOn(toast, 'error')
    const user = userEvent.setup()
    renderCloud([
      previewMock(VALID),
      {
        request: { query: JoinHouseholdDocument, variables: { token: TOKEN } },
        error: new OfflineWriteError(),
      },
    ])

    // When they press Join
    const button = await screen.findByRole('button', { name: 'Join' })
    await user.click(button)

    // Then no second toast is shown, and they can try again
    await waitFor(() => expect(button).toBeEnabled())
    expect(errorToast).not.toHaveBeenCalled()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('user sees a message when the invite cannot be loaded', async () => {
    // Given the invite preview fails (no connection, server down)
    renderCloud([
      {
        request: { query: InvitePreviewDocument, variables: { token: TOKEN } },
        error: new Error('network down'),
      },
    ])

    // Then the page says so, under its heading, with no Join button
    expect(
      await screen.findByText('Could not load this invite. Try again.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Join a household' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })
})
